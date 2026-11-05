/**
 * A barra de volume do PC numa curva de OUVIDO (16/10, João: "perto do mínimo
 * fica quase tão alto como no máximo"; 4/11: "nos mínimos chega a um ponto que
 * não baixa mais o volume, fica igual, e depois fica muito alto a meio, não é
 * constante"; 5/11: "o som tá no mínimo mas sinto que continua alto, mais do
 * que devia").
 *
 * O leitor do PC é o IFrame do YouTube, e o `setVolume` dele é linear na
 * amplitude e só aceita INTEIROS de 0 a 100 -- medido no Electron: o `<video>`
 * fica em `barra × normalização` (0,68 numa música alta).
 *
 * O ouvido conta em dB e não em amplitude, por isso é em dB que a barra anda:
 * cada ponto dela vale a mesma mudança de som que qualquer outro.
 *
 * **O FUNDO (5/11).** De 4/11 a 5/11 a barra ia de 0 a -30 dB, porque abaixo
 * disso os inteiros já não chegam (de 1 para 2 vão 6 dB) e a barra ficava
 * parada. Mas -30 dB, com o Windows alto, ainda se ouve bem -- era o "no mínimo
 * continua alto". Agora a barra vai até **-50 dB** e os inteiros deixam de ser
 * o limite: o player recebe o inteiro mais pequeno que NÃO fica abaixo do que a
 * barra pede (`volumeParaOMotor`), e o que falta é o **ganho fino**
 * (`ganhoFinoDaBarra`, entre 0 e 1), que o grafo do equalizador aplica no
 * próprio frame do YouTube (o nó `margem` em `electron/main.cjs`, por
 * `aplicarEqualizador`). O grafo instala-se em todas as músicas
 * (`aplicarEqNoMotor` no `playTrack`), com ou sem EQ. O ganho fino também
 * corrige o arredondamento do inteiro, e por isso a barra é contínua até ao
 * fundo, sem zona parada.
 *
 * **Sem grafo** (a ponte falhou, ou a faixa que entra num crossfade ainda não o
 * tem): fica só o inteiro, que nunca é mais baixo do que a barra pede. O fundo
 * dela fica então a -40 dB (o inteiro 1), parado lá em baixo -- e nunca mais
 * alto do que pedia a curva de 4/11.
 *
 * O MÁXIMO é o mesmo (100% continua a ser 100): nada de ganho artificial. O
 * teto de cada música é a normalização do YouTube, que baixa as mais altas.
 *
 * Puro, sem imports: `scripts/test-curva-do-volume.ts`.
 */

/**
 * O fundo da barra, logo acima do zero. -50 dB é onde se deixa de ouvir com o
 * Windows a meio, e a barra continua a valer 0,5 dB por cada 1%.
 */
export const PISO_DB = -50;

/** O fundo da curva de 4/11 a 5/11, para migrar o volume guardado. */
export const PISO_DB_DE_4_11 = -30;

/** A amplitude que a barra pede (0-1), antes de qualquer arredondamento. */
function amplitudeDaBarra(p: number): number {
  return 10 ** ((PISO_DB * (1 - p)) / 20);
}

function fracao(percentagem: number): number {
  return Math.max(0, Math.min(100, Number(percentagem) || 0)) / 100;
}

/**
 * A percentagem da barra (0-100) para o `setVolume` do player (0-100, inteiro):
 * o mais pequeno que não fica abaixo do que a barra pede. O resto desce no
 * ganho fino.
 */
export function volumeParaOMotor(percentagem: number): number {
  const p = fracao(percentagem);
  if (p === 0) return 0;
  // A folga tira o 1e-14 das contas, que fazia o 100 virar 101.
  return Math.min(100, Math.max(1, Math.ceil(100 * amplitudeDaBarra(p) - 1e-9)));
}

/**
 * O que falta ao inteiro do player para chegar à barra: o ganho do nó `margem`
 * do grafo (0 < g ≤ 1). Com a barra a zero, 1 (o player já está calado).
 */
export function ganhoFinoDaBarra(percentagem: number): number {
  const p = fracao(percentagem);
  if (p === 0) return 1;
  return Math.min(1, (100 * amplitudeDaBarra(p)) / volumeParaOMotor(percentagem));
}

/** Os dB abaixo do máximo a que a barra manda tocar, com o grafo. */
export function dbDaBarra(percentagem: number): number {
  const motor = volumeParaOMotor(percentagem);
  return motor === 0 ? -Infinity : 20 * Math.log10((motor / 100) * ganhoFinoDaBarra(percentagem));
}

/** Os mesmos dB sem o grafo: só o inteiro do player. */
export function dbSoComOInteiro(percentagem: number): number {
  const motor = volumeParaOMotor(percentagem);
  return motor === 0 ? -Infinity : 20 * Math.log10(motor / 100);
}

/** Onde pôr a barra para soar a estes dB. O inverso da curva. */
function barraParaOsDb(db: number): number {
  const p = 1 + db / Math.abs(PISO_DB);
  return Math.round(Math.max(1, Math.min(100, p * 100)));
}

/**
 * Quem tinha um volume guardado na barra LINEAR (antes de 16/10): a mesma
 * altura na curva de agora.
 */
export function barraParaACurva(volumeLinear: number): number {
  const v = Math.max(0, Math.min(100, Number(volumeLinear) || 0));
  if (v === 0) return 0;
  return barraParaOsDb(20 * Math.log10(v / 100));
}

/**
 * Quem tinha um volume guardado na barra QUADRÁTICA (de 16/10 a 4/11): a mesma
 * altura na curva de agora, para nada mudar de som ao abrir esta versão.
 */
export function curvaQuadraticaParaDb(barraQuadratica: number): number {
  const b = Math.max(0, Math.min(100, Number(barraQuadratica) || 0));
  if (b === 0) return 0;
  // A antiga mandava `b²/100` ao motor, ou seja 40·log10(b) - 80 dB.
  return barraParaOsDb(40 * Math.log10(b) - 80);
}

/**
 * Quem tinha um volume guardado na barra em dB com o fundo a -30 (4/11 a 5/11):
 * a mesma altura na barra que vai até -50. Ficam todos mais acima na barra, e
 * soam igual; a barra ganha espaço por baixo.
 */
export function curvaDe30DbParaANova(barra: number): number {
  const b = Math.max(0, Math.min(100, Number(barra) || 0));
  if (b === 0) return 0;
  return barraParaOsDb(PISO_DB_DE_4_11 * (1 - b / 100));
}
