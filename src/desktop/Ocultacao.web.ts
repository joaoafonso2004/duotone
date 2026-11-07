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
  COR_DO_DISCO_SEM_CAPA, corDoDisco, fundoDoDisco, OCULTACAO, SOMBRA_NA_LATERAL, sombraNaLateral, trajetoDoDisco,
  type LadoDaCaixa,
} from '../lib/ocultacao';

const menosMovimento = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/**
 * Quantas capas estão à espera de o disco as tapar (7/11). O fundo da janela
 * (`FundoDaCapa`) espera por elas: trocava no instante do skip, e via-se o fundo
 * da música nova com a capa da velha ainda à frente.
 */
let porTapar = 0;
const aEsperar = new Set<() => void>();
function comecouATapar(): void { porTapar++; }
function tapou(): void {
  porTapar = Math.max(0, porTapar - 1);
  // Num microtask: uma música nova a meio cancela esta passagem e começa outra no
  // mesmo commit, e o fundo deve esperar pela nova, não saltar já para ela.
  queueMicrotask(() => { if (!porTapar) [...aEsperar].forEach((f) => f()); });
}

/**
 * O valor que se vê depois da troca da capa: igual ao `valor`, mas enquanto uma
 * Ocultação não tapou a capa fica o anterior. Num `useEffect`, que corre depois
 * dos `useLayoutEffect` onde a passagem começa: no mesmo commit já se sabe se há.
 */
export function useAtrasadoPelaOcultacao<T extends string | null>(valor: T): T {
  const [mostrado, setMostrado] = useState<T>(valor);
  const ultimo = useRef(valor);
  ultimo.current = valor;
  useEffect(() => {
    if (valor === mostrado) return undefined;
    if (!porTapar) { setMostrado(valor); return undefined; }
    const quando = () => setMostrado(ultimo.current);
    aEsperar.add(quando);
    return () => { aEsperar.delete(quando); };
  }, [valor, mostrado]);
  return mostrado;
}

/** Uma lateral da caixa 3D, para a sombra do disco lhe passar por cima. */
export type LateralDaOcultacao = { lado: LadoDaCaixa; no: HTMLElement };

/**
 * Passa o disco por `caixa`. `aTotalidade` corre uma vez, quando a capa está
 * tapada (ou ao cancelar). Devolve como cancelar: uma música nova a meio da
 * passagem acaba esta de imediato.
 *
 * `laterais` (a capa 3D, 7/11): o disco passa na face, que é a `caixa`, e as
 * laterais escurecem com a sombra dele (`sombraNaLateral`).
 */
export function ocultar(caixa: HTMLElement, entrada: { sentido: 1 | -1; capa?: string | null; aTotalidade: () => void; laterais?: LateralDaOcultacao[] }): () => void {
  comecouATapar();
  const o = { ...entrada, aTotalidade: () => { entrada.aTotalidade(); tapou(); } };
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
  // As laterais: uma camada com a mesma cor, que escurece e volta (só opacidade).
  const sombras = (o.laterais ?? []).map(({ lado, no }) => {
    const camada = document.createElement('div');
    Object.assign(camada.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '2', opacity: '0', background: COR_DO_DISCO_SEM_CAPA });
    no.appendChild(camada);
    return { camada, tempos: sombraNaLateral(lado, o.sentido) };
  });
  const escurecer = (fase: 'entra' | 'sai', duracao: number) => {
    for (const { camada, tempos } of sombras) {
      const [de, ate] = tempos[fase];
      const [x, y] = fase === 'entra' ? [0, SOMBRA_NA_LATERAL] : [SOMBRA_NA_LATERAL, 0];
      camada.animate([{ opacity: x, offset: 0 }, { opacity: x, offset: de }, { opacity: y, offset: ate }, { opacity: y, offset: 1 }],
        { duration: duracao, easing: 'linear', fill: 'forwards' });
    }
  };
  // A cor chega quando chega (em cache, quase sempre logo): o movimento não espera por ela.
  let vivo = true;
  if (o.capa) {
    void lerCelulasDaCapa(o.capa).then((c) => {
      if (!vivo) return;
      const cor = corDoDisco(c);
      disco.style.background = fundoDoDisco(cor);
      for (const { camada } of sombras) camada.style.background = cor;
    }).catch(() => {});
  }
  const curvas = curvasDoPc();
  const relogios: ReturnType<typeof setTimeout>[] = [];
  const acabar = () => { vivo = false; relogios.forEach(clearTimeout); disco.remove(); sombras.forEach(({ camada }) => camada.remove()); };
  const sair = () => {
    trocar();
    escurecer('sai', curvas.entrada.ms);
    const b = disco.animate([{ transform: t.meio }, { transform: t.para }], { duration: curvas.entrada.ms, easing: curvas.entrada.curva, fill: 'forwards' });
    b.onfinish = acabar;
    // Com a janela escondida o Chromium não dá o `finish`: o relógio acaba à hora.
    relogios.push(setTimeout(acabar, curvas.entrada.ms + 100));
  };
  const a = disco.animate([{ transform: t.de }, { transform: t.meio }], { duration: OCULTACAO.entradaMs, easing: curvas.sair.curva, fill: 'forwards' });
  escurecer('entra', OCULTACAO.entradaMs);
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
  /** A capa 3D (7/11): as laterais da caixa, que escurecem com o disco. */
  laterais?: () => LateralDaOcultacao[];
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
    cancelar.current = ocultar(caixa, { sentido: o.sentido(), capa: o.capa, aTotalidade: () => setVelha(null), laterais: o.laterais?.() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  // Depois do de cima, e também quando só o valor muda: a capa grande do Now
  // Playing chega depois da pequena, e é a última que deve sair.
  useLayoutEffect(() => { antes.current = valor ? { chave, valor } : null; }, [chave, valor]);
  useEffect(() => () => { cancelar.current?.(); }, []);
  return velha;
}
