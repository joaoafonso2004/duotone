import { curvaDoPc } from '../lib/molasEmCss';
import { caixaPlana, voltaDaCaixa } from '../lib/capaMetal3D';
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
 * A caixa passa de plana a 3D a meio do voo (24/11, a maquete "Capa a voar 2D↔3D"; o
 * João: "a meio do caminho deve converter-se gradualmente em 2d, e o mesmo para quando
 * está a abrir mas para 3d"). Na barra é a miniatura, plana e com os cantos dela; a abrir
 * ganha a inclinação, as arestas e a sombra entre 12 % e 72 % do caminho, e a fechar
 * perde-as até meio (`caixaAVoar`).
 *
 * A página do leitor mede a área ao montar, antes do primeiro desenho
 * (NowPlayingPage.web.tsx), e a cópia ainda espera que a caixa fique igual dois
 * fotogramas seguidos. Se a capa verdadeira mudar de sítio a meio do voo, a cópia acerta
 * o passo antes de pousar: a troca só se faz com as duas iguais (o João: "não deve haver
 * piscadas da capa 3D quando chega à posição"). Sem capa à vista (o Cinema, a letra
 * grande) não voa nada.
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
/** A abrir, a caixa ganha a pose entre estes dois pontos do voo (em fração do tempo). */
const CAIXA_A_ABRIR = { de: 0.12, ate: 0.72 } as const;
/** A fechar, perde-a até meio do caminho e faz a outra metade plana. */
const CAIXA_A_FECHAR = { de: 0, ate: 0.5 } as const;
/** O canto da face: o da miniatura da barra no primeiro quarto do voo a abrir; a fechar, na metade plana. */
const CANTO_A_ABRIR = 0.25;
/** Entre plana e 3D, devagar nas pontas (o `suave` da maquete). */
const SUAVE = 'cubic-bezier(.45, 0, .55, 1)';
/** O acerto, se a capa verdadeira mudou de sítio a meio do voo (a janela a mudar de tamanho). */
const DURACAO_DO_ACERTO = 160;
const MAX_ACERTOS = 2;

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
    // O canvas do efeito é WebGL e, no modo reativo, não guarda o quadro
    // (`preserveDrawingBuffer` desligado): lido fora do desenho vem PRETO, e tapava a
    // capa a voar nos dois sentidos (23/11, o João: "a capa vem preta e só depois
    // aparece"). Sai da cópia: por baixo dele está a imagem da capa, que é o que o
    // efeito mostra em repouso. As arestas vivas são 2D e guardam o quadro.
    if (!original || original.matches('[data-efeito="webgl"]')) { tela.remove(); return; }
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

/** Os quadros de uma passagem de `a` para `b` entre as frações `de` e `ate` do voo, parada antes e depois. */
function passagem(a: Keyframe, b: Keyframe, de: number, ate: number): Keyframe[] {
  const quadros: Keyframe[] = [];
  if (de > 0) quadros.push({ ...a, offset: 0 });
  quadros.push({ ...a, offset: de, easing: SUAVE }, { ...b, offset: ate });
  if (ate < 1) quadros.push({ ...b, offset: 1 });
  return quadros;
}

/**
 * Dentro da cópia, a caixa da "3D cover" passa de plana a 3D (a abrir) ou de 3D a plana
 * (a fechar) enquanto voa: a inclinação (a mesma lista de funções, `caixaPlana`), a sombra
 * no chão e o canto da face, de `raioNaBarra` (o da miniatura, nas medidas da cópia) ao da
 * caixa. Corre ao mesmo tempo que o voo, com o tempo direito (o voo é que tem a curva).
 * Sem a caixa (o cubo plano) não há nada a fazer.
 */
function caixaAVoar(copia: HTMLElement, sentido: 'abrir' | 'fechar', duracao: number, raioNaBarra: number): Animation[] {
  const caixa = copia.querySelector<HTMLElement>('[data-dt~="m3-caixa"]');
  const pose = caixa?.style.transform;
  if (!caixa || !pose) return [];
  const abrir = sentido === 'abrir';
  const { de, ate } = abrir ? CAIXA_A_ABRIR : CAIXA_A_FECHAR;
  const tempo: KeyframeAnimationOptions = { duration: duracao, easing: 'linear', fill: 'both' };
  const plana: Keyframe = { transform: caixaPlana(voltaDaCaixa(pose)) };
  const emPose: Keyframe = { transform: pose };
  const sem: Keyframe = { opacity: 0 };
  const com: Keyframe = { opacity: 1 };
  const anims = [caixa.animate(abrir ? passagem(plana, emPose, de, ate) : passagem(emPose, plana, de, ate), tempo)];
  copia.querySelectorAll<HTMLElement>('[data-dt~="m3-chao"]').forEach((chao) => {
    anims.push(chao.animate(abrir ? passagem(sem, com, de, ate) : passagem(com, sem, de, ate), tempo));
  });
  copia.querySelectorAll<HTMLElement>('[data-dt~="m3-face"]').forEach((face) => {
    const naBarra: Keyframe = { borderRadius: `${raioNaBarra.toFixed(2)}px` };
    const naCaixa: Keyframe = { borderRadius: getComputedStyle(face).borderTopLeftRadius || '0px' };
    anims.push(face.animate(abrir ? passagem(naBarra, naCaixa, 0, CANTO_A_ABRIR) : passagem(naCaixa, naBarra, ate, 1), tempo));
  });
  return anims;
}

/** O canto da miniatura da barra (`CapaDaBarra`) nas medidas da cópia, que ali está encolhida. */
const raioDaBarraNaCopia = (copia: DOMRect, barra: DOMRect): number => RAIO.ctrl * (copia.width / barra.width);

/** Abrir o Now Playing: a capa sai da barra plana e cresce até ao sítio, a ganhar a pose da caixa. */
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
  let dentro: Animation[] = [];
  const acabar = () => { raiz.removeAttribute(A_VOAR); copia?.remove(); copia = null; if (cancelarAtual === cancelar) cancelarAtual = null; };
  const cancelar = () => { cancelado = true; cancelAnimationFrame(quadro); anim?.cancel(); dentro.forEach((a) => a.cancel()); acabar(); };
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
    dentro = caixaAVoar(copia, 'abrir', DURACAO_A_ABRIR, raioDaBarraNaCopia(alvo.r, de));
    anim.onfinish = () => chegar(alvo.r, alvo.r, 0);
  };
  // A capa verdadeira pode já não estar onde estava ao partir (a janela mudou de tamanho
  // a meio do voo): a cópia vai lá ter primeiro. `base` é onde a cópia foi posta.
  const chegar = (base: DOMRect, onde: DOMRect, acertos: number) => {
    if (cancelado || !copia) return;
    const agora = caixaDe(ID_DA_CAPA_NO_LEITOR);
    if (agora && !iguais(agora.r, onde) && acertos < MAX_ACERTOS) {
      anim = copia.animate([{ transform: deslocarAte(onde, base) }, { transform: deslocarAte(agora.r, base) }],
        { duration: DURACAO_DO_ACERTO, easing: CURVA_A_FECHAR(), fill: 'both' });
      anim.onfinish = () => chegar(base, agora.r, acertos + 1);
      return;
    }
    pousar(agora?.el);
  };
  // A troca. A capa verdadeira aparece por baixo, igual, e a cópia apaga-se por cima dela.
  // Antes disso a caixa da cópia fica na pose que a verdadeira tem AGORA (o rato pode
  // tê-la inclinado), e a sombra da cópia sai já: duas sombras meio transparentes uma por
  // cima da outra escureciam o chão durante a troca, e via-se piscar.
  const pousar = (capa: HTMLElement | undefined) => {
    if (!copia) return;
    dentro.forEach((a) => a.cancel());
    dentro = [];
    const daCopia = copia.querySelector<HTMLElement>('[data-dt~="m3-caixa"]');
    const verdadeira = capa?.querySelector<HTMLElement>('[data-dt~="m3-caixa"]');
    if (daCopia && verdadeira?.style.transform) daCopia.style.transform = verdadeira.style.transform;
    copia.querySelectorAll('[data-dt~="m3-chao"]').forEach((chao) => chao.remove());
    raiz.removeAttribute(A_VOAR);
    const fim = copia.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DURACAO_A_POUSAR, fill: 'both' });
    fim.onfinish = acabar;
  };
  quadro = requestAnimationFrame(esperar);
}

/** Fechar o Now Playing: a capa volta para a barra e achata-se até meio, enquanto o leitor se apaga. */
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
  const dentro = caixaAVoar(copia, 'fechar', DURACAO_A_FECHAR, raioDaBarraNaCopia(noLeitor.r, naBarra.r));
  let fim: Animation | null = null;
  const acabar = () => { raiz.removeAttribute(A_VOAR); copia.remove(); if (cancelarAtual === cancelar) cancelarAtual = null; };
  const cancelar = () => { anim.cancel(); dentro.forEach((a) => a.cancel()); fim?.cancel(); acabar(); };
  cancelarAtual = cancelar;
  // Na barra, apaga-se por cima da capa dela.
  anim.onfinish = () => {
    fim = copia.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DURACAO_A_POUSAR, fill: 'both' });
    fim.onfinish = acabar;
  };
}
