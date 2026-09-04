import assert from 'node:assert/strict';
import { correspondeAPesquisa, normalizarPesquisa } from '../src/lib/searchText.ts';
import { planearMerge } from '../src/lib/playlistMerge.ts';
import type { Track } from '../src/types.ts';
import { contaComResetDeArtistas, semCanaisLegadosNosArtistas } from '../src/lib/artistName.ts';

assert.equal(normalizarPesquisa('  Beyoncé  '), 'beyonce');
assert.equal(correspondeAPesquisa('joao', 'João Gilberto'), true);
assert.equal(correspondeAPesquisa('rosalia', 'ROSALÍA'), true);
assert.equal(correspondeAPesquisa('bjork', 'Beyoncé', 'Björk'), true);
assert.equal(correspondeAPesquisa('drake', 'Björk'), false);

const faixa = (sourceId: string): Track => ({
  source: 'youtube', sourceId, title: sourceId, artist: null,
  album: null, artworkUrl: null, durationSeconds: null,
});
const alvo = [faixa('a'), faixa('b')];
const origem = [faixa('b'), faixa('c'), faixa('c'), faixa('d')];
const plano = planearMerge(alvo, origem);
assert.deepEqual(plano.novas.map((t) => t.sourceId), ['c', 'd']);
assert.equal(plano.repetidas, 2);
assert.deepEqual(alvo.map((t) => t.sourceId), ['a', 'b'], 'o planeamento não altera o destino');
assert.deepEqual(origem.map((t) => t.sourceId), ['b', 'c', 'c', 'd'], 'o planeamento não altera a origem');

const legadas: Track[] = [
  { ...faixa('legacy'), title: 'Juice WRLD - Lucid Dreams', artist: 'Random Uploads' },
  { ...faixa('topic'), title: 'Song', artist: 'Björk - Topic' },
];
const reescritas = semCanaisLegadosNosArtistas(legadas);
assert.equal(reescritas[0].artist, null, 'canal de upload deixa de criar artista na vista de @joao');
assert.equal(reescritas[1].artist, 'Björk - Topic', 'fonte oficial é preservada');
assert.equal(legadas[0].artist, 'Random Uploads', 'a faixa original e o catálogo não são alterados');
assert.equal(contaComResetDeArtistas({ username: '@Joao' }), true);
assert.equal(contaComResetDeArtistas({ name: 'joao' }), true, 'contas antigas podem só ter name');
assert.equal(contaComResetDeArtistas({ username: 'joana' }), false, 'nenhuma outra conta recebe a migração');

console.log('Pesquisa sem acentos e merge sem repetidos passaram.');
