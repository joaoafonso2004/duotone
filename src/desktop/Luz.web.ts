/**
 * A luz como estado no PC (S2, 1/11): a banda de luz que passa por uma
 * superfície. As regras e as contas vivem no `lib/luz.ts`; a curva é o
 * travão das molas (S1), o mesmo `decay` do iPhone.
 *
 * É DOM à mão e Web Animations, como a Órbita: a banda entra como último filho
 * da superfície (que tem de cortar o que lhe sai, `overflow: hidden`), anda só
 * por `transform` e sai do documento quando acaba.
 */
import { curvasDoPc } from '../lib/molasEmCss';
import {
  DEGRAU_MS, LARGURA_DA_BANDA, LUZ_A_PASSAR_MS, OPACIDADE_DA_BANDA, OPACIDADE_DO_DEGRAU, pedirLuz, trajetoDaBanda, type DirecaoDaLuz,
} from '../lib/luz';

/** O branco do texto do PC (`COR.texto`), como luz. */
const BRANCO = '233,234,238';

const menosMovimento = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/**
 * Passa a luz por `el` na `direcao`. Sem direção (um erro) não faz nada. Com
 * outra luz a andar, ou com menos movimento, é o degrau: acende e apaga no
 * sítio. `atraso`: deixa a superfície chegar primeiro.
 */
export function varrerLuz(el: HTMLElement | null | undefined, direcao: DirecaoDaLuz | null, atraso = 0): void {
  if (!el?.animate || !direcao) return;
  const anda = !menosMovimento() && pedirLuz(LUZ_A_PASSAR_MS + atraso);
  const banda = document.createElement('i');
  Object.assign(banda.style, { position: 'absolute', pointerEvents: 'none', borderRadius: 'inherit' });
  let a: Animation;
  let dura = DEGRAU_MS;
  if (!anda) {
    Object.assign(banda.style, { inset: '0', backgroundColor: `rgba(${BRANCO},${OPACIDADE_DO_DEGRAU})`, opacity: '0' });
    el.appendChild(banda);
    a = banda.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration: DEGRAU_MS, delay: atraso, easing: 'linear' });
  } else {
    const t = trajetoDaBanda(direcao);
    const lado = `${LARGURA_DA_BANDA * 100}%`;
    const luz = `transparent, rgba(${BRANCO},${OPACIDADE_DA_BANDA}), transparent`;
    Object.assign(banda.style, t.eixo === 'x'
      ? { top: '0', bottom: '0', left: '0', width: lado, background: `linear-gradient(100deg, ${luz})` }
      : { left: '0', right: '0', top: '0', height: lado, background: `linear-gradient(180deg, ${luz})` });
    const mover = (f: number) => `translate${t.eixo === 'x' ? 'X' : 'Y'}(${f * 100}%)`;
    banda.style.transform = mover(t.de);
    el.appendChild(banda);
    const travao = curvasDoPc().travar;
    dura = travao.ms;
    a = banda.animate([{ transform: mover(t.de) }, { transform: mover(t.para) }],
      { duration: travao.ms, delay: atraso, easing: travao.curva, fill: 'both' });
  }
  a.onfinish = a.oncancel = () => banda.remove();
  // Com a janela escondida o Chromium não chega a dar o `finish` (visto a
  // 1/11): as bandas ficavam no aviso até ela voltar. O relógio tira-as à hora.
  setTimeout(() => banda.remove(), atraso + dura + 100);
}
