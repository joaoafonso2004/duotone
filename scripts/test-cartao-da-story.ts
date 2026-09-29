// O cartão das Stories (lib/cartaoDaStory.ts, 29/9): as medidas da opção A da
// maquete (docs/cartao-stories.html), as mesmas no iPhone e no canvas do PC.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  encherCaixa, geometriaDoCartao, nomeDoFicheiroDaStory, partirTitulo, TAMANHO_DA_STORY, VEU_DO_CARTAO,
} from '../src/lib/cartaoDaStory.ts';

const src = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const perto = (a: number, b: number, msg: string) => assert.ok(Math.abs(a - b) < 0.5, `${msg}: ${a} vs ${b}`);

// ---- as medidas: a Story é 1080x1920 e tudo é proporção da largura
assert.deepEqual(TAMANHO_DA_STORY, { largura: 1080, altura: 1920 });
const g = geometriaDoCartao(1080);
assert.equal(g.altura, 1920);
perto(g.capa.lado, 1080 * 0.58, 'a capa tem 58% da largura');
perto(g.capa.x + g.capa.lado / 2, 540, 'a capa está ao centro');
perto(g.capa.y + g.capa.lado / 2, 1920 * 0.43, 'e o centro dela a 43% da altura');
perto(g.titulo.topo, 1920 * 0.645, 'o nome começa a 64,5%');
assert.ok(g.titulo.topo > g.capa.y + g.capa.lado, 'o nome fica por baixo da capa');
perto(g.marca.base, 1920 * 0.945, 'a marca a 5,5% do fundo');
perto(g.fundo.desfoque, 36, 'o desfoque da maquete (10 px em 300) à escala');
assert.ok(g.fundo.x < 0 && g.fundo.y < 0 && g.fundo.x + g.fundo.largura > 1080 && g.fundo.y + g.fundo.altura > 1920,
  'o fundo sangra para fora do cartão (sem moldura clara do desfoque)');
const metade = geometriaDoCartao(540);
perto(metade.capa.lado * 2, g.capa.lado, 'a meia largura é meio cartão');
perto(metade.titulo.tamanho * 2, g.titulo.tamanho, 'também o texto');
assert.deepEqual(VEU_DO_CARTAO.map((v) => v.em), [0, 0.45, 0.78, 1]);
assert.ok(VEU_DO_CARTAO.every((v, i, t) => i === 0 || v.opacidade > t[i - 1]!.opacidade), 'o véu escurece para baixo');

// ---- encher a caixa: o login_bg (540x959) cobre o fundo, encostado em cima
const caixa = { x: g.fundo.x, y: g.fundo.y, largura: g.fundo.largura, altura: g.fundo.altura };
const onde = encherCaixa({ largura: 540, altura: 959 }, caixa, 0);
assert.ok(onde.largura >= caixa.largura - 0.01 && onde.altura >= caixa.altura - 0.01, 'enche a caixa toda');
perto(onde.y, caixa.y, 'encostado em cima (o símbolo)');
perto(onde.x + onde.largura / 2, caixa.x + caixa.largura / 2, 'ao centro na horizontal');
const embaixo = encherCaixa({ largura: 100, altura: 400 }, { x: 0, y: 0, largura: 100, altura: 100 }, 1);
assert.equal(embaixo.y, -300);

// ---- o título: até duas linhas, reticências se sobrar, palavras enormes cortadas
const cabe = (n: number) => (s: string) => s.length <= n;
assert.deepEqual(partirTitulo('Telescópio', cabe(20), 2), ['Telescópio']);
assert.deepEqual(partirTitulo('one two three four', cabe(9), 2), ['one two', 'three…']);
assert.deepEqual(partirTitulo('one two three', cabe(9), 2), ['one two', 'three']);
assert.deepEqual(partirTitulo('supercalifragilistic', cabe(8), 2), ['supercal', 'ifragil…']);
assert.deepEqual(partirTitulo('  ', cabe(8), 2), []);
for (const linhas of [partirTitulo('a b c d e f g h i j k l m n o p', cabe(5), 2)]) {
  assert.equal(linhas.length, 2);
  assert.ok(linhas.every((l) => l.length <= 5), JSON.stringify(linhas));
}

// ---- o nome do ficheiro
assert.equal(nomeDoFicheiroDaStory('Telescópio'), 'duotone-story-telescopio.png');
assert.equal(nomeDoFicheiroDaStory('A$AP / "Praise the Lord"?'), 'duotone-story-a-ap-praise-the-lord.png');
assert.equal(nomeDoFicheiroDaStory('???'), 'duotone-story.png');

// ---- os dois lados usam o mesmo fundo, o mesmo tamanho e as mesmas medidas
const ios = src('src/components/CartaoDaStory.tsx');
const pc = src('src/desktop/CartaoDaStory.web.tsx');
for (const [nome, s] of [['iPhone', ios], ['PC', pc]] as const) {
  assert.match(s, /assets\/login_bg\.png/, `${nome}: o fundo é o da app`);
  assert.match(s, /geometriaDoCartao\(/, `${nome}: as medidas vêm do lib`);
  assert.match(s, /tituloNoLeitor\(/, `${nome}: o título limpo, como no leitor`);
}
assert.match(ios, /captureRef\(cartao, \{[^}]*TAMANHO_DA_STORY\.largura[^}]*TAMANHO_DA_STORY\.altura/, 'o iPhone fotografa a 1080x1920');
assert.match(ios, /Share\.share\(\{ url: uri \}\)/, 'e vai pela folha de partilha');
assert.match(ios, /disabled=\{!capaPronta \|\| !fundoPronto/, 'o Share só acende com as imagens carregadas');
// Os cantos redondos são da pré-visualização: a vista fotografada não os tem.
const vistaFotografada = /<View ref=\{cartao\}[^>]*style=\{\{([^}]*)\}\}/.exec(ios);
assert.ok(vistaFotografada && !/borderRadius/.test(vistaFotografada[1]!), 'a imagem sai retangular');
assert.match(pc, /recorteDaCapa\(/, 'o PC tira as barras das miniaturas 4:3');
assert.match(pc, /canvas\.width = L;\n  canvas\.height = A;/, 'o canvas é do tamanho da Story');

// ---- o menu abre-o nos três sítios
assert.match(src('src/components/PlayerRoot.tsx'), /case 'story':/);
assert.match(src('src/components/SocialTrackActions.tsx'), /case 'story':/);
assert.match(src('src/navigation/RootNavigator.web.tsx'), /case 'story':/);
assert.match(src('src/navigation/RootNavigator.web.tsx'), /<CartaoDaStoryPc /);

console.log('Cartão das Stories: passou.');
