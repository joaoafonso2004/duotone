// Os álbuns da página de artista (lib/albunsDoArtista.ts, 28/9), contra
// respostas reais do YouTube Music guardadas em scripts/fixtures/ytmusic-*.json.
// O caso que o originou: na página do Isak (rap português) apareciam os álbuns
// do Isak Danielson.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canalPelasProvas, canalSemProvas, chaveDoTitulo, FORMA_DA_CONTINUACAO, FORMA_DA_LISTA, legendaDoAlbum, lerAlbunsDoCanal,
  fotoDoCanal, lerCancoesComArtistas, lerMusicasDoCanal, lerPaginaDaPlaylist, lerRadioDoYtMusic, maisRecente, mixDoCanal,
} from '../src/lib/albunsDoArtista.ts';

const ler = (nome: string) => JSON.parse(readFileSync(new URL(`./fixtures/${nome}`, import.meta.url), 'utf8'));
const ler_ = (nome: string) => readFileSync(new URL(`../${nome}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
// A mesma regra da `chaveDeArtista` (sem acentos, sem maiúsculas, sem pontuação).
const chave = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\$/g, 's').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim();

const ISAK = 'UCX24KmsuxFB4jacvMSd3G2Q';
const DANIELSON = 'UC75RhrKQDnf2gCFLlvIPQqQ';

// ---- a pesquisa de canções traz o CANAL de cada artista
const telescopio = lerCancoesComArtistas(ler('ytmusic-isak-telescopio.json'));
assert.equal(telescopio[0]?.videoId, 'k8u8sHjyVnE');
assert.equal(telescopio[0]?.titulo, 'Telescópio');
assert.deepEqual(telescopio[0]?.artistas.map((a) => a.nome), ['Isak', 'Zigarro', 'Armando Teles'],
  'o álbum também é um link, mas não é um artista');
assert.ok(telescopio.every((c) => c.artistas.every((a) => a.id.startsWith('UC'))));

// ---- o canal certo sai das músicas da biblioteca
const peloVideo = canalPelasProvas([{ prova: { videoId: 'k8u8sHjyVnE', titulo: 'Telescópio' }, cancoes: telescopio }], 'isak', chave);
assert.equal(peloVideo, ISAK, 'o mesmo vídeo');
const peloTitulo = canalPelasProvas([{ prova: { videoId: 'outroUpload1', titulo: 'TELESCOPIO (Official Video)' }, cancoes: telescopio }], 'isak', chave);
assert.equal(peloTitulo, ISAK, 'outro upload da mesma música: pelo título');
// "Batota" é do mesmo Isak mas com outro canal; não é a música que se procurou.
assert.notEqual(peloTitulo, 'UCTcKAN-8P2Jvn3Fpq7500Uw');
assert.equal(canalPelasProvas([{ prova: { videoId: 'k8u8sHjyVnE', titulo: 'Telescópio' }, cancoes: telescopio }], 'isak danielson', chave),
  null, 'o Telescópio não é do Isak Danielson');
assert.equal(canalPelasProvas([{ prova: { videoId: 'naoExiste00', titulo: 'Uma que não está lá' }, cancoes: telescopio }], 'isak', chave),
  null, 'sem prova nenhuma, nenhum canal -- nunca o de um homónimo');
assert.equal(canalPelasProvas([], 'isak', chave), null);

// Na pesquisa pelo nome estão os dois: cada um fica com o seu.
const isak = lerCancoesComArtistas(ler('ytmusic-isak.json'));
assert.equal(canalPelasProvas([{ prova: { videoId: '_y0ed5-k7kc', titulo: 'Sweat' }, cancoes: isak }], 'isak danielson', chave), DANIELSON);
assert.equal(canalPelasProvas([{ prova: { videoId: '_y0ed5-k7kc', titulo: 'Sweat' }, cancoes: isak }], 'isak', chave),
  null, 'uma música do Isak Danielson não prova o Isak');
assert.equal(canalPelasProvas([
  { prova: { videoId: 'Zk64ow_NVyw', titulo: 'Calipo De Cerveja' }, cancoes: isak },
  { prova: { videoId: 'UgI0sKebLSk', titulo: 'Bada Bing' }, cancoes: isak },
], 'isak', chave), ISAK);

// ---- sem biblioteca: só o ÚNICO canal com este nome
assert.equal(canalSemProvas(isak, 'isak', chave), null, '"Isak" e "ISÁK" são dois canais com a mesma chave');
assert.equal(canalSemProvas(isak, 'isak danielson', chave), DANIELSON);
assert.equal(canalSemProvas(isak, '', chave), null);

// ---- os álbuns da página do canal
const albuns = lerAlbunsDoCanal(ler('ytmusic-artista-isak.json'));
assert.deepEqual(albuns.map((a) => [a.titulo, a.tipo, a.ano]), [
  ['Jon', 'Album', '2026'],
  ['Mate Sua Mãe', 'Album', '2024'],
  ['Pinga', 'Single', '2026'],
  ['Laços de Sangue', 'EP', '2026'],
  ['Super Brega', 'EP', '2025'],
  ['Peso Morto', 'EP', '2025'],
  ['Hoe Hoe Hoe', 'Single', '2024'],
]);
assert.ok(albuns.every((a) => /^OLAK5uy_/.test(a.id)), 'cada um com a playlist que a app já sabe abrir');
assert.ok(albuns.every((a) => a.capa?.startsWith('https://')));
assert.equal(new Set(albuns.map((a) => a.id)).size, albuns.length);
assert.equal(legendaDoAlbum(albuns[3]!), 'EP · 2026');
assert.equal(legendaDoAlbum({ tipo: 'Album', ano: null }), 'Album');
assert.deepEqual(lerAlbunsDoCanal({}), []);
assert.deepEqual(lerAlbunsDoCanal(null), []);

assert.equal(chaveDoTitulo('Telescópio (Official Video)'), chaveDoTitulo('TELESCOPIO'));

// ---- o mais recente (29/9): o ano mais alto; no mesmo ano, o álbum
assert.equal(maisRecente(albuns)?.titulo, 'Jon', 'Jon é álbum de 2026, e há singles e um EP do mesmo ano');
assert.equal(maisRecente([
  { id: 'a', titulo: 'Velho', tipo: 'Album', ano: '2024', capa: null },
  { id: 'b', titulo: 'Novo', tipo: 'Single', ano: '2025', capa: null },
])?.titulo, 'Novo', 'um single mais novo ganha a um álbum mais velho');
assert.equal(maisRecente([{ id: 'a', titulo: 'Sem ano', tipo: 'Album', ano: null, capa: null }]), null);
assert.equal(maisRecente([]), null);

// ---- as músicas do canal (29/9): o topo da página e a lista com todas
const musicas = lerMusicasDoCanal(ler('ytmusic-artista-isak.json'));
assert.equal(musicas.topo.length, 5, 'a prateleira "Top songs"');
assert.ok(musicas.topo.every((c) => c.artistas.some((a) => a.id === ISAK)), 'todas do canal do Isak');
assert.match(musicas.todas ?? '', FORMA_DA_LISTA, 'e o "Show all", que é a lista com todas');
assert.deepEqual(lerMusicasDoCanal({}), { topo: [], todas: null });
assert.ok(FORMA_DA_LISTA.test('VLOLAK5uy_ncCUeCPXq5jftZ4m-NEnxMwze4ov3OOeI'));
assert.ok(!FORMA_DA_LISTA.test('VLx'), 'só a forma de uma lista');
assert.ok(!FORMA_DA_LISTA.test('UCX24KmsuxFB4jacvMSd3G2Q'));

// ---- as duas páginas usam isto, e não a pesquisa de playlists pelo nome
for (const f of ['src/desktop/paginas/BibliotecaPages.web.tsx', 'src/screens/LibraryGroupScreen.tsx']) {
  const src = ler_(f);
  assert.match(src, /paginaDoArtista\(name, tracks\)/, `${f}: os álbuns e as músicas vêm do canal`);
  assert.match(src, /pagina\?\.maisRecente/, `${f}: o lançamento mais recente aparece`);
  assert.match(src, /pagina\?\.musicas\.length \? pagina\.musicas : null/, `${f}: as "More tracks" vêm do canal primeiro`);
  assert.match(src, /alternarFavorito\(/, `${f}: favoritar dentro da página`);
  assert.ok(!src.includes('searchYouTubePlaylists'), `${f}: voltou a pesquisa de playlists pelo nome`);
}
assert.ok(!ler_('src/screens/LibraryGroupScreen.tsx').includes('searchYouTube('),
  'o iPhone voltou a mostrar a pesquisa crua (homónimos, e 100 unidades da Data API)');

// ---- no PC, pelo processo principal, que só aceita um canal ou a lista dele
const main = ler_('electron/main.cjs');
assert.match(main, /ipcMain\.handle\('ytmusic:artista'[\s\S]{0,200}daJanelaPrincipal\(event\)[\s\S]{0,500}!\/\^UC\[\\w-\]\{22\}\$\/\.test\(browseId\) && !\/\^VL\(OLAK5uy_\|PL\|RDCLAK5uy_\)\[\\w-\]\{10,80\}\$\/\.test\(browseId\)/);
assert.match(ler_('electron/preload.cjs'), /lerArtistaDoYtMusic: \(pedido\) => ipcRenderer\.invoke\('ytmusic:artista', pedido\)/);

// ---- as listas editoriais (29/9): a página traz o título, as músicas e o
// token da seguinte. Resposta real ("All-Time Hip Hop Hits", 281 músicas),
// recortada às primeiras seis.
const editorial = lerPaginaDaPlaylist(ler('ytmusic-playlist-editorial.json'));
assert.equal(editorial.titulo, 'All-Time Hip Hop Hits');
assert.equal(editorial.cancoes.length, 6);
assert.equal(editorial.cancoes[0]!.titulo, "God's Plan");
assert.deepEqual(editorial.cancoes[0]!.artistas.map((a) => a.nome), ['Drake']);
assert.ok(editorial.cancoes.every((c) => c.duracaoSec && c.duracaoSec > 60), 'com a duração');
assert.ok(editorial.continuacao && FORMA_DA_CONTINUACAO.test(editorial.continuacao), 'e a página seguinte');
assert.equal(lerPaginaDaPlaylist({}).continuacao, null);
assert.equal(lerPaginaDaPlaylist({}).titulo, null);
assert.ok(!FORMA_DA_CONTINUACAO.test('"><script>'), 'só a forma de um token');
const ytm = ler_('src/api/ytMusic.ts');
assert.match(ytm, /const PAGINAS_DA_PLAYLIST = 50;/, 'até 5000 músicas, o teto da Data API');
assert.match(ytm, /if \(!pagina\.continuacao\) \{ completa = true; break; \}\n\s+if \(!novas\) break;/,
  'acabar a lista é "completa"; uma página sem novas desiste (as editoriais repetem a primeira)');

// ---- o Mix do artista (29/9): o botão "Mix" do canal, lido pelo `next` do
// YouTube Music. Respostas reais recortadas (o canal do Isak e o Mix dele).
assert.deepEqual(mixDoCanal(ler('ytmusic-canal-cabecalho.json')),
  { playlistId: 'RDEMkbiSANKWVlisYendXhQ6WQ', videoId: 'A3CLMCcesms', params: 'wAEB' },
  'o Mix, e não o Shuffle (RDAO) que está ao lado');
assert.equal(mixDoCanal({}), null);
assert.equal(mixDoCanal({ header: { musicImmersiveHeaderRenderer: { startRadioButton: { buttonRenderer: { navigationEndpoint: {
  watchEndpoint: { videoId: 'A3CLMCcesms', playlistId: '"><script>' } } } } } } }), null, 'só a forma de um Mix');
const radio = lerRadioDoYtMusic(ler('ytmusic-mix-do-artista.json'));
assert.equal(radio.length, 6, 'sem a repetida');
assert.deepEqual(radio[0], { videoId: 'A3CLMCcesms', titulo: 'Fácil', artistas: [{ nome: 'Holly Hood', id: radio[0]!.artistas[0]!.id }], duracaoSec: 207 });
assert.ok(/^UC[\w-]{22}$/.test(radio[0]!.artistas[0]!.id), 'o artista é o canal');
assert.deepEqual(radio[1]!.artistas.map((a) => a.nome), ['Isak', 'Zigarro', 'Armando Teles'], 'uma colaboração são três');
assert.deepEqual(lerRadioDoYtMusic({}), []);
// No PC o `next` do YouTube Music vai pelo processo principal, só com a forma.
assert.match(main, /ipcMain\.handle\('ytmusic:radio'[\s\S]{0,200}daJanelaPrincipal\(event\)[\s\S]{0,600}\/\^RD\[\\w-\]\{2,80\}\$\/\.test\(playlistId\) \|\| !\/\^\[\\w-\]\{11\}\$\/\.test\(videoId\)/);
assert.match(main, /music\.youtube\.com\/youtubei\/v1\/next/);
assert.match(ler_('electron/preload.cjs'), /lerRadioDoYtMusic: \(pedido\) => ipcRenderer\.invoke\('ytmusic:radio', pedido\)/);
// E há botão nas duas páginas de artista.
assert.match(ler_('src/desktop/paginas/BibliotecaPages.web.tsx'), /tocarMixDoArtista\(name, \{ mix: pagina\.mix \}\)/);
assert.match(ler_('src/screens/LibraryGroupScreen.tsx'), /tocarMixDoArtista\(name, \{ mix: pagina\.mix \}\)/);

// ---- a foto do canal (30/9): a do Dave Blunts faltava, com o catálogo sem
// foto. A redonda de primeiro plano primeiro; o fundo largo, pedido quadrado.
const mini = (...lados: [number, number][]) => ({ musicThumbnailRenderer: { thumbnail: { thumbnails:
  lados.map(([w, h]) => ({ url: `https://lh3.googleusercontent.com/abc=w${w}-h${h}-p-l90-rj`, width: w, height: h })) } } });
assert.equal(fotoDoCanal({ header: { musicImmersiveHeaderRenderer: { thumbnail: mini([540, 225], [2880, 1200]) } } }),
  'https://lh3.googleusercontent.com/abc=w600-h600-p-l90-rj', 'o fundo largo maior, pedido quadrado');
assert.equal(fotoDoCanal({ header: { musicVisualHeaderRenderer: { thumbnail: mini([1440, 600]), foregroundThumbnail: mini([120, 120], [544, 544]) } } }),
  'https://lh3.googleusercontent.com/abc=w600-h600-p-l90-rj', 'a de primeiro plano antes do fundo');
assert.equal(fotoDoCanal({ header: { musicImmersiveHeaderRenderer: { thumbnail: { musicThumbnailRenderer: { thumbnail: { thumbnails: [
  { url: 'https://yt3.googleusercontent.com/xyz', width: 900, height: 900 }] } } } } } }),
  'https://yt3.googleusercontent.com/xyz', 'sem tamanho no URL, fica como veio');
assert.equal(fotoDoCanal({ header: { musicImmersiveHeaderRenderer: { thumbnail: { musicThumbnailRenderer: { thumbnail: { thumbnails: [
  { url: 'javascript:alert(1)', width: 900 }] } } } } } }), null, 'só https');
assert.equal(fotoDoCanal(ler('ytmusic-canal-cabecalho.json')), null, 'um cabeçalho sem imagem não inventa uma');
assert.equal(fotoDoCanal({}), null);
// E as duas páginas usam-na quando o catálogo não tem foto. O Play toca a aba.
const pc = ler_('src/desktop/paginas/BibliotecaPages.web.tsx');
const iphone = ler_('src/screens/LibraryGroupScreen.tsx');
assert.match(pc, /const fotoDoCanal = foto \? null : pagina\?\.foto \?\? null;/);
assert.match(iphone, /const capaDoArtista = foto\n\s+\?\? pagina\?\.foto/);
assert.match(pc, /const faixasDaAba = separador === 'library' \? tracks : separador === 'tracks' \? outrasSemRepetir : \[\];/,
  'PC: o Play segue a aba e não toca a biblioteca em Albums');
assert.match(pc, /tocarLista\(faixasDaAba, ligado, inteligente, \{ tipo: 'artista', nome: name \}\)/);
assert.match(iphone, /tocarLista\(faixasDaAba, shuffleLigado, shuffleInteligente, \{ tipo: 'artista', nome: name \}\)/);

console.log('Álbuns do artista: passou.');
