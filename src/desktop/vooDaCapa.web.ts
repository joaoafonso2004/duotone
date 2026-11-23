import { curvaDoPc } from '../lib/molasEmCss';
import { menosMovimentoAgora } from '../hooks/useReducedMotion';
import { RAIO } from './tokens.web';

/**
 * A capa que voa da barra do leitor para o Now Playing, e de volta (23/11, a maquete
 * "Painel e leitor a abrir"; o João: "quando se abre a página do currently playing,
 * não tem animação clean, dá pop out"). A página e o leitor trocavam no mesmo
 * fotograma; agora a capa sai da barra e cresce até ao sítio dela, enquanto a página
 * recua por baixo (`pagina-sob-o-leitor`) e o resto do leitor sobe em escada
 * (`np-sobe`), tudo no CSS da casca.
 *
 * Não é uma View Transition (`viagem.web.ts`): o Now Playing não é uma rota, e a
 * transição congelava a janela à espera dele. É uma cópia da capa num `<div>` fixo,
 * animada pelo compositor (WAAPI, só `transform`), e a capa verdadeira fica escondida
 * enquanto ela voa (`html[data-capa-a-voar]`).
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
/** A fechar, a capa trava no sítio dela na barra, sem passar dele. */
const CURVA_A_FECHAR = () => curvaDoPc('travar');
/** Os cantos da capa na barra (`CapaDaBarra`) e no leitor (a caixa da capa). */
const RAIO_NA_BARRA = RAIO.ctrl;
const RAIO_NO_LEITOR = RAIO.superficie;
const MAX_FOTOGRAMAS_A_ESPERAR = 12;

let cancelarAtual: (() => void) | null = null;

function caixaDe(id: string): { el: HTMLElement; r: DOMRect } | null {
  const el = document.getElementById(id);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 1 && r.height > 1 ? { el, r } : null;
}

/** A imagem que uma capa está a mostrar (a `<img>` escondida que o RNW põe junto do fundo). */
function imagemDe(el: HTMLElement | null | undefined): string | null {
  const img = el?.querySelector('img');
  return img?.currentSrc || img?.src || null;
}

function podeVoar(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'visible' && !menosMovimentoAgora()
    && typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
}

function copiaEm(r: DOMRect, imagens: (string | null)[], raio: number): HTMLDivElement {
  const copia = document.createElement('div');
  copia.setAttribute('aria-hidden', 'true');
  const fundos = imagens.filter((i): i is string => !!i).map((i) => `url("${i.replace(/"/g, '%22')}")`);
  Object.assign(copia.style, {
    position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
    zIndex: '2147483000', pointerEvents: 'none', transformOrigin: '0 0', willChange: 'transform',
    backgroundColor: '#14141A', backgroundImage: fundos.join(', '), backgroundSize: 'cover', backgroundPosition: 'center',
    borderRadius: `${raio}px`, boxShadow: '0 24px 60px rgba(0,0,0,.45)',
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(copia);
  return copia;
}

const iguais = (a: DOMRect, b: DOMRect) =>
  Math.abs(a.left - b.left) < 0.5 && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;

/** Abrir o Now Playing: a capa da barra voa até à capa do leitor. */
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
    const para = alvo.r;
    // A grande por cima da pequena: se ainda não carregou, vê-se a da barra.
    copia = copiaEm(para, [imagemDe(alvo.el), imagemDe(naBarra.el)], RAIO_NO_LEITOR);
    const escala = de.width / para.width;
    anim = copia.animate([
      { transform: `translate(${de.left - para.left}px, ${de.top - para.top}px) scale(${escala})`, borderRadius: `${RAIO_NA_BARRA / escala}px`, boxShadow: '0 0 0 rgba(0,0,0,0)' },
      { transform: 'none', borderRadius: `${RAIO_NO_LEITOR}px`, boxShadow: '0 24px 60px rgba(0,0,0,.45)' },
    ], { duration: DURACAO_A_ABRIR, easing: curvaDoPc('entrada'), fill: 'both' });
    anim.onfinish = () => {
      if (cancelado || !copia) return;
      // A capa verdadeira aparece por baixo, e a cópia apaga-se por cima dela.
      raiz.removeAttribute(A_VOAR);
      const fim = copia.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'both' });
      fim.onfinish = acabar;
    };
  };
  quadro = requestAnimationFrame(esperar);
}

/** Fechar o Now Playing: a capa do leitor volta para a barra, enquanto o leitor se apaga. */
export function voarParaABarra(): void {
  cancelarAtual?.();
  if (!podeVoar()) return;
  const noLeitor = caixaDe(ID_DA_CAPA_NO_LEITOR);
  const naBarra = caixaDe(ID_DA_CAPA_NA_BARRA);
  if (!noLeitor || !naBarra) return;
  const raiz = document.documentElement;
  raiz.setAttribute(A_VOAR, '');
  const de = noLeitor.r, para = naBarra.r;
  const copia = copiaEm(de, [imagemDe(noLeitor.el), imagemDe(naBarra.el)], RAIO_NO_LEITOR);
  const escala = para.width / de.width;
  const anim = copia.animate([
    { transform: 'none', borderRadius: `${RAIO_NO_LEITOR}px`, boxShadow: '0 24px 60px rgba(0,0,0,.45)' },
    { transform: `translate(${para.left - de.left}px, ${para.top - de.top}px) scale(${escala})`, borderRadius: `${RAIO_NA_BARRA / escala}px`, boxShadow: '0 0 0 rgba(0,0,0,0)' },
  ], { duration: DURACAO_A_FECHAR, easing: CURVA_A_FECHAR(), fill: 'both' });
  const acabar = () => { raiz.removeAttribute(A_VOAR); copia.remove(); if (cancelarAtual === cancelar) cancelarAtual = null; };
  const cancelar = () => { anim.cancel(); acabar(); };
  cancelarAtual = cancelar;
  anim.onfinish = acabar;
}
