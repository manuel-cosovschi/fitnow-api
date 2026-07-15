// bench/weight-sweep.js
// Barrido sistemático de pesos del evaluador multicriterio sobre las carteras
// volcadas por dump-portfolios.js. Para cada combinación de pesos re-puntúa
// las 120 carteras (sin llamar a OSRM), aplica la misma política de selección
// que producción (calles antes que respaldos) y mide qué ruta quedaría
// recomendada. El resultado es la curva de compromiso entre fidelidad de
// distancia y exposición a hazards que justifica los pesos elegidos.
//
// Uso:
//   node bench/weight-sweep.js bench/portfolios-<ts>.jsonl
//
// Grilla: w_dist + w_hazard + w_turns = 1, paso 0.05, cada peso >= 0.05
// (el peso de historial queda en 0: el dataset del banco no tiene rutas
// calificadas, igual que en la corrida principal).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scorePortfolio } from '../src/services/routeEvaluator.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HAZARDS = JSON.parse(fs.readFileSync(path.join(__dirname, 'hazards-seed.json'))).hazards;

const dumpPath = process.argv[2];
if (!dumpPath) { console.error('Uso: node bench/weight-sweep.js <portfolios.jsonl>'); process.exit(1); }

const cases = fs.readFileSync(dumpPath, 'utf8').trim().split('\n').map(JSON.parse);
console.log(`Carteras: ${cases.length} casos, ${HAZARDS.length} hazards\n`);

// Grilla del simplex con paso 0.05.
const STEP = 0.05;
const combos = [];
for (let wd = STEP; wd <= 0.9001; wd += STEP) {
  for (let wh = STEP; wd + wh <= 0.9501; wh += STEP) {
    const wt = 1 - wd - wh;
    if (wt < STEP - 1e-9) continue;
    combos.push({
      w_dist_fid: Math.round(wd * 100) / 100,
      w_hazard_exp: Math.round(wh * 100) / 100,
      w_turns: Math.round(wt * 100) / 100,
      w_hist: 0,
    });
  }
}
console.log(`Combinaciones de pesos: ${combos.length}`);

// Puntos con nombre: los pesos de producción y los perfiles con sus
// multiplicadores efectivos (scorePortfolio renormaliza internamente).
const NAMED = [
  { label: 'produccion',  w_dist_fid: 0.45,  w_hazard_exp: 0.35,  w_turns: 0.20, w_hist: 0 },
  { label: 'seguridad',   w_dist_fid: 0.315, w_hazard_exp: 0.595, w_turns: 0.20, w_hist: 0 },
  { label: 'distancia',   w_dist_fid: 0.72,  w_hazard_exp: 0.175, w_turns: 0.20, w_hist: 0 },
];

const mean = arr => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);

const rows = [];
for (const w of [...combos.map(c => ({ label: '', ...c })), ...NAMED]) {
  const errs = [], expos = [], turns = []; let fallbacks = 0;
  for (const c of cases) {
    const candidates = c.candidates.map(k => ({
      spec: { kind: k.kind },
      distance_m: k.distance_m,
      fallback: k.fallback,
      geojson: { type: 'LineString', coordinates: k.coordinates },
    }));
    const ranked = scorePortfolio(candidates, { hazards: HAZARDS, weights: w, targetM: c.target_m });
    const ordered = [...ranked.filter(x => !x.fallback), ...ranked.filter(x => x.fallback)];
    const top = ordered[0];
    errs.push(Math.abs(top.distance_m - c.target_m) / c.target_m * 100);
    expos.push(top.criteria.hazard_exposure_m);
    turns.push(top.criteria.turns_per_km);
    if (top.fallback) fallbacks++;
  }
  rows.push({
    ...w,
    err_mean: Math.round(mean(errs) * 1000) / 1000,
    valid_pct: Math.round(errs.filter(e => e <= 5).length / errs.length * 1000) / 10,
    exposure_mean: Math.round(mean(expos) * 10) / 10,
    turns_mean: Math.round(mean(turns) * 100) / 100,
    fallbacks,
  });
}

// CSV
const csvPath = path.join(__dirname, 'weight-sweep-results.csv');
const headers = Object.keys(rows[0]);
fs.writeFileSync(csvPath, [headers.join(','), ...rows.map(r => headers.map(h => r[h]).join(','))].join('\n'));

// Frente de Pareto sobre (err_mean, exposure_mean): nadie lo domina en ambas.
const pareto = rows.filter(r =>
  !rows.some(o => (o.err_mean < r.err_mean && o.exposure_mean <= r.exposure_mean) ||
                  (o.err_mean <= r.err_mean && o.exposure_mean < r.exposure_mean)));
pareto.sort((a, b) => a.exposure_mean - b.exposure_mean);

console.log('\n════ FRENTE DE PARETO (error medio vs exposición media) ════');
console.log('w_dist | w_haz | w_turns | err% | exposición | giros/km');
for (const r of pareto) {
  console.log([r.w_dist_fid.toFixed(2), r.w_hazard_exp.toFixed(2), r.w_turns.toFixed(2),
               r.err_mean.toFixed(2).padStart(5), r.exposure_mean.toFixed(1).padStart(9),
               r.turns_mean.toFixed(2).padStart(8)].join(' | '));
}

// Referencia: los pesos de producción normalizados sin historial (0.45/0.35/0.20).
const ref = rows.find(r => r.w_dist_fid === 0.45 && r.w_hazard_exp === 0.35 && r.w_turns === 0.2);
if (ref) {
  const dominated = rows.some(o => (o.err_mean < ref.err_mean && o.exposure_mean <= ref.exposure_mean) ||
                                   (o.err_mean <= ref.err_mean && o.exposure_mean < ref.exposure_mean));
  console.log(`\nPesos de producción (0.45/0.35/0.20): err ${ref.err_mean.toFixed(2)}% | exposición ${ref.exposure_mean.toFixed(1)} m | giros ${ref.turns_mean.toFixed(2)} | ${dominated ? 'DOMINADO (revisar)' : 'en el frente de Pareto o no dominado'}`);
}
console.log(`\nCSV: ${csvPath}`);
