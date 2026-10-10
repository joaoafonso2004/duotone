/**
 * A roda do rato no volume e na barra de progresso do PC (10/10).
 *
 * Um "dente" da roda vale `PX_POR_DENTE` píxeis de `deltaY` no Chromium do
 * Windows. Um touchpad manda dezenas de eventos pequenos por gesto: por isso
 * soma-se o que chega e só se conta um passo por cada dente inteiro (o resto
 * fica para o evento seguinte). Para cima é mais.
 *
 * Puro, sem imports: `scripts/test-roda-do-rato.ts`.
 */
export const PX_POR_DENTE = 100;
/** Quanto sobe o volume por dente (de 0 a 100). */
export const VOLUME_POR_DENTE = 5;
/** Quanto anda a música por dente. */
export const SEGUNDOS_POR_DENTE = 5;
/** A barra só procura depois de a roda parar este tempo: um seek por gesto. */
export const PROCURAR_DEPOIS_MS = 350;

/** `deltaMode`: 0 píxeis, 1 linhas, 2 páginas. */
function emPixeis(deltaY: number, deltaMode: number): number {
  if (deltaMode === 1) return deltaY * 33;
  if (deltaMode === 2) return deltaY * PX_POR_DENTE * 3;
  return deltaY;
}

/** Devolve uma função que converte cada evento em dentes inteiros (+ para cima). */
export function criarRoda(): (deltaY: number, deltaMode?: number) => number {
  let resto = 0;
  return (deltaY, deltaMode = 0) => {
    if (!Number.isFinite(deltaY) || deltaY === 0) return 0;
    const novo = -emPixeis(deltaY, deltaMode);
    // Mudar de sentido esquece o que sobrava do outro.
    if (resto !== 0 && Math.sign(novo) !== Math.sign(resto)) resto = 0;
    const px = resto + novo;
    const dentes = Math.trunc(px / PX_POR_DENTE) || 0; // sem -0
    resto = px - dentes * PX_POR_DENTE;
    return dentes;
  };
}

/** O volume depois de `dentes`, preso entre 0 e 100. */
export function volumeComARoda(volume: number, dentes: number): number {
  return Math.min(100, Math.max(0, Math.round(volume + dentes * VOLUME_POR_DENTE)));
}

/** A proporção da música depois de `dentes`, presa entre 0 e 1. */
export function proporcaoComARoda(proporcao: number, dentes: number, duracaoMs: number): number {
  if (!(duracaoMs > 0)) return proporcao;
  return Math.min(1, Math.max(0, proporcao + (dentes * SEGUNDOS_POR_DENTE * 1000) / duracaoMs));
}
