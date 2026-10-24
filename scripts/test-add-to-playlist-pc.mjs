/**
 * O "Add to playlist" do PC é um painel ao lado do menu da música (24/10,
 * variante B de docs/add-to-playlist-pc-maquete.html), e não o diálogo ao
 * centro com caixas iguais.
 *
 * Lê os ficheiros como TEXTO (finais de linha normalizados: o CI do Windows faz
 * checkout com CRLF). A posição do painel testa-se em test-menu-do-amigo.ts.
 *
 * Correr: node scripts/test-add-to-playlist-pc.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ler = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let falhas = 0;
const caso = (nome, f) => {
  try { f(); console.log(`  ok - ${nome}`); } catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${String(e.message).split('\n')[0]}`); }
};

const casca = ler('src/navigation/RootNavigator.web.tsx');
const painel = ler('src/desktop/EscolherPlaylist.web.tsx');
const menu = ler('src/desktop/MenuDeContexto.web.tsx');
// O que se faz ao escolher vive à parte desde 24/10: o menu de uma mensagem usa o mesmo.
const porNa = ler('src/desktop/porNaPlaylist.web.ts');

caso('o diálogo ao centro saiu', () => {
  assert.ok(!casca.includes('title="Add to playlist"'), 'voltou o Dialog');
  assert.ok(!casca.includes('openPlaylistDialog'), 'voltou o openPlaylistDialog');
});
caso('no menu da música, a linha abre o painel ao lado', () => {
  assert.match(casca, /submenu: a\.id === 'por-em-playlist'/);
  assert.match(casca, /submenu=\{\(\{ fechar, voltar \}\) => painelDasPlaylists\(trackMenu, fechar, voltar\)\}/);
});
caso('o botão do Now Playing abre o mesmo painel, sozinho, no botão', () => {
  assert.equal(casca.match(/aoAdicionarAPlaylist=\{abrirPlaylistsSozinhas\}/g)?.length, 2, 'as duas montagens do Now Playing');
  assert.match(casca, /corpo=\{painelDasPlaylists\(escolhaSolta\.faixa, \(\) => setEscolhaSolta\(null\)\)\}/);
});
caso('com o ✓, não a põe outra vez: diz que já lá está', () => {
  assert.match(porNa, /if \(jaLaEsta\) \{ notify\(`Already in \$\{p\.name\}\.`\); return; \}/);
});
caso('criar põe a música lá, e a lista das Playlists sabe já da nova', () => {
  assert.match(porNa, /const p = await createPlaylist\(nome\);\n\s+await addTracksToPlaylist\(p\.id, \[t\]\);\n[\s\S]{0,160}carregar\(true\)/);
});
caso('os erros pela frase legível', () => {
  assert.match(porNa, /notify\(mensagemDeErro\(e, 'Could not add to the playlist\.'\)\)/);
  assert.match(porNa, /notify\(mensagemDeErro\(e, 'Could not create the playlist\.'\)\)/);
});

caso('as marcas ✓ pelas regras da folha do iPhone, só da abertura de agora', () => {
  assert.match(painel, /criarMarcasDasPlaylists<Track>\(playlistsComAFaixa,/);
  assert.match(painel, /return \(\) => marcas\.esquecer\(\);/);
});
caso('escolher fecha o menu ANTES de executar', () => {
  assert.match(painel, /const escolher = \(p: Playlist\) => \{ aoFechar\(\); aoEscolher\(p, dentro\.has\(p\.id\)\); \};/);
  assert.match(painel, /aoFechar\(\);\n\s+aoCriar\(limpo\);/);
});
caso('Enter na procura: com uma só, põe-na lá; sem nenhuma, cria com esse nome', () => {
  assert.match(painel, /if \(visiveis\.length === 1\) escolher\(visiveis\[0\]\);\n\s+else if \(!visiveis\.length && pedido\) criar\(pedido\);/);
});
caso('o painel trata das suas teclas, e o menu deixa-lhas', () => {
  assert.match(painel, /<View ref=\{raiz\} \{\.\.\.TECLAS_PROPRIAS\}>/);
  assert.match(menu, /\[data-teclas="proprias"\]/);
  assert.match(menu, /if \(temTeclasProprias\(e\.target\)\) return;/);
});
caso('o painel é um portal à parte (a animação do menu é um transform)', () => {
  assert.match(menu, /return createPortal\(<>\{menu\}\{lado\}<\/>, document\.body\);/);
});
caso('clicar ou rodar a roda dentro do painel não fecha o menu', () => {
  assert.match(menu, /const dentro = \(alvo: any\) => !!\(caixa\.current\?\.contains\?\.\(alvo\) \|\| painel\.current\?\.contains\?\.\(alvo\)\);/);
  assert.match(menu, /const roda = \(e: WheelEvent\) => \{ if \(!dentro\(e\.target\)\) fechar\.current\(\); \};/);
});

if (falhas) { console.error(`\n  ${falhas} caso(s) a falhar.`); process.exit(1); }
console.log('\nAdd to playlist no PC: o painel ao lado do menu, o ✓, criar ali, e as teclas passaram.');
