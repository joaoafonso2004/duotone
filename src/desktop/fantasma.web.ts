import { curvaDoPc } from '../lib/molasEmCss';
import { menosMovimentoAgora } from '../hooks/useReducedMotion';
import { SAIDA_MS } from './Saida.web';

/**
 * A saída de quem é desmontado de fora (22/11): os menus de contexto abrem-se e
 * fecham-se em doze sítios, cada um com o seu `menu ? <MenuDeContexto/> : null`.
 * Em vez de mexer em todos, o menu deixa no ecrã, ao desmontar, uma CÓPIA
 * estática do que lá estava, e essa cópia desvanece com a curva de sair.
 *
 * - Chama-se na limpeza de um `useLayoutEffect`: o React corre-a antes de tirar
 *   os nós do DOM, por isso a caixa ainda tem o sítio e o tamanho.
 * - A cópia não apanha o rato nem o leitor de ecrã, não tem ids (não se duplicam),
 *   e as animações e transições lá dentro param (`data-fantasma` no CSS da casca):
 *   só a saída mexe.
 * - Com o "menos movimento" do Windows não há cópia: fecha logo.
 * - Não serve para diálogos: a cópia perde o scroll de dentro.
 */
export function sairComFantasma(el: HTMLElement | null | undefined): void {
  if (!el || !el.isConnected || typeof document === 'undefined' || menosMovimentoAgora()) return;
  const sitio = el.getBoundingClientRect();
  if (!sitio.width || !sitio.height) return;
  const estilo = getComputedStyle(el);
  if (estilo.opacity === '0' || estilo.visibility === 'hidden') return;
  const copia = el.cloneNode(true) as HTMLElement;
  copia.removeAttribute('id');
  copia.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  copia.setAttribute('aria-hidden', 'true');
  copia.setAttribute('inert', '');
  copia.setAttribute('data-fantasma', '');
  copia.removeAttribute('data-dt');
  Object.assign(copia.style, {
    position: 'fixed', left: `${sitio.left}px`, top: `${sitio.top}px`, width: `${sitio.width}px`, height: `${sitio.height}px`,
    margin: '0', pointerEvents: 'none', zIndex: estilo.zIndex === 'auto' ? '300' : estilo.zIndex,
  });
  document.body.appendChild(copia);
  copia.scrollTop = el.scrollTop;
  const fim = () => copia.remove();
  try {
    const a = copia.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.98)' }],
      { duration: SAIDA_MS, easing: curvaDoPc('sair'), fill: 'forwards' });
    a.onfinish = fim;
    a.oncancel = fim;
  } catch {
    fim();
  }
  // Mesmo sem o `finish` (a janela escondida não anima), a cópia nunca fica.
  setTimeout(fim, SAIDA_MS + 120);
}
