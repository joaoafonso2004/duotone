/**
 * A barra de tarefas do Windows (10/10): os três botões na miniatura da janela
 * (anterior, tocar/pausa, seguinte) e a lista de saltos do ícone (Resume,
 * Daily mix, Shuffle Liked Songs -- os mesmos três atalhos do ícone do iPhone,
 * `src/lib/atalhosDoIcone.ts`).
 *
 * Puro: o `main.cjs` liga isto ao Electron (`setThumbarButtons`,
 * `setUserTasks`). Testado em `scripts/test-barra-de-tarefas.mjs`.
 *
 * Os ícones são DESENHADOS aqui, píxel a píxel: o `nativeImage` não lê SVG, e
 * quatro PNGs à parte (mais os de tema claro) eram ficheiros para manter.
 */

/** O argumento com que a lista de saltos abre a app (ou a segunda instância). */
const ARGUMENTO = '--duotone-acao=';

/** As tarefas da lista de saltos. A `acao` é a do iPhone (`AcaoDoAtalho`). */
const TAREFAS = Object.freeze([
  { acao: 'continuar', titulo: 'Resume', descricao: 'Resume what you were listening to' },
  { acao: 'mistura-do-dia', titulo: 'Daily mix', descricao: 'Play your Daily mix' },
  { acao: 'baralhar-gostadas', titulo: 'Shuffle Liked Songs', descricao: 'Shuffle your Liked Songs' },
]);

/** A ação pedida nos argumentos, ou `null`. Só uma das três. */
function acaoDosArgumentos(argv) {
  if (!Array.isArray(argv)) return null;
  for (const a of argv) {
    if (typeof a !== 'string' || !a.startsWith(ARGUMENTO)) continue;
    const acao = a.slice(ARGUMENTO.length);
    if (TAREFAS.some((t) => t.acao === acao)) return acao;
  }
  return null;
}

/** O estado que a página manda, validado. */
function estadoValido(e) {
  if (!e || typeof e !== 'object') return null;
  if (typeof e.aTocar !== 'boolean' || typeof e.temFaixa !== 'boolean') return null;
  return { aTocar: e.aTocar, temFaixa: e.temFaixa };
}

/**
 * Os três botões, por ordem. `atalho` é a ação de `electron/atalhos.cjs` que o
 * clique executa. Sem música ficam lá, apagados: a miniatura não muda de forma.
 */
function botoesDaMiniatura(estado) {
  const flags = estado.temFaixa ? [] : ['disabled'];
  return [
    { icone: 'anterior', dica: 'Previous', atalho: 'anterior', flags },
    estado.aTocar
      ? { icone: 'pausa', dica: 'Pause', atalho: 'tocar-pausa', flags }
      : { icone: 'tocar', dica: 'Play', atalho: 'tocar-pausa', flags },
    { icone: 'seguinte', dica: 'Next', atalho: 'seguinte', flags },
  ];
}

// As formas, numa grelha de 16. Triângulos e retângulos, todos convexos.
const tri = (...p) => p;
const ret = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const FORMAS = Object.freeze({
  tocar: [tri([5, 3], [13, 8], [5, 13])],
  pausa: [ret(4, 3, 7, 13), ret(9, 3, 12, 13)],
  seguinte: [tri([3, 3], [10.5, 8], [3, 13]), ret(11, 3, 13, 13)],
  anterior: [ret(3, 3, 5, 13), tri([13, 3], [13, 13], [5.5, 8])],
});

/** O ponto está dentro do polígono convexo (vértices por qualquer ordem de volta)? */
function dentro(px, py, poligono) {
  let sinal = 0;
  for (let i = 0; i < poligono.length; i++) {
    const [ax, ay] = poligono[i];
    const [bx, by] = poligono[(i + 1) % poligono.length];
    const c = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    if (c === 0) continue;
    const s = c > 0 ? 1 : -1;
    if (sinal === 0) sinal = s;
    else if (s !== sinal) return false;
  }
  return true;
}

/**
 * O ícone em BGRA pré-multiplicado (o que o `nativeImage.createFromBitmap`
 * espera), `lado` x `lado` píxeis, com 4x4 amostras por píxel para as arestas
 * saírem suaves. `cor` = [r, g, b].
 */
function desenharIcone(nome, lado, cor) {
  const formas = FORMAS[nome];
  if (!formas) throw new Error('Ícone desconhecido: ' + nome);
  const AMOSTRAS = 4;
  const escala = 16 / lado;
  const buf = Buffer.alloc(lado * lado * 4);
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      let cheias = 0;
      for (let sy = 0; sy < AMOSTRAS; sy++) {
        for (let sx = 0; sx < AMOSTRAS; sx++) {
          const px = (x + (sx + 0.5) / AMOSTRAS) * escala;
          const py = (y + (sy + 0.5) / AMOSTRAS) * escala;
          if (formas.some((f) => dentro(px, py, f))) cheias++;
        }
      }
      const a = cheias / (AMOSTRAS * AMOSTRAS);
      const i = (y * lado + x) * 4;
      buf[i] = Math.round(cor[2] * a);
      buf[i + 1] = Math.round(cor[1] * a);
      buf[i + 2] = Math.round(cor[0] * a);
      buf[i + 3] = Math.round(255 * a);
    }
  }
  return buf;
}

/** Ícones claros numa barra escura, escuros numa clara. */
function corDosIcones(barraEscura) {
  return barraEscura ? [255, 255, 255] : [32, 32, 36];
}

module.exports = { ARGUMENTO, TAREFAS, acaoDosArgumentos, estadoValido, botoesDaMiniatura, desenharIcone, corDosIcones, FORMAS };
