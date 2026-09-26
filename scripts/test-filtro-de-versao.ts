// O filtro por versão da pesquisa (lib/filtroDeVersao.ts).
import assert from 'node:assert/strict';
import { filtrosComResultados, versaoPassa } from '../src/lib/filtroDeVersao';

const T = {
  estudio: 'Travis Scott - HIGHEST IN THE ROOM (Official Audio)',
  remix: 'HIGHEST IN THE ROOM (Remix) ft. ROSALÍA & Lil Baby',
  slowed: 'Travis Scott - HIGHEST IN THE ROOM (slowed + reverb)',
  live: 'Travis Scott - HIGHEST IN THE ROOM (Live at Rolling Loud)',
  acustica: 'HIGHEST IN THE ROOM acoustic cover',
};
assert.equal(versaoPassa(T.estudio, 'original'), true, 'o upload oficial é o original');
assert.equal(versaoPassa(T.remix, 'original'), false);
assert.equal(versaoPassa(T.remix, 'remix'), true);
assert.equal(versaoPassa(T.slowed, 'ritmo'), true);
assert.equal(versaoPassa(T.slowed, 'remix'), false);
assert.equal(versaoPassa(T.live, 'live'), true);
assert.equal(versaoPassa(T.acustica, 'acustica'), true);
assert.equal(versaoPassa(T.acustica, 'original'), false, 'um cover acústico não é o original');
assert.ok(Object.values(T).every((t) => versaoPassa(t, 'todas')));
assert.deepEqual(filtrosComResultados([T.estudio, T.slowed]), ['todas', 'original', 'ritmo'], 'só aparecem filtros com resultados');
assert.deepEqual(filtrosComResultados([]), ['todas']);
console.log('Filtro de versão: passou.');
