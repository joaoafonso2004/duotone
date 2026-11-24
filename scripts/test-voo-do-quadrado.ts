/**
 * Entrar pelo quadrado (24/11, `lib/vooDoQuadrado.ts`): as contas da cor e da
 * capa, o momento em que a página abre por baixo, e onde está ligado.
 *
 * O movimento em si só se vê no iPhone (uma build): aqui confirma-se que a página
 * nova nunca abre antes de a cor tapar o ecrã todo (senão via-se a de trás
 * desaparecer), e que cada porta passa pelo mesmo caminho.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  corTapa, curvaDaMola, duracaoDaMola, momentoDeAbrir, MOLA_DO_VOO, vooDaCapa, vooDaCor,
} from '../src/lib/vooDoQuadrado.ts';
import { ENTRADA } from '../src/lib/movimento.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); } catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const ecra = { width: 390, height: 844 };
const cartao = { x: 24, y: 180, width: 165, height: 165 };
const circulo = { x: 140, y: 300, width: 110, height: 110 };

console.log('\na mola');
caso('é a ENTRADA da app', () => {
  assert.deepEqual({ ...MOLA_DO_VOO }, { ...ENTRADA });
});
caso('chega ao fim e assenta num tempo de entrada', () => {
  assert.ok(Math.abs(curvaDaMola(2) - 1) < 0.001);
  const d = duracaoDaMola();
  assert.ok(d > 400 && d < 1200, `${d} ms`);
});

console.log('\na cor');
caso('vai para o centro do ecrã e cresce até o tapar, com folga', () => {
  const v = vooDaCor(cartao, ecra, 'quadrado');
  assert.equal(cartao.x + cartao.width / 2 + v.dx, ecra.width / 2);
  assert.equal(cartao.y + cartao.height / 2 + v.dy, ecra.height / 2);
  assert.ok(cartao.width * v.escala > ecra.height);
});
caso('não tapa no começo, tapa no fim (quadrado e círculo)', () => {
  assert.equal(corTapa(0, cartao, ecra, 'quadrado', 12), false);
  assert.equal(corTapa(1, cartao, ecra, 'quadrado', 12), true);
  assert.equal(corTapa(0, circulo, ecra, 'circulo', 55), false);
  assert.equal(corTapa(1, circulo, ecra, 'circulo', 55), true);
});
caso('a página abre quando a cor já tapa tudo, e não antes', () => {
  for (const [de, forma, raio] of [[cartao, 'quadrado', 12], [circulo, 'circulo', 55], [{ x: 20, y: 600, width: 52, height: 52 }, 'quadrado', 0]] as const) {
    const t = momentoDeAbrir(de, ecra, forma, raio);
    assert.ok(t > 50 && t < duracaoDaMola(), `${forma}: ${t} ms`);
    assert.equal(corTapa(curvaDaMola(t / 1000), de, ecra, forma, raio), true, `${forma} tapa aos ${t} ms`);
    assert.equal(corTapa(curvaDaMola((t - 20) / 1000), de, ecra, forma, raio), false, `${forma} ainda não tapa 20 ms antes`);
  }
});

console.log('\na capa');
caso('vai de centro a centro, com a escala pela largura', () => {
  const ate = { x: 95, y: 107, width: 200, height: 200 };
  const v = vooDaCapa(cartao, ate);
  assert.equal(cartao.x + cartao.width / 2 + v.dx, ate.x + ate.width / 2);
  assert.equal(cartao.y + cartao.height / 2 + v.dy, ate.y + ate.height / 2);
  assert.ok(Math.abs(v.escala - 200 / 165) < 1e-9);
});

console.log('\nonde está ligado');
caso('as quatro páginas abrem sem animação nativa quando trazem voo, e esperam a capa', () => {
  const nav = ler('src/navigation/RootNavigator.tsx');
  for (const ecraDaPilha of ['PlaylistDetail', 'PastaDePlaylists', 'LibraryGroup', 'Prateleira']) {
    assert.match(nav, new RegExp(`<Stack\\.Screen name="${ecraDaPilha}" component=\\{\\w+\\} options=\\{abrePorUmQuadrado\\} />`), ecraDaPilha);
  }
  assert.match(nav, /\{voo \? <PaginaDoQuadrado voo=\{voo\} navigation=\{navigation\}>\{children\}<\/PaginaDoQuadrado> : children\}/);
  assert.match(nav, /<CamadaDoQuadrado \/>\n\s+\{\/\* A base de baixo/, 'por cima das páginas, por baixo da base');
});
caso('as capas de destino e as portas', () => {
  assert.match(ler('src/components/CabecalhoDaPlaylist.tsx'), /<AlvoDoVoo style=\{\[styles\.capa/);
  assert.match(ler('src/components/SeccoesDoArtista.tsx'), /<AlvoDoVoo style=\{\{ height: altura \}\}>/);
  for (const f of ['src/screens/PlaylistsScreen.tsx', 'src/screens/ArtistsScreen.tsx', 'src/screens/SearchScreen.tsx', 'src/components/SocialProfileView.tsx']) {
    assert.match(ler(f), /entrarPeloQuadrado\(/, f);
  }
});
caso('voltar pelo botão encolhe até ao quadrado', () => {
  assert.match(ler('src/screens/PlaylistDetailScreen.tsx'), /onPress=\{voltar\} style=\{\{ marginLeft: -8 \}\} accessibilityLabel="Back"/);
  const artista = ler('src/screens/LibraryGroupScreen.tsx');
  assert.match(artista, /<BolaDeVidro icone="chevron-back" label="Back" onPress=\{voltar\} \/>/);
  assert.equal(artista.match(/onBack=\{voltar\}/g)?.length, 2);
  assert.match(ler('src/screens/PlaylistsScreen.tsx'), /onBack=\{pastaAberta \? voltar : undefined\}/);
});

console.log(falhas ? `\n  ${falhas} caso(s) falharam.\n` : '\n  Todos os casos passaram.\n');
process.exit(falhas ? 1 : 0);
