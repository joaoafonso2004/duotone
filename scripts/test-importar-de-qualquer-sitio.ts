/**
 * Importar música de qualquer sítio (5/11): os links do Deezer e do Apple
 * Music, as listas coladas e os ficheiros, a caixa única que percebe o que é,
 * e o fim que diz quais faltaram. Sem rede: o Deezer e o Apple Music leem-se
 * de recortes reais (scripts/fixtures, um pedido a cada a 5/11).
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-importar-de-qualquer-sitio.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  lerFaixasDoDeezer, lerLink, lerPaginaDaApple, lerPlaylistDoDeezer, servicoSemLeitura,
} from '../src/lib/linkDePlaylist.ts';
import { lerLinhaDeTexto, lerListaDeMusicas } from '../src/lib/listaDeMusicas.ts';
import { entradaDaImportacao, notaDoCorte } from '../src/lib/entradaDaImportacao.ts';
import {
  importarLeitura, importarLinhas, leituraDasLinhas, lerPlaylist, MAXIMO_POR_IMPORTACAO,
  type Dependencias, type FaixaImportada,
} from '../src/lib/importacaoPorLink.ts';
import { frasesDaImportacao } from '../src/lib/frasesDaImportacao.ts';

let falhas = 0;
const caso = async (nome: string, fn: () => void | Promise<void>) => {
  try { await fn(); console.log(`  ok - ${nome}`); } catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
};
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const linha = (t: string, a = 'X') => ({ title: t, artist: a, album: null, durationMs: null, uri: null });
const faixa = (id: string): FaixaImportada => ({ source: 'youtube', sourceId: id, title: id, artist: null, album: null, artworkUrl: null, durationSeconds: 200 });

console.log('\nos links');
await caso('Deezer: o da web, com e sem língua, e o curto da partilha dentro de uma frase', () => {
  assert.deepEqual(lerLink('https://www.deezer.com/en/playlist/3155776842'), { tipo: 'deezer', id: '3155776842' });
  assert.deepEqual(lerLink('https://www.deezer.com/playlist/3155776842?utm_source=x'), { tipo: 'deezer', id: '3155776842' });
  assert.deepEqual(lerLink('https://deezer.com/pt-br/playlist/123'), { tipo: 'deezer', id: '123' });
  assert.deepEqual(lerLink('Listen to Workout on Deezer! https://link.deezer.com/s/31abcDEF9 ok'), { tipo: 'deezer-curto', url: 'https://link.deezer.com/s/31abcDEF9' });
  assert.equal(lerLink('https://www.deezer.com/en/album/302127'), null);
});
await caso('Apple Music: o link da partilha, sem o ?ls= do fim', () => {
  assert.deepEqual(lerLink('https://music.apple.com/pt/playlist/running-mix/pl.u-AkAmPlyUxDqGB?ls'),
    { tipo: 'apple', url: 'https://music.apple.com/pt/playlist/running-mix/pl.u-AkAmPlyUxDqGB' });
  assert.equal(lerLink('https://music.apple.com/pt/album/x/1440857781'), null);
});
await caso('os que se conhecem mas não se leem sem conta', () => {
  assert.equal(servicoSemLeitura('https://tidal.com/playlist/36ea71a8-445e-41a4-82ab-6628c581535d'), 'Tidal');
  assert.equal(servicoSemLeitura('https://listen.tidal.com/playlist/x'), 'Tidal');
  assert.equal(servicoSemLeitura('https://music.amazon.com/playlists/B07H8LD4VJ'), 'Amazon Music');
  assert.equal(servicoSemLeitura('https://soundcloud.com/user/sets/name'), 'SoundCloud');
  assert.equal(servicoSemLeitura('https://open.spotify.com/playlist/x'), null);
});
await caso('os do Spotify e do YouTube continuam iguais', () => {
  assert.deepEqual(lerLink('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=1'), { tipo: 'spotify', id: '37i9dQZF1DXcBWIGoYBM5M' });
  assert.deepEqual(lerLink('https://music.youtube.com/playlist?list=PLabcdefghij123'), { tipo: 'youtube', id: 'PLabcdefghij123' });
});

console.log('\nas páginas, de recortes reais');
await caso('Deezer: nome, capa, total e faixas com artista, álbum e duração', () => {
  const p = lerPlaylistDoDeezer(JSON.parse(ler('scripts/fixtures/deezer-playlist.json')))!;
  assert.equal(p.nome, 'Top Worldwide');
  assert.equal(p.total, 100);
  assert.match(p.capa ?? '', /^https:\/\/cdn-images\.dzcdn\.net\//);
  assert.equal(p.faixas.length, 3);
  const f = p.faixas[0];
  assert.ok(f.title && f.artist && f.album, 'título, artista e álbum');
  assert.ok(f.durationMs! > 60000, 'a duração vem em segundos e passa a ms');
  assert.match(f.uri ?? '', /^deezer:track:\d+$/);
  assert.equal(lerPlaylistDoDeezer({ error: { type: 'DataException', code: 800 } }), null);
});
await caso('Deezer: uma página das seguintes traz as faixas e o total', () => {
  const p = lerFaixasDoDeezer(JSON.parse(ler('scripts/fixtures/deezer-faixas.json')))!;
  assert.equal(p.total, 100);
  assert.equal(p.faixas.length, 2);
  assert.equal(lerFaixasDoDeezer({ error: {} }), null);
});
await caso('Apple Music: o nome e as faixas, com os artistas todos', () => {
  const p = lerPaginaDaApple(ler('scripts/fixtures/apple-music-playlist.html'))!;
  assert.match(p.nome, /Today.s Hits/);
  assert.equal(p.faixas.length, 3);
  assert.equal(p.faixas[0].title, 'Solar Eclipse');
  assert.equal(p.faixas[0].artist, 'Drake, Don Toliver');
  assert.ok(p.faixas[0].durationMs! > 60000);
  assert.equal(lerPaginaDaApple('<html>mudou</html>'), null);
});

console.log('\nas listas e os ficheiros');
await caso('uma linha: "Artist - Song", com números e marcas, e "Song by Artist"', () => {
  assert.deepEqual(lerLinhaDeTexto('1. Daft Punk - One More Time'), linha('One More Time', 'Daft Punk'));
  assert.deepEqual(lerLinhaDeTexto('• Fleetwood Mac – Dreams'), linha('Dreams', 'Fleetwood Mac'));
  assert.deepEqual(lerLinhaDeTexto('Weird Fishes by Radiohead'), linha('Weird Fishes', 'Radiohead'));
  assert.deepEqual(lerLinhaDeTexto('311 - Amber'), linha('Amber', '311'), 'o número é a banda');
  assert.equal(lerLinhaDeTexto('notes for later'), null);
  assert.equal(lerLinhaDeTexto('https://example.com/a - b'), null);
});
await caso('texto: conta as que se perceberam e as que não', () => {
  const l = lerListaDeMusicas('Daft Punk - One More Time\n\nnotes\n# comentário\nAmália Rodrigues - Estranha Forma de Vida\n');
  assert.equal(l.formato, 'texto');
  assert.equal(l.linhas.length, 2);
  assert.equal(l.ignoradas, 1);
});
await caso('a mesma música duas vezes fica uma (uma pesquisa a menos)', () => {
  const l = lerListaDeMusicas('Radiohead - Weird Fishes\nWeird Fishes by Radiohead\nradiohead - weird fishes');
  assert.deepEqual(l.linhas, [linha('Weird Fishes', 'Radiohead')]);
  assert.equal(l.ignoradas, 0);
});
await caso('CSV do TuneMyMusic (e colado, sem nome de ficheiro)', () => {
  const csv = 'Track name,Artist name,Album,Playlist name,Type,ISRC\n"Dreams","Fleetwood Mac","Rumours","Mix","Playlist",USWB10400004\n"One More Time","Daft Punk","Discovery","Mix","Playlist",GBDUW0000059\n';
  for (const l of [lerListaDeMusicas(csv, 'Mix.csv'), lerListaDeMusicas(csv)]) {
    assert.equal(l.formato, 'csv');
    assert.deepEqual(l.linhas.map((x) => `${x.artist} - ${x.title} (${x.album})`), ['Fleetwood Mac - Dreams (Rumours)', 'Daft Punk - One More Time (Discovery)']);
  }
});
await caso('M3U: o #EXTINF com a duração', () => {
  const l = lerListaDeMusicas('#EXTM3U\n#EXTINF:254,Fleetwood Mac - Dreams\nC:\\musica\\dreams.mp3\n#EXTINF:-1,sem separador\nx.mp3\n', 'mix.m3u');
  assert.equal(l.formato, 'm3u');
  assert.deepEqual(l.linhas, [{ ...linha('Dreams', 'Fleetwood Mac'), durationMs: 254000 }]);
  assert.equal(l.ignoradas, 1);
});

console.log('\na caixa única');
await caso('percebe o que é: link, serviço sem leitura, link qualquer, lista, nada', () => {
  assert.deepEqual(entradaDaImportacao('  '), { tipo: 'vazia' });
  const d = entradaDaImportacao('https://www.deezer.com/en/playlist/3155776842');
  assert.ok(d.tipo === 'link' && d.servico === 'Deezer');
  assert.deepEqual(entradaDaImportacao('https://tidal.com/playlist/abc'), { tipo: 'sem-leitura', servico: 'Tidal' });
  assert.deepEqual(entradaDaImportacao('https://example.com/coisa'), { tipo: 'link-desconhecido' });
  const l = entradaDaImportacao('Daft Punk - One More Time\nRadiohead - Weird Fishes');
  assert.ok(l.tipo === 'lista' && l.lista.linhas.length === 2 && !l.doFicheiro);
  assert.deepEqual(entradaDaImportacao('olá, tudo bem?'), { tipo: 'nada', doFicheiro: false });
});
await caso('um ficheiro ganha ao texto, e o nome da playlist é o do ficheiro', () => {
  const e = entradaDaImportacao('https://tidal.com/x', { nome: 'Workout.txt', conteudo: 'A - B\nC - D' });
  assert.ok(e.tipo === 'lista' && e.nome === 'Workout' && e.doFicheiro);
  assert.deepEqual(entradaDaImportacao('', { nome: 'vazio.csv', conteudo: 'a,b\n1,2' }), { tipo: 'nada', doFicheiro: true });
});
await caso('a nota do corte diz até onde se leu', () => {
  assert.equal(notaDoCorte('Apple Music', 50), 'Apple Music shows the first 50 songs. For a longer playlist, use a list or a file.');
  assert.equal(notaDoCorte('Deezer', null), null);
  assert.match(notaDoCorte('Deezer', MAXIMO_POR_IMPORTACAO)!, /first 1000 songs/);
});

console.log('\nler e importar');
function duplo(over: Partial<Dependencias> = {}) {
  const criadas: string[] = [];
  const gostadas: string[] = [];
  const deps: Dependencias = {
    lerSpotify: async () => null,
    lerYouTube: async () => ({ title: 'Mix', items: [{ videoId: 'v1', title: 'V1' }] }),
    lerDeezer: async (id) => (id === '42' ? { nome: 'Do Deezer', capa: null, faixas: [linha('a'), linha('b'), linha('c')], total: 3 } : null),
    resolverDeezerCurto: async (url) => (url.endsWith('/s/curto1') ? '42' : null),
    lerApple: async () => ({ nome: 'Da Apple', capa: null, faixas: Array.from({ length: 50 }, (_, i) => linha(`t${i}`)) }),
    resolver: async (linhas) => linhas.map((l, i) => (l.title === 'b' ? { track: null, confident: false } : { track: faixa(`y${i}`), confident: true })),
    criarPlaylist: async (nome) => { criadas.push(nome); return { id: `pl-${criadas.length}` }; },
    adicionar: async () => {},
    guardarNasGostadas: async (fs) => { gostadas.push(...fs.map((f) => f.sourceId)); },
    ...over,
  };
  return { deps, criadas, gostadas };
}
await caso('Deezer: o link curto resolve-se até ao id e lê-se a playlist inteira', async () => {
  const { deps } = duplo();
  const l = await lerPlaylist({ tipo: 'deezer-curto', url: 'https://link.deezer.com/s/curto1' }, deps);
  assert.deepEqual({ origem: l.origem, nome: l.nome, total: l.total, cortada: l.cortada }, { origem: 'deezer', nome: 'Do Deezer', total: 3, cortada: false });
  await assert.rejects(lerPlaylist({ tipo: 'deezer-curto', url: 'https://link.deezer.com/s/outro' }, deps), (e: any) => e.motivo === 'privada-ou-mudou');
});
await caso('Apple Music: 50 lidas dizem que pode haver mais', async () => {
  const { deps } = duplo();
  const l = await lerPlaylist({ tipo: 'apple', url: 'https://music.apple.com/pt/playlist/x/pl.u-12345' }, deps);
  assert.deepEqual({ total: l.total, cortada: l.cortada, limite: l.limite }, { total: 50, cortada: true, limite: 50 });
});
await caso('no fim diz QUAIS faltaram, pelo nome', async () => {
  const { deps, criadas } = duplo();
  const r = await importarLinhas({ nome: 'Lista', linhas: [linha('a', 'A'), linha('b', 'B'), linha('c', 'C')], cortada: false, destino: 'playlist' }, deps, () => {});
  assert.deepEqual(criadas, ['Lista']);
  assert.deepEqual({ ad: r.adicionadas, fora: r.deFora, faltaram: r.faltaram, destino: r.destino }, { ad: 2, fora: 1, faltaram: ['B - b'], destino: 'playlist' });
});
await caso(`uma lista maior do que ${MAXIMO_POR_IMPORTACAO} procura só as primeiras ${MAXIMO_POR_IMPORTACAO}, e diz`, async () => {
  let procuradas = 0;
  const { deps } = duplo({ resolver: async (linhas) => { procuradas = linhas.length; return linhas.map((_, i) => ({ track: faixa(`z${i}`), confident: true })); } });
  const muitas = Array.from({ length: MAXIMO_POR_IMPORTACAO + 250 }, (_, i) => linha(`m${i}`));
  const leitura = leituraDasLinhas('lista', { nome: 'Grande', capa: null, faixas: muitas }, null);
  assert.equal(leitura.total, MAXIMO_POR_IMPORTACAO);
  const r = await importarLeitura(leitura, 'playlist', deps, () => {});
  assert.equal(procuradas, MAXIMO_POR_IMPORTACAO);
  assert.deepEqual({ cortada: r.cortada, limite: r.limite }, { cortada: true, limite: MAXIMO_POR_IMPORTACAO });
});
await caso('para as Liked Songs: nenhuma playlist criada, e a frase diz onde ficou', async () => {
  const { deps, criadas, gostadas } = duplo();
  const r = await importarLinhas({ nome: 'Lista', linhas: [linha('a')], cortada: false, destino: 'gostadas' }, deps, () => {});
  assert.deepEqual(criadas, []);
  assert.deepEqual(gostadas, ['y0']);
  const f = frasesDaImportacao({ tipo: 'lista', nome: 'Lista', estado: 'feita', feitas: 1, total: 1, resultado: r }, 0);
  assert.equal(f.titulo, 'Added to your Liked Songs');
});
await caso('YouTube lido antes: entra direto, sem procurar, também nas Liked Songs', async () => {
  let procurou = false;
  const { deps, gostadas } = duplo({ resolver: async () => { procurou = true; return []; } });
  const l = await lerPlaylist({ tipo: 'youtube', id: 'PLx' }, deps);
  const r = await importarLeitura(l, 'gostadas', deps, () => {});
  assert.equal(procurou, false);
  assert.deepEqual(gostadas, ['v1']);
  assert.equal(r.adicionadas, 1);
});
await caso('as frases: o nome de cada serviço antes de se ler, e o corte com o limite certo', () => {
  assert.equal(frasesDaImportacao({ tipo: 'deezer', nome: null, estado: 'a-ler', feitas: 0, total: 0 }, 0).titulo, 'Importing Deezer playlist');
  assert.equal(frasesDaImportacao({ tipo: 'apple', nome: 'X', estado: 'feita', feitas: 0, total: 0, resultado: { adicionadas: 48, deFora: 2, cortada: true, limite: 50 } }, 0).linha,
    '48 songs · 2 not found · first 50 only');
});

console.log('\nno código');
await caso('o PC só pede à Apple e ao link curto do Deezer o que confere, e o catálogo aceita as playlists', () => {
  const main = ler('electron/main.cjs');
  assert.match(main, /ipcMain\.handle\('apple:playlist'[\s\S]{0,200}LINK_DA_APPLE\.test\(url\)/);
  assert.match(main, /ipcMain\.handle\('deezer:link'[\s\S]{0,200}LINK_CURTO_DO_DEEZER\.test\(url\)/);
  assert.match(main, /\/\^\\\/playlist\\\/\\d\{1,20\}\$\//);
  assert.match(main, /\/\^\\\/playlist\\\/\\d\{1,20\}\\\/tracks\\\?index=\\d\{1,5\}&limit=\\d\{1,3\}\$\//);
  const preload = ler('electron/preload.cjs');
  assert.match(preload, /lerPlaylistDaApple: \(url\) => ipcRenderer\.invoke\('apple:playlist', url\)/);
  assert.match(preload, /resolverLinkDoDeezer: \(url\) => ipcRenderer\.invoke\('deezer:link', url\)/);
});
await caso('a playlist do Deezer pede-se às páginas de 100 e pára no máximo por importação', () => {
  const api = ler('src/api/playlistPorLink.ts');
  assert.match(api, /Math\.min\(p\.total \?\? faixas\.length, MAXIMO_POR_IMPORTACAO\)/);
  assert.match(api, /\/playlist\/\$\{id\}\/tracks\?index=\$\{faixas\.length\}&limit=100/);
});
await caso('um link lê-se uma vez, depois de se acabar de colar, e não outra vez no botão', () => {
  const hook = ler('src/hooks/useImportacaoPreparada.ts');
  assert.match(hook, /const lidas = new Map<string, Leitura>\(\);/);
  assert.match(hook, /setTimeout\(\(\) => \{\n\s+lerPlaylist\(entrada\.link, dependenciasReais\)/);
  for (const f of ['src/desktop/paginas/ImportPage.web.tsx', 'src/screens/ImportYouTubeScreen.tsx']) {
    const ecra = ler(f);
    assert.match(ecra, /useImportacaoPreparada\(/, f);
    assert.match(ecra, /useImportacoes\.getState\(\)\.importarLida\(leitura, destino\)/, f);
  }
});
await caso('as que faltaram veem-se nas duas barras, e a barra não sai sozinha com elas', () => {
  for (const f of ['src/desktop/ProgressoDaImportacao.web.tsx', 'src/components/ProgressoDaImportacao.tsx']) {
    const b = ler(f);
    assert.match(b, /if \(!imp \|\| !acabou \|\| faltaram\.length\) return;/, f);
    assert.match(b, /See the songs not found/, f);
  }
});

console.log(falhas ? `\n  ${falhas} falha(s)` : '\n  Importar de qualquer sítio: todos os casos passaram.');
process.exit(falhas ? 1 : 0);
