// bench/dump-portfolios.js
// Genera la cartera de candidatas del método M para cada caso de la matriz
// del banco y la vuelca a un JSONL (una línea por caso, con la geometría de
// cada candidata). Ese volcado permite re-puntuar las carteras offline con
// distintas combinaciones de pesos (ver weight-sweep.js) sin volver a llamar
// a OSRM: la generación se paga una sola vez.
//
// Uso:
//   node bench/dump-portfolios.js            → 30 orígenes × [3000,5000,8000,12000]
//   node bench/dump-portfolios.js --origins 8 --distances 5000

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generatePortfolio, circularFallback } from '../src/services/routeGenerator.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORIGINS = JSON.parse(fs.readFileSync(path.join(__dirname, 'origins-mdp.json'))).origins;

const TOLERANCE = 0.05;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 5 decimales ≈ 1 m de precisión: suficiente para la evaluación y achica el archivo.
const round5 = (coords) => coords.map(([lng, lat]) => [Math.round(lng * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5]);

async function main() {
  const args = process.argv.slice(2);
  const nOrigins = args.includes('--origins') ? parseInt(args[args.indexOf('--origins') + 1], 10) : ORIGINS.length;
  const distances = args.includes('--distances')
    ? args[args.indexOf('--distances') + 1].split(',').map(Number)
    : [3000, 5000, 8000, 12000];

  const origins = ORIGINS.slice(0, nOrigins);
  const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  const outPath = path.join(__dirname, `portfolios-${ts}.jsonl`);
  const out = fs.createWriteStream(outPath);

  console.log(`Volcado de carteras: ${origins.length} orígenes × ${distances.length} distancias`);

  for (const origin of origins) {
    for (const d of distances) {
      let candidates;
      try {
        candidates = await generatePortfolio(origin.lat, origin.lng, d);
      } catch (e) {
        console.log(`  ✗ ${origin.name} ${d}m: ${e.message}`);
        continue;
      }
      const inRange = c => Math.abs(c.distance_m - d) / d <= TOLERANCE;
      const eligible = candidates.filter(inRange).map(c => ({
        kind: c.spec?.kind ?? 'circuito',
        distance_m: c.distance_m,
        fallback: false,
        coordinates: round5(c.geojson?.coordinates ?? []),
      }));
      for (const b of [0, 90, 180, 270]) {
        if (eligible.length >= 3) break;
        eligible.push({
          kind: 'circular',
          distance_m: d,
          fallback: true,
          coordinates: round5(circularFallback(origin.lat, origin.lng, d, b).coordinates),
        });
      }
      out.write(JSON.stringify({ zone: origin.zone, origin: origin.name, target_m: d, candidates: eligible }) + '\n');
      console.log(`  ✓ ${origin.name} — ${d} m (${eligible.length} elegibles)`);
      await sleep(300);
    }
  }

  out.end();
  console.log(`\nJSONL: ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
