import { useLayoutEffect, useRef } from 'react';
import { curvaDoPc } from '../lib/molasEmCss';
import { menosMovimentoAgora } from '../hooks/useReducedMotion';

/**
 * Uma lista que muda de ordem sem saltar (22/11): os amigos da lateral entram,
 * saem e trocam de lugar com a presença, e cada mudança era um salto. Depois de
 * cada desenho, cada linha marcada com `data-chave` compara onde está com onde
 * estava (FLIP: o sítio antigo, o novo, inverter, animar):
 * - mudou de lugar: desliza do antigo para o novo;
 * - é nova (e a lista já existia): aparece a desvanecer;
 * - uma que saiu: as outras sobem a deslizar para o lugar dela.
 * Só o `transform` e a `opacity` (no compositor), com a curva de entrada do PC.
 * `ref` vai no contentor das linhas. Com o "menos movimento" do Windows, nada.
 */
export function useFlip<T extends HTMLElement = HTMLElement>(): React.RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const antes = useRef<Map<string, number> | null>(null);
  useLayoutEffect(() => {
    const raiz = ref.current as unknown as HTMLElement | null;
    if (!raiz?.querySelectorAll) return;
    const agora = new Map<string, number>();
    const animar = antes.current !== null && !menosMovimentoAgora();
    raiz.querySelectorAll<HTMLElement>('[data-chave]').forEach((el) => {
      const chave = el.dataset.chave;
      if (!chave) return;
      const topo = el.getBoundingClientRect().top;
      agora.set(chave, topo);
      if (!animar || typeof el.animate !== 'function') return;
      const era = antes.current!.get(chave);
      if (era === undefined) {
        el.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }],
          { duration: 220, easing: curvaDoPc('entrada') });
      } else if (Math.abs(era - topo) > 1) {
        el.animate([{ transform: `translateY(${era - topo}px)` }, { transform: 'none' }],
          { duration: 260, easing: curvaDoPc('entrada') });
      }
    });
    antes.current = agora;
  });
  return ref;
}
