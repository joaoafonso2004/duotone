/**
 * O play do PC como um disco de metal escovado (C3, 1/11, `docs/elevacao-maquete.html`).
 *
 * Três camadas: o metal (o gradiente da maquete), o laço de luz (a forma em
 * disco do Reflexo, `lib/luz.ts`) e o ícone. Na pausa o laço trava como um
 * prato de gira-discos, meia volta a perder velocidade (o travão); no play
 * arranca, um quarto de volta com ressalto (a mola SOLTAR). Parado, nunca roda.
 *
 * As regras vivem em dois documentos, a casca e o mini leitor; os valores saem
 * daqui para os dois as escreverem iguais.
 */
import { curvasDoPc } from '../lib/molasEmCss';
import {
  DEGRAU_DO_REFLEXO_MS, lacoConico, ocuparLuz, OPACIDADE_DO_REFLEXO, quedaDoReflexo, RISCOS_DO_REFLEXO, voltaDoDisco,
} from '../lib/luz';

/** O metal: claro em cima, escuro em baixo, como um botão de alumínio sob uma luz de tecto. */
const METAL = 'radial-gradient(circle at 50% 36%, #c4c7ce 0%, #8f929b 48%, #5c5f68 100%)';
const ARESTAS = 'inset 0 1px 0 rgba(255,255,255,.35), inset 0 -1px 0 rgba(0,0,0,.25), 0 4px 10px rgba(0,0,0,.4)';

/**
 * Os dois símbolos partilham o centro (12, 12) no quadrado de 24. Na barra,
 * o disco de 36 deixa uma margem inteira de 6 px quando a posição é inteira.
 * A pausa é simétrica; o play é um triângulo equilátero com o centro de massa
 * e o centro do círculo no mesmo ponto, sem deslocações CSS adicionais.
 */
export const SIMBOLO_DO_PLAY = 'M7.381 4v16l13.856-8z';
export const SIMBOLO_DA_PAUSA = 'M6 4h4v16H6zM14 4h4v16h-4z';

/**
 * As declarações do disco (o botão). Numa camada só dele: numa posição fracionária da
 * barra, o metal encostava a um píxel e o símbolo a outro, e ao premir o símbolo era
 * redesenhado. Assim o disco anda inteiro.
 */
export function estiloDoDisco(): string {
  return `background:${METAL}; box-shadow:${ARESTAS}; overflow:hidden; isolation:isolate; will-change:transform;`;
}

/** O hover ilumina o metal por baixo do símbolo, sem filtrar nem escalar o ícone. */
export function cssDoHoverDoDisco(): string {
  return `[data-dt~="disco-metal"]:hover{ background:linear-gradient(rgba(255,255,255,.08),rgba(255,255,255,.08)),${METAL}; }`;
}

/** As declarações do laço (a camada por cima do metal e por baixo do ícone). */
export function estiloDoReflexo(): string {
  const mascara = `${lacoConico()}, ${quedaDoReflexo()}`;
  return `position:absolute; inset:0; border-radius:50%; pointer-events:none; z-index:0;`
    + ` opacity:${OPACIDADE_DO_REFLEXO}; mix-blend-mode:screen; background:${RISCOS_DO_REFLEXO};`
    + ` -webkit-mask-image:${mascara}; mask-image:${mascara};`
    + ' -webkit-mask-composite:source-in; mask-composite:intersect;';
}

const menosMovimento = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/** O ângulo a que o laço está AGORA, mesmo a meio de uma volta. */
function anguloAgora(el: HTMLElement): number {
  const t = getComputedStyle(el).transform;
  const m = t && t !== 'none' ? /matrix\(([^)]+)\)/.exec(t) : null;
  if (!m) return 0;
  const [a, b] = m[1].split(',').map(Number);
  return (Math.atan2(b, a) * 180) / Math.PI;
}

/**
 * Roda o laço porque se carregou no play (`aTocar` é o estado NOVO). Parte de
 * onde está: carregar outra vez a meio continua daí, sem saltar.
 */
export function rodarReflexo(el: HTMLElement | null | undefined, aTocar: boolean): void {
  if (!el?.animate) return;
  const de = anguloAgora(el);
  const { graus, curva } = voltaDoDisco(aTocar);
  const para = de + graus;
  el.getAnimations().forEach((a) => a.cancel());
  el.style.transform = `rotate(${para}deg)`;
  if (menosMovimento()) {
    // O laço muda de ângulo sem rodar: um degrau de opacidade.
    const o = OPACIDADE_DO_REFLEXO;
    el.animate([{ opacity: o }, { opacity: o / 3 }, { opacity: o }], { duration: DEGRAU_DO_REFLEXO_MS, easing: 'linear' });
    return;
  }
  const c = curvasDoPc()[curva];
  // A luz anda sobretudo nos primeiros 40 % (o resto é o prato a assentar).
  ocuparLuz(Math.round(c.ms * 0.4));
  el.animate([{ transform: `rotate(${de}deg)` }, { transform: `rotate(${para}deg)` }], { duration: c.ms, easing: c.curva });
}
