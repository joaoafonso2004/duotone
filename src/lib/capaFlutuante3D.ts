/**
 * A pose da capa flutuante do Now Playing do iPhone.
 *
 * ## De onde vêm os números
 *
 * Da screenshot de referência (NOSTYLIST, 13/9), medida em alta resolução
 * (941×1672), e não do olho. O quadrado da capa sai do layout do PlayerRoot
 * (os pontos do cubo estão 11 pt por baixo dele); dentro dele, os cantos da face
 * estão em `CANTOS_DA_REFERENCIA`. A pose que os põe lá EXATAMENTE foi procurada
 * com a mesma matemática de transformações do React Native (a do CSS) e fica em
 * `POSE_DA_REFERENCIA`.
 *
 * ## Um pouco menos do que a referência, de propósito
 *
 * Decisão do João (13/9): a face tem de dominar. A pose usada tem os ângulos a
 * 85% dos da referência e a perspetiva 30% mais longe; a escala e a posição
 * foram reajustadas aos cantos. Resultado: os cantos ficam a ~3% do lado da
 * referência, e a face ocupa 66% da caixa contra 63% lá. O teste
 * (`test-capa-reactiva.cjs`) prende as duas coisas: perto da referência, e nunca
 * mais rodada do que ela.
 *
 * - **Vê-se a aresta ESQUERDA e a de BAIXO**, como na referência. Com
 *   `rotateY` negativo -- a primeira versão -- via-se o lado contrário.
 *
 * ## A espessura
 *
 * O React Native não extruda vistas, e no iPhone uma vista com transformação 3D
 * ACHATA o que tem dentro antes de rodar. Placas deslocadas em 2D dentro da
 * vista que roda davam uma cópia desfasada da capa, e não uma aresta. Aqui são
 * `fatias` do mesmo retângulo arredondado, IRMÃS da face, cada uma com a pose
 * inteira e deslocada em Z pelo truque do cubo das letras.
 *
 * ## O ambiente
 *
 * Uma capa rodada em cima de um fundo parece colada. O que a põe NO espaço é a
 * luz e a sombra no plano do fundo, não presas à capa: a própria capa desfocada
 * como luz ambiente, e uma sombra larga que se dissolve (`luz`, `sombra`).
 */

export type EstiloDaCapaIOS = 'floating' | 'simple';

/** Onde estão os cantos da face na referência, em frações do quadrado da capa. */
export const CANTOS_DA_REFERENCIA = {
  TL: [0.062, -0.029],
  TR: [0.836, 0.182],
  BR: [0.995, 0.933],
  BL: [0.138, 0.801],
} as const;

export type Canto = keyof typeof CANTOS_DA_REFERENCIA;

/** A pose que reproduz a referência ao pormenor (1% do lado). A usada roda menos. */
export const POSE_DA_REFERENCIA = {
  perspectiva: 4.865,
  deslocacaoX: 0.027,
  deslocacaoY: -0.042,
  rotateX: 38.2,
  rotateY: 30,
  rotateZ: -9.1,
  scale: 0.96,
} as const;

export const CAPA_FLUTUANTE = {
  /** Distância para cada lado do centro: seis pontos no percurso inteiro. */
  amplitude: 3,
  /** Uma subida e uma descida completas, sem pausa nas extremidades. */
  cicloMs: 4600,
  /** Em lados da capa. */
  perspectiva: 6.3,
  /** Em lados: a silhueta na referência está um pouco à direita e acima. */
  deslocacaoX: 0.022,
  deslocacaoY: -0.039,
  rotateX: 32.5,
  rotateY: 25.5,
  rotateZ: -6.1,
  scale: 0.93,
  /** Em lados. Fina: o bordo visível fica com ~1,6% do lado. */
  espessura: 0.042,
  /** Fatias da espessura. Com menos, o bordo mostrava degraus num Retina. */
  fatias: 14,
  /** Cantos quase retos: num objeto com espessura, um canto largo lê-se como plástico. */
  raio: 6,
  /** A luz que a capa deixa no fundo: ela própria, desfocada. */
  luz: { opacidade: 0.5, desfoque: 60 },
  /** A sombra no fundo: larga, difusa, e mais clara quando a capa sobe. */
  sombra: { opacidade: 0.7 },
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

/** A área da face projetada, em frações da área da caixa: quanto a face domina. */
export function areaDaFace(p: PoseDaCapa): number {
  const pontos = (['TL', 'TR', 'BR', 'BL'] as const).map((k) => projetarCanto(k, p));
  let dobro = 0;
  pontos.forEach(([x, y], i) => {
    const [x2, y2] = pontos[(i + 1) % pontos.length];
    dobro += x * y2 - x2 * y;
  });
  return Math.abs(dobro) / 2;
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
 * baixo à direita -- o bordo esquerdo apanha mais luz do que o de baixo, como na
 * referência. Cinzentos médios e não pretos: um bordo preto lia-se como um
 * painel colado à interface.
 */
export function tonsDaFatia(indice: number, fatias: number): [string, string, string] {
  const tom = Math.round(14 + (indice / fatias) * 30);
  const rgb = (v: number) => `rgb(${v},${v},${v + 1})`;
  return [rgb(tom + 16), rgb(tom + 3), rgb(Math.max(6, tom - 8))];
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
