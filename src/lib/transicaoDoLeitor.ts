/**
 * As contas da transição do leitor do iPhone (2/10) -- ver
 * `state/transicaoDoLeitor.ts` (os valores animados) e a maquete
 * `docs/transicao-do-leitor.html` (variante C + o fecho "zoom" a arrastar).
 *
 * Sem imports, para se testar em Node (`scripts/test-transicao-do-leitor.ts`).
 */

/** Uma mola como as do iOS, a partir da resposta (s) e do amortecimento (1 = sem ressalto). */
export function molaIOS(resposta: number, amortecimento: number) {
  const w = (2 * Math.PI) / resposta;
  return { stiffness: w * w, damping: 2 * amortecimento * w, mass: 1 };
}

/** Para os lados, com resistência: um terço do dedo no início, e nunca mais de ~120 pt. */
export function deLado(x: number): number {
  return Math.sign(x) * (1 - 1 / (Math.abs(x) / 360 + 1)) * 120;
}
/** O inverso de `deLado`, para retomar um cartão apanhado a meio da volta. */
export function deLadoInverso(t: number): number {
  const u = Math.min(Math.abs(t), 119);
  return Math.sign(t) * ((360 * u) / (120 - u));
}

/** O que falta arrastar (em fração da altura do ecrã) para o cartão chegar ao mais pequeno. */
export const ARRASTO_TOTAL = 0.586;
/** Quanto o cartão encolhe no máximo (0,46 = fica a 54%). */
export const ENCOLHER = 0.46;
/** Larga-se para fechar a partir daqui (fração do arrasto) ou desta velocidade (pt/s). */
export const LARGAR_PARA_FECHAR = { arrasto: 0.16, velocidade: 450 };

export type Cartao = { tx: number; ty: number; esc: number; g: number };

/** O cartão a partir do dedo (dx, dy em pontos desde o início) e da altura do ecrã. */
export function cartaoDoArrasto(dx: number, dy: number, H: number): Cartao {
  const g = Math.min(1, Math.max(0, dy / (H * ARRASTO_TOTAL)));
  return {
    g,
    esc: 1 - ENCOLHER * (1 - Math.pow(1 - g, 1.6)),
    tx: deLado(dx),
    // Para cima não fecha: estica, com resistência.
    ty: dy >= 0 ? dy * 0.62 : -(1 - 1 / ((-dy * 0.55) / H + 1)) * H * 0.6,
  };
}

/** A geometria que o gesto precisa, em pontos do ecrã. */
export type Geometria = {
  /** O pivô do cartão (50%, 40% do ecrã). */
  pivo: { x: number; y: number };
  /** O centro e o lado da capa grande, e os da capa do mini-player. */
  capa: { x: number; y: number; lado: number };
  mini: { x: number; y: number; lado: number };
};

/** Um ponto do leitor aberto, visto através do cartão. */
export function atravesDoCartao(geo: Geometria, c: { tx: number; ty: number; esc: number }, x: number, y: number) {
  return { x: geo.pivo.x + (x - geo.pivo.x) * c.esc + c.tx, y: geo.pivo.y + (y - geo.pivo.y) * c.esc + c.ty };
}

/** O cartão no fim da aterragem: a capa dele exatamente em cima da do mini-player. */
export function destinoNoMini(geo: Geometria) {
  const esc = geo.mini.lado / geo.capa.lado;
  return {
    esc,
    tx: geo.mini.x - geo.pivo.x - (geo.capa.x - geo.pivo.x) * esc,
    ty: geo.mini.y - geo.pivo.y - (geo.capa.y - geo.pivo.y) * esc,
  };
}

/**
 * A velocidade inicial da aterragem, em "caminhos por segundo": a do dedo
 * projetada na direção do mini-player e dividida pela distância. Cada valor
 * anima com (destino - origem) × isto, e assim andam todos juntos.
 */
export function velocidadeDeAterragem(geo: Geometria, c: Cartao, vx: number, vy: number): number {
  const de = atravesDoCartao(geo, c, geo.capa.x, geo.capa.y);
  const ax = geo.mini.x - de.x, ay = geo.mini.y - de.y;
  const dist = Math.max(Math.hypot(ax, ay), 1);
  return Math.min(7, Math.max(0, (vx * ax + vy * ay) / dist / dist));
}

/**
 * A velocidade inicial da volta ao sítio, em "caminhos por segundo" (u vai de
 * 1 a 0): continuar o dedo para baixo é u a crescer primeiro.
 */
export function velocidadeDeVolta(c: Cartao, vy: number): number {
  const base = Math.max(Math.abs(c.ty / 0.62), Math.abs(c.tx), 30);
  return Math.max(-8, Math.min(8, vy / base));
}

export function deveFechar(c: Cartao, vy: number): boolean {
  return c.g > LARGAR_PARA_FECHAR.arrasto || vy > LARGAR_PARA_FECHAR.velocidade;
}

/**
 * As contas do `cartaoDoArrasto` em amostras, para o motor nativo as
 * interpolar por troços (3/10: o dedo passou para a thread da interface e lá
 * não corre JavaScript). `test-transicao-do-leitor.ts` mede o erro contra as
 * contas exatas.
 *
 * - `x`: dedo (pt) -> deslocação para o lado (pt);
 * - `yFracao`: dedo/altura -> deslocação vertical/altura;
 * - `g`: dedo/altura -> quanto se arrastou (0..1);
 * - `esc`: quanto se arrastou -> escala do cartão.
 */
export function amostrasDoDedo() {
  const xs = [0, 20, 45, 80, 130, 200, 300, 450, 700, 1100, 1800];
  const negativos = xs.slice(1).reverse();
  const acima = [1.5, 1, 0.6, 0.35, 0.2, 0.1, 0.04];
  const gs = [0, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9, 1];
  return {
    x: {
      inputRange: [...negativos.map((x) => -x), ...xs],
      outputRange: [...negativos.map((x) => -deLado(x)), ...xs.map(deLado)],
    },
    yFracao: {
      inputRange: [...acima.map((u) => -u), 0, 2],
      outputRange: [...acima.map((u) => -(1 - 1 / (u * 0.55 + 1)) * 0.6), 0, 1.24],
    },
    g: { inputRange: [0, ARRASTO_TOTAL], outputRange: [0, 1] },
    esc: { inputRange: gs, outputRange: gs.map((g) => 1 - ENCOLHER * (1 - Math.pow(1 - g, 1.6))) },
  };
}
