/**
 * A capa flutuante do Now Playing do iPhone: a pose, a caixa e o ambiente.
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
 * foram reajustadas aos cantos. O teste (`test-capa-reactiva.cjs`) prende as
 * duas coisas: perto da referência, e nunca mais rodada do que ela.
 *
 * ## Uma caixa, e não uma imagem rodada
 *
 * Seis faces: a face (a capa), o verso (as letras) e quatro laterais INTEIRAS
 * que levam a própria capa -- a borda da imagem continua pela aresta, como uma
 * impressão que dá a volta, e um véu escurece-a para trás. Inteiras porque só
 * assim fecham nos cantos: com cantos arredondados e laterais mais curtas, os
 * cantos ficavam escuros (13/9). Numa caixa convexa com as faces de trás
 * escondidas, cada face aparece quando está virada para quem vê, também a meio
 * da volta para as letras.
 *
 * O React Native não extruda vistas, e no iPhone uma vista com transformação 3D
 * ACHATA o que tem dentro antes de rodar. Por isso cada face é IRMÃ das outras
 * e leva a pose inteira; nunca dentro de uma vista que roda.
 *
 * ## O ambiente
 *
 * A cor do fundo é a da capa, porque o fundo do leitor já é a capa desfocada;
 * com a capa 3D, o véu dá lugar a uma vinheta centrada nela. As sombras vivem no
 * plano do fundo, não presas à capa: uma larga e ténue, e uma de contacto logo
 * abaixo da aresta. O grão de pedra é o material, igual para todas as capas.
 * Os PNGs saem de `scripts/gerar-materiais-da-capa.py`.
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
  /**
   * Em lados. Escolhida pelo bordo VISÍVEL da foto: 3,5% do lado na aresta de
   * baixo e 3,1% na esquerda. Rodar menos do que a referência estreita o bordo,
   * e isso compensa-se aqui.
   */
  espessura: 0.078,
  /** Cantos quase vivos: é o que deixa as laterais inteiras fechar a caixa. */
  raio: 2,
  /** O grão de pedra: 60 pt por mosaico, por cima de todas as faces. */
  grao: { opacidade: 0.42, ladoPt: 60 },
  /** Em lados da caixa da capa. Larga e ténue: a profundidade. */
  sombraAmbiente: { opacidade: 0.45, x: -0.1, y: 0.72, largura: 1.3, altura: 0.5 },
  /**
   * Em lados. Pequena e escura logo abaixo da aresta de baixo, que desce ~7°
   * para a direita. A caixa inclui a margem do desfoque que vem no PNG.
   */
  sombraDeContacto: { opacidade: 0.75, x: 0.09, y: 0.845, largura: 0.92, altura: 0.195, rotacao: 7.3 },
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

export type Lateral = 'esquerda' | 'direita' | 'cima' | 'baixo';

/**
 * As quatro laterais e o véu de cada uma, da face (`frente`) para trás (`tras`).
 * A esquerda apanha mais luz do que a de baixo, como na referência.
 */
export const LATERAIS: readonly { lado: Lateral; frente: number; tras: number }[] = [
  { lado: 'esquerda', frente: 0.12, tras: 0.45 },
  { lado: 'direita', frente: 0.35, tras: 0.65 },
  { lado: 'cima', frente: 0.2, tras: 0.5 },
  { lado: 'baixo', frente: 0.3, tras: 0.6 },
];

type Ponto = { x: number; y: number };

/**
 * Onde fica uma lateral e que faixa da capa leva, em pontos, para uma capa de
 * lado `lado` e espessura `espessura`.
 *
 * - Comprimento INTEIRO (o lado da capa): é o que fecha a caixa nos cantos.
 * - `imagem` é onde pôr a capa (lado × lado) dentro da faixa para ela mostrar a
 *   borda certa; `espelho` diz em que eixo a faixa vira, para a borda da imagem
 *   ficar junto à face e continuar pela aresta.
 * - `degrade` escurece da face (clara) para trás (escura).
 */
export function geometriaDaLateral(qual: Lateral, lado: number, espessura: number) {
  const vertical = qual === 'esquerda' || qual === 'direita';
  const largura = vertical ? espessura : lado;
  const altura = vertical ? lado : espessura;
  const veu = LATERAIS.find((l) => l.lado === qual) ?? LATERAIS[0];
  const degrade: { start: Ponto; end: Ponto } = {
    esquerda: { start: { x: 1, y: 0.5 }, end: { x: 0, y: 0.5 } },
    direita: { start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } },
    cima: { start: { x: 0.5, y: 1 }, end: { x: 0.5, y: 0 } },
    baixo: { start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } },
  }[qual];
  return {
    largura,
    altura,
    left: (lado - largura) / 2,
    top: (lado - altura) / 2,
    imagem: { x: qual === 'direita' ? -(lado - espessura) : 0, y: qual === 'baixo' ? -(lado - espessura) : 0 },
    espelho: (vertical ? 'x' : 'y') as 'x' | 'y',
    degrade,
    veu: { frente: veu.frente, tras: veu.tras },
  };
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
