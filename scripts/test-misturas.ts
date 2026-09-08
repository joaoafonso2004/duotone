// As playlists que a app monta sozinha, em Node puro.
import assert from 'node:assert/strict';
import {
  misturasDaBiblioteca, MISTURAS, MINIMO_PARA_VALER, POR_MISTURA, radiosDeArtista,
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

verificar('a mistura intercala o teu com o novo', () => {
  // É isto que separa uma mistura de uma lista: sai-se do que já se conhece
  // sem se sair do que se gosta.
  const lib = muitas('A', 6);
  const vizinhas = new Map([['a', [f('v1', 'Vizinho'), f('v2', 'Vizinho'), f('v3', 'Vizinho')]]]);
  const r = misturasDaBiblioteca([{ name: 'A' }], lib, chaveT, chaveN, (l) => [...l], 0, vizinhas);
  const ids = r[0].faixas.map((t) => t.sourceId);
  assert.equal(ids[0], 'A0', 'o conhecido dá o tom');
  assert.equal(ids[1], 'v1', 'e o novo entra por entre ele');
  assert.equal(ids[2], 'A1');
  assert.equal(ids[3], 'v2');
});

verificar('sem vizinhos degrada para a biblioteca, não desaparece', () => {
  const lib = muitas('A', 7);
  const r = misturasDaBiblioteca([{ name: 'A' }], lib, chaveT, chaveN);
  assert.equal(r.length, 1);
  assert.equal(r[0].faixas.length, 7, 'a mistura sai mais curta, e sai');
});

verificar('as novas não ficam todas no fim', () => {
  // Em bloco, o que é novo ficava onde ninguém chega -- e a mistura era a
  // biblioteca com um apêndice.
  const lib = muitas('A', 20);
  const vizinhas = new Map([['a', Array.from({ length: 20 }, (_, i) => f('v' + i, 'Vizinho'))]]);
  const r = misturasDaBiblioteca([{ name: 'A' }], lib, chaveT, chaveN, (l) => [...l], 0, vizinhas);
  const metade = r[0].faixas.slice(0, Math.floor(r[0].faixas.length / 2));
  assert.ok(metade.some((t) => t.artist === 'Vizinho'), 'há novidade na primeira metade');
});

verificar('um artista com pouca biblioteca mas muitos vizinhos VALE', () => {
  // O mínimo conta as duas fontes. Contá-lo só sobre a biblioteca deitava
  // fora misturas perfeitamente boas -- e era isso que fazia aparecerem três
  // playlists onde cabiam quatro.
  const lib = muitas('A', 2);
  const vizinhas = new Map([['a', Array.from({ length: 10 }, (_, i) => f('v' + i, 'Vizinho'))]]);
  const r = misturasDaBiblioteca([{ name: 'A' }], lib, chaveT, chaveN, undefined, 0, vizinhas);
  assert.equal(r.length, 1, 'duas guardadas mais dez descobertas dão uma mistura');
  assert.ok(r[0].faixas.length >= MINIMO_PARA_VALER);
});

verificar('sem biblioteca nem vizinhos continua a não haver mistura', () => {
  const r = misturasDaBiblioteca([{ name: 'A' }], muitas('A', 2), chaveT, chaveN);
  assert.deepEqual(r, [], 'duas faixas com um título por cima não são playlist');
});

verificar('a chave das vizinhas é a NORMALIZADA', () => {
  // O bug que isto guarda: a descoberta preenchia o mapa com o nome em cru e
  // a leitura procurava pela chave normalizada. Nenhuma leitura acertava,
  // ninguém dava erro, e as misturas saíam sem vizinhos.
  const lib = muitas('Juice WRLD', 6);
  const crua = new Map([['Juice WRLD', [f('v1', 'Vizinho')]]]);
  const normal = new Map([['juice wrld', [f('v1', 'Vizinho')]]]);
  const comCrua = misturasDaBiblioteca([{ name: 'Juice WRLD' }], lib, chaveT, chaveN, undefined, 0, crua);
  const comNormal = misturasDaBiblioteca([{ name: 'Juice WRLD' }], lib, chaveT, chaveN, undefined, 0, normal);
  assert.ok(!comCrua[0].faixas.some((t) => t.artist === 'Vizinho'), 'a chave crua não é encontrada');
  assert.ok(comNormal[0].faixas.some((t) => t.artist === 'Vizinho'), 'a normalizada é');
});

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam`);
  process.exit(1);
}
console.log('\nMisturas: só quando há música que chegue para elas.');

// ------------------------------------------------------------------ radios

verificar('a radio e sobretudo musica nova, ao contrario da mistura', () => {
  const lib = muitas('A', 10);
  const vizinhas = new Map([['a', muitas('Novo', 12)]]);
  const r = radiosDeArtista([{ name: 'A' }], lib, chaveT, chaveN, vizinhas);
  assert.equal(r.length, 1);
  assert.equal(r[0].nome, 'A radio');
  const novas = r[0].faixas.filter((t) => t.artist === 'Novo').length;
  // Tres em cada quatro: e isto que a separa de uma mistura.
  assert.ok(novas > r[0].faixas.length * 0.6, `so ${novas} de ${r[0].faixas.length}`);
});

verificar('sem vizinhos que cheguem nao ha radio', () => {
  const r = radiosDeArtista(
    [{ name: 'A' }], muitas('A', 30), chaveT, chaveN,
    new Map([['a', muitas('Novo', 2)]]),
  );
  assert.equal(r.length, 0);
});

verificar('a radio funciona sem nada teu do artista', () => {
  // O artista pode estar no historico e nao na biblioteca.
  const r = radiosDeArtista(
    [{ name: 'A' }], [], chaveT, chaveN, new Map([['a', muitas('Novo', 12)]]),
  );
  assert.equal(r.length, 1);
  assert.ok(r[0].faixas.length > 0);
});

verificar('nao devolve mais radios do que o pedido', () => {
  const vizinhas = new Map([
    ['a', muitas('N1', 12)], ['b', muitas('N2', 12)], ['c', muitas('N3', 12)],
  ]);
  const r = radiosDeArtista(
    [{ name: 'A' }, { name: 'B' }, { name: 'C' }], [], chaveT, chaveN, vizinhas, undefined, 2,
  );
  assert.equal(r.length, 2);
});
