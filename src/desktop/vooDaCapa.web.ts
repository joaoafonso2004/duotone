import { curvaDoPc } from '../lib/molasEmCss';
import { menosMovimentoAgora } from '../hooks/useReducedMotion';

/**
 * A capa que voa da barra do leitor para o Now Playing, e de volta (23/11, a maquete
 * "Painel e leitor a abrir"; o João: "quando se abre a página do currently playing,
 * não tem animação clean, dá pop out"). A página e o leitor trocavam no mesmo
 * fotograma; agora a capa sai da barra e cresce até ao sítio dela, enquanto a página
 * recua por baixo (`pagina-sob-o-leitor`) e o resto do leitor sobe em escada
 * (`np-sobe`), tudo no CSS da casca.
 *
 * Quem voa é uma CÓPIA DO DOM da capa do leitor, tal como está (23/11, o João: "abre
 * só a imagem e depois dá pop para ficar em 3D, deve abrir já em 3D"): com a "3D
 * cover" é a caixa inteira, com as arestas e a sombra no chão, já na pose dela; sem
 * ela, o cubo plano. A cópia voa com uma transformação plana (deslocar e escalar,
 * pelo compositor) e a caixa lá dentro mantém a perspetiva dela: na barra é uma caixa
 * 3D pequena, e aterra igual à verdadeira, que fica escondida enquanto ela voa
 * (`html[data-capa-a-voar]`). Não é a capa verdadeira a voar porque a página do
 * leitor corta o que sai dela (`npPagina`, `overflow: hidden`), e a barra fica fora.
 *
 * Não é uma View Transition (`viagem.web.ts`): o Now Playing não é uma rota, e a
 * transição congelava a janela à espera dele.
 *
 * A capa do leitor só tem o tamanho certo depois de ele medir a área (o `onLayout`
 * corre no fotograma a seguir a montar): a cópia espera até a caixa ficar igual dois
 * fotogramas seguidos. Sem capa à vista (o Cinema, a letra grande) não voa nada.
 */

/** O invólucro da capa na barra do leitor (`CapaDaBarra`, casca.web.tsx). */
export const ID_DA_CAPA_NA_BARRA = 'alvo-seguinte';
/** A caixa da capa no Now Playing (NowPlayingPage.web.tsx). */
export const ID_DA_CAPA_NO_LEITOR = 'capa-do-leitor';
/** O atributo da raiz que esconde a capa do leitor enquanto a cópia voa. */
export const A_VOAR = 'data-capa-a-voar';
const DURACAO_A_ABRIR = 560;
const DURACAO_A_FECHAR = 420;
/** O fim de cada voo: a cópia apaga-se por cima da capa verdadeira (ou da da barra). */
const DURACAO_A_POUSAR = 100;
/** A fechar, a capa trava no sítio dela na barra, sem passar dele. */
const CURVA_A_FECHAR = () => curvaDoPc('travar');
const MAX_FOTOGRAMAS_A_ESPERAR = 12;

let cancelarAtual: (() => void) | null = null;

function caixaDe(id: string): { el: HTMLElement; r: DOMRect } | null {
  const el = document.getElementById(id);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 1 && r.height > 1 ? { el, r } : null;
}

function podeVoar(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'visible' && !menosMovimentoAgora()
    && typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
}

/**
 * A cópia da capa do leitor, num `<div>` fixo no sítio dela. Os canvases (o efeito do
 * glitch e as arestas vivas) não vêm com o DOM: copia-se o que têm desenhado. Tira-se
 * o id (não pode haver dois) e a marca que a esconde.
 */
export function copiaDaCapa(capa: HTMLElement, r: DOMRect): HTMLDivElement {
  const caixa = document.createElement('div');
  caixa.setAttribute('aria-hidden', 'true');
  Object.assign(caixa.style, {
    position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
    zIndex: '2147483000', pointerEvents: 'none', transformOrigin: '50% 50%', willChange: 'transform',
  } as Partial<CSSStyleDeclaration>);
  const copia = capa.cloneNode(true) as HTMLElement;
  copia.removeAttribute('id');
  copia.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  copia.setAttribute('data-dt', (copia.getAttribute('data-dt') ?? '').split(/\s+/).filter((n) => n && n !== ID_DA_CAPA_NO_LEITOR).join(' '));
  Object.assign(copia.style, { margin: '0', position: 'absolute', left: '0', top: '0' });
  const daqui = capa.querySelectorAll('canvas');
  copia.querySelectorAll('canvas').forEach((tela, i) => {
    const original = daqui[i];
    if (!original) return;
    tela.width = original.width;
    tela.height = original.height;
    try { tela.getContext('2d')?.drawImage(original, 0, 0); } catch { /* sem o desenho, fica a imagem por baixo */ }
  });
  caixa.appendChild(copia);
  document.body.appendChild(caixa);
  return caixa;
}

/** A transformação que leva a cópia (posta em `em`) ao centro e ao tamanho de `la`. */
export function deslocarAte(la: DOMRect, em: DOMRect): string {
  const dx = la.left + la.width / 2 - (em.left + em.width / 2);
  const dy = la.top + la.height / 2 - (em.top + em.height / 2);
  return `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${(la.width / em.width).toFixed(4)})`;
}

const iguais = (a: DOMRect, b: DOMRect) =>
  Math.abs(a.left - b.left) < 0.5 && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;

/** Abrir o Now Playing: a capa (já em 3D, com a "3D cover") sai da barra e cresce até ao sítio. */
export function voarParaOLeitor(): void {
  cancelarAtual?.();
  if (!podeVoar()) return;
  const naBarra = caixaDe(ID_DA_CAPA_NA_BARRA);
  if (!naBarra) return;
  const raiz = document.documentElement;
  raiz.setAttribute(A_VOAR, '');
  let cancelado = false;
  let quadro = 0;
  let copia: HTMLDivElement | null = null;
  let anim: Animation | null = null;
  const acabar = () => { raiz.removeAttribute(A_VOAR); copia?.remove(); copia = null; if (cancelarAtual === cancelar) cancelarAtual = null; };
  const cancelar = () => { cancelado = true; cancelAnimationFrame(quadro); anim?.cancel(); acabar(); };
  cancelarAtual = cancelar;
  let antes: DOMRect | null = null;
  let n = 0;
  const esperar = () => {
    if (cancelado) return;
    const alvo = caixaDe(ID_DA_CAPA_NO_LEITOR);
    if (alvo && antes && iguais(alvo.r, antes)) { partir(alvo); return; }
    antes = alvo?.r ?? null;
    if (++n > MAX_FOTOGRAMAS_A_ESPERAR) { acabar(); return; }
    quadro = requestAnimationFrame(esperar);
  };
  const partir = (alvo: { el: HTMLElement; r: DOMRect }) => {
    const de = caixaDe(ID_DA_CAPA_NA_BARRA)?.r ?? naBarra.r;
    copia = copiaDaCapa(alvo.el, alvo.r);
    anim = copia.animate([{ transform: deslocarAte(de, alvo.r) }, { transform: 'none' }],
      { duration: DURACAO_A_ABRIR, easing: curvaDoPc('entrada'), fill: 'both' });
    anim.onfinish = () => {
      if (cancelado || !copia) return;
      // A capa verdadeira aparece por baixo (igual), e a cópia apaga-se por cima dela.
      raiz.removeAttribute(A_VOAR);
      const fim = copia.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DURACAO_A_POUSAR, fill: 'both' });
      fim.onfinish = acabar;
    };
  };
  quadro = requestAnimationFrame(esperar);
}

/** Fechar o Now Playing: a capa (como está) volta para a barra, enquanto o leitor se apaga. */
export function voarParaABarra(): void {
  cancelarAtual?.();
  if (!podeVoar()) return;
  const noLeitor = caixaDe(ID_DA_CAPA_NO_LEITOR);
  const naBarra = caixaDe(ID_DA_CAPA_NA_BARRA);
  if (!noLeitor || !naBarra) return;
  const raiz = document.documentElement;
  const copia = copiaDaCapa(noLeitor.el, noLeitor.r);
  raiz.setAttribute(A_VOAR, '');
  const anim = copia.animate([{ transform: 'none' }, { transform: deslocarAte(naBarra.r, noLeitor.r) }],
    { duration: DURACAO_A_FECHAR, easing: CURVA_A_FECHAR(), fill: 'both' });
  let fim: Animation | null = null;
  const acabar = () => { raiz.removeAttribute(A_VOAR); copia.remove(); if (cancelarAtual === cancelar) cancelarAtual = null; };
  const cancelar = () => { anim.cancel(); fim?.cancel(); acabar(); };
  cancelarAtual = cancelar;
  // Na barra, apaga-se por cima da capa dela.
  anim.onfinish = () => {
    fim = copia.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DURACAO_A_POUSAR, fill: 'both' });
    fim.onfinish = acabar;
  };
}
