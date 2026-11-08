// Os oito defeitos do PC de 8/11 (vistos no ecrã a 5/11, reconferidos no código a 8/11).
// Correr: node --experimental-strip-types scripts/test-oito-defeitos-do-pc.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { grelhaQueEnche } from '../src/lib/grelhaDeCartoes.ts';

const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
let falhas = 0;
function caso(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

console.log('a grelha que enche a linha (grelhaQueEnche)');
caso('quantos cabem com o mínimo, e o lado estica até à borda', () => {
  // As Playlists maximizadas: ~1500 de largura, cartões de 200 com 32 entre eles.
  const g = grelhaQueEnche(1500, 200, 32);
  assert.equal(g.colunas, 6);
  assert.equal(g.lado, Math.floor((1500 - 32 * 5) / 6));
  assert.ok(g.colunas * g.lado + 32 * (g.colunas - 1) <= 1500, 'nunca passa da borda');
  assert.ok(1500 - (g.colunas * g.lado + 32 * (g.colunas - 1)) < g.colunas, 'e não sobra mais do que o arredondamento');
});
caso('antes de medir, o mínimo; e nunca menos de uma coluna', () => {
  assert.deepEqual(grelhaQueEnche(0, 200, 32), { colunas: 1, lado: 200 });
  assert.equal(grelhaQueEnche(120, 200, 32).colunas, 1);
});
caso('o "Jump back in": no máximo três por linha, e seis dão linhas cheias a qualquer largura', () => {
  for (const largura of [500, 700, 900, 1100, 1300, 1500, 1900]) {
    const { colunas } = grelhaQueEnche(largura, 260, 8, { maxColunas: 3 });
    assert.ok(colunas >= 1 && colunas <= 3, `${largura}: ${colunas} colunas`);
    assert.equal(6 % colunas, 0, `${largura}: seis em ${colunas} colunas deixava um sozinho`);
  }
  // Era o defeito: a 1400 cabiam cinco de 260, e o sexto ficava sozinho.
  assert.equal(grelhaQueEnche(1400, 260, 8, { maxColunas: 3 }).colunas, 3);
});

console.log('\nonde se usa');
caso('o "Jump back in" mede a largura e dá a cada um a mesma fração', () => {
  const v = ler('src/desktop/VoltarAOuvir.web.tsx');
  assert.match(v, /grelhaQueEnche\(largura, LARGURA_MINIMA, ESP\.sm, \{ maxColunas: 3 \}\)/);
  assert.match(v, /calc\(\(100% - \$\{ESP\.sm \* \(colunas - 1\)\}px\) \/ \$\{colunas\}\)/);
  assert.doesNotMatch(v, /flexBasis: 260, flexGrow: 1, maxWidth: '33%'/, 'a base de 260 que deixava cinco por linha saiu');
});
caso('a grelha das Playlists cresce até à borda', () => {
  const p = ler('src/desktop/paginas/PlaylistPages.web.tsx');
  assert.match(p, /grelhaQueEnche\(larguraDaGrelha, LADO_MINIMO_DO_CARTAO, ESP\.xxl\)/);
  assert.match(p, /style=\{\[styles\.playlistCard, \{ width: ladoDoCartao \}\]\}/);
  assert.match(p, /<PlaylistArtwork artworks=\{item\.artworks\} lado=\{ladoDoCartao\} \/>/);
});
caso('os mosaicos sem as barras pretas: a 16:9 em cada quarto, e a original ampliada numa capa só', () => {
  const c = ler('src/desktop/paginas/comum.web.tsx');
  assert.match(c, /artworks\.map\(capaParaLista\)/);
  assert.match(c, /if \(capaComBarras\(original\)\) \{\s+const m = molduraSemBarras\(lado\);/);
});
caso('a página de uma playlist diz "Playlist" uma vez, com o voltar à esquerda', () => {
  const p = ler('src/desktop/paginas/PlaylistPages.web.tsx');
  assert.doesNotMatch(p, /<Page title="Playlist"/, 'o cabeçalho "Playlist" por cima saiu');
  assert.match(p, /<ContentScroll scrollKey=\{`playlist:\$\{id\}`\}><View style=\{styles\.voltarDaPlaylist\}><BotaoVoltar onPress=\{back\} \/><\/View>/);
  assert.equal((p.match(/>PLAYLIST</g) ?? []).length, 1, 'a sobrancelha "PLAYLIST" fica, uma vez');
});
caso('as décadas mostram só o número', () => {
  assert.match(ler('src/desktop/ui.web.tsx'), /\{decada \? numeroDaDecada\(m\.nome\) : m\.nome\}/);
});
caso('a coluna do título não passa dos 560', () => {
  assert.match(ler('src/desktop/ui.web.tsx'), /colunaDoTitulo: \{ flex: 1, minWidth: 0, maxWidth: 560 \}/);
});
caso('com o Now Playing à frente, nenhuma entrada da lateral fica acesa', () => {
  const casca = ler('src/desktop/casca.web.tsx');
  assert.match(casca, /const active: string \| null = leitorAberto \? null/);
  const nav = ler('src/navigation/RootNavigator.web.tsx');
  // Só enquanto a lateral mostra a página de baixo: um clique noutra entrada acende-a logo.
  assert.match(nav, /const leitorNaLateral = leitorAberto && JSON\.stringify\(rotaDaLateral\) === JSON\.stringify\(route\);/);
});
caso('"New releases": no máximo dois por artista', () => {
  assert.match(ler('src/lib/novosLancamentos.ts'), /export const MAX_POR_ARTISTA = 2;/);
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');
