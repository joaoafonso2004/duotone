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
 *
 * O sítio de cada linha é o do layout (22/11, a B4): `offsetTop` até ao
 * contentor, que não vê as transformações nem o scroll. Medido pela janela, com
 * a animação que ainda corria, cada desenho a meio de um deslize somava o desvio
 * ao seguinte (as linhas fugiam para -900 000 px), e o scroll da página fazia
 * deslizar a lista toda no desenho seguinte.
 */
export function useFlip<T extends HTMLElement = HTMLElement>(): React.RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const antes = useRef<Map<string, number> | null>(null);
  const emCurso = useRef(new WeakMap<HTMLElement, Animation>());
  useLayoutEffect(() => {
    const raiz = ref.current as unknown as HTMLElement | null;
    if (!raiz?.querySelectorAll) return;
    const agora = new Map<string, number>();
    const animar = antes.current !== null && !menosMovimentoAgora();
    raiz.querySelectorAll<HTMLElement>('[data-chave]').forEach((el) => {
      const chave = el.dataset.chave;
      if (!chave) return;
      const topo = topoNoLayout(el, raiz);
      agora.set(chave, topo);
      if (!animar || typeof el.animate !== 'function') return;
      const era = antes.current!.get(chave);
      if (era === undefined) {
        emCurso.current.get(el)?.cancel();
        emCurso.current.set(el, el.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }],
          { duration: 220, easing: curvaDoPc('entrada') }));
      } else if (Math.abs(era - topo) > 1) {
        // Parte de onde se via (o sítio antigo mais o deslize que ia a meio), não do fim dele.
        const desvio = deslocamentoY(el);
        emCurso.current.get(el)?.cancel();
        emCurso.current.set(el, el.animate([{ transform: `translateY(${era + desvio - topo}px)` }, { transform: 'none' }],
          { duration: 260, easing: curvaDoPc('entrada') }));
      }
    });
    antes.current = agora;
  });
  return ref;
}

/** O topo de `el` dentro de `raiz`, pelo layout: sem transformações nem scroll. */
function topoNoLayout(el: HTMLElement, raiz: HTMLElement): number {
  let y = 0;
  let n: HTMLElement | null = el;
  while (n && n !== raiz) {
    y += n.offsetTop;
    const pai = n.offsetParent as HTMLElement | null;
    // A raiz não está posicionada (não é o offsetParent): desconta-se o topo dela.
    if (!pai || !raiz.contains(pai)) return y - (pai === raiz.offsetParent ? raiz.offsetTop : 0);
    n = pai;
  }
  return y;
}

/** O que o deslize em curso soma agora à linha (o `translateY` da animação). */
function deslocamentoY(el: HTMLElement): number {
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return 0;
  try { return new DOMMatrixReadOnly(t).m42; } catch { return 0; }
}
