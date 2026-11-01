import { useLayoutEffect } from 'react';
import { useCompasso } from '../hooks/useCompasso.web';
import { duracoesDasBarras, msDoCompasso } from '../lib/compasso';

const BARRAS = ['--dt-barra-1', '--dt-barra-2', '--dt-barra-3'];

/**
 * O andamento da música que toca no CSS do PC (S3, `lib/compasso.ts`): as barrinhas
 * das listas e a troca da cor do Now Playing são CSS, e leem estas variáveis. Sem
 * andamento conhecido as variáveis saem, e fica o ciclo de sempre. Uma peça só, para
 * nenhuma linha de nenhuma tabela ter de ouvir a música que toca.
 */
export function CompassoNoCss() {
  const bpm = useCompasso()?.bpm ?? null;
  useLayoutEffect(() => {
    const raiz = document.documentElement.style;
    const duracoes = duracoesDasBarras(bpm);
    BARRAS.forEach((nome, i) => (duracoes ? raiz.setProperty(nome, `${duracoes[i]}ms`) : raiz.removeProperty(nome)));
    if (bpm) raiz.setProperty('--dt-compasso', `${msDoCompasso(bpm)}ms`);
    else raiz.removeProperty('--dt-compasso');
  }, [bpm]);
  return null;
}
