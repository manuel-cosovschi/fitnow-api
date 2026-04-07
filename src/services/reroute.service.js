// src/services/reroute.service.js
// AI-powered real-time route recalculation during an active run session.
// Flow: validate session → fetch context (telemetry + hazards) → ask Claude →
//       call OSRM with Claude's params → persist updated polyline → return result.

import Anthropic from '@anthropic-ai/sdk';
import * as runRepo     from '../repositories/run.repository.js';
import * as hazardRepo  from '../repositories/hazard.repository.js';
import { generateRoutes } from './routeGenerator.service.js';
import { Errors } from '../utils/errors.js';
import logger from '../utils/logger.js';

const MAX_REROUTES    = 10;
const CLAUDE_TIMEOUT  = 10_000; // 10 s

// ── Claude client (lazy — only instantiated if ANTHROPIC_API_KEY is set) ──────

function getAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw Errors.internal('ANTHROPIC_API_KEY no configurado.');
  return new Anthropic({ apiKey: key });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Ask Claude to parse the runner's free-text instruction into structured params.
 * Returns a safe default if Claude fails or times out.
 */
async function parseInstructionWithClaude({ instruction, lat, lng, remaining_km, hazards, originalPolyline }) {
  const systemPrompt = `Sos un asistente de navegación para runners en tiempo real.
Tu trabajo es interpretar instrucciones en lenguaje natural y devolver parámetros estructurados
para recalcular la ruta del runner. Respondé ÚNICAMENTE con JSON válido, sin markdown.

Formato de respuesta:
{
  "action": "shorten" | "lengthen" | "avoid_hazards" | "change_direction" | "custom",
  "target_distance_km": <número, distancia total objetivo desde la posición actual>,
  "avoid_coords": [{"lat": <número>, "lng": <número>}],
  "summary": "<descripción breve de lo que entendiste, máximo 80 chars>",
  "reasoning": "<por qué tomaste esta decisión, máximo 120 chars>"
}

Reglas:
- Si pide "más corta" / "menos" / "cansado": acción=shorten, reducí target_distance_km en ~30-40%
- Si pide "más larga" / "más distancia": acción=lengthen, aumentá target_distance_km en ~30-50%
- Si menciona evitar un lugar o hay peligros cercanos: acción=avoid_hazards, incluí avoid_coords
- Si pide cambiar dirección / zona: acción=change_direction
- Para cualquier otra instrucción: acción=custom
- target_distance_km nunca puede ser menor a 0.5 ni mayor a 50`;

  const userPrompt = `Instrucción del runner: "${instruction}"

Contexto:
- Posición actual: lat=${lat}, lng=${lng}
- Distancia restante estimada: ${remaining_km ?? 'desconocida'} km
- Peligros activos en radio 2km: ${
    hazards.length === 0
      ? 'ninguno'
      : hazards.map(h => `[tipo=${h.type}, severidad=${h.severity}, lat=${h.lat}, lng=${h.lng}]`).join('; ')
  }
- Ruta original (polyline): ${originalPolyline ? originalPolyline.slice(0, 80) + '…' : 'ninguna'}`;

  const anthropic = getAnthropic();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT);

  try {
    const message = await anthropic.messages.create(
      {
        model:      'claude-sonnet-4-6',
        max_tokens: 300,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userPrompt }],
      },
      { signal: controller.signal }
    );

    const raw = message.content?.[0]?.text ?? '';
    // Strip any accidental markdown fences
    const jsonStr = raw.replace(/```json?\n?/gi, '').replace(/```/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (err) {
    if (err.name === 'AbortError' || err.code === 'ERR_ABORTED') {
      logger.warn('[reroute] Claude timeout — usando fallback');
    } else {
      logger.warn('[reroute] Claude error:', err.message);
    }
    return null; // caller handles fallback
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Simple keyword fallback when Claude is unavailable.
 */
function fallbackParams(instruction, remaining_km) {
  const lower = instruction.toLowerCase();
  const base  = remaining_km ?? 3;

  if (/cor(ta|to)|menos|cans|fati/i.test(lower)) {
    return { action: 'shorten',  target_distance_km: Math.max(0.5, base * 0.65), avoid_coords: [], summary: 'Ruta más corta', reasoning: 'Fallback por keyword' };
  }
  if (/larg(a|o)|más distancia|extende/i.test(lower)) {
    return { action: 'lengthen', target_distance_km: base * 1.4,               avoid_coords: [], summary: 'Ruta más larga',  reasoning: 'Fallback por keyword' };
  }
  return { action: 'custom', target_distance_km: base, avoid_coords: [], summary: 'Ruta recalculada', reasoning: 'Fallback genérico' };
}

/**
 * Convert GeoJSON linestring coordinates to encoded polyline (Google format).
 * Uses the @mapbox/polyline package already present in the project.
 */
async function geojsonToPolyline(geojson) {
  const { default: polyline } = await import('@mapbox/polyline');
  // GeoJSON coords are [lng, lat]; polyline expects [lat, lng]
  const latLngs = geojson.coordinates.map(([lng, lat]) => [lat, lng]);
  return polyline.encode(latLngs);
}

// ── Public entry point ─────────────────────────────────────────────────────────

export async function rerouteSession(sessionId, userId, { instruction, current_lat, current_lng, remaining_distance_km }) {
  // 1. Verify session ownership and active status
  const session = await runRepo.findSessionById(sessionId);
  if (!session)                     throw Errors.notFound('Sesión no encontrada.');
  if (session.user_id !== userId)   throw Errors.forbidden('No podés modificar esta sesión.');
  if (session.status !== 'active')  throw Errors.badRequest('La sesión no está activa.');

  // 2. Reroute limit
  if ((session.reroute_count ?? 0) >= MAX_REROUTES) {
    throw Object.assign(Errors.badRequest('Límite de recálculos alcanzado para esta sesión.'), { status: 429 });
  }

  // 3. Best known position — prefer body params, fall back to last telemetry
  let lat = current_lat;
  let lng = current_lng;

  const lastPoint = await runRepo.findLastTelemetryPoint(sessionId);
  if (lastPoint && (lastPoint.ts_ms > Date.now() - 30_000)) {
    // Use telemetry if it's fresher than 30 s
    lat = lastPoint.lat;
    lng = lastPoint.lng;
  }

  // 4. Nearby hazards (2 km radius)
  const hazards = await hazardRepo.findNear({ lat, lng, radius_m: 2000 });

  // 5. Ask Claude (with timeout + fallback)
  let parsed = await parseInstructionWithClaude({
    instruction,
    lat,
    lng,
    remaining_km: remaining_distance_km,
    hazards,
    originalPolyline: session.route_polyline ?? null,
  });

  if (!parsed) {
    parsed = fallbackParams(instruction, remaining_distance_km);
  }

  const target_m = Math.round((parsed.target_distance_km ?? (remaining_distance_km ?? 3)) * 1000);

  // 6. Generate new route via OSRM from current position
  const { items: routeOptions } = await generateRoutes({
    origin_lat: lat,
    origin_lng: lng,
    distance_m: target_m,
  });

  // Pick best variant: avoid_hazards action → circular (index 1), else directa (index 0)
  const bestRoute = parsed.action === 'avoid_hazards'
    ? (routeOptions[1] ?? routeOptions[0])
    : routeOptions[0];

  const polyline   = await geojsonToPolyline(bestRoute.geojson);
  const dist_km    = Math.round(bestRoute.distance_m / 100) / 10;
  const est_min    = Math.round(bestRoute.distance_m / 83); // ~5 min/km pace

  // 7. Persist — update session and insert reroute telemetry marker
  await Promise.all([
    runRepo.applyReroute(sessionId, polyline),
    runRepo.insertReroutePoint(sessionId, lat, lng),
  ]);

  return {
    session_id:   sessionId,
    new_route: {
      polyline,
      distance_km:        dist_km,
      estimated_time_min: est_min,
      summary:            parsed.summary,
    },
    ai_reasoning: parsed.reasoning,
  };
}
