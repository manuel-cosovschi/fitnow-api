// src/services/newsIngest.service.js
// Ingesta automática de reportes desde la prensa local: lee los feeds RSS
// configurados, filtra las notas que suenan a riesgo urbano por palabras
// clave, le pide al modelo de lenguaje que extraiga tipo, lugar y severidad,
// geocodifica el lugar con Nominatim (OpenStreetMap) y crea el reporte con
// fuente "prensa" y la URL de la nota. La deduplicación es por URL, así la
// corrida puede repetirse todos los días sin duplicar. El modelo solo
// clasifica texto; las coordenadas salen del geocodificador y la nota queda
// con vencimiento a 30 días como cualquier reporte.
import { query, queryOne } from '../db.js';
import { chatJSON } from '../utils/openai.js';
import logger from '../utils/logger.js';

const DEFAULT_FEEDS = [
  'https://www.lacapitalmdp.com/feed/',
  'https://www.infobrisas.com/rss/home.xml',
];

const CITY_HINT = 'Mar del Plata, Argentina';
const TYPES = ['inseguridad', 'iluminacion', 'obra', 'vereda_rota'];

// Palabras que ameritan mirar la nota con el modelo (filtro barato primero).
const KEYWORDS = [
  'robo', 'asalto', 'inseguridad', 'motochorro', 'arrebato', 'entradera',
  'alumbrado', 'luminaria', 'sin luz', 'a oscuras',
  'obra', 'bache', 'vereda', 'calle rota', 'corte de calle', 'repavimentaci',
];

export function feedUrls() {
  const env = (process.env.NEWS_FEEDS || '').split(',').map(s => s.trim()).filter(Boolean);
  return env.length ? env : DEFAULT_FEEDS;
}

// Parser mínimo de RSS: extrae título, link y descripción de cada item.
export function parseRss(xml) {
  const items = [];
  const blocks = String(xml).split(/<item[\s>]/).slice(1);
  for (const b of blocks) {
    const grab = (tag) => {
      const m = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
      if (!m) return '';
      return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').trim();
    };
    const title = grab('title');
    const link = grab('link');
    if (title && link) items.push({ title, link, description: grab('description').slice(0, 600) });
  }
  return items;
}

// ¿La nota amerita analizarse? Filtro por palabras clave, sin gastar modelo.
export function looksRelevant(item) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  return KEYWORDS.some(k => text.includes(k));
}

// Le pide al modelo la clasificación de la nota. Devuelve null si no aplica.
async function classify(item) {
  const system =
    'Analizás noticias locales de Mar del Plata para una app de corredores urbanos. ' +
    'Respondé SOLO un objeto JSON con estas claves: relevante (boolean: true solo si la ' +
    'nota describe un hecho puntual y localizable de riesgo urbano para peatones o ' +
    'corredores), tipo (uno de: inseguridad, iluminacion, obra, vereda_rota), lugar ' +
    '(string: la calle, esquina o barrio más específico que mencione la nota, sin la ciudad), ' +
    'severidad (1 leve, 2 media, 3 grave). Notas de política, tasas, opiniones o hechos ' +
    'sin ubicación concreta NO son relevantes.';
  const res = await chatJSON({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `Título: ${item.title}\nResumen: ${item.description}` },
    ],
    jsonMode: true, temperature: 0, maxTokens: 200,
  }).catch(() => null);

  const d = res?.ok ? res.data : null;
  if (!d || d.relevante !== true) return null;
  if (!TYPES.includes(d.tipo) || typeof d.lugar !== 'string' || !d.lugar.trim()) return null;
  const sev = [1, 2, 3].includes(Number(d.severidad)) ? Number(d.severidad) : 2;
  return { tipo: d.tipo, lugar: d.lugar.trim().slice(0, 120), severidad: sev };
}

// Geocodifica el lugar con Nominatim (1 llamada por segundo, con User-Agent).
async function geocode(place) {
  const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
    q: `${place}, ${CITY_HINT}`, format: 'json', limit: '1',
  });
  const resp = await fetch(url, { headers: { 'User-Agent': 'fitnow-app/1.0' } });
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data?.length) return null;
  return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
}

// Usuario "sistema" dueño de los reportes de prensa (se crea una sola vez).
async function pressUserId() {
  const existing = await queryOne(`SELECT id FROM users WHERE email = 'prensa@fitnow.local' LIMIT 1`);
  if (existing) return existing.id;
  const result = await query(
    `INSERT INTO users (name, email, role) VALUES ('Fuente prensa local', 'prensa@fitnow.local', 'user')`);
  return result.insertId;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Corre la ingesta completa. Devuelve el resumen de lo hecho.
 * maxCreates acota cuántos reportes nuevos puede crear una corrida.
 */
// Lee las noticias, clasifica con el modelo y crea los reportes nuevos.
export async function ingestNews({ maxCreates = 10 } = {}) {
  const summary = { feeds: 0, scanned: 0, candidates: 0, created: 0, skipped_dup: 0, failed: 0 };
  const userId = await pressUserId();

  for (const feed of feedUrls()) {
    let xml;
    try {
      const resp = await fetch(feed, { headers: { 'User-Agent': 'fitnow-app/1.0' } });
      if (!resp.ok) continue;
      xml = await resp.text();
    } catch { continue; }
    summary.feeds++;

    for (const item of parseRss(xml)) {
      summary.scanned++;
      if (!looksRelevant(item)) continue;
      summary.candidates++;
      if (summary.created >= maxCreates) continue;

      // Dedup por URL de la nota: cada noticia genera un solo reporte.
      const dup = await queryOne(`SELECT id FROM hazards WHERE source_url = ? LIMIT 1`, [item.link]);
      if (dup) { summary.skipped_dup++; continue; }

      const cls = await classify(item);
      if (!cls) continue;

      const geo = await geocode(cls.lugar).catch(() => null);
      await sleep(1100); // límite de uso de Nominatim
      if (!geo) { summary.failed++; continue; }

      await query(
        `INSERT INTO hazards (user_id, lat, lng, type, note, severity, source, source_url, expires_at)
         VALUES (?,?,?,?,?,?,'prensa',?, NOW() + INTERVAL '30 days')`,
        [userId, geo.lat, geo.lng, cls.tipo,
         `${item.title.slice(0, 300)} (fuente: prensa local)`, cls.severidad, item.link]);
      summary.created++;
      logger.info(`newsIngest: reporte creado [${cls.tipo} sev ${cls.severidad}] ${cls.lugar}`);
    }
  }
  logger.info(`newsIngest: ${JSON.stringify(summary)}`);
  return summary;
}

// Programa la corrida diaria si está habilitada por entorno.
export function scheduleNewsIngest() {
  if (process.env.NEWS_INGEST_ENABLED !== 'true') return;
  const DAY = 24 * 60 * 60 * 1000;
  setTimeout(() => ingestNews().catch(e => logger.error('newsIngest:', e.message)), 90 * 1000);
  setInterval(() => ingestNews().catch(e => logger.error('newsIngest:', e.message)), DAY);
  logger.info('newsIngest: ingesta diaria de noticias habilitada');
}
