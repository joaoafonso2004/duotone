import { readFileSync } from 'node:fs';
import { parseSpotifyCsv } from '../src/lib/spotifyCsv.ts';

const path = process.argv[2];
if (!path) {
  console.error('uso: node scripts/check-real-csv.ts <ficheiro.csv>');
  process.exit(1);
}

const text = readFileSync(path, 'utf8');
const r = parseSpotifyCsv(text);

console.log('cabeçalhos:', r.headers.length);
r.headers.forEach((h, i) => console.log(`  [${i}] ${JSON.stringify(h)}`));
console.log('\nlinhas lidas:', r.rows.length, ' ignoradas:', r.skipped);
for (const row of r.rows.slice(0, 12)) {
  console.log(`  ${row.artist} — ${row.title}  (${row.durationMs}ms, ${row.album})`);
}
