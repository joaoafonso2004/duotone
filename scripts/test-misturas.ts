// As playlists que a app monta sozinha, em Node puro.
import assert from 'node:assert/strict';
import {
  misturasDaBiblioteca, MISTURAS, MINIMO_PARA_VALER, POR_MISTURA,
} from '../src/lib/misturas.ts';
import type { Track } from '../src/types.ts';

const f = (id: string, artista: string): Track => ({ source: 'youtube', sourceId: id,
  title: id, artist: artista, album: null, artworkUrl: null, durationSeconds: null });
const chaveT = (t: Track) => (t.artist ?? '').toLowerCase();
const chaveN = (n: string) => n.toLowerCase();
/** Muitas faixas de um artista, para passar o mínimo. */
const muitas = (artista: string, n: number) =>
  Array.from({ length: n }, (_, i) => f(`${artista}${i}`, artista));

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

verificar('uma mistura por artista, pela ordem de quem se ouve mais', () => {
  const lib = [...muitas('A', 6), ...muitas('B', 8)];
  const r = misturasDaBiblioteca([{ name: 'B' }, { name: 'A' }], lib, chaveT, chaveN);
  assert.deepEqual(r.map((m) => m.nome), ['B mix', 'A mix']);
  assert.equal(r[0].faixas.length, 8);
});

verificar('um artista com pouca música não dá playlist', () => {
  // Três faixas com um título por cima não são uma playlist, e a capa em
  // mosaico ficaria com células vazias a denunciar a invenção.
  const lib = [...muitas('A', MINIMO_PARA_VALER - 1), ...muitas('B', MINIMO_PARA_VALER)];
  const r = misturasDaBiblioteca([{ name: 'A' }, { name: 'B' }], lib, chaveT, chaveN);
  assert.deepEqual(r.map((m) => m.nome), ['B mix'], 'o A fica de fora e passa-se ao seguinte');
});

verificar('não se mostram mais do que as que cabem', () => {
  const nomes = ['A', 'B', 'C', 'D', 'E', 'F'];
  const lib = nomes.flatMap((n) => muitas(n, 6));
  const r = misturasDaBiblioteca(nomes.map((name) => ({ name })), lib, chaveT, chaveN);
  assert.equal(r.length, MISTURAS);
});

verificar('uma mistura não cresce sem fim', () => {
  const lib = muitas('A', POR_MISTURA + 40);
  const r = misturasDaBiblioteca([{ name: 'A' }], lib, chaveT, chaveN);
  assert.equal(r[0].faixas.length, POR_MISTURA);
});

verificar('o id é estável e não depende da ordem de chegada', () => {
  const lib = muitas('Juice WRLD', 6);
  const a = misturasDaBiblioteca([{ name: 'Juice WRLD' }], lib, chaveT, chaveN);
  const b = misturasDaBiblioteca([{ name: 'juice wrld' }], lib, chaveT, chaveN);
  assert.equal(a[0].id, b[0].id, 'a chave normaliza, o id acompanha');
});

verificar('sem biblioteca ou sem artistas não se inventa nada', () => {
  assert.deepEqual(misturasDaBiblioteca([{ name: 'A' }], [], chaveT, chaveN), []);
  assert.deepEqual(misturasDaBiblioteca([], muitas('A', 9), chaveT, chaveN), []);
});

verificar('faixas sem artista não formam uma mistura fantasma', () => {
  const lib = Array.from({ length: 9 }, (_, i) => f(`x${i}`, ''));
  assert.deepEqual(misturasDaBiblioteca([{ name: '' }], lib, chaveT, chaveN), []);
});

verificar('o deslocamento muda quem sai hoje', () => {
  const nomes = ['A', 'B', 'C', 'D', 'E', 'F'];
  const lib = nomes.flatMap((n) => muitas(n, 6));
  const artistas = nomes.map((name) => ({ name }));
  const hoje = misturasDaBiblioteca(artistas, lib, chaveT, chaveN, undefined, 0);
  const amanha = misturasDaBiblioteca(artistas, lib, chaveT, chaveN, undefined, 1);
  assert.notDeepEqual(hoje.map((m) => m.nome), amanha.map((m) => m.nome),
    'dois dias seguidos não podem dar a mesma lista');
  assert.equal(amanha.length, MISTURAS, 'e continuam a ser quatro');
});

verificar('o mesmo dia dá sempre o mesmo', () => {
  // Dentro do mesmo dia a página tem de ser estável: sair da pesquisa e
  // voltar não pode baralhar as playlists de sítio.
  const nomes = ['A', 'B', 'C', 'D', 'E'];
  const lib = nomes.flatMap((n) => muitas(n, 6));
  const artistas = nomes.map((name) => ({ name }));
  const a = misturasDaBiblioteca(artistas, lib, chaveT, chaveN, undefined, 3);
  const b = misturasDaBiblioteca(artistas, lib, chaveT, chaveN, undefined, 3);
  assert.deepEqual(a.map((m) => m.id), b.map((m) => m.id));
});

verificar('dá a volta em vez de devolver menos', () => {
  // Os primeiros do deslocamento não têm música que chegue; em vez de
  // devolver duas playlists, continua pelos seguintes.
  const lib = [...muitas('A', 2), ...muitas('B', 2), ...muitas('C', 9), ...muitas('D', 9)];
  const artistas = [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }];
  const r = misturasDaBiblioteca(artistas, lib, chaveT, chaveN, undefined, 0);
  assert.deepEqual(r.map((m) => m.nome).sort(), ['C mix', 'D mix']);
});

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam`);
  process.exit(1);
}
console.log('\nMisturas: só quando há música que chegue para elas.');
