/**
 * A capa de metal em 3D do Now Playing do PC (5/11, opção das Definições
 * "3D metal cover", desligada de origem). Escolhida pelo João numa maquete
 * (`docs/capa-3d-pc-maquete.html`): a pose da Floating 3D do iPhone, as
 * arestas em metal escovado SEM reflexos, e duas coisas que só o rato dá:
 *
 *  - **o lado onde está o rato afunda** ("onde eu passo o rato afunda e não
 *    vem para perto"), até 6°;
 *  - **agarrar e arrastar roda a caixa**, sem limite, até à letra no verso.
 *    Largada devagar acaba a meia volta ou volta atrás (as regras do cubo da
 *    app, `lyricsCubeGesture.ts`); lançada, continua a rodar e trava numa face.
 *
 * Só contas, sem imports de runtime: testadas em `scripts/test-capa-metal-3d.ts`.
 * Quem desenha é `desktop/CapaMetal3D.web.tsx`.
 */
import { CAPA_FLUTUANTE } from './capaFlutuante3D';
import type { Mola } from './movimento';

/** A pose de repouso: a mesma do iPhone (vê-se a aresta esquerda e a de baixo). */
export const POSE_DO_METAL = {
  rotateX: CAPA_FLUTUANTE.rotateX,
  rotateY: CAPA_FLUTUANTE.rotateY,
  rotateZ: CAPA_FLUTUANTE.rotateZ,
  escala: CAPA_FLUTUANTE.scale,
  /** Em lados da capa. */
  deslocacaoX: CAPA_FLUTUANTE.deslocacaoX,
  deslocacaoY: CAPA_FLUTUANTE.deslocacaoY,
  espessura: CAPA_FLUTUANTE.espessura,
  perspectiva: CAPA_FLUTUANTE.perspectiva,
} as const;

/** Quanto o rato inclina a caixa, em graus (o João: "podes implementar com 6 graus"). */
export const INCLINACAO_MAXIMA = 6;

/**
 * À volta da capa há uma margem onde o rato ainda conta, em lados da capa.
 * Fora dela a caixa volta à pose.
 */
export const MARGEM_DO_RATO = 0.45;

/**
 * Onde está o rato em relação à capa, de -1 a 1 em cada eixo, ou `null` fora da
 * zona. `centro` é o centro da capa no ecrã, `lado` o lado dela em píxeis.
 */
export function ratoNaCapa(
  x: number, y: number, centro: { x: number; y: number }, lado: number,
): { nx: number; ny: number } | null {
  if (!(lado > 0)) return null;
  const margem = lado * MARGEM_DO_RATO;
  const meio = lado / 2 + margem;
  if (Math.abs(x - centro.x) >= meio || Math.abs(y - centro.y) >= meio) return null;
  // A inclinação toda chega a meio da margem: na aresta da capa já se sente bem.
  const escala = lado / 2 + margem * 0.5;
  const limitar = (v: number) => Math.max(-1, Math.min(1, v));
  return { nx: limitar((x - centro.x) / escala), ny: limitar((y - centro.y) / escala) };
}

/**
 * Os ângulos que a caixa procura com o rato em (nx, ny). O lado do rato AFUNDA:
 * com o rato em cima à direita, a aresta de cima e a da direita vão para trás
 * (`rotateX` e `rotateY` sobem, nas contas do CSS: y para baixo, z para quem vê).
 */
export function inclinacao(
  rato: { nx: number; ny: number } | null, maximo = INCLINACAO_MAXIMA,
): { rotateX: number; rotateY: number } {
  if (!rato) return { rotateX: POSE_DO_METAL.rotateX, rotateY: POSE_DO_METAL.rotateY };
  return {
    rotateX: POSE_DO_METAL.rotateX - rato.ny * maximo,
    rotateY: POSE_DO_METAL.rotateY + rato.nx * maximo,
  };
}

/** Os mesmos limiares do cubo: 20 % do caminho, ou um gesto de 0,35 px/ms. */
export const LIMIAR_DO_CAMINHO = 0.2;
export const LIMIAR_DO_GESTO = 0.35;
/** Parado mais do que isto antes de largar não é lançar. */
export const PAUSA_QUE_NAO_LANCA_MS = 60;
/**
 * Quanto um lançamento continua a rodar sozinho, em segundos de velocidade.
 * Medido na maquete: um gesto rápido curto vira uma face, um forte dá voltas.
 */
export const IMPULSO_S = 0.16;

/** Arrastar uma capa de largura dá meia volta. */
export function anguloDoArrasto(inicio: number, dx: number, lado: number): number {
  return inicio + (dx / Math.max(1, lado)) * 180;
}

/** A velocidade de um arrasto em graus por segundo, a partir de px/ms. */
export function grausPorSegundo(vxPxMs: number, lado: number): number {
  return (vxPxMs * 1000 / Math.max(1, lado)) * 180;
}

/**
 * Onde a caixa pousa ao largar: sempre num múltiplo de 180° (0 é a capa, 180 a
 * letra, e as voltas inteiras somam-se).
 *
 * - Lançada (`|vx| > 0,35 px/ms`): continua no sentido do gesto e trava na face
 *   seguinte ao sítio onde o impulso a levaria.
 * - Largada devagar: a regra dos 20 % a contar da face de onde se partiu, no
 *   sentido em que ia. `sentido` é o do último movimento (±1).
 * - Parada antes de largar (`msParada`): a velocidade não conta.
 */
export function destinoAoLargar(
  { angulo, vxPxMs, msParada, sentido, lado }:
  { angulo: number; vxPxMs: number; msParada: number; sentido: number; lado: number },
): number {
  const vx = msParada > PAUSA_QUE_NAO_LANCA_MS ? 0 : vxPxMs;
  if (Math.abs(vx) > LIMIAR_DO_GESTO) {
    const lanca = angulo + grausPorSegundo(vx, lado) * IMPULSO_S;
    return (vx > 0 ? Math.ceil(lanca / 180) : Math.floor(lanca / 180)) * 180 + 0;
  }
  const baixo = Math.floor(angulo / 180) * 180;
  const fracao = (angulo - baixo) / 180;
  if (fracao === 0) return baixo + 0;
  if ((sentido || 1) > 0) return (fracao > LIMIAR_DO_CAMINHO ? baixo + 180 : baixo) + 0;
  return (1 - fracao > LIMIAR_DO_CAMINHO ? baixo : baixo + 180) + 0;
}

/** Se um ângulo mostra a letra (o verso para quem vê). */
export function mostraALetra(angulo: number): boolean {
  const a = ((angulo % 360) + 360) % 360;
  return a > 90 && a < 270;
}

/** O mesmo lado com o ângulo curto: 0 ou 180. Depois de assentar, as voltas esquecem-se. */
export function anguloCurto(angulo: number): number {
  return mostraALetra(angulo) ? 180 : 0;
}

/**
 * Para onde rodar quando o lado muda por outra porta (os pontos, o teclado):
 * o ângulo do lado pedido mais perto de onde a caixa está, para a frente
 * quando os dois ficam à mesma distância.
 */
export function anguloDoLado(agora: number, letra: boolean): number {
  const base = letra ? 180 : 0;
  const k = Math.round((agora - base) / 360);
  const candidatos = [base + (k - 1) * 360, base + k * 360, base + (k + 1) * 360];
  let melhor = candidatos[0];
  for (const c of candidatos) {
    const d = Math.abs(c - agora), dm = Math.abs(melhor - agora);
    if (d < dm || (d === dm && c > melhor)) melhor = c;
  }
  return melhor + 0;
}

/**
 * Uma mola num passo (Euler semi-implícito), nas unidades de quem a usa (graus).
 * As molas são as da app (`movimento.ts`): ESTADO a seguir o rato, SOLTAR a
 * voltar à pose, ENTRADA ao virar.
 */
export type EstadoDaMola = { x: number; v: number; alvo: number };
export function passoDaMola(m: EstadoDaMola, mola: Mola, dt: number): void {
  const a = (-mola.stiffness * (m.x - m.alvo) - mola.damping * m.v) / mola.mass;
  m.v += a * dt;
  m.x += m.v * dt;
}
export function molaAssente(m: EstadoDaMola): boolean {
  return Math.abs(m.x - m.alvo) < 0.004 && Math.abs(m.v) < 0.004;
}

/**
 * A mola de uma volta lançada, mais mole do que a ENTRADA para as voltas se
 * verem (afinada na maquete; amortecimento a ~0,9 do crítico, sem ressalto).
 */
export const LANCAR: Mola = { stiffness: 80, damping: 16, mass: 1 };
