import type { ComponentType } from 'react';

/** PC: a língua já se leu do `localStorage` (`idioma.ts`); a raiz arranca logo. */
export function comIdioma<P extends object>(Raiz: ComponentType<P>): ComponentType<P> {
  return Raiz;
}
