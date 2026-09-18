/**
 * Segundos desde o último toque no rato ou no teclado do COMPUTADOR.
 *
 * No iPhone não há tal coisa (nem faz falta: ver `lib/presencaAtiva.ts`), por
 * isso aqui não se sabe. A versão do PC está no `.web.ts`.
 */
export async function segundosSemInteracao(): Promise<number | null> {
  return null;
}
