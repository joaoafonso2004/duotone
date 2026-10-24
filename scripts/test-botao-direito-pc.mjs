/**
 * O botão direito no PC, fase 1 (24/10, docs/botao-direito-pc-maquete.html):
 * onde há uma coisa, o botão direito abre o menu dessa coisa. Este teste prova
 * que cada sítio novo está ligado ao seu menu. As linhas de cada menu testam-se
 * em test-menu-do-artista.ts, test-menu-do-lancamento.ts, test-menu-da-faixa.ts
 * e test-menu-do-texto.cjs.
 *
 * Lê os ficheiros como TEXTO, com os finais de linha normalizados.
 *
 * Correr: node scripts/test-botao-direito-pc.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ler = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let falhas = 0;
const caso = (nome, f) => {
  try { f(); console.log(`  ok - ${nome}`); } catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${String(e.message).split('\n')[0]}`); }
};

const home = ler('src/desktop/paginas/BibliotecaPages.web.tsx');
const casca = ler('src/desktop/casca.web.tsx');
const raiz = ler('src/navigation/RootNavigator.web.tsx');
const menu = ler('src/desktop/MenuDeContexto.web.tsx');
const ui = ler('src/desktop/ui.web.tsx');

console.log('\num artista');
caso('na grelha dos Artists', () => {
  assert.match(home, /onContextMenu: \(e: any\) => abrirMenuDoArtista\(\{ nome, capa: faixas\[0\]\?\.artworkUrl \?\? null \}, e\)/);
  assert.match(home, /\{menuDoArtista\}\n\s+<\/Page>;/);
  assert.match(raiz, /<ArtistsPage navigate=\{navigate\} notify=\{notify\} \/>/);
});
caso('na pesquisa (os resultados e o artista em destaque)', () => {
  assert.match(home, /aoMenu=\{\(a, e\) => abrirMenuDoArtista\(\{ nome: a\.nome, canal: a\.canal, capa: a\.foto \}, e\)\}/);
  assert.match(home, /aoMenu=\{\(e\) => abrirMenuDoArtista\(\{ nome: destaque\.nome, canal: destaque\.canal, capa: destaque\.foto \}, e\)\}/);
  assert.match(home, /<View style=\{artistStyles\.destaque\} \{\.\.\.\(\{ onContextMenu: aoMenu \} as any\)\}>/);
});
caso('no "Fans also like"', () => {
  assert.match(home, /aoMenu=\{\(e\) => abrirMenuDoArtista\(\{ nome: n \}, e\)\}/);
});
caso('fixado na lateral: o menu do artista com o mover', () => {
  const lateral = ler('src/desktop/AtalhosNaLateral.web.tsx');
  assert.match(lateral, /\{menu\?\.tipo === 'artista' \? <MenuDoArtista/);
  assert.match(lateral, /extras=\{\{ linhas: MOVER, aoEscolher: \(id\) => moverOuTirar\(menu, id\) \}\}/);
});
caso('abrir o menu não vai à rede: a biblioteca e a foto em memória', () => {
  const m = ler('src/desktop/MenuDoArtista.web.tsx');
  assert.match(m, /const faixas = faixasEmCache\(getLibrary\);/);
  assert.match(m, /const foto = fotoJaConhecida\(artista\.nome\) \?\? /);
  assert.ok(!/useFotoDoArtista/.test(m), 'o useFotoDoArtista pedia a foto');
});

console.log('\num disco');
caso('nos discos, singles e último lançamento do artista, sem "View artist" (é a página dele)', () => {
  assert.match(home, /const discoNoMenu = \(a: AlbumDaPagina\): DiscoDoMenu => \(\{[^\n]+artista: null \}\);/);
  assert.equal(home.match(/onContextMenu: \(e: any\) => abrirMenuDoDisco\(discoNoMenu\(a\), e\)/g)?.length, 2, 'discos e singles');
  assert.match(home, /aoMenu=\{\(e\) => abrirMenuDoDisco\(discoNoMenu\(pagina\.maisRecente!\), e\)\}/);
});
caso('nos álbuns e nas playlists da pesquisa', () => {
  assert.match(home, /aoMenu=\{abrirMenuDoDisco\} escolhido=\{discoDoMenu\}/);
  assert.match(home, /tipo: 'Playlist', artista: null/);
});

console.log('\numa mistura e as Liked Songs');
caso('as cinco prateleiras de misturas da Home', () => {
  assert.equal(home.match(/aoMenu=\{\(m, e\) => setMenuDaMist\(\{ id: m\.id, ponto: pontoDoEvento\(e\) \}\)\}/g)?.length, 5);
  const prateleira = ui.slice(ui.indexOf('export function PrateleiraDeMisturas('));
  assert.match(prateleira, /onContextMenu=\{\(\(e: any\) => \{ if \(!aoMenu\) return; e\.preventDefault\(\); aoMenu\(m, e\); \}\) as any\}/);
});
caso('baralhar é o playShuffled (Fisher-Yates), e guardar cria a playlist com as faixas de hoje', () => {
  assert.match(home, /else if \(acao === 'baralhar'\) await leitor\.playShuffled\(m\.faixas, leitor\.shuffleInteligente, origem\);/);
  assert.match(home, /const playlist = await createPlaylist\(m\.nome\);\n\s+await addTracksToPlaylist\(playlist\.id, m\.faixas\);/);
});
caso('as Liked Songs na lateral (e só elas: os outros itens são lugares)', () => {
  assert.match(casca, /aoMenu=\{item\.id === 'songs' \? \(e\) => setMenuDasLiked\(pontoDoEvento\(e\)\) : undefined\}/);
  assert.match(casca, /onContextMenu=\{\(e: any\) => \{ if \(!aoMenu\) return; e\.preventDefault\(\); aoMenu\(e\); \}\}/);
  assert.match(casca, /const faixas=await lerFaixas\(getLikedSongs\);/);
});

console.log('\na música que toca');
caso('na barra do leitor, com o "Open Now Playing"', () => {
  assert.match(casca, /onContextMenu: \(e: any\) => \{ if \(!aoMenuDaFaixa\) return; e\.preventDefault\(\); aoMenuDaFaixa\(\); \}/);
  assert.match(raiz, /aoMenuDaFaixa=\{\(\) => \{ if \(currentTrack\) void more\(currentTrack, undefined, \{ leitor: 'barra' \}\); \}\}/);
  assert.match(raiz, /trackMenuLeitor === 'barra' \? 'barra' : trackMenuLeitor === 'capa' \? 'leitor' : 'lista'/);
  assert.match(raiz, /case 'abrir-leitor': setTrackMenuOpen\(false\); irPara\(\{ tipo: 'a-tocar' \}\); return;/);
});
caso('na capa do Now Playing, o menu curto do leitor', () => {
  assert.match(ler('src/desktop/paginas/NowPlayingPage.web.tsx'), /onContextMenu: \(e: any\) => \{ e\.preventDefault\(\); more\(track, undefined, \{ leitor: 'capa' \}\); \}/);
});

console.log('\nas regras');
caso('o cartão com o menu aberto fica levantado, como no hover', () => {
  assert.match(casca, /\[data-dt~="cartao"\]\[data-dt~="com-menu"\]\{\n\s+transform: translateY\(-3px\); filter: brightness\(1\.08\); \}/);
  assert.ok((home.match(/'com-menu'/g)?.length ?? 0) >= 1 && /'com-menu'/.test(ui));
});
caso('do teclado (Shift+F10) o menu abre junto do que tem o foco', () => {
  assert.match(menu, /if \(x === 0 && y === 0\) \{\n\s+const r = n\?\.target\?\.getBoundingClientRect\?\.\(\);/);
});

if (falhas) { console.error(`\n  ${falhas} caso(s) a falhar.`); process.exit(1); }
console.log('\nO botão direito no PC (fase 1): artistas, discos, misturas, Liked Songs e a música que toca passaram.');
