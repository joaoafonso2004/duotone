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

// --- O degradê que esconde o fim da capa ---
import { degradeDaCapa } from '../src/lib/profileImageCrop.ts';

const FUNDO = '#0A0A0F';
const d = degradeDaCapa(FUNDO);

assert.equal(d.cores.length, d.paragens.length, 'uma paragem por cor');
assert.equal(d.paragens[0], 0, 'começa no topo');
assert.equal(d.paragens[d.paragens.length - 1], 1, 'acaba no fundo');

for (let i = 1; i < d.paragens.length; i++) {
  assert.ok(d.paragens[i]! > d.paragens[i - 1]!, `paragens sempre a subir (${i})`);
}

// A opacidade do véu, depois da zona limpa do topo, nunca pode descer: uma
// descida a meio devolvia a fotografia e criava uma segunda aresta.
const alfa = (c: string) => (c.startsWith('#') ? 1 : Number(/([\d.]+)\)$/.exec(c)![1]));
for (let i = 2; i < d.cores.length; i++) {
  assert.ok(alfa(d.cores[i]!) >= alfa(d.cores[i - 1]!), `opacidade sem recuos (${i})`);
}

// Opaco ANTES da aresta: é isto que impede o corte de se ver.
const primeiroOpaco = d.cores.findIndex((c) => alfa(c) === 1);
assert.ok(primeiroOpaco > 0, 'chega a opaco');
assert.ok(d.paragens[primeiroOpaco]! <= 0.95, 'chega a opaco antes do fim');
assert.equal(d.cores[d.cores.length - 1], FUNDO, 'a última cor é o fundo da página');

// A chegada tem de ser mansa: um último salto grande volta a marcar a linha.
assert.ok(alfa(d.cores[primeiroOpaco]!) - alfa(d.cores[primeiroOpaco - 1]!) <= 0.15,
  'o último passo até ao opaco é pequeno');

console.log('Degradê da capa: monótono, opaco antes da aresta e com chegada suave.');

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
