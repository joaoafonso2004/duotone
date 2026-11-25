/**
 * Os números que rolam (25/11, item 5 do plano, `docs/premium-ios-maquete.html#numeros`):
 * as contas, sem React Native. A peça é o `components/TextoQueRola.tsx`.
 */

/** A curva e os tempos da maquete. */
export const ROLAR = { duracaoMs: 1150, atrasoPorAlgarismoMs: 70 } as const;

/** Os bocados de um texto: os algarismos rolam, o resto fica parado. */
export function bocadosDoTexto(texto: string): { algarismo: number | null; ch: string }[] {
  return [...texto].map((ch) => ({ algarismo: /\d/.test(ch) ? Number(ch) : null, ch }));
}

/** Quanto dura a passagem toda: o último algarismo (o da esquerda) parte mais tarde. */
export function duracaoDoRolar(texto: string): number {
  const algarismos = bocadosDoTexto(texto).filter((b) => b.algarismo !== null).length;
  return algarismos ? ROLAR.duracaoMs + (algarismos - 1) * ROLAR.atrasoPorAlgarismoMs : 0;
}
