/**
 * Arrastar a barra de progresso do leitor do iPhone (3/10, variante B de
 * `docs/barra-home-folhas.html`). Sem imports: `scripts/test-arrastar-barra.ts`.
 *
 *  - **Agarrar não mexe na música.** Pousar o dedo saltava logo para esse ponto
 *    (querias agarrar a bolinha e a música saltava). Agora só o MOVIMENTO conta:
 *    a posição é a de quando se agarrou mais o que o dedo andou.
 *  - **Descer o dedo abranda** (como no Apple Music): a 50 pt da barra, meia
 *    velocidade; a 110, um quarto; a 170, ajuste fino (um décimo). Mudar de
 *    ritmo não faz a posição saltar: a conta recomeça de onde está
 *    (`mudarDeRitmo`), e só o movimento seguinte anda ao ritmo novo.
 *  - **Um toque rápido salta para esse ponto** (`eToque`), a deslizar.
 *
 * O desenho corre no motor nativo (`components/ProgressBar.tsx`): estas contas
 * são as mesmas que as interpolações fazem lá, e o JavaScript só as usa para o
 * tempo mostrado, as vibrações e o sítio para onde se salta ao largar.
 */

/** A partir de quantos pontos abaixo da barra cada ritmo começa. */
export const RITMOS = [
  { desde: 0, fator: 1, nome: '' },
  { desde: 50, fator: 0.5, nome: 'Half-speed scrubbing' },
  { desde: 110, fator: 0.25, nome: 'Quarter-speed scrubbing' },
  { desde: 170, fator: 0.1, nome: 'Fine scrubbing' },
] as const;

/** O ritmo para um dedo `desceu` pontos abaixo de onde agarrou (subir não abranda). */
export function ritmoDoArrasto(desceu: number): number {
  let i = 0;
  for (let k = 0; k < RITMOS.length; k++) if (desceu >= RITMOS[k].desde) i = k;
  return i;
}

export type Arrasto = {
  /** A fração quando se agarrou, ou quando o ritmo mudou pela última vez. */
  base: number;
  /** Onde estava o dedo (translação em X) nesse instante. */
  origemX: number;
  /** O ritmo em vigor (índice de `RITMOS`). */
  ritmo: number;
};

export function comecarArrasto(fracao: number): Arrasto {
  return { base: clamp01(fracao), origemX: 0, ritmo: 0 };
}

/** Onde a barra está com o dedo em `tx` (translação desde que se agarrou). */
export function fracaoNoArrasto(a: Arrasto, tx: number, largura: number): number {
  if (!(largura > 0)) return a.base;
  return clamp01(a.base + ((tx - a.origemX) * RITMOS[a.ritmo].fator) / largura);
}

/** Muda de ritmo SEM saltar: a conta recomeça de onde a barra está agora. */
export function mudarDeRitmo(a: Arrasto, tx: number, largura: number, ritmo: number): Arrasto {
  if (ritmo === a.ritmo) return a;
  return { base: fracaoNoArrasto(a, tx, largura), origemX: tx, ritmo };
}

/** Um toque e não um arrasto: quase sem mexer e curto. */
export function eToque(dx: number, dy: number, ms: number): boolean {
  return Math.hypot(dx, dy) < 8 && ms < 300;
}

/** Chegou a uma ponta vindo de dentro: vibra. */
export function bateuNaPonta(antes: number, agora: number): boolean {
  return (agora <= 0 && antes > 0) || (agora >= 1 && antes < 1);
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
