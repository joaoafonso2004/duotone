/**
 * A barra de volume do PC numa curva de OUVIDO (16/10, João: "perto do mínimo
 * fica quase tão alto como no máximo").
 *
 * O leitor do PC é o IFrame do YouTube, e o `setVolume` dele é linear na
 * amplitude -- medido no Electron: o `<video>` fica em `barra × normalização`
 * (0,68 numa música alta). O ouvido não é linear: de 100% a 50% são só -6 dB,
 * e quase toda a mudança que se ouve acontecia nos últimos centímetros da
 * barra. Com a curva quadrática, 50% fica a -12 dB e 20% a -28 dB, e a barra
 * inteira passa a fazer alguma coisa.
 *
 * O MÁXIMO é o mesmo (100% continua a ser 100): nada de ganho artificial. O
 * teto de cada música é a normalização do YouTube, que baixa as mais altas.
 *
 * Puro, sem imports: `scripts/test-curva-do-volume.ts`.
 */

/** A percentagem da barra (0-100) para o `setVolume` do player (0-100, inteiro). */
export function volumeParaOMotor(percentagem: number): number {
  const p = Math.max(0, Math.min(100, Number(percentagem) || 0)) / 100;
  if (p === 0) return 0;
  // O player só aceita inteiros: o mínimo audível fica em 1 (-40 dB), para a
  // barra nunca calar a música sem estar no zero.
  return Math.max(1, Math.round(p * p * 100));
}

/**
 * Quem já tinha um volume guardado na barra linear: a mesma ALTURA na curva
 * nova, para nada mudar de som na primeira vez que se abre esta versão.
 */
export function barraParaACurva(volumeLinear: number): number {
  const v = Math.max(0, Math.min(100, Number(volumeLinear) || 0));
  return Math.round(Math.sqrt(v / 100) * 100);
}
