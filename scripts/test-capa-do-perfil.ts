import assert from 'node:assert/strict';
import { enquadrarCapa, RACIO_DA_CAPA } from '../src/lib/profileImageCrop.ts';

const quaseIgual = (a: number, b: number, msg: string) =>
  assert.ok(Math.abs(a - b) < 0.001, `${msg}: ${a} != ${b}`);

// Caixa alta (telemóvel): a capa cresce pelos lados e cobre a altura toda --
// era aqui que a foto acabava antes da biografia.
const tel = enquadrarCapa(393, 420);
quaseIgual(tel.altura, 420, 'telemóvel cobre a altura toda');
assert.ok(tel.largura > 393, 'telemóvel transborda pelos lados');
quaseIgual(tel.left, (393 - tel.largura) / 2, 'telemóvel fica centrado na horizontal');
assert.equal(tel.top, 0, 'telemóvel encosta ao topo');

// Caixa larga (PC): a capa cresce para baixo, cortada pelo fundo do cabeçalho.
const pc = enquadrarCapa(1600, 370);
quaseIgual(pc.largura, 1600, 'PC ocupa a largura toda');
assert.ok(pc.altura > 370, 'PC transborda por baixo');
assert.equal(pc.left, 0, 'PC não desloca na horizontal');
assert.equal(pc.top, 0, 'PC encosta ao topo, como o telemóvel');

// O rácio da imagem nunca é deformado, seja qual for a caixa.
for (const [w, h] of [[393, 420], [1600, 370], [800, 800], [200, 1000]]) {
  const e = enquadrarCapa(w!, h!);
  quaseIgual(e.largura / e.altura, RACIO_DA_CAPA, `rácio preservado em ${w}x${h}`);
  assert.ok(e.largura >= w! - 0.001 && e.altura >= h! - 0.001, `cobre a caixa ${w}x${h}`);
}

// Caixa por medir não pode produzir NaN nem uma imagem gigante.
for (const [w, h] of [[0, 0], [-1, 10], [10, 0]]) {
  assert.deepEqual(enquadrarCapa(w!, h!), { largura: 0, altura: 0, left: 0, top: 0 });
}

console.log('Capa do perfil: cobre a caixa, mantém o rácio, ancora ao topo nas duas plataformas.');

// --- A capa dissolve-se na cor dela, que desce pela página (11/10, variante A de docs/perfil-topo.html) ---
import { degradeDaCorDaCapa, veuDoTopo, DISSOLVE_DESDE, EXTENSAO_DO_AMBIENTE } from '../src/lib/profileImageCrop.ts';
import { contraste, corDoAmbiente, deHex } from '../src/lib/corDaCapa.ts';

const alfa = (c: string) => (c.startsWith('#') ? 1 : Number(/([\d.]+)\)$/.exec(c)![1]));
for (const alturaDaCapa of [100, 300, 333, 1200]) {
  const d = degradeDaCorDaCapa(alturaDaCapa, '#5A4A3C');
  assert.equal(d.cores.length, d.paragens.length, 'uma paragem por cor');
  assert.equal(d.paragens[0], 0, 'começa no topo');
  assert.equal(d.paragens[d.paragens.length - 1], 1, 'acaba no fundo');
  for (let i = 1; i < d.paragens.length; i++) {
    assert.ok(d.paragens[i]! > d.paragens[i - 1]!, `paragens sempre a subir (${alturaDaCapa}, ${i})`);
  }
  // A cor só se apaga para baixo, sem recuos: não há aresta nenhuma.
  for (let i = 1; i < d.cores.length; i++) {
    assert.ok(alfa(d.cores[i]!) <= alfa(d.cores[i - 1]!), `sem recuos (${alturaDaCapa}, ${i})`);
  }
  assert.equal(alfa(d.cores[0]!), 1, 'cheia por trás da capa (é ela que se vê quando a fotografia se dissolve)');
  assert.ok(alfa(d.cores[1]!) >= 0.85, 'ainda cheia no fim da capa');
  assert.equal(alfa(d.cores[d.cores.length - 1]!), 0, 'acaba transparente sobre o fundo da página, sem corte');
  assert.ok(d.cores.every((c) => c.startsWith('rgba(90,74,60,')), 'a cor é a da capa');
}
assert.ok(DISSOLVE_DESDE >= 0.5 && DISSOLVE_DESDE <= 0.7, 'a nítida fica inteira até mais de metade');
assert.ok(EXTENSAO_DO_AMBIENTE >= 400, 'a cor desce devagar até bem abaixo da capa (era o espaço preto)');

// A cor: a da fotografia, escura o bastante para o texto branco (contraste de 4,5).
const BRANCO = { r: 255, g: 255, b: 255 };
const cao = [...Array(10).fill({ r: 130, g: 90, b: 55 }), ...Array(6).fill({ r: 200, g: 195, b: 188 })];
for (const celulas of [cao, Array(16).fill({ r: 240, g: 235, b: 225 }), Array(16).fill({ r: 30, g: 120, b: 210 })]) {
  const c = corDoAmbiente(celulas)!;
  assert.match(c, /^#[0-9A-F]{6}$/);
  assert.ok(contraste(deHex(c), BRANCO) >= 4.5, `o branco lê-se sobre ${c}`);
}
const doCao = deHex(corDoAmbiente(cao)!);
assert.ok(doCao.r > doCao.b, 'a do cão é quente (a característica, não a média cinzenta)');
assert.equal(corDoAmbiente(null), null);
assert.equal(corDoAmbiente([]), null);
const topo = veuDoTopo();
assert.equal(alfa(topo.cores[topo.cores.length - 1]!), 0, 'o véu do topo (horas, botões) acaba transparente');
assert.ok(topo.paragens[topo.paragens.length - 1]! <= 0.25, 'e acaba cedo');

// A capa já não escurece até ao preto: é uma máscara (dissolve) por cima do ambiente.
const heroi = (await import('node:fs')).readFileSync(new URL('../src/components/ProfileHero.tsx', import.meta.url), 'utf8');
assert.match(heroi, /<DissolverEmBaixo desde=\{DISSOLVE_DESDE\}>/, 'a capa nítida dissolve-se');
assert.match(heroi, /<CorDaCapaDoPerfil cover=\{cover\} alturaDaCapa=\{alturaDaCapa\}\/>/, 'e a cor dela está por trás do cabeçalho');
assert.doesNotMatch(heroi, /AmbienteDaCapa|blurRadius/, 'a fotografia desfocada por trás saiu (11/10)');
assert.match(heroi, /alignItems:'flex-start',paddingHorizontal:SOCIAL_GUTTER,marginTop:-sobreposicao/, 'a identidade à esquerda, por cima da capa');
assert.match(heroi, /const AVATAR=76;/, 'a cara grande');
assert.doesNotMatch(heroi, /BlurView/, 'nada de desfoque ao vivo no perfil');
for (const f of ['src/components/DissolverEmBaixo.tsx', 'src/components/DissolverEmBaixo.web.tsx']) {
  assert.ok((await import('node:fs')).existsSync(new URL(`../${f}`, import.meta.url)), `${f} existe (par de plataforma)`);
}

console.log('Capa do perfil: dissolve-se num ambiente desfocado que acaba no fundo, sem espaço preto.');

// --- A altura do cabeçalho no PC ---
import { alturaDoCabecalhoNoPc, ALTURA_MINIMA_DO_CABECALHO, FRACAO_MAXIMA_DA_JANELA } from '../src/lib/profileImageCrop.ts';

// Quanto da ALTURA da fotografia se vê, dada uma caixa. É esta fração que
// antes variava com a janela: 50% numa janela normal, 23% em ecrã grande.
const visivel = (largura: number, alturaDaJanela: number) => {
  const h = alturaDoCabecalhoNoPc(largura, alturaDaJanela);
  return alturaDoCabecalhoNoPc(largura, alturaDaJanela) / enquadrarCapa(largura, h).altura;
};

// Enquanto o teto da janela não morde, a fração mantém-se — que é o ponto.
const normal = visivel(1100, 1200);
const largo = visivel(1660, 1400);
assert.ok(Math.abs(normal - largo) < 0.02, `fração estável: ${normal} vs ${largo}`);

// Quando o teto morde, a fração baixa — é o preço de não comer o ecrã. Mas
// tem de continuar bem melhor do que a altura fixa de 370 que havia antes.
const antes = 370 / enquadrarCapa(1660, 370).altura;
assert.ok(visivel(1660, 900) > antes + 0.05, `melhor que a altura fixa: ${visivel(1660, 900)} vs ${antes}`);

// Cresce com a largura, em vez de encolher.
assert.ok(alturaDoCabecalhoNoPc(1660, 1000) > alturaDoCabecalhoNoPc(1100, 1000));

// O conteúdo precisa de um mínimo, mesmo numa janela estreita.
assert.equal(alturaDoCabecalhoNoPc(600, 900), ALTURA_MINIMA_DO_CABECALHO);
assert.equal(alturaDoCabecalhoNoPc(0, 900), ALTURA_MINIMA_DO_CABECALHO);

// E não pode comer a janela: num ecrã baixo o teto é a fração da janela.
assert.ok(alturaDoCabecalhoNoPc(3000, 700) <= 700 * FRACAO_MAXIMA_DA_JANELA + 1);
// Num monitor grande manda o máximo absoluto.
assert.ok(alturaDoCabecalhoNoPc(3840, 2160) <= 560);
// Sem altura de janela conhecida não rebenta.
assert.ok(alturaDoCabecalhoNoPc(1600, 0) >= ALTURA_MINIMA_DO_CABECALHO);

console.log('Cabeçalho no PC: a altura acompanha a largura, com mínimo e teto.');

// --- O zoom da moldura ---
import {
  imageCrop, LARGURA_DA_CAPA, LARGURA_DO_AVATAR, RACIO_DO_AVATAR,
  zoomMaximo, ZOOM_MAXIMO, ZOOM_MINIMO,
} from '../src/lib/profileImageCrop.ts';

// UMA FOTO VERTICAL, que é o caso da queixa: com o recorte de área máxima o
// recorte come a largura toda e não sobra NADA para andar na horizontal.
const vertical = { largura: 3000, altura: 4000 };
const semZoom = imageCrop(vertical.largura, vertical.altura, RACIO_DA_CAPA, 0.5, 0.5);
assert.equal(semZoom.width, vertical.largura, 'sem zoom o recorte usa a largura toda');
assert.equal(vertical.largura - semZoom.width, 0, 'e por isso não há folga lateral nenhuma');

// Aproximar encolhe o recorte, e é isso que abre espaço nos DOIS eixos.
const comZoom = imageCrop(vertical.largura, vertical.altura, RACIO_DA_CAPA, 0.5, 0.5, 2);
assert.ok(vertical.largura - comZoom.width > 0, 'com zoom já há folga lateral');
assert.ok(vertical.altura - comZoom.height > 0, 'e continua a haver folga vertical');

// O rácio não se perde ao aproximar -- os dois lados descem pelo mesmo fator.
//
// A tolerância é UM PÍXEL de altura, e não um epsilon: um recorte é feito de
// píxeis inteiros, e 3:2 exacto só existe quando a largura é múltipla de 3.
// A 3,7x o recorte é 1081x720, que dá 1,5014 -- não há inteiros ali que dêem
// melhor. O que interessa é que o erro fique preso ao arredondamento e não
// cresça com o zoom.
for (const z of [1, 1.5, 2, 3.7]) {
  const c = imageCrop(4000, 3000, RACIO_DA_CAPA, 0.5, 0.5, z);
  const folga = RACIO_DA_CAPA / c.height;
  assert.ok(
    Math.abs(c.width / c.height - RACIO_DA_CAPA) < folga,
    `rácio mantido com zoom ${z}: ${c.width}x${c.height}`,
  );
}

// Metade do recorte por cada duplicação do zoom.
const z1 = imageCrop(4000, 3000, RACIO_DA_CAPA, 0.5, 0.5, 1);
const z2 = imageCrop(4000, 3000, RACIO_DA_CAPA, 0.5, 0.5, 2);
assert.equal(z2.width, Math.floor(z1.width / 2), 'o dobro do zoom é metade do recorte');

// Um zoom disparatado não pode produzir um recorte de zero nem NaN.
for (const mau of [0, -3, NaN, Infinity]) {
  const c = imageCrop(4000, 3000, RACIO_DA_CAPA, 0.5, 0.5, mau as number);
  assert.deepEqual(c, z1, `zoom inválido (${mau}) cai no recorte máximo`);
}
assert.ok(imageCrop(40, 30, RACIO_DA_CAPA, 0.5, 0.5, 1000).width >= 1, 'nunca um recorte de zero');

// O ponto focal continua a andar de ponta a ponta, agora também na horizontal.
const esquerda = imageCrop(3000, 4000, RACIO_DA_CAPA, 0, 0.5, 2);
const direita = imageCrop(3000, 4000, RACIO_DA_CAPA, 1, 0.5, 2);
assert.equal(esquerda.originX, 0, 'encostado à esquerda');
assert.equal(direita.originX, 3000 - direita.width, 'encostado à direita');

console.log('Zoom do recorte: encolhe nos dois eixos, mantém o rácio e destrava o movimento lateral.');

// --- O teto por imagem ---

// Uma fotografia de telemóvel tem resolução de sobra para aproximar.
assert.ok(zoomMaximo(4000, 3000, RACIO_DA_CAPA, LARGURA_DA_CAPA) > 2, 'foto grande deixa aproximar');

// Uma imagem já do tamanho da saída não tem por onde: aproximar seria só
// ampliar pixéis. Tolera-se 1,5x, e nada mais.
quaseIgual(zoomMaximo(1600, 1067, RACIO_DA_CAPA, LARGURA_DA_CAPA), 1.5, 'imagem justa tolera 1,5x');
assert.equal(zoomMaximo(800, 533, RACIO_DA_CAPA, LARGURA_DA_CAPA), ZOOM_MINIMO,
  'imagem pequena não deixa aproximar nada');

// O teto absoluto manda, por maior que seja a fotografia.
assert.equal(zoomMaximo(20000, 15000, RACIO_DA_CAPA, LARGURA_DA_CAPA), ZOOM_MAXIMO);

// O avatar grava a 512, por isso a mesma fotografia dá muito mais zoom.
assert.ok(
  zoomMaximo(3000, 4000, RACIO_DO_AVATAR, LARGURA_DO_AVATAR)
  > zoomMaximo(3000, 4000, RACIO_DA_CAPA, LARGURA_DA_CAPA),
  'o avatar tolera mais zoom do que a capa, porque grava mais pequeno',
);

// Medidas por saber nunca devolvem NaN nem deixam aproximar às cegas.
for (const [w, h, r, saida] of [[0, 10, 1.5, 1600], [10, 0, 1.5, 1600], [10, 10, 0, 1600], [10, 10, 1.5, 0]]) {
  assert.equal(zoomMaximo(w!, h!, r!, saida!), ZOOM_MINIMO);
}

console.log('Teto do zoom: sai da resolução de cada imagem, com mínimo de 1 e teto absoluto.');

// --- A variante A (5/10, docs/perfil-capa.html): a fotografia inteira ---
import { alturaDaCapaNoTelemovel, FOLGA_DA_CAPA } from '../src/lib/profileImageCrop.ts';

// A caixa do telemóvel mostra a fotografia INTEIRA: era 220 pt para uma
// fotografia de 260-293 pt, e o fundo dela ficava cortado.
for (const largura of [375, 393, 402, 430, 440]) {
  const h = alturaDaCapaNoTelemovel(largura);
  assert.ok(h >= largura / RACIO_DA_CAPA, `${largura}: a caixa tem a fotografia toda (${h})`);
  assert.equal(h, Math.round(largura / RACIO_DA_CAPA + FOLGA_DA_CAPA));
  // A fotografia cobre a caixa sem a cortar em baixo; só uns pontos dos lados.
  const e = enquadrarCapa(largura, h);
  quaseIgual(e.altura, h, `${largura}: cobre a altura`);
  // (+0,5 pt do arredondamento da altura.)
  assert.ok(e.largura - largura <= (FOLGA_DA_CAPA + 0.5) * RACIO_DA_CAPA + 0.001, `${largura}: corta pouco dos lados`);
}
assert.equal(alturaDaCapaNoTelemovel(0), 0, 'sem largura medida, sem caixa');

// A fotografia fica nítida até mais de metade (era o "acaba a meio"): agora é a
// máscara que manda, e só começa em DISSOLVE_DESDE.
assert.ok(DISSOLVE_DESDE >= 0.55, `nítida até ${DISSOLVE_DESDE}`);

console.log('Capa no telemóvel: a fotografia inteira, nítida até mais de metade.');
