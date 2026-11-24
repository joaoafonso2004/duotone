/**
 * O QR do "Send to friends" (24/11): o link que leva, quem o abre, e a matriz.
 *
 * O QR desenha-se no aparelho (`lib/matrizDoQr.ts`, com o `qrcode-generator`);
 * antes era pedido ao api.qrserver.com e levava um link que ninguém tratava.
 * Que a matriz se LÊ com a capa a tapar o meio foi visto uma vez com um leitor de
 * QR (jsQR) fora do projeto: 37×37 módulos, 9×9 tapados, lido certo.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eLinkDaPlaylist, linkDaPlaylist, playlistDoLink } from '../src/lib/linkDaPlaylist.ts';
import { ladoDoCentro, matrizDoQr, riscosDaLinha } from '../src/lib/matrizDoQr.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); } catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const ID = '0b6f1c2e-9a4d-4f5b-8e21-3c7d9a1b2e4f';

console.log('\no link');
caso('vai e volta', () => {
  assert.equal(linkDaPlaylist(ID), `duotone://playlist/${ID}`);
  assert.equal(playlistDoLink(linkDaPlaylist(ID)), ID);
  assert.equal(playlistDoLink(`duotone://playlist/${ID.toUpperCase()}/?x=1`), ID);
});
caso('outros links não são de playlist', () => {
  assert.equal(playlistDoLink('duotone://controlo/play'), null);
  assert.equal(playlistDoLink('duotone://playlist/import?id=' + ID), null, 'o link antigo do QR nunca abriu nada');
  assert.equal(playlistDoLink('duotone://playlist/abc'), null);
  assert.equal(playlistDoLink(null), null);
  assert.ok(eLinkDaPlaylist(linkDaPlaylist(ID)) && !eLinkDaPlaylist('duotone://social'));
});
caso('a navegação deixa-o passar e o hook abre a playlist', () => {
  assert.match(ler('src/navigation/RootNavigator.tsx'), /filter: \(url\) => !eLinkDeControlo\(url\) && !eLinkDaPlaylist\(url\),/);
  const hook = ler('src/hooks/useAtalhosDoIcone.ts');
  assert.equal(hook.match(/const playlist = playlistDoLink\(url\);\n\s+if \(playlist\) abrirPlaylistDoLink\(playlist\);/g)?.length, 2, 'no arranque e com a app aberta');
  assert.match(hook, /irParaNoIphone\(\{ tipo: 'playlist', id, nome: 'Playlist' \}\)/);
});

console.log('\na matriz');
caso('um link de playlist dá um QR de 37 módulos, com os três quadrados dos cantos', () => {
  const m = matrizDoQr(linkDaPlaylist(ID));
  assert.equal(m.length, 37);
  for (const [x, y] of [[0, 0], [30, 0], [0, 30]]) {
    for (let i = 0; i < 7; i++) {
      assert.ok(m[y][x + i] && m[y + 6][x + i] && m[y + i][x] && m[y + i][x + 6], `a moldura do quadrado em ${x},${y}`);
    }
    assert.ok(!m[y + 1][x + 1] && m[y + 3][x + 3], `o miolo do quadrado em ${x},${y}`);
  }
});
caso('a capa tapa no máximo 8 % (o nível Q aguenta 25 %)', () => {
  const lado = ladoDoCentro(37);
  assert.equal(lado % 2, 1);
  assert.ok((lado * lado) / (37 * 37) <= 0.08);
});
caso('os riscos de uma linha', () => {
  assert.deepEqual(riscosDaLinha([true, true, false, true, false, false, true]), [[0, 2], [3, 1], [6, 1]]);
  assert.deepEqual(riscosDaLinha([false, false]), []);
});

console.log('\na folha');
caso('o botão do QR está no cartão do que vai, só nas playlists, e a folha antiga saiu', () => {
  const folha = ler('src/components/ShareFriendSheet.tsx');
  assert.match(folha, /qr=\{playlistDoQr \? \{ ref: botaoDoQr, aoCarregar: abrirQr \} : undefined\}/);
  assert.match(folha, /accessibilityLabel="Show QR code"/);
  assert.match(folha, /<QrDoDuotone texto=\{linkDaPlaylist\(playlistDoQr\)\}/);
  for (const f of ['src/screens/PlaylistsScreen.tsx', 'src/screens/PlaylistDetailScreen.tsx', 'src/lib/menuDaPlaylist.ts']) {
    assert.doesNotMatch(ler(f), /YtPlaylistShareSheet|partilhar-link|qrserver/, f);
  }
});

console.log(falhas ? `\n  ${falhas} caso(s) falharam.\n` : '\n  Todos os casos passaram.\n');
process.exit(falhas ? 1 : 0);
