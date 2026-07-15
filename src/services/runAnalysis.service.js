// src/services/runAnalysis.service.js
// Post-run AI analysis. The numbers are computed from the real session (never
// from the model); the LLM only writes the narrative, and that narrative is
// validated against a fixed schema before it reaches the user. Without an
// OpenAI key it still returns a useful, grounded analysis.
import { isAiEnabled, chatJSON, getModel } from '../utils/openai.js';
import { validateRunAnalysis } from '../utils/aiGuardrails.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Derive the authoritative metrics from a finished run session. */
// Saca los números REALES de tu corrida (distancia, ritmo, pulso, desnivel) desde la sesión guardada. Estos son los datos que no se le dejan inventar al modelo.
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

// Convierte el ritmo (segundos por km) al formato lindo, tipo 6:00/km.
function formatPace(sPerKm) {
  const m = Math.floor(sPerKm / 60);
  const s = Math.round(sPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

// Clasifica el ritmo en una etiqueta: rápido, sólido, moderado, etc.
function paceBand(sPerKm) {
  if (sPerKm == null) return 'sin ritmo';
  if (sPerKm < 300) return 'muy rápido';
  if (sPerKm < 360) return 'rápido';
  if (sPerKm < 420) return 'sólido';
  if (sPerKm < 480) return 'moderado';
  return 'regenerativo';
}

/**
 * Training load context from the runner's recent completed sessions.
 * ACWR (acute:chronic workload ratio) compares the last 7 days of volume
 * against the weekly average of the last 28 days. Values above ~1.5 indicate
 * a load spike associated with injury risk; below ~0.8, undertraining.
 */
// Calcula tu carga de entrenamiento: cuántos km hiciste esta semana contra tu promedio del último mes (ACWR). Sirve para avisarte si estás subiendo el volumen demasiado rápido.
export function computeTrainingContext(sessions = [], now = new Date()) {
  // Las sesiones viejas pueden tener finished_at en null; started_at sirve igual.
  const done = sessions.filter((s) => s && isNum(s.distance_m) && (s.finished_at || s.started_at));
  if (done.length === 0) return null;

  const DAY = 86400000;
  let acuteM = 0;
  let monthM = 0;
  const recent = [];

  for (const s of done) {
    const finished = new Date(s.finished_at ?? s.started_at);
    if (isNaN(finished)) continue;
    const daysAgo = (now - finished) / DAY;
    if (daysAgo < 0 || daysAgo > 28) continue;
    monthM += s.distance_m;
    if (daysAgo <= 7) acuteM += s.distance_m;
    if (recent.length < 3) {
      recent.push({
        distancia_km: Math.round((s.distance_m / 1000) * 100) / 100,
        ritmo: isNum(s.avg_pace_s) ? formatPace(s.avg_pace_s) : null,
        hace_dias: Math.max(0, Math.round(daysAgo)),
      });
    }
  }

  if (monthM === 0) return null;

  const acute_km = Math.round((acuteM / 1000) * 10) / 10;
  const chronic_weekly_km = Math.round((monthM / 4000) * 10) / 10;
  // Con menos de 1 km semanal de base el cociente no dice nada.
  const acwr = chronic_weekly_km >= 1 ? Math.round((acute_km / chronic_weekly_km) * 100) / 100 : null;

  let label = null;
  if (acwr != null) {
    if (acwr > 1.5) label = 'riesgo elevado';
    else if (acwr > 1.3) label = 'carga alta';
    else if (acwr < 0.8) label = 'subcarga';
    else label = 'zona segura';
  }

  return { acute_km, chronic_weekly_km, acwr, label, recent };
}

/**
 * Deterministic, grounded analysis built purely from the real metrics. Used as
 * the answer when the LLM is disabled or its output fails validation, and as
 * the source of authoritative numbers when the LLM is used.
 */
// Arma un análisis completo solo con tus números, sin IA. Se usa cuando no hay OpenAI o cuando la respuesta del modelo no pasa la validación.
export function fallbackAnalysis(metrics, training = null) {
  const km = metrics.distance_km;
  const band = paceBand(metrics.pace_s_per_km);

  const strengths = [];
  const improvements = [];

  if (km != null) strengths.push(`Completaste ${km} km, terminar ya es un logro.`);
  if (metrics.pace_label) strengths.push(`Mantuviste un ritmo ${band} (${metrics.pace_label}).`);
  if (metrics.deviations === 0) strengths.push('No te desviaste de la ruta: buen foco.');

  if (training?.label === 'riesgo elevado') improvements.push(`Esta semana llevás ${training.acute_km} km contra un promedio de ${training.chronic_weekly_km}: bajá un cambio para no lesionarte.`);
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

// Arma las instrucciones para el modelo, pidiéndole que devuelva un JSON con un formato fijo.
function buildAnalysisMessages(metrics, training = null) {
  const system =
    'Sos FitNow Coach, un entrenador de running. Analizá la corrida del usuario y ' +
    'respondé SOLO con un objeto JSON con estas claves exactas: headline (string), ' +
    'summary (string), pace_assessment (string), strengths (array de 1 a 4 strings), ' +
    'improvements (array de 1 a 4 strings), recommendation (string), next_run ' +
    '(objeto con distance_km number y focus string). Español, motivador y concreto. ' +
    'No inventes números: usá solo los datos provistos. Si viene el historial y la ' +
    'carga de entrenamiento, tenelos en cuenta para la recomendación y la próxima ' +
    'corrida (un ACWR mayor a 1.5 indica que la carga semanal subió demasiado rápido).';

  const data = {
    distancia_km: metrics.distance_km,
    duracion_min: metrics.duration_min,
    ritmo:        metrics.pace_label,
    pulso_promedio: metrics.avg_hr,
    desvios:      metrics.deviations,
    desnivel_m:   metrics.elev_gain_m,
  };

  if (training) {
    data.historial = {
      ultimas_corridas: training.recent,
      km_ultimos_7_dias: training.acute_km,
      km_semanales_promedio_28_dias: training.chronic_weekly_km,
      acwr: training.acwr,
      carga: training.label,
    };
  }

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
// El corazón del análisis: calcula tus métricas, le pide el texto a la IA, valida que venga con el formato correcto y, si no, usa el análisis calculado. Los números siempre son los tuyos.
export async function analyzeRun(session, history = []) {
  const metrics = computeRunMetrics(session);
  const training = computeTrainingContext(history);
  const grounded = fallbackAnalysis(metrics, training);

  if (!isAiEnabled()) {
    return { ...grounded, training_load: training, ai_mode: 'stub', model: null };
  }

  let res;
  try {
    res = await chatJSON({ messages: buildAnalysisMessages(metrics, training), jsonMode: true, temperature: 0.5, maxTokens: 600 });
  } catch {
    return { ...grounded, training_load: training, ai_mode: 'stub', model: null };
  }

  if (!res || !res.ok) {
    return { ...grounded, training_load: training, ai_mode: 'stub', model: null };
  }

  // FILTER: the model's output is only accepted if it matches the schema.
  const valid = validateRunAnalysis(res.data);
  if (!valid) {
    return { ...grounded, training_load: training, ai_mode: 'stub', model: getModel() };
  }

  // GROUNDING: keep the model's narrative, but the numbers stay ours.
  return {
    ...valid,
    next_run: { distance_km: metrics.distance_km ? Math.max(2, Math.round(metrics.distance_km)) : valid.next_run.distance_km, focus: valid.next_run.focus },
    metrics,
    training_load: training,
    ai_mode: 'real',
    model: getModel(),
  };
}
