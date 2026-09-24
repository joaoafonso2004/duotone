import type { ComponentType } from 'react';

/**
 * A raiz da janela do mini leitor do PC (ver janelaMini.web.tsx). No iPhone
 * não existe: o index.ts pergunta e, sem ela, arranca a app de sempre.
 *
 * TEM de ser `.tsx`, a mesma extensão do `.web.tsx`: o Metro procura extensão a
 * extensão, e um `janelaMini.ts` ganhava ao `janelaMini.web.tsx` também na
 * build do PC. Foi o que fez a 3.8.1 abrir a app inteira dentro do mini.
 */
export function raizDaJanelaMini(): ComponentType | null {
  return null;
}
