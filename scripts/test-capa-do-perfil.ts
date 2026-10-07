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

// --- A capa dissolve-se no ambiente (7/10, variante B) ---
import { veuDoAmbiente, veuDoTopo, DISSOLVE_DESDE, EXTENSAO_DO_AMBIENTE } from '../src/lib/profileImageCrop.ts';

const FUNDO = '#0A0A0F';
const alfa = (c: string) => (c.startsWith('#') ? 1 : Number(/([\d.]+)\)$/.exec(c)![1]));
for (const alturaDaCapa of [100, 300, 333, 1200]) {
  const d = veuDoAmbiente(alturaDaCapa, FUNDO);
  assert.equal(d.cores.length, d.paragens.length, 'uma paragem por cor');
  assert.equal(d.paragens[0], 0, 'começa no topo');
  assert.equal(d.paragens[d.paragens.length - 1], 1, 'acaba no fundo');
  for (let i = 1; i < d.paragens.length; i++) {
    assert.ok(d.paragens[i]! > d.paragens[i - 1]!, `paragens sempre a subir (${alturaDaCapa}, ${i})`);
  }
  // O ambiente escurece sempre para baixo, nunca devolve a fotografia.
  for (let i = 1; i < d.cores.length; i++) {
    assert.ok(alfa(d.cores[i]!) >= alfa(d.cores[i - 1]!), `véu sem recuos (${alturaDaCapa}, ${i})`);
  }
  // Opaco ANTES do fim da caixa: o desfoque transborda, e o corte cai sobre cor lisa.
  const primeiroOpaco = d.cores.findIndex((c) => alfa(c) === 1);
  assert.ok(primeiroOpaco > 0 && d.paragens[primeiroOpaco]! < 1, 'chega ao fundo antes do fim');
  assert.equal(d.cores[d.cores.length - 1], FUNDO, 'a última cor é o fundo da página');
  // Por trás da capa o ambiente é leve: é ele que se vê quando a nítida se dissolve.
  assert.ok(alfa(d.cores[0]!) <= 0.35, 'leve no topo');
}
assert.ok(DISSOLVE_DESDE >= 0.5 && DISSOLVE_DESDE <= 0.7, 'a nítida fica inteira até mais de metade');
assert.ok(EXTENSAO_DO_AMBIENTE >= 250, 'o ambiente chega à secção seguinte (era o espaço preto)');
const topo = veuDoTopo();
assert.equal(alfa(topo.cores[topo.cores.length - 1]!), 0, 'o véu do topo (horas, botões) acaba transparente');
assert.ok(topo.paragens[topo.paragens.length - 1]! <= 0.25, 'e acaba cedo');

// A capa já não escurece até ao preto: é uma máscara (dissolve) por cima do ambiente.
const heroi = (await import('node:fs')).readFileSync(new URL('../src/components/ProfileHero.tsx', import.meta.url), 'utf8');
assert.match(heroi, /<DissolverEmBaixo desde=\{DISSOLVE_DESDE\}>/, 'a capa nítida dissolve-se');
assert.match(heroi, /<AmbienteDaCapa fonte=\{cover\}/, 'e o ambiente está por trás do cabeçalho');
assert.match(heroi, /blurRadius=\{40\}/, 'o desfoque é da imagem, não ao vivo');
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
