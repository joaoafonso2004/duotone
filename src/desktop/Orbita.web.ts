/**
 * A Órbita no PC (C4, 31/10): a capa da linha vira disco e voa em arco para
 * onde a música foi -- a seta da fila na barra de título (ou o separador
 * "Queue" com o painel aberto), a capa da barra do leitor (a seguir), ou as
 * Liked Songs da lateral -- e no destino acende um anel. As decisões (tempos,
 * arco, frases) vivem no `lib/orbita.ts`; as curvas são as molas (S1).
 *
 * É DOM à mão e Web Animations, como o arrastar: três camadas encaixadas (o X
 * anda a direito, o Y sobe e desce, o disco muda de tamanho), só transform e
 * opacidade, e tudo sai do documento quando o voo acaba.
 *
 * De onde parte: o último sítio onde se carregou (a capa da linha, ou o ponto
 * do rato), guardado na fase de captura por `ouvirOrigemDaOrbita`. Pelo
 * teclado, a linha com o foco.
 */
import { curvaDoPc } from '../lib/molasEmCss';
import { ANEL_MS, centro, DISCO, vooEmArco, type DestinoDaOrbita, type Retangulo } from '../lib/orbita';

const LINHA = '[data-dt~="fila"], [data-dt~="cartao"]';
/** Um gesto mais velho do que isto já não é a origem desta ação. */
const ORIGEM_VALE_MS = 15000;
const POR_CIMA = '2147483000';

let origem: { r: Retangulo; em: number } | null = null;

const retanguloDe = (el: Element): Retangulo => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
};
const aVista = (el: Element | null): el is HTMLElement => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};
const capaDaLinha = (el: Element | null | undefined): Element | null => {
  const linha = el?.closest?.(LINHA);
  if (!linha) return null;
  const capa = linha.querySelector('img');
  return aVista(capa) ? capa : aVista(linha) ? linha : null;
};

/** Guarda de onde partiu o último gesto. Liga-se uma vez, na raiz. */
export function ouvirOrigemDaOrbita(): () => void {
  const aoPremir = (e: PointerEvent) => {
    const capa = capaDaLinha(e.target as Element | null);
    origem = { r: capa ? retanguloDe(capa) : { x: e.clientX - 1, y: e.clientY - 1, width: 2, height: 2 }, em: Date.now() };
  };
  window.addEventListener('pointerdown', aoPremir, true);
  return () => window.removeEventListener('pointerdown', aoPremir, true);
}

function origemAgora(): Retangulo | null {
  if (origem && Date.now() - origem.em < ORIGEM_VALE_MS) return origem.r;
  const capa = capaDaLinha(document.activeElement);
  return capa ? retanguloDe(capa) : null;
}

function destinoDe(d: DestinoDaOrbita): HTMLElement | null {
  const q = (s: string) => document.querySelector(s);
  const candidatos = d === 'fila'
    ? [q('#seta-do-painel-do-leitor'), q('#aba-do-leitor-fila'), q('#alvo-seguinte')]
    : d === 'seguinte' ? [q('#alvo-seguinte')] : [q('[data-dt~="nav-songs"]')];
  return candidatos.find(aVista) ?? null;
}

const menosMovimento = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

function camada(estilo: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const el = document.createElement('div');
  Object.assign(el.style, estilo);
  return el;
}

/** O anel que acende no destino (com menos movimento, só a opacidade). */
export function acender(el: HTMLElement): void {
  const r = el.getBoundingClientRect();
  const lado = Math.max(r.width, r.height) + 10;
  const anel = camada({
    position: 'fixed', left: `${r.left + r.width / 2 - lado / 2}px`, top: `${r.top + r.height / 2 - lado / 2}px`,
    width: `${lado}px`, height: `${lado}px`, borderRadius: '50%', border: '1.5px solid #E9EAEE',
    pointerEvents: 'none', zIndex: POR_CIMA, opacity: '0',
  });
  document.body.appendChild(anel);
  const quadros = menosMovimento()
    ? [{ opacity: 0 }, { opacity: 0.6 }, { opacity: 0 }]
    : [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 0.6, transform: 'scale(1.05)', offset: 0.35 }, { opacity: 0, transform: 'scale(1.25)' }];
  const a = anel.animate(quadros, { duration: ANEL_MS, easing: 'linear' });
  a.onfinish = a.oncancel = () => anel.remove();
  // Com a janela escondida o Chromium não dá o `finish`: o relógio tira-o à hora.
  setTimeout(() => anel.remove(), ANEL_MS + 100);
}

/**
 * A capa voa para `destino`. Devolve `false` quando não houve voo (menos
 * movimento, ou sem origem à vista): quem chamou diz então a frase
 * (`fraseDaOrbita`). Sem destino à vista também devolve `false`.
 */
export function orbitar(destino: DestinoDaOrbita, capaUrl?: string | null): boolean {
  const para = destinoDe(destino);
  if (!para) return false;
  const de = origemAgora();
  origem = null;
  if (menosMovimento() || !de) { acender(para); return false; }
  const v = vooEmArco(de, retanguloDe(para), destino);
  const c = centro(de);
  const x = camada({ position: 'fixed', left: `${c.x - DISCO / 2}px`, top: `${c.y - DISCO / 2}px`, width: `${DISCO}px`, height: `${DISCO}px`, pointerEvents: 'none', zIndex: POR_CIMA });
  const y = camada({ width: '100%', height: '100%' });
  const disco = camada({
    width: '100%', height: '100%', borderRadius: '50%', backgroundColor: '#34363E', boxShadow: '0 6px 18px rgba(0,0,0,.5)',
    ...(capaUrl ? { backgroundImage: `url("${capaUrl.replace(/"/g, '%22')}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
  });
  y.appendChild(disco); x.appendChild(y); document.body.appendChild(x);
  // O x a direito e o y na parábola do lançamento (lib/orbita.ts): sobe a abrandar e cai a acelerar.
  const ax = x.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${v.dx}px)` }], { duration: v.duracao, easing: 'linear', fill: 'forwards' });
  y.animate(v.arco.map((p) => ({ transform: `translateY(${p.y}px)`, offset: p.t })), { duration: v.duracao, easing: 'linear', fill: 'forwards' });
  disco.animate([{ transform: 'scale(1)' }, { transform: `scale(${v.escalaFinal})` }], { duration: v.duracao, easing: curvaDoPc('entrada'), fill: 'forwards' });
  const fim = () => { x.remove(); acender(para); };
  ax.onfinish = fim;
  ax.oncancel = () => x.remove();
  return true;
}
