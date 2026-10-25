/**
 * Gera `src/lib/autoeqModelos.ts`: a correção de cada auscultador medido pelo
 * AutoEQ, já ajustada às dez bandas do Duotone. Corre-se à mão, quando se
 * quiser atualizar as medições -- a app nunca vai buscar nada.
 *
 *   git clone --depth 1 --filter=blob:none --no-checkout https://github.com/jaakkopasanen/AutoEq.git
 *   (checkout parcial só dos "* GraphicEQ.txt" de `results/`)
 *   node --experimental-strip-types scripts/gerar-autoeq.mjs <pasta do AutoEq>
 *
 * **Um modelo, uma medição.** O mesmo auscultador aparece em várias fontes; fica
 * a de maior confiança (oratory1990, depois Rtings, crinacle, Innerfidelity,
 * Headphone.com) e, dentro do Rtings, o banco novo (B&K 5128).
 *
 * **O ajuste.** O GraphicEQ do AutoEQ é a curva de correção em 127 pontos. As
 * bandas do Duotone são as que o próprio AutoEQ usa para EQ paramétrico
 * (prateleira a 105 Hz, picos, prateleira a 10 kHz), por isso basta procurar os
 * dez ganhos cuja resposta (`respostaDb`, a mesma matemática que se ouve) fica
 * mais perto da curva: mínimos quadrados com Gauss-Newton, pesos que contam
 * menos nos extremos (os agudos acima de 6 kHz dependem de como o auscultador
 * assenta, e medem-se mal) e um pouco de regularização, para as três bandas
 * dos graves não se anularem umas às outras com ganhos enormes.
 *
 * **O volume não muda.** A curva centra-se na média de 100 Hz a 4 kHz: sobe
 * onde o auscultador é fraco e desce onde exagera, sem baixar tudo. É a regra
 * do equalizador (som.md): nunca fingir correção com atenuação global.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { respostaDb } from '../src/lib/equalizer.ts';

const raiz = process.argv[2];
if (!raiz) { console.error('Uso: node --experimental-strip-types scripts/gerar-autoeq.mjs <pasta do AutoEq>'); process.exit(1); }

const FONTES = ['oratory1990', 'Rtings', 'crinacle', 'Innerfidelity', 'Headphone.com Legacy'];
const LIMITE = 10;
const ALFABETO = '0123456789abcdefghijklmnopqrstuvwxyzABCDE';

function* ficheiros(pasta) {
  for (const nome of readdirSync(pasta)) {
    const p = join(pasta, nome);
    if (statSync(p).isDirectory()) yield* ficheiros(p);
    else if (nome.endsWith(' GraphicEQ.txt')) yield p;
  }
}

const prioridade = (p) => {
  const partes = p.split(/[\\/]/);
  const i = partes.indexOf('results');
  const fonte = partes[i + 1], banco = partes[i + 2] ?? '';
  const f = FONTES.indexOf(fonte);
  return [f < 0 ? FONTES.length : f, banco.includes('5128') ? 0 : 1];
};
const antes = (a, b) => a[0] - b[0] || a[1] - b[1];

// "Pro2", "Pro 2" e "Airpods Pro 2" são o mesmo modelo: a chave ignora caixa,
// espaços e pontuação. A medição é a da fonte mais fiável; o nome, a grafia
// que mais fontes usam (com empate, a mais legível: "AirPods Pro 2" e não "Pro2").
const nomeDe = (p) => p.split(/[\\/]/).pop().slice(0, -' GraphicEQ.txt'.length)
  .replace(/\s+/g, ' ').trim().replace(/\bAirpods\b/g, 'AirPods');
const escolhidos = new Map();
for (const p of ficheiros(join(raiz, 'results'))) {
  const nome = nomeDe(p);
  const chave = nome.toLowerCase().replace(/[^a-z0-9]/g, '');
  const atual = escolhidos.get(chave) ?? { p, grafias: new Map() };
  if (antes(prioridade(p), prioridade(atual.p)) < 0) atual.p = p;
  atual.grafias.set(nome, (atual.grafias.get(nome) ?? 0) + 1);
  escolhidos.set(chave, atual);
}
for (const e of escolhidos.values()) {
  const daFonte = nomeDe(e.p);
  const espacos = (s) => s.split(' ').length;
  e.nome = [...e.grafias].sort((x, y) => y[1] - x[1] || espacos(y[0]) - espacos(x[0])
    || (x[0] === daFonte ? -1 : y[0] === daFonte ? 1 : 0))[0][0];
}

function lerCurva(p) {
  const texto = readFileSync(p, 'utf8').replace(/^GraphicEQ:\s*/, '');
  return texto.split(';').map((par) => par.trim().split(/\s+/).map(Number)).filter(([f, g]) => f > 0 && Number.isFinite(g));
}

// A curva a uma frequência, interpolada em log.
function naCurva(curva, f) {
  if (f <= curva[0][0]) return curva[0][1];
  for (let i = 1; i < curva.length; i++) {
    if (f <= curva[i][0]) {
      const [f0, g0] = curva[i - 1], [f1, g1] = curva[i];
      const t = Math.log(f / f0) / Math.log(f1 / f0);
      return g0 + t * (g1 - g0);
    }
  }
  return curva[curva.length - 1][1];
}

const GRELHA = Array.from({ length: 96 }, (_, i) => 20 * Math.pow(16000 / 20, i / 95));
const peso = (f) => (f < 40 ? 0.5 : f <= 6000 ? 1 : f <= 12000 ? 0.4 : 0.15);
const PESOS = GRELHA.map(peso);
const REGULARIZACAO = 0.6;

function resolver(A, b) {
  const n = b.length, M = A.map((linha, i) => [...linha, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let l = c + 1; l < n; l++) if (Math.abs(M[l][c]) > Math.abs(M[p][c])) p = l;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) continue;
    for (let l = c + 1; l < n; l++) {
      const k = M[l][c] / M[c][c];
      for (let j = c; j <= n; j++) M[l][j] -= k * M[c][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = Math.abs(M[i][i]) < 1e-12 ? 0 : s / M[i][i];
  }
  return x;
}

function ajustar(alvo) {
  let g = new Array(10).fill(0);
  const prender = (v) => Math.max(-LIMITE, Math.min(LIMITE, v));
  for (let volta = 0; volta < 20; volta++) {
    const atual = GRELHA.map((f) => respostaDb(g, f));
    const r = GRELHA.map((_, k) => alvo[k] - atual[k]);
    // Diferenças centradas de meio dB: o `respostaDb` arredonda os ganhos a uma
    // casa, e um passo mais pequeno do que isso não mexia em nada. Os filtros
    // estão em série (os dB somam-se), por isso a derivada de uma banda só
    // depende dela: mede-se com as outras a zero, que é muito mais barato.
    const J = GRELHA.map(() => new Array(10).fill(0));
    for (let i = 0; i < 10; i++) {
      const mais = new Array(10).fill(0), menos = new Array(10).fill(0);
      mais[i] = g[i] + 0.5; menos[i] = g[i] - 0.5;
      GRELHA.forEach((f, k) => { J[k][i] = respostaDb(mais, f) - respostaDb(menos, f); });
    }
    const A = Array.from({ length: 10 }, (_, i) => Array.from({ length: 10 }, (_, j) => {
      let s = 0;
      for (let k = 0; k < GRELHA.length; k++) s += PESOS[k] * J[k][i] * J[k][j];
      return s + (i === j ? REGULARIZACAO : 0);
    }));
    const b = Array.from({ length: 10 }, (_, i) => {
      let s = 0;
      for (let k = 0; k < GRELHA.length; k++) s += PESOS[k] * J[k][i] * r[k];
      return s - REGULARIZACAO * g[i];
    });
    const passo = resolver(A, b);
    const novo = g.map((v, i) => prender(v + passo[i]));
    const mexeu = novo.some((v, i) => Math.abs(v - g[i]) > 0.02);
    g = novo;
    if (!mexeu) break;
  }
  return g.map((v) => Math.round(v * 2) / 2);
}

const erro = (g, alvo) => Math.sqrt(GRELHA.reduce((s, f, k) => s + PESOS[k] * (alvo[k] - respostaDb(g, f)) ** 2, 0)
  / PESOS.reduce((a, b) => a + b, 0));

const linhas = [];
let somaAntes = 0, somaDepois = 0;
const ordenados = [...escolhidos.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'en'));
for (const { p, nome } of ordenados) {
  const curva = lerCurva(p);
  if (curva.length < 20) continue;
  const bruto = GRELHA.map((f) => naCurva(curva, f));
  const meio = GRELHA.map((f, k) => [f, bruto[k]]).filter(([f]) => f >= 100 && f <= 4000);
  const media = meio.reduce((s, [, v]) => s + v, 0) / meio.length;
  const alvo = bruto.map((v) => v - media);
  const g = ajustar(alvo);
  somaAntes += erro(new Array(10).fill(0), alvo);
  somaDepois += erro(g, alvo);
  const letras = g.map((v) => ALFABETO[Math.round(v * 2) + 20]).join('');
  linhas.push(`${nome.replace(/[\t\n`$\\]/g, ' ')}\t${letras}`);
}

const cabecalho = `/**
 * GERADO por scripts/gerar-autoeq.mjs -- não editar à mão.
 *
 * A correção de ${linhas.length} auscultadores medidos pelo projeto AutoEQ
 * (github.com/jaakkopasanen/AutoEq, licença MIT), ajustada às dez bandas do
 * Duotone. Uma linha por modelo: o nome, um TAB, e dez letras -- uma por banda,
 * pela ordem de BANDAS. Cada letra é um ganho em meios dB: a posição dela em
 * ALFABETO menos 20, a dividir por 2 ("k" = 0 dB, "0" = -10 dB, "E" = +10 dB).
 */
export const ALFABETO = '${ALFABETO}';

export const MODELOS = \``;
writeFileSync(join(import.meta.dirname, '..', 'src', 'lib', 'autoeqModelos.ts'), `${cabecalho}\n${linhas.join('\n')}\n\`;\n`);
console.log(`${linhas.length} modelos; erro médio ${(somaAntes / linhas.length).toFixed(2)} dB sem correção -> ${(somaDepois / linhas.length).toFixed(2)} dB com as dez bandas`);
