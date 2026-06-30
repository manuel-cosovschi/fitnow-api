// src/services/runAnalysis.service.js
// Post-run AI analysis. The numbers are computed from the real session (never
// from the model); the LLM only writes the narrative, and that narrative is
// validated against a fixed schema before it reaches the user. Without an
// OpenAI key it still returns a useful, grounded analysis.
import { isAiEnabled, chatJSON, getModel } from '../utils/openai.js';
import { validateRunAnalysis } from '../utils/aiGuardrails.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Derive the authoritative metrics from a finished run session. */
export function computeRunMetrics(session = {}) {
  const distance_m = isNum(session.distance_m) ? session.distance_m : null;
  const duration_s = isNum(session.duration_s) ? session.duration_s : null;
  const distance_km = distance_m != null ? distance_m / 1000 : null;

  let pace_s_per_km = isNum(session.avg_pace_s) ? session.avg_pace_s : null;
  if (pace_s_per_km == null && distance_km && duration_s) {
    pace_s_per_km = duration_s / distance_km;
  }

  const avg_hr = isNum(session.avg_hr_bpm) ? Math.round(session.avg_hr_bpm) : null;
  const deviations = isNum(session.deviates_count) ? session.deviates_count : 0;
  const elev_gain_m =
    isNum(session.max_elevation_m) && isNum(session.min_elevation_m)
      ? Math.max(0, Math.round(session.max_elevation_m - session.min_elevation_m))
      : null;

  return {
    distance_km:   distance_km != null ? Math.round(distance_km * 100) / 100 : null,
    duration_min:  duration_s != null ? Math.round((duration_s / 60) * 10) / 10 : null,
    pace_s_per_km: pace_s_per_km != null ? Math.round(pace_s_per_km) : null,
    pace_label:    pace_s_per_km != null ? formatPace(pace_s_per_km) : null,
    avg_hr,
    deviations,
    elev_gain_m,
  };
}

function formatPace(sPerKm) {
  const m = Math.floor(sPerKm / 60);
  const s = Math.round(sPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

function paceBand(sPerKm) {
  if (sPerKm == null) return 'sin ritmo';
  if (sPerKm < 300) return 'muy rápido';
  if (sPerKm < 360) return 'rápido';
  if (sPerKm < 420) return 'sólido';
  if (sPerKm < 480) return 'moderado';
  return 'regenerativo';
}

/**
 * Deterministic, grounded analysis built purely from the real metrics. Used as
 * the answer when the LLM is disabled or its output fails validation, and as
 * the source of authoritative numbers when the LLM is used.
 */
export function fallbackAnalysis(metrics) {
  const km = metrics.distance_km;
  const band = paceBand(metrics.pace_s_per_km);

  const strengths = [];
  const improvements = [];

  if (km != null) strengths.push(`Completaste ${km} km, terminar ya es un logro.`);
  if (metrics.pace_label) strengths.push(`Mantuviste un ritmo ${band} (${metrics.pace_label}).`);
  if (metrics.deviations === 0) strengths.push('No te desviaste de la ruta: buen foco.');

  if (metrics.avg_hr == null) improvements.push('Usá un pulsómetro para medir el esfuerzo real.');
  if (metrics.deviations > 2) improvements.push('Te desviaste varias veces; anticipá los giros.');
  if (km != null && km < 5) improvements.push('Sumá volumen de a poco para construir base aeróbica.');
  if (improvements.length === 0) improvements.push('Probá intervalos para ganar velocidad sin perder técnica.');

  const headline = km != null
    ? `Corriste ${km} km en ${metrics.duration_min ?? '—'} min`
    : 'Resumen de tu corrida';

  const summary = [
    km != null ? `Recorriste ${km} km` : 'Registramos tu corrida',
    metrics.duration_min != null ? `en ${metrics.duration_min} min` : null,
    metrics.pace_label ? `a un ritmo ${band} de ${metrics.pace_label}` : null,
    metrics.avg_hr != null ? `con ${metrics.avg_hr} ppm promedio` : null,
    metrics.elev_gain_m != null ? `y ${metrics.elev_gain_m} m de desnivel` : null,
  ].filter(Boolean).join(' ') + '.';

  const next_km = km != null ? Math.max(2, Math.round(km * (km < 5 ? 1.2 : 1.1))) : 5;

  return {
    headline,
    summary,
    pace_assessment: metrics.pace_label
      ? `Tu ritmo fue ${band} (${metrics.pace_label}).`
      : 'No registramos ritmo en esta salida.',
    strengths: strengths.length ? strengths.slice(0, 4) : ['Saliste a entrenar: lo más difícil ya está hecho.'],
    improvements: improvements.slice(0, 4),
    recommendation: km != null && km >= 10
      ? 'Sumá una sesión de fuerza esta semana para sostener distancias largas.'
      : 'Alterná días de trote suave con uno de series cortas para progresar.',
    next_run: {
      distance_km: next_km,
      focus: band === 'regenerativo' ? 'ritmo controlado' : 'mantener el ritmo y sumar 1 km',
    },
    metrics,
  };
}

function buildAnalysisMessages(metrics) {
  const system =
    'Sos FitNow Coach, un entrenador de running. Analizá la corrida del usuario y ' +
    'respondé SOLO con un objeto JSON con estas claves exactas: headline (string), ' +
    'summary (string), pace_assessment (string), strengths (array de 1 a 4 strings), ' +
    'improvements (array de 1 a 4 strings), recommendation (string), next_run ' +
    '(objeto con distance_km number y focus string). Español, motivador y concreto. ' +
    'No inventes números: usá solo los datos provistos.';

  const data = {
    distancia_km: metrics.distance_km,
    duracion_min: metrics.duration_min,
    ritmo:        metrics.pace_label,
    pulso_promedio: metrics.avg_hr,
    desvios:      metrics.deviations,
    desnivel_m:   metrics.elev_gain_m,
  };

  return [
    { role: 'system', content: system },
    { role: 'user', content: `Datos de la corrida: ${JSON.stringify(data)}` },
  ];
}

/**
 * Analyze a finished run session. Returns a validated, grounded analysis.
 * `ai_mode` is 'real' when the LLM enriched it, 'stub' when the deterministic
 * fallback was used (no key, upstream error, or output that failed validation).
 */
export async function analyzeRun(session) {
  const metrics = computeRunMetrics(session);
  const grounded = fallbackAnalysis(metrics);

  if (!isAiEnabled()) {
    return { ...grounded, ai_mode: 'stub', model: null };
  }

  let res;
  try {
    res = await chatJSON({ messages: buildAnalysisMessages(metrics), jsonMode: true, temperature: 0.5, maxTokens: 600 });
  } catch {
    return { ...grounded, ai_mode: 'stub', model: null };
  }

  if (!res || !res.ok) {
    return { ...grounded, ai_mode: 'stub', model: null };
  }

  // FILTER: the model's output is only accepted if it matches the schema.
  const valid = validateRunAnalysis(res.data);
  if (!valid) {
    return { ...grounded, ai_mode: 'stub', model: getModel() };
  }

  // GROUNDING: keep the model's narrative, but the numbers stay ours.
  return {
    ...valid,
    next_run: { distance_km: metrics.distance_km ? Math.max(2, Math.round(metrics.distance_km)) : valid.next_run.distance_km, focus: valid.next_run.focus },
    metrics,
    ai_mode: 'real',
    model: getModel(),
  };
}
