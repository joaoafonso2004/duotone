/**
 * O tom da app espera pela Ocultação (25/11, item 17 do plano; o João: "ao mesmo
 * tempo que a capa muda com a eclipse numa direção, a cor da app mudava também,
 * como já existe no PC"). É a ideia do `porTapar` do PC (`desktop/Ocultacao.web.ts`),
 * para o iPhone: a Ocultação conta-se aqui enquanto o disco não tapou a capa, e o
 * tom (`useAcompanharCapa`) só troca quando ela tapa.
 *
 * Sem React Native nem React: puro, para o teste (`test-ocultacao.ts`).
 */
let porTapar = 0;
const aEsperar = new Set<() => void>();

/** Uma Ocultação começou: até ela tapar, o tom espera. */
export function comecouATapar(): void {
  porTapar++;
}

/** Tapou (ou foi cancelada). Num microtask: uma música nova a meio começa outra no mesmo commit. */
export function tapou(): void {
  porTapar = Math.max(0, porTapar - 1);
  queueMicrotask(() => {
    if (porTapar) return;
    const quem = [...aEsperar];
    aEsperar.clear();
    for (const f of quem) f();
  });
}

/** Corre `f` já, ou quando a Ocultação em curso tapar a capa. Devolve como desistir. */
export function depoisDeTapar(f: () => void): () => void {
  if (!porTapar) { f(); return () => {}; }
  aEsperar.add(f);
  return () => { aEsperar.delete(f); };
}

export function reporParaTestes(): void {
  porTapar = 0;
  aEsperar.clear();
}
