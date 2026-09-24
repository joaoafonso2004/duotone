import type { ComponentType } from 'react';

/**
 * A raiz da janela do mini leitor do PC (ver janelaMini.web.tsx). No iPhone
 * não existe: o index.ts pergunta e, sem ela, arranca a app de sempre.
 */
export function raizDaJanelaMini(): ComponentType | null {
  return null;
}
