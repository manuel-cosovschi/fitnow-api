// bench/route-eval.js
// Banco de evaluación del planificador de rutas. Corre los tres métodos sobre
// la misma matriz de casos y compara sus resultados con métricas objetivas:
//
//   B0 (línea base ingenua): una sola llamada a OSRM con estimación geométrica
//       del tramo. Es "lo que haría alguien integrando OSRM directo".
//   B1 (método anterior): búsqueda binaria de distancia sobre 3 plantillas
//       fijas, sin evaluación de calidad (la versión previa de FitNow).
//   M  (método propuesto): cartera de candidatas + evaluación multicriterio
//       (fidelidad de distancia, exposición a hazards, giros) + selección.
//
// Métricas por caso y método: error de distancia (%), exposición a hazards
// (metros ponderados), giros por km, llamadas a OSRM, latencia (ms) y si se
// usó el respaldo geométrico. Sale un CSV por corrida + resumen en consola.
//
// Uso:
//   node bench/route-eval.js                    → 8 orígenes × [5000] (humo)
//   node bench/route-eval.js --full             → 30 orígenes × [3000,5000,8000,12000]
//   node bench/route-eval.js --origins 10 --distances 5000,8000
//
// Los hazards salen de bench/hazards-seed.json (dataset reproducible, no de
// la base), y los orígenes de bench/origins-mdp.json.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  generatePortfolio,
  buildRoute,
  fetchSpec,
  circularFallback,
  TEMPLATES,
} from '../src/services/routeGenerator.service.js';
import {
  scorePortfolio,
  hazardExposure,
  turnComplexity,
  DEFAULT_PLANNER_WEIGHTS,
} from '../src/services/routeEvaluator.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORIGINS = JSON.parse(fs.readFileSync(path.join(__dirname, 'origins-mdp.json'))).origins;
const HAZARDS = JSON.parse(fs.readFileSync(path.join(__dirname, 'hazards-seed.json'))).hazards;

const TOLERANCE = 0.05;

// ── Contador de llamadas a OSRM: envolvemos fetch para medir cuántas hace
//    cada método, sin tocar el código de producción. ──────────────────────────
let osrmCalls = 0;
const realFetch = global.fetch;
global.fetch = async (...args) => {
  if (String(args[0]).includes('/trip/v1/')) osrmCalls++;
  return realFetch(...args);
};
const resetCalls = () => { osrmCalls = 0; };

// Pausa corta entre casos para no castigar el servidor público de OSRM.
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Los tres métodos, cada uno devuelve su "ruta recomendada" ─────────────────

// B0: una única llamada, tramo estimado geométricamente (mitad de la distancia).
async function methodB0(origin, distance_m) {
  const spec = { kind: 'ida-vuelta', bearings: [0], legFraction: 0.5 };
  try {
    return { ...(await fetchSpec(spec, origin.lat, origin.lng, distance_m * 0.5)), fallback: false };
  } catch {
    return { distance_m, geojson: circularFallback(origin.lat, origin.lng, distance_m, 0), fallback: true };
  }
}

// B1: el método anterior de FitNow — bisección por plantilla, devuelve la 1ª.
async function methodB1(origin, distance_m) {
  const r = await buildRoute(TEMPLATES[0], origin.lat, origin.lng, distance_m);
  const fallback = Math.abs(r.distance_m - distance_m) < 1 && r.geojson?.coordinates?.length === 37;
  return { ...r, fallback };
}

// M: cartera + evaluación multicriterio + selección (idéntico a producción,
// pero con los hazards del dataset semilla para que sea reproducible).
async function methodM(origin, distance_m) {
  const candidates = await generatePortfolio(origin.lat, origin.lng, distance_m);
  const inRange = c => Math.abs(c.distance_m - distance_m) / distance_m <= TOLERANCE;
  let eligible = candidates.filter(inRange);
  for (const b of [0, 90, 180, 270]) {
    if (eligible.length >= 3) break;
    eligible.push({
      spec: { kind: 'circular', bearings: [b] },
      distance_m,
      geojson: circularFallback(origin.lat, origin.lng, distance_m, b),
      fallback: true,
    });
  }
  const ranked  = scorePortfolio(eligible, { hazards: HAZARDS, weights: DEFAULT_PLANNER_WEIGHTS, targetM: distance_m });
  const ordered = [...ranked.filter(c => !c.fallback), ...ranked.filter(c => c.fallback)];
  return ordered[0];
}

// ── Métricas comunes sobre la ruta recomendada de cada método ─────────────────
function measure(route, distance_m) {
  const coords = route.geojson?.coordinates ?? [];
  const errPct = Math.abs(route.distance_m - distance_m) / distance_m * 100;
  const { exposureM, hazardsTouched } = hazardExposure(coords, HAZARDS);
  const { turnsPerKm } = turnComplexity(coords, route.distance_m);
  return {
    dist_m: route.distance_m,
    err_pct: Math.round(errPct * 100) / 100,
    exposure_m: exposureM,
    hazards_touched: hazardsTouched,
    turns_per_km: turnsPerKm,
    fallback: route.fallback ? 1 : 0,
  };
}

// ── Corrida principal ─────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const full = args.includes('--full');
  const nOrigins = args.includes('--origins')
    ? parseInt(args[args.indexOf('--origins') + 1], 10)
    : (full ? ORIGINS.length : 8);
  const distances = args.includes('--distances')
    ? args[args.indexOf('--distances') + 1].split(',').map(Number)
    : (full ? [3000, 5000, 8000, 12000] : [5000]);

  const origins = ORIGINS.slice(0, nOrigins);
  const methods = { B0: methodB0, B1: methodB1, M: methodM };
  const rows = [];

  console.log(`Banco de evaluación: ${origins.length} orígenes × ${distances.length} distancias × 3 métodos`);
  console.log(`Hazards del dataset semilla: ${HAZARDS.length}\n`);

  for (const origin of origins) {
    for (const d of distances) {
      for (const [name, fn] of Object.entries(methods)) {
        resetCalls();
        const t0 = Date.now();
        let route;
        try {
          route = await fn(origin, d);
        } catch (e) {
          console.log(`  ✗ ${name} ${origin.name} ${d}m: ${e.message}`);
          continue;
        }
        const latency = Date.now() - t0;
        const m = measure(route, d);
        rows.push({ zone: origin.zone, origin: origin.name, target_m: d, method: name,
                    ...m, osrm_calls: osrmCalls, latency_ms: latency });
        await sleep(300);
      }
      console.log(`  ✓ ${origin.name} — ${d} m`);
    }
  }

  // CSV
  const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  const csvPath = path.join(__dirname, `results-${ts}.csv`);
  const headers = Object.keys(rows[0]);
  fs.writeFileSync(csvPath, [headers.join(','), ...rows.map(r => headers.map(h => r[h]).join(','))].join('\n'));

  // Resumen por método
  const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const mean = arr => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
  console.log('\n════════ RESUMEN POR MÉTODO ════════');
  console.log('método | err% medio | err% p95 | ≤5% | exposición media (m) | giros/km | llamadas | latencia media | respaldo');
  for (const name of Object.keys(methods)) {
    const g = rows.filter(r => r.method === name);
    if (!g.length) continue;
    const errs = g.map(r => r.err_pct);
    const valid = g.filter(r => r.err_pct <= 5).length;
    console.log([
      name.padEnd(6),
      mean(errs).toFixed(2).padStart(9),
      pct(errs, 0.95).toFixed(2).padStart(8),
      `${valid}/${g.length}`.padStart(6),
      mean(g.map(r => r.exposure_m)).toFixed(0).padStart(12),
      mean(g.map(r => r.turns_per_km)).toFixed(2).padStart(8),
      mean(g.map(r => r.osrm_calls)).toFixed(1).padStart(8),
      `${mean(g.map(r => r.latency_ms)).toFixed(0)} ms`.padStart(10),
      `${g.filter(r => r.fallback).length}/${g.length}`.padStart(7),
    ].join(' | '));
  }
  console.log(`\nCSV: ${csvPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
