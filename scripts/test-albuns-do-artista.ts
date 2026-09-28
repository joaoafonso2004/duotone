// Os álbuns da página de artista (lib/albunsDoArtista.ts, 28/9), contra
// respostas reais do YouTube Music guardadas em scripts/fixtures/ytmusic-*.json.
// O caso que o originou: na página do Isak (rap português) apareciam os álbuns
// do Isak Danielson.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canalPelasProvas, canalSemProvas, chaveDoTitulo, legendaDoAlbum, lerAlbunsDoCanal, lerCancoesComArtistas,
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

// ---- as duas páginas usam isto, e não a pesquisa de playlists pelo nome
for (const f of ['src/desktop/paginas/BibliotecaPages.web.tsx', 'src/screens/LibraryGroupScreen.tsx']) {
  const src = ler_(f);
  assert.match(src, /albunsDoArtista\(name, tracks\)/, `${f}: os álbuns vêm do canal`);
  assert.ok(!src.includes('searchYouTubePlaylists'), `${f}: voltou a pesquisa de playlists pelo nome`);
}
assert.ok(!ler_('src/screens/LibraryGroupScreen.tsx').includes('searchYouTube('),
  'o iPhone voltou a mostrar a pesquisa crua (homónimos, e 100 unidades da Data API)');

// ---- no PC, pelo processo principal, que só aceita a forma de um canal
const main = ler_('electron/main.cjs');
assert.match(main, /ipcMain\.handle\('ytmusic:artista'[\s\S]{0,200}daJanelaPrincipal\(event\)[\s\S]{0,200}\/\^UC\[\\w-\]\{22\}\$\//);
assert.match(ler_('electron/preload.cjs'), /lerArtistaDoYtMusic: \(pedido\) => ipcRenderer\.invoke\('ytmusic:artista', pedido\)/);

console.log('Álbuns do artista: passou.');
