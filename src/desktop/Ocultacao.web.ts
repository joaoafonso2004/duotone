/**
 * A Ocultação no PC (C2, 1/11): a capa velha fica por cima da nova, e um disco
 * esbatido com a sombra da música que vem passa por cima das duas. Quando a
 * tapa, a velha sai, e o disco deixa a nova à vista. As decisões vivem no
 * `lib/ocultacao.ts`; as curvas são as molas (S1): a chegar a do `sair`, a
 * acelerar, e a sair a ENTRADA. Só `transform`, e o disco sai do documento no fim.
 *
 * A caixa tem de cortar o que lhe sai (`overflow: hidden`, com o raio da capa).
 * Com menos movimento não há disco: a velha esbate-se em 160 ms (regra `capa-sai`
 * da casca) e sai.
 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { lerCelulasDaCapa } from '../lib/celulasDaCapa';
import { curvasDoPc } from '../lib/molasEmCss';
import {
  COR_DO_DISCO_SEM_CAPA, corDoDisco, fundoDoDisco, OCULTACAO, trajetoDoDisco,
} from '../lib/ocultacao';

const menosMovimento = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/**
 * Passa o disco por `caixa`. `aTotalidade` corre uma vez, quando a capa está
 * tapada (ou ao cancelar). Devolve como cancelar: uma música nova a meio da
 * passagem acaba esta de imediato.
 */
export function ocultar(caixa: HTMLElement, o: { sentido: 1 | -1; capa?: string | null; aTotalidade: () => void }): () => void {
  let trocou = false;
  const trocar = () => { if (trocou) return; trocou = true; o.aTotalidade(); };
  if (menosMovimento() || !caixa.animate) {
    const id = setTimeout(trocar, OCULTACAO.cruzarMs);
    return () => { clearTimeout(id); trocar(); };
  }
  const disco = document.createElement('div');
  const lado = `${OCULTACAO.ladoDoDisco * 100}%`;
  const margem = `${-(OCULTACAO.ladoDoDisco - 1) * 50}%`;
  Object.assign(disco.style, {
    position: 'absolute', left: margem, top: margem, width: lado, height: lado, borderRadius: '50%', pointerEvents: 'none',
    zIndex: '3', opacity: String(OCULTACAO.opacidade), background: fundoDoDisco(COR_DO_DISCO_SEM_CAPA),
  });
  const t = trajetoDoDisco(o.sentido);
  disco.style.transform = t.de;
  caixa.appendChild(disco);
  // A cor chega quando chega (em cache, quase sempre logo): o movimento não espera por ela.
  let vivo = true;
  if (o.capa) {
    void lerCelulasDaCapa(o.capa).then((c) => { if (vivo) disco.style.background = fundoDoDisco(corDoDisco(c)); }).catch(() => {});
  }
  const curvas = curvasDoPc();
  const relogios: ReturnType<typeof setTimeout>[] = [];
  const acabar = () => { vivo = false; relogios.forEach(clearTimeout); disco.remove(); };
  const sair = () => {
    trocar();
    const b = disco.animate([{ transform: t.meio }, { transform: t.para }], { duration: curvas.entrada.ms, easing: curvas.entrada.curva, fill: 'forwards' });
    b.onfinish = acabar;
    // Com a janela escondida o Chromium não dá o `finish`: o relógio acaba à hora.
    relogios.push(setTimeout(acabar, curvas.entrada.ms + 100));
  };
  const a = disco.animate([{ transform: t.de }, { transform: t.meio }], { duration: OCULTACAO.entradaMs, easing: curvas.sair.curva, fill: 'forwards' });
  let saiu = false;
  const aoChegar = () => { if (saiu || !vivo) return; saiu = true; sair(); };
  a.onfinish = aoChegar;
  relogios.push(setTimeout(aoChegar, OCULTACAO.entradaMs + 50));
  return () => { saiu = true; trocar(); acabar(); };
}

/**
 * A capa que está a sair enquanto o disco não a tapa: quem desenha põe-na por
 * cima da nova. O estado muda no `useLayoutEffect`, antes de pintar: num
 * `useEffect` via-se a capa nova um fotograma antes de o disco chegar.
 */
export function useCapaQueSai<T>(chave: string, valor: T | null, o: {
  caixa: RefObject<HTMLElement | null>;
  /** A capa da música que vem, para a cor da sombra. */
  capa: string | null | undefined;
  sentido: () => 1 | -1;
  /** Falso quando a capa não está à vista (a letra na frente, no Now Playing). */
  ligada?: boolean;
}): T | null {
  const [velha, setVelha] = useState<T | null>(null);
  const antes = useRef<{ chave: string; valor: T } | null>(null);
  const cancelar = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    const anterior = antes.current;
    if (!anterior || anterior.chave === chave || !valor) return;
    cancelar.current?.();
    cancelar.current = null;
    const caixa = o.caixa.current;
    if (o.ligada === false || !caixa) { setVelha(null); return; }
    setVelha(anterior.valor);
    cancelar.current = ocultar(caixa, { sentido: o.sentido(), capa: o.capa, aTotalidade: () => setVelha(null) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  // Depois do de cima, e também quando só o valor muda: a capa grande do Now
  // Playing chega depois da pequena, e é a última que deve sair.
  useLayoutEffect(() => { antes.current = valor ? { chave, valor } : null; }, [chave, valor]);
  useEffect(() => () => { cancelar.current?.(); }, []);
  return velha;
}
