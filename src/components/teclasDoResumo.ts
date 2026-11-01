/**
 * O teclado da story do mês: só no PC (`teclasDoResumo.web.ts`). No iPhone
 * não há teclado, e isto não faz nada.
 */
export type AcoesDoTeclado = { seguinte: () => void; anterior: () => void; pausa: () => void; fechar: () => void };

export function useTeclasDoResumo(_acoes: AcoesDoTeclado): void {}
