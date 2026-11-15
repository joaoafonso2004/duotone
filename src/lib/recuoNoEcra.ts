/**
 * O "Recuo subtil" visto do ecrã, para o Core Animation o correr (15/11).
 *
 * ## Porque saiu do motor de animações do React Native
 *
 * O `useNativeDriver: true` NÃO é "fora da thread principal": no iPhone, o
 * React Native avança essas animações num `CADisplayLink` da thread principal
 * (o `RCTNativeAnimatedNodesManager`), fotograma a fotograma. Tudo o que ocupa
 * essa thread no instante do skip -- o React a aplicar a faixa nova, o AVPlayer
 * a trocar de item, o Now Playing a ser reescrito -- congela a caixa. Foi o
 * "trava sempre" do João (15/11), que sobreviveu às correções de 2/10 (a curva
 * numa só animação) e à passagem do download para o Swift: essas tiraram
 * trabalho ao JavaScript, e o travão não era do JavaScript.
 *
 * O Core Animation corre no servidor de desenho do iOS, fora da app: uma vez
 * entregue, a animação anda mesmo com a thread principal parada. É assim que
 * as animações do próprio iOS ficam lisas com uma app ocupada.
 *
 * ## O mesmo movimento
 *
 * Na pose 3D, o recuo é a caixa a afastar-se ao longo do PRÓPRIO eixo
 * (`RECUO.profundidade`) e a desviar-se no sentido do skip (`RECUO.desvio`),
 * com a curva aprovada a 14/9 (`curvaDoSkip`). Visto de frente, isso é a caixa
 * a encolher um pouco e a deslizar. Aqui calcula-se, para cada amostra da
 * curva, a escala e a deslocação que levam os oito cantos da caixa em repouso
 * aos oito cantos da caixa recuada (a mesma projeção do `capaFlutuante3D`), e
 * é isso que a vista nativa anima à volta do cubo. O teste
 * (`scripts/test-recuo-no-ecra.ts`) prende a diferença para o 3D verdadeiro.
 *
 * Puro: sem React Native, para correr em Node.
 */
import { CAPA_FLUTUANTE, projetar, type PoseDaCapa } from './capaFlutuante3D';
import { curvaDoSkip, RECUO, type Sentido } from './transicaoDaCapa';

/** O que a vista nativa recebe (modules/duotone-capa). Escala sem unidades; x e y em pontos. */
export type SaltoDaCapa = {
  /** Um número novo por skip: é a mudança dele que dispara a animação. */
  id: number;
  /** Quando foi (Date.now()). Uma vista que só monta depois disto já não anima. */
  em: number;
  duracaoMs: number;
  /** De 0 a 1, como os `keyTimes` do Core Animation. */
  tempos: number[];
  escala: number[];
  x: number[];
  y: number[];
  /**
   * Quanto do recuo anterior ainda conta (skips seguidos): 1 no início, 0 no fim
   * da ida. A vista soma-o ao que a caixa mostrava, para partir de onde estava.
   */
  largar: number[];
};

const POSE: PoseDaCapa = {
  perspectiva: CAPA_FLUTUANTE.perspectiva,
  deslocacaoX: CAPA_FLUTUANTE.deslocacaoX,
  deslocacaoY: CAPA_FLUTUANTE.deslocacaoY,
  rotateX: CAPA_FLUTUANTE.rotateX,
  rotateY: CAPA_FLUTUANTE.rotateY,
  rotateZ: CAPA_FLUTUANTE.rotateZ,
  scale: CAPA_FLUTUANTE.scale,
};

const QUADRADO: readonly [number, number][] = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];

/**
 * Os oito cantos da caixa (face e verso) no ecrã, em lados e com a origem no
 * centro do quadrado da capa, com o recuo `k` (0 = no sítio, 1 = no fundo).
 * A ordem das transformações é a do `criarPostura`: o desvio soma-se à
 * deslocação, e a profundidade vai ao longo do eixo da caixa.
 */
export function cantosDaCaixa(k: number, sentido: Sentido): [number, number][] {
  const pose = { ...POSE, deslocacaoX: POSE.deslocacaoX + RECUO.desvio * sentido * k };
  const fundo = -RECUO.profundidade * k;
  const pontos: [number, number][] = [];
  for (const z of [0, -CAPA_FLUTUANTE.espessura]) {
    for (const [x, y] of QUADRADO) pontos.push(projetar(x, y, fundo + z, pose));
  }
  return pontos;
}

/**
 * A escala e a deslocação (em lados) que levam a caixa em repouso à caixa com o
 * recuo `k`: os mínimos quadrados de uma semelhança sem rotação. A origem é o
 * centro do quadrado, que é o ponto de âncora da vista nativa.
 */
export function recuoComoSemelhanca(k: number, sentido: Sentido): { escala: number; x: number; y: number } {
  const a = cantosDaCaixa(0, sentido);
  const b = cantosDaCaixa(k, sentido);
  const media = (p: [number, number][]) => p.reduce((m, [x, y]) => [m[0] + x / p.length, m[1] + y / p.length], [0, 0]);
  const [ax, ay] = media(a), [bx, by] = media(b);
  let num = 0, den = 0;
  a.forEach(([x, y], i) => {
    const [u, v] = b[i]!;
    num += (x - ax) * (u - bx) + (y - ay) * (v - by);
    den += (x - ax) ** 2 + (y - ay) ** 2;
  });
  const escala = den > 0 ? num / den : 1;
  return { escala, x: bx - escala * ax, y: by - escala * ay };
}

/** A curva, as escalas e as deslocações (em lados) de cada sentido: calculadas uma vez. */
const porSentido = new Map<Sentido, { duracaoMs: number; tempos: number[]; escala: number[]; x: number[]; y: number[]; largar: number[] }>();

function quadros(sentido: Sentido) {
  const feito = porSentido.get(sentido);
  if (feito) return feito;
  const c = curvaDoSkip();
  const escala: number[] = [], x: number[] = [], y: number[] = [];
  for (const k of c.curva) {
    const r = recuoComoSemelhanca(k, sentido);
    escala.push(r.escala);
    x.push(r.x);
    y.push(r.y);
  }
  const novo = { duracaoMs: c.duracaoMs, tempos: c.inputRange, escala, x, y, largar: c.largar };
  porSentido.set(sentido, novo);
  return novo;
}

/** O pedido de um skip para a vista nativa, com as deslocações já em pontos. */
export function saltoDaCapa(o: { id: number; em: number; lado: number; sentido: Sentido }): SaltoDaCapa {
  const q = quadros(o.sentido);
  return {
    id: o.id,
    em: o.em,
    duracaoMs: q.duracaoMs,
    tempos: q.tempos.slice(),
    escala: q.escala.slice(),
    x: q.x.map((v) => v * o.lado),
    y: q.y.map((v) => v * o.lado),
    largar: q.largar.slice(),
  };
}
