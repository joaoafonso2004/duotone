/**
 * A pose da capa flutuante do Now Playing do iPhone.
 *
 * ## De onde vêm os números
 *
 * Da screenshot de referência (NOSTYLIST, 13/9), e não do olho. Nela, dentro do
 * quadrado da capa, os cantos da face estão em `CANTOS_DA_REFERENCIA`. A pose
 * abaixo foi PROCURADA para os pôr ali, com a mesma matemática de transformações
 * do React Native (a mesma do CSS), e confirmada num browser a medir os cantos
 * projetados: 0,4% do lado de erro médio. O `test-capa-reactiva.cjs` volta a
 * projetá-los, e falha se alguém mexer num ângulo e a capa deixar de ser aquela.
 *
 * - **Quase sem perspetiva** (`perspectiva` em lados da capa). A referência é
 *   praticamente um paralelogramo: a inclinação vem das rotações, não da fuga.
 *   Com perspetiva a sério (8 lados) os cantos afastavam-se três vezes mais.
 * - **Vê-se a aresta ESQUERDA e a de BAIXO**, como na referência. Com
 *   `rotateY` negativo -- o que estava antes -- via-se o lado contrário.
 *
 * ## A espessura
 *
 * O React Native não extruda vistas, e no iPhone uma vista com transformação 3D
 * ACHATA o que tem dentro antes de rodar. Placas deslocadas em 2D dentro da
 * vista que roda (a versão anterior) davam uma cópia desfasada da capa, e não
 * uma aresta. Aqui são `fatias` do mesmo retângulo arredondado, IRMÃS da face,
 * cada uma com a pose inteira e deslocada em Z pelo truque do cubo das letras:
 * juntas formam o bordo com a perspetiva certa, cantos incluídos.
 *
 * Números fora do componente para se poderem afinar sem espalhar ângulos pelo
 * JSX -- e verificar que a flutuação continua subtil.
 */

export type EstiloDaCapaIOS = 'floating' | 'simple';

/** Onde estão os cantos da face na referência, em frações do quadrado da capa. */
export const CANTOS_DA_REFERENCIA = {
  TL: [0.08, 0.08],
  TR: [0.87, 0.24],
  BR: [0.95, 0.98],
  BL: [0.16, 0.84],
} as const;

export type Canto = keyof typeof CANTOS_DA_REFERENCIA;

export const CAPA_FLUTUANTE = {
  /** Distância para cada lado do centro: seis pontos no percurso inteiro. */
  amplitude: 3,
  /** Uma subida e uma descida completas, sem pausa nas extremidades. */
  cicloMs: 4600,
  /** Em lados da capa. Quase ortográfica, como a referência. */
  perspectiva: 40,
  /** O centro da silhueta na referência está um pouco à direita e abaixo. Em lados. */
  deslocacaoX: 0.017,
  deslocacaoY: 0.033,
  rotateX: 34.7,
  rotateY: 26.7,
  rotateZ: -5.85,
  scale: 0.888,
  /** Em lados: o bordo visível fica com ~2,5% do lado, o da referência. */
  espessura: 0.06,
  /** Fatias da espessura. Com menos, o bordo mostrava degraus num Retina. */
  fatias: 14,
  /** Cantos quase retos: num objeto com espessura, um canto largo lê-se como plástico. */
  raio: 6,
} as const;

export type PoseDaCapa = {
  perspectiva: number;
  deslocacaoX: number;
  deslocacaoY: number;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  scale: number;
};

const rad = (graus: number) => (graus * Math.PI) / 180;

/**
 * Onde um ponto da capa aparece no ecrã, em lados da capa e com a origem no
 * centro. Pela ordem da lista de transformações do componente: perspetiva,
 * deslocação, rotateX, rotateY, rotateZ, escala e, por fim, a profundidade `z`
 * (que a escala não afeta, como no React Native e no CSS).
 */
export function projetar(x: number, y: number, z: number, p: PoseDaCapa): [number, number] {
  let px = x * p.scale;
  let py = y * p.scale;
  let pz = z;
  const cz = Math.cos(rad(p.rotateZ)), sz = Math.sin(rad(p.rotateZ));
  [px, py] = [px * cz - py * sz, px * sz + py * cz];
  const cy = Math.cos(rad(p.rotateY)), sy = Math.sin(rad(p.rotateY));
  [px, pz] = [px * cy + pz * sy, -px * sy + pz * cy];
  const cx = Math.cos(rad(p.rotateX)), sx = Math.sin(rad(p.rotateX));
  [py, pz] = [py * cx - pz * sx, py * sx + pz * cx];
  px += p.deslocacaoX;
  py += p.deslocacaoY;
  const w = 1 - pz / p.perspectiva;
  return [px / w, py / w];
}

const POSICAO_DO_CANTO: Record<Canto, [number, number]> = {
  TL: [-0.5, -0.5], TR: [0.5, -0.5], BR: [0.5, 0.5], BL: [-0.5, 0.5],
};

/** Onde fica um canto da face, em frações do quadrado (o formato da referência). */
export function projetarCanto(canto: Canto, p: PoseDaCapa): [number, number] {
  const [x, y] = POSICAO_DO_CANTO[canto];
  const [px, py] = projetar(x, y, 0, p);
  return [px + 0.5, py + 0.5];
}

/** Para onde vai a face de trás: diz que arestas se veem. Em lados. */
export function desvioDaFaceDeTras(p: PoseDaCapa & { espessura: number }): { x: number; y: number } {
  let x = 0, y = 0;
  for (const [cx, cy] of Object.values(POSICAO_DO_CANTO)) {
    const frente = projetar(cx, cy, 0, p);
    const tras = projetar(cx, cy, -p.espessura, p);
    x += tras[0] - frente[0];
    y += tras[1] - frente[1];
  }
  return { x: x / 4, y: y / 4 };
}

/** A profundidade de uma fatia, em pontos: 0 é a do fundo, e nenhuma fica na face. */
export function profundidadeDaFatia(indice: number, fatias: number, espessura: number): number {
  return -espessura * (1 - indice / fatias);
}

/**
 * As cores de uma fatia, em diagonal: claras em cima à esquerda, escuras em
 * baixo à direita. É isso que faz o bordo esquerdo apanhar mais luz do que o de
 * baixo, como na referência. As do fundo são mais escuras.
 */
export function tonsDaFatia(indice: number, fatias: number): [string, string, string] {
  const tom = Math.round(10 + (indice / fatias) * 26);
  const rgb = (v: number) => `rgb(${v},${v},${v + 1})`;
  return [rgb(tom + 14), rgb(tom), rgb(Math.max(4, tom - 8))];
}

/**
 * Migração do antigo efeito do iPhone.
 *
 * Quem tinha o glitch desligado ou estático fica com a capa simples; quem o
 * tinha reativo recebe o novo efeito. Numa instalação nova mostramos a nova
 * capa, que é a escolha desta versão.
 */
export function interpretarEstiloDaCapa(
  atual: string | null,
  glitchAntigo: string | null,
): EstiloDaCapaIOS {
  if (atual === 'simple' || atual === 'floating') return atual;
  return glitchAntigo === 'static' || glitchAntigo === 'off' ? 'simple' : 'floating';
}
