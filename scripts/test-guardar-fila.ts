// Guardar a fila como playlist (11/10). Correr: node --experimental-strip-types scripts/test-guardar-fila.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { faixasDaFila, nomeParaAFila } from '../src/lib/guardarFila.ts';

const dia = new Date(2026, 9, 11);
assert.equal(nomeParaAFila({ tipo: 'mistura', nome: 'Sia Mix' }, dia), 'Sia Mix', 'um Mix leva o nome dele');
assert.equal(nomeParaAFila({ tipo: 'prateleira', nome: 'Discover daily' }, dia), 'Discover daily');
assert.equal(nomeParaAFila({ tipo: 'playlist', nome: 'Rap tuga' }, dia), 'Queue · 11 Oct', 'não repete o nome de uma playlist');
assert.equal(nomeParaAFila({ tipo: 'guardadas', nome: 'Liked Songs' }, dia), 'Queue · 11 Oct');
assert.equal(nomeParaAFila(null, dia), 'Queue · 11 Oct');
assert.equal(nomeParaAFila({ tipo: 'artista', nome: '   ' }, dia), 'Queue · 11 Oct');

const a = { source: 'youtube', sourceId: 'a' }, b = { source: 'youtube', sourceId: 'b' }, c = { source: 'youtube', sourceId: 'c' };
assert.deepEqual(faixasDaFila(a, [b, c]), [a, b, c], 'a que toca primeiro');
assert.deepEqual(faixasDaFila(a, [b, a, c, b]), [a, b, c], 'sem repetidas');
assert.deepEqual(faixasDaFila(null, [b, c]), [b, c]);
assert.deepEqual(faixasDaFila(null, []), []);

// O botão está na fila, e usa o que já existe para criar a playlist.
const fila = readFileSync(new URL('../src/components/QueueSheet.tsx', import.meta.url), 'utf8');
assert.match(fila, /accessibilityLabel="Save queue as playlist"/);
assert.match(fila, /faixasDaFila\(current, upNext\.map\(\(u\) => u\.track\)\)/);
assert.match(fila, /await createPlaylist\(nome\)/);
assert.match(fila, /await addTracksToPlaylist\(nova\.id, faixas\)/);
console.log('Guardar a fila: o nome sugerido, sem repetidas, e o botão na fila.');
