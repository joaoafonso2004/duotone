import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { LyricsView } from '../components/LyricsView';
import { acceptsCubeSwipe } from '../lib/lyricsCubeGesture';
import { desfoqueLeve } from '../lib/capaGrande';
import { CAPA_FLUTUANTE, geometriaDaLateral, type Lateral } from '../lib/capaFlutuante3D';
import { ENTRADA, ESTADO, SOLTAR, type Mola } from '../lib/movimento';
import {
  COMPRIMENTO_DO_FIO, COMPRIMENTO_DO_LUSTRO, FORCA_DO_BRILHO, LANCAR, LIMIAR_DO_CAMINHO, LIMIAR_DO_GESTO,
  PAUSA_QUE_NAO_LANCA_MS, POSE_DO_METAL,
  anguloCurto, anguloDoArrasto, anguloDoLado, brilhoDaAresta, destinoAoLargar, grausPorSegundo, inclinacao,
  molaAssente, mostraALetra, passoDaMola, ratoNaCapa, type EstadoDaMola,
} from '../lib/capaMetal3D';
import type { LadoDaCaixa } from '../lib/ocultacao';
import type { Track } from '../types';
import { useRecorteDaCapa } from './glitch/GlitchArtwork.web';
import type { LateralDaOcultacao } from './Ocultacao.web';

/**
 * A capa em 3D do Now Playing do PC (5/11; nas Definições "3D cover" desde 7/11,
 * quando as arestas deixaram de ser metal; `pref:capaMetal3D`). **Desligada de origem** (pedido do João):
 * sem ela fica o `ArtworkLyricsCube` de sempre. A casca lê a preferência ao
 * arrancar (`getCapaMetal3D` no `RootNavigator.web.tsx`) e as Definições
 * mudam-na ao vivo, no mesmo processo -- a mesma pequena store dos dois tons.
 */
let ligada = false;
const ouvintes = new Set<() => void>();
export function definirCapaMetal(v: boolean): void {
  if (v === ligada) return;
  ligada = v;
  ouvintes.forEach((f) => f());
}
const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };
const ler = () => ligada;
export function useCapaMetal(): boolean {
  return useSyncExternalStore(assinar, ler, ler);
}

const menosMovimento = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

type Arrasto = { id: number; x: number; y: number; inicio: number; ativo: boolean; rasto: [number, number][] };
type Motor = {
  rx: EstadoDaMola; ry: EstadoDaMola; virar: EstadoDaMola;
  molaInclina: Mola; molaVirar: Mola;
  raf: number; antes: number; arrasto: Arrasto | null; rodando: boolean;
};

/** Uma sombra no chão, em lados da capa (os números da Floating 3D do iPhone). */
function sombra(s: { opacidade: number; x: number; y: number; largura: number; altura: number; rotacao?: number }, lado: number): React.CSSProperties {
  return {
    left: s.x * lado, top: s.y * lado, width: s.largura * lado, height: s.altura * lado,
    opacity: s.opacidade, transform: s.rotacao ? `rotate(${s.rotacao}deg)` : undefined,
  };
}

/**
 * As quatro laterais: cada uma roda para fora a partir do meio da caixa. Ficam
 * 0,75 px para dentro da face (o `recuoDasLaterais` do iPhone), para nenhuma
 * linha clara aparecer na emenda.
 */
function lateral(qual: 'esq' | 'dir' | 'cima' | 'baixo', lado: number, t: number): React.CSSProperties {
  const z = lado / 2 - CAPA_FLUTUANTE.recuoDasLaterais;
  if (qual === 'esq' || qual === 'dir') {
    return { width: t, height: lado, left: (lado - t) / 2, top: 0, transform: `rotateY(${qual === 'esq' ? -90 : 90}deg) translateZ(${z}px)` };
  }
  return { width: lado, height: t, top: (lado - t) / 2, left: 0, transform: `rotateX(${qual === 'cima' ? 90 : -90}deg) translateZ(${z}px)` };
}

/** O nome de cada lateral nas contas do iPhone (`geometriaDaLateral`). */
const NO_IPHONE: Record<LadoDaCaixa, Lateral> = { esq: 'esquerda', dir: 'direita', cima: 'cima', baixo: 'baixo' };
/** O véu vai da frente da lateral para trás: a frente da esquerda é o lado direito dela, e assim por diante. */
const PARA_TRAS: Record<LadoDaCaixa, string> = { esq: 'to left', dir: 'to right', cima: 'to top', baixo: 'to bottom' };

/**
 * A faixa da capa junto àquela borda, espelhada para a borda continuar pela
 * aresta (7/11, como no iPhone: as contas são as do `geometriaDaLateral`). Com o
 * mesmo recorte da face (`useRecorteDaCapa`): a maxres do YouTube traz barras, e
 * a aresta tem de continuar a capa e não as barras.
 */
function FaixaDaCapa({ uri, qual, lado, espessura }: { uri: string | null; qual: LadoDaCaixa; lado: number; espessura: number }) {
  const g = geometriaDaLateral(NO_IPHONE[qual], lado, espessura);
  const recorte = useRecorteDaCapa(uri);
  if (!uri) return null;
  const escala = recorte ? lado / recorte.lado : 0;
  const imagem: React.CSSProperties = recorte
    ? { position: 'absolute', width: recorte.largura * escala, height: recorte.altura * escala, left: -recorte.x * escala, top: -recorte.y * escala }
    : { position: 'absolute', left: 0, top: 0, width: lado, height: lado, objectFit: 'cover' };
  return (
    <div data-dt="m3-tira" style={{ transform: g.espelho === 'x' ? 'scaleX(-1)' : 'scaleY(-1)' }}>
      <div style={{ position: 'absolute', left: g.imagem.x, top: g.imagem.y, width: lado, height: lado, overflow: 'hidden' }}>
        <img src={uri} alt="" draggable={false} style={imagem} />
      </div>
    </div>
  );
}

// O brilho (7/11, `brilhoDaAresta`): um fio de 1,5 px na borda de cada face, o
// mesmo fio do lado de lá do canto (o "lábio" da lateral) e um lustro largo e
// fraco na espessura. Desenhado uma vez; o `pintar` só lhe muda a posição e a
// opacidade do ponto quente.
const FIO = 'linear-gradient(DIR, rgba(255,255,255,0), rgba(255,255,255,.5) 30%, #fff 50%, rgba(255,255,255,.5) 70%, rgba(255,255,255,0))';
const LUSTRO = 'radial-gradient(farthest-side, rgba(255,255,255,.85), rgba(255,255,255,.3) 55%, rgba(255,255,255,0))';
/** Um fio ao longo de uma borda (`vertical`: de cima a baixo). `junto` é a borda onde fica. */
function Fio({ marca, lado, face, vertical, junto, comprimento, inverter = false }: {
  marca: 'm3-fio' | 'm3-labio'; lado: LadoDaCaixa; face: 1 | -1; vertical: boolean;
  junto: 'top' | 'bottom' | 'left' | 'right'; comprimento: number; inverter?: boolean;
}) {
  const faixa: React.CSSProperties = vertical ? { top: 0, bottom: 0, width: 1.5, [junto]: 0 } : { left: 0, right: 0, height: 1.5, [junto]: 0 };
  const quente: React.CSSProperties = vertical
    ? { left: 0, right: 0, top: 0, height: comprimento, background: FIO.replace('DIR', '180deg') }
    : { top: 0, bottom: 0, left: 0, width: comprimento, background: FIO.replace('DIR', '90deg') };
  const dados = { 'data-l': lado, 'data-f': face, 'data-v': vertical ? 1 : 0, 'data-inv': inverter ? 1 : 0 };
  // As marcas por extenso: o teste das animações lê-as no código.
  return marca === 'm3-fio'
    ? <b data-dt="m3-fio" {...dados} style={faixa}><i style={quente} /></b>
    : <b data-dt="m3-labio" {...dados} style={faixa}><i style={quente} /></b>;
}
/** Os quatro fios de uma face. No verso a face está virada: a esquerda dela é a direita da caixa. */
function FiosDaFace({ face, lado }: { face: 1 | -1; lado: number }) {
  const c = lado * COMPRIMENTO_DO_FIO;
  return <>
    <Fio marca="m3-fio" lado="cima" face={face} vertical={false} junto="top" comprimento={c} inverter={face < 0} />
    <Fio marca="m3-fio" lado="baixo" face={face} vertical={false} junto="bottom" comprimento={c} inverter={face < 0} />
    <Fio marca="m3-fio" lado={face > 0 ? 'esq' : 'dir'} face={face} vertical junto="left" comprimento={c} />
    <Fio marca="m3-fio" lado={face > 0 ? 'dir' : 'esq'} face={face} vertical junto="right" comprimento={c} />
  </>;
}
/** O que vai dentro de uma lateral: a capa (e a que sai, na Ocultação), o véu, o lustro e os dois lábios. */
function DentroDaLateral({ qual, lado, espessura, capa, capaQueSai }: { qual: LadoDaCaixa; lado: number; espessura: number; capa: string | null; capaQueSai: string | null }) {
  const g = geometriaDaLateral(NO_IPHONE[qual], lado, espessura);
  const vertical = qual === 'esq' || qual === 'dir';
  // A frente de cada lateral (a borda junto à face) e a de trás (junto ao verso).
  const frente = ({ esq: 'right', dir: 'left', cima: 'bottom', baixo: 'top' } as const)[qual];
  const tras = ({ esq: 'left', dir: 'right', cima: 'top', baixo: 'bottom' } as const)[qual];
  const comprimento = lado * COMPRIMENTO_DO_LUSTRO;
  const lustro: React.CSSProperties = vertical
    ? { left: 0, right: 0, top: 0, height: comprimento, background: LUSTRO }
    : { top: 0, bottom: 0, left: 0, width: comprimento, background: LUSTRO };
  return <>
    <FaixaDaCapa uri={capa} qual={qual} lado={lado} espessura={espessura} />
    {capaQueSai ? <FaixaDaCapa uri={capaQueSai} qual={qual} lado={lado} espessura={espessura} /> : null}
    <div data-dt="m3-veu" style={{ background: `linear-gradient(${PARA_TRAS[qual]}, rgba(0,0,0,${g.veu.frente}), rgba(0,0,0,${g.veu.tras}))` }} />
    <b data-dt="m3-lustro" data-l={qual} data-v={vertical ? 1 : 0}><i style={lustro} /></b>
    <Fio marca="m3-labio" lado={qual} face={1} vertical={vertical} junto={frente} comprimento={lado * COMPRIMENTO_DO_FIO} />
    <Fio marca="m3-labio" lado={qual} face={-1} vertical={vertical} junto={tras} comprimento={lado * COMPRIMENTO_DO_FIO} />
  </>;
}

type PontoQuente = { i: HTMLElement; lado: LadoDaCaixa; face: 1 | -1; vertical: boolean; inverter: boolean; comprimento: number; ganho: number; lustro: boolean };
/** Os pontos quentes da caixa, lidos do DOM uma vez (e de novo se a caixa mudou). */
function pontosQuentes(caixa: HTMLElement, lado: number): PontoQuente[] {
  const ler = (sel: string, o: { comprimento: number; ganho: number; lustro: boolean }) =>
    [...caixa.querySelectorAll<HTMLElement>(sel)].map((b) => ({
      i: b.firstElementChild as HTMLElement, lado: b.dataset.l as LadoDaCaixa, face: (Number(b.dataset.f) < 0 ? -1 : 1) as 1 | -1,
      vertical: b.dataset.v === '1', inverter: b.dataset.inv === '1', ...o,
    }));
  return [
    ...ler('[data-dt~="m3-fio"]', { comprimento: lado * COMPRIMENTO_DO_FIO, ganho: 1.3, lustro: false }),
    ...ler('[data-dt~="m3-labio"]', { comprimento: lado * COMPRIMENTO_DO_FIO, ganho: 1.2, lustro: false }),
    ...ler('[data-dt~="m3-lustro"]', { comprimento: lado * COMPRIMENTO_DO_LUSTRO, ganho: 1.25, lustro: true }),
  ].filter((p) => p.i);
}

/**
 * As laterais da caixa onde está a `face` (7/11): a Ocultação escurece-as com o
 * disco que passa na face.
 */
export function lateraisDaCaixa(face: HTMLElement | null): LateralDaOcultacao[] {
  const caixa = face?.parentElement;
  if (!caixa) return [];
  return (['esq', 'dir', 'cima', 'baixo'] as const).flatMap((lado) => {
    const no = caixa.querySelector<HTMLElement>(`:scope > [data-dt~="m3-${lado}"]`);
    return no ? [{ lado, no }] : [];
  });
}

/**
 * A capa numa caixa, na pose da Floating 3D do iPhone. O lado onde está o rato
 * afunda (até 6°), e agarrar e arrastar roda a caixa sem limite até à letra no
 * verso. As contas estão em `lib/capaMetal3D.ts`.
 *
 * Só se mexem `transform` e opacidade, e o ciclo de animação PÁRA quando a
 * caixa assenta: parada, a capa não custa nada. As arestas são a capa, como no
 * iPhone, com um brilho que corre por elas quando a caixa inclina ou roda (7/11;
 * eram metal escovado). Com "menos movimento" nada inclina e a letra troca por
 * opacidade.
 */
export function CapaMetal3D({ track, size, artwork, front, showLyrics, onChange, capaQueSai = null, faceRef, capaDasArestas = null }: {
  track: Track;
  size: number;
  /** A miniatura, para o verso desfocado (a mesma do cubo). */
  artwork: string | null | undefined;
  /** A face da frente: o `GlitchArtwork`, como no cubo. */
  front: React.ReactNode;
  showLyrics: boolean;
  onChange: (letra: boolean) => void;
  /**
   * A Ocultação (7/11): a capa da música que saiu, por cima da face até a sombra
   * da que vem a tapar. Passa DENTRO da face, por isso roda e inclina com a caixa
   * (por cima dela, numa camada plana, ficava desencontrada).
   */
  capaQueSai?: string | null;
  /** A face da frente, onde a Ocultação passa o disco (é ela que o corta). */
  faceRef?: React.MutableRefObject<HTMLDivElement | null>;
  /** A capa das arestas: a mesma imagem da face (a grande). Sem ela, a miniatura. */
  capaDasArestas?: string | null;
}) {
  const palcoRef = useRef<HTMLDivElement | null>(null);
  const chaoRef = useRef<HTMLDivElement | null>(null);
  const caixaRef = useRef<HTMLDivElement | null>(null);
  const [reduzido] = useState(menosMovimento);
  // A rodar, as letras montam-se já (como no cubo) e ainda não aceitam toques.
  const [aRodar, setARodar] = useState(false);
  const atual = useRef({ showLyrics, onChange, size, reduzido });
  atual.current = { showLyrics, onChange, size, reduzido };
  const motor = useRef<Motor | null>(null);
  if (!motor.current) {
    const a = showLyrics ? 180 : 0;
    motor.current = {
      rx: { x: POSE_DO_METAL.rotateX, v: 0, alvo: POSE_DO_METAL.rotateX },
      ry: { x: POSE_DO_METAL.rotateY, v: 0, alvo: POSE_DO_METAL.rotateY },
      virar: { x: a, v: 0, alvo: a },
      molaInclina: ESTADO, molaVirar: ENTRADA, raf: 0, antes: 0, arrasto: null, rodando: false,
    };
  }
  const acordarRef = useRef<() => void>(() => {});
  const pintarRef = useRef<() => void>(() => {});
  const rodarRef = useRef<() => void>(() => {});

  useEffect(() => {
    const m = motor.current!;
    const palco = palcoRef.current, chao = chaoRef.current, caixa = caixaRef.current;
    if (!palco || !chao || !caixa) return undefined;

    let pontos: PontoQuente[] = [];
    let ladoDosPontos = 0;
    const pintar = () => {
      const lado = atual.current.size;
      const rotX = m.rx.x, rotY = m.ry.x;
      const volta = atual.current.reduzido ? 0 : m.virar.x;
      caixa.style.transform =
        `translate3d(${(POSE_DO_METAL.deslocacaoX * lado).toFixed(2)}px,${(POSE_DO_METAL.deslocacaoY * lado).toFixed(2)}px,0) ` +
        `rotateX(${rotX.toFixed(3)}deg) rotateY(${rotY.toFixed(3)}deg) rotateZ(${POSE_DO_METAL.rotateZ}deg) ` +
        `scale(${POSE_DO_METAL.escala}) rotateY(${volta.toFixed(3)}deg)`;
      // As sombras fogem para o lado contrário da inclinação.
      const fogeX = -(rotY - POSE_DO_METAL.rotateY) * lado * 0.004;
      const fogeY = (rotX - POSE_DO_METAL.rotateX) * lado * 0.003;
      chao.style.transform = `translate3d(${fogeX.toFixed(2)}px,${fogeY.toFixed(2)}px,0)`;
      // O brilho: o ponto quente de cada aresta corre com a pose (só transform e opacidade).
      if (!pontos.length || !pontos[0].i.isConnected || ladoDosPontos !== lado) { pontos = pontosQuentes(caixa, lado); ladoDosPontos = lado; }
      const pose = { rotateX: rotX, rotateY: rotY, rotateZ: POSE_DO_METAL.rotateZ, virar: volta };
      const contas = new Map<string, ReturnType<typeof brilhoDaAresta>>();
      for (const p of pontos) {
        const chave = `${p.lado}${p.face}`;
        let b = contas.get(chave);
        if (!b) { b = brilhoDaAresta(p.lado, p.face, pose); contas.set(chave, b); }
        const u = p.inverter ? 1 - b.u : b.u;
        const d = (u * lado - p.comprimento / 2).toFixed(1);
        p.i.style.transform = p.vertical ? `translate3d(0,${d}px,0)` : `translate3d(${d}px,0,0)`;
        p.i.style.opacity = Math.min(1, (p.lustro ? b.lateral : b.canto) * FORCA_DO_BRILHO * p.ganho).toFixed(3);
      }
    };
    const comecarARodar = () => { if (!m.rodando) { m.rodando = true; setARodar(true); } };
    const tique = (t: number) => {
      m.raf = 0;
      const dt = Math.min(0.05, Math.max(0, (t - m.antes) / 1000));
      m.antes = t;
      const passos = Math.max(1, Math.ceil(dt * 240));
      const aArrastar = !!m.arrasto?.ativo;
      for (let i = 0; i < passos; i++) {
        passoDaMola(m.rx, m.molaInclina, dt / passos);
        passoDaMola(m.ry, m.molaInclina, dt / passos);
        if (!aArrastar) passoDaMola(m.virar, m.molaVirar, dt / passos);
      }
      if (molaAssente(m.rx) && molaAssente(m.ry) && (aArrastar || molaAssente(m.virar))) {
        m.rx.x = m.rx.alvo; m.rx.v = 0;
        m.ry.x = m.ry.alvo; m.ry.v = 0;
        if (!aArrastar) {
          // As voltas inteiras esquecem-se: 900° é a letra, como 180°.
          m.virar.x = m.virar.alvo = anguloCurto(m.virar.x); m.virar.v = 0;
          if (m.rodando) { m.rodando = false; setARodar(false); }
        }
        pintar();
        return; // assente: nada corre até o rato ou um gesto a acordarem
      }
      pintar();
      m.raf = requestAnimationFrame(tique);
    };
    const acordar = () => {
      if (m.raf || document.hidden) return;
      m.antes = performance.now();
      m.raf = requestAnimationFrame(tique);
    };
    acordarRef.current = acordar;
    pintarRef.current = pintar;
    rodarRef.current = comecarARodar;

    // O rato: o lado onde ele está afunda. Um ouvinte passivo no documento,
    // que só escreve quando o rato está perto da capa ou acabou de sair.
    const seguirORato = (x: number, y: number) => {
      if (atual.current.reduzido) return;
      const r = palco.getBoundingClientRect();
      const rato = ratoNaCapa(x, y, { x: r.left + r.width / 2, y: r.top + r.height / 2 }, atual.current.size);
      if (!rato && m.rx.alvo === POSE_DO_METAL.rotateX && m.ry.alvo === POSE_DO_METAL.rotateY) return;
      const alvo = inclinacao(rato);
      m.molaInclina = rato ? ESTADO : SOLTAR;
      m.rx.alvo = alvo.rotateX;
      m.ry.alvo = alvo.rotateY;
      acordar();
    };
    // Durante o arrasto a inclinação fica onde estava: a volta lê-se melhor.
    const aoMoverORato = (e: PointerEvent) => { if (!m.arrasto?.ativo) seguirORato(e.clientX, e.clientY); };
    const voltarAPose = () => {
      if (m.rx.alvo === POSE_DO_METAL.rotateX && m.ry.alvo === POSE_DO_METAL.rotateY) return;
      m.molaInclina = SOLTAR;
      m.rx.alvo = POSE_DO_METAL.rotateX;
      m.ry.alvo = POSE_DO_METAL.rotateY;
      acordar();
    };

    // Agarrar e arrastar roda a caixa. Os listeners vão em captura, como no
    // cubo: um arrasto lateral é da capa, e não do ScrollView das letras.
    const aoPremir = (e: PointerEvent) => {
      if (e.button !== 0) return;
      m.arrasto = { id: e.pointerId, x: e.clientX, y: e.clientY, inicio: m.virar.x, ativo: false, rasto: [[performance.now(), e.clientX]] };
    };
    const aoArrastar = (e: PointerEvent) => {
      const a = m.arrasto;
      if (!a || a.id !== e.pointerId) return;
      const dx = e.clientX - a.x, dy = e.clientY - a.y;
      if (!a.ativo) {
        if (!acceptsCubeSwipe(dx, dy)) return;
        a.ativo = true;
        a.inicio = m.virar.x; // o que a mola estava a fazer pára: quem manda agora é o rato
        caixa.setPointerCapture?.(e.pointerId);
        caixa.style.cursor = 'grabbing';
        comecarARodar();
      }
      e.preventDefault();
      e.stopPropagation();
      a.rasto.push([performance.now(), e.clientX]);
      if (a.rasto.length > 6) a.rasto.shift();
      if (atual.current.reduzido) return;
      m.virar.x = m.virar.alvo = anguloDoArrasto(a.inicio, dx, atual.current.size);
      m.virar.v = 0;
      pintar();
    };
    const aoLargar = (e: PointerEvent) => {
      const a = m.arrasto;
      if (!a || a.id !== e.pointerId) return;
      m.arrasto = null;
      caixa.style.cursor = '';
      if (!a.ativo) return;
      e.preventDefault();
      e.stopPropagation();
      // A inclinação volta a seguir o rato, de onde ele foi largado.
      seguirORato(e.clientX, e.clientY);
      const [t0, x0] = a.rasto[0];
      const [t1, x1] = a.rasto[a.rasto.length - 1];
      const vx = (x1 - x0) / Math.max(1, t1 - t0);
      const msParada = performance.now() - t1;
      const { size: lado, reduzido: calmo, showLyrics: letra, onChange: mudar } = atual.current;
      if (calmo) {
        const lancou = msParada <= PAUSA_QUE_NAO_LANCA_MS && Math.abs(vx) > LIMIAR_DO_GESTO;
        if (Math.abs(e.clientX - a.x) / lado > LIMIAR_DO_CAMINHO || lancou) mudar(!letra);
        acordar();
        return;
      }
      const sentido = Math.sign(x1 - x0) || Math.sign(m.virar.x - a.inicio) || 1;
      const destino = destinoAoLargar({ angulo: m.virar.x, vxPxMs: vx, msParada, sentido, lado });
      m.virar.alvo = destino;
      // A mola acaba a volta à velocidade do gesto (parado antes de largar: zero).
      m.virar.v = msParada > PAUSA_QUE_NAO_LANCA_MS ? 0 : grausPorSegundo(vx, lado);
      m.molaVirar = Math.abs(destino - m.virar.x) > 190 ? LANCAR : ENTRADA;
      const naLetra = mostraALetra(destino);
      if (naLetra !== letra) mudar(naLetra);
      acordar();
    };
    const aoCancelar = (e: PointerEvent) => {
      const a = m.arrasto;
      if (!a || a.id !== e.pointerId) return;
      m.arrasto = null;
      caixa.style.cursor = '';
      if (!a.ativo) return;
      seguirORato(e.clientX, e.clientY);
      m.virar.alvo = anguloDoLado(m.virar.x, atual.current.showLyrics);
      m.molaVirar = ENTRADA;
      acordar();
    };
    const aoVoltarAJanela = () => { if (!document.hidden) acordar(); };
    // Uma imagem dentro da caixa (a capa da face) começava o "arrastar imagem"
    // do browser, que cancela o ponteiro: o arrasto nunca chegava a rodar.
    const semArrastoNativo = (e: DragEvent) => e.preventDefault();

    document.addEventListener('pointermove', aoMoverORato, { passive: true });
    document.documentElement.addEventListener('pointerleave', voltarAPose);
    caixa.addEventListener('pointerdown', aoPremir, true);
    caixa.addEventListener('pointermove', aoArrastar, true);
    caixa.addEventListener('pointerup', aoLargar, true);
    caixa.addEventListener('pointercancel', aoCancelar, true);
    caixa.addEventListener('dragstart', semArrastoNativo, true);
    document.addEventListener('visibilitychange', aoVoltarAJanela);
    pintar();
    return () => {
      if (m.raf) cancelAnimationFrame(m.raf);
      m.raf = 0;
      document.removeEventListener('pointermove', aoMoverORato);
      document.documentElement.removeEventListener('pointerleave', voltarAPose);
      caixa.removeEventListener('pointerdown', aoPremir, true);
      caixa.removeEventListener('pointermove', aoArrastar, true);
      caixa.removeEventListener('pointerup', aoLargar, true);
      caixa.removeEventListener('pointercancel', aoCancelar, true);
      caixa.removeEventListener('dragstart', semArrastoNativo, true);
      document.removeEventListener('visibilitychange', aoVoltarAJanela);
    };
  }, []);

  // O lado mudou por outra porta (os pontos, o teclado): roda até lá. Quando foi
  // o gesto a decidir, o alvo já é desse lado e não há nada a fazer.
  useEffect(() => {
    const m = motor.current!;
    if (m.arrasto?.ativo || mostraALetra(m.virar.alvo) === showLyrics) return;
    if (!reduzido) {
      m.virar.alvo = anguloDoLado(m.virar.x, showLyrics);
      m.molaVirar = ENTRADA;
      rodarRef.current();
    }
    acordarRef.current();
  }, [showLyrics, reduzido]);
  // A pose é em lados da capa: o tamanho muda com a janela.
  useEffect(() => { pintarRef.current(); }, [size]);

  const t = size * POSE_DO_METAL.espessura;
  const meio = t / 2;
  const verso = desfoqueLeve(artwork, 28);
  const letras = showLyrics || aRodar;
  const laterais = { lado: size, espessura: t, capa: capaDasArestas ?? artwork ?? null, capaQueSai };
  return (
    <div data-dt="m3-palco" ref={palcoRef} style={{ width: size, height: size, perspective: `${Math.round(size * POSE_DO_METAL.perspectiva)}px` }}>
      <div data-dt="m3-chao" ref={chaoRef} aria-hidden="true" style={{ width: size, height: size }}>
        <div data-dt="m3-sombra" style={sombra(CAPA_FLUTUANTE.sombraAmbiente, size)} />
        <div data-dt="m3-sombra" style={sombra(CAPA_FLUTUANTE.sombraDeContacto, size)} />
      </div>
      <div data-dt="m3-caixa" ref={caixaRef} role="group" tabIndex={0}
        aria-label={showLyrics ? 'Lyrics' : 'Album artwork'}
        aria-roledescription="Drag sideways to turn"
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (['ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(e.key)) { e.preventDefault(); onChange(!showLyrics); }
          else if (e.key === 'Escape' && showLyrics) { e.preventDefault(); onChange(false); }
        }}
        style={{ width: size, height: size }}>
        <div data-dt="m3-face" aria-hidden={showLyrics} ref={faceRef}
          style={{ transform: reduzido ? undefined : `translateZ(${meio}px)`, opacity: reduzido && showLyrics ? 0 : 1 }}>
          {front}
          {/* Um <img> a sério, como na capa plana: a <Image> do RNW só desenha depois de recarregar. */}
          {capaQueSai ? <img data-dt="capa-sai" src={capaQueSai} alt=""
            style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 2 }} /> : null}
          <FiosDaFace face={1} lado={size} />
        </div>
        <div data-dt="m3-face" aria-hidden={!showLyrics}
          style={{
            transform: reduzido ? `translateZ(${meio + 1}px)` : `rotateY(180deg) translateZ(${meio}px)`,
            opacity: reduzido && !showLyrics ? 0 : 1,
            pointerEvents: showLyrics && !aRodar ? 'auto' : 'none',
          }}>
          {verso ? <img data-dt="m3-verso-capa" src={verso.uri} alt="" style={{ filter: `blur(${verso.raio}px)` }} /> : null}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,8,15,0.5)' }]} />
          {letras ? (
            <View style={StyleSheet.absoluteFill}>
              <LyricsView key={`${track.source}:${track.sourceId}`} track={track} visible={showLyrics && !aRodar} />
            </View>
          ) : null}
          <FiosDaFace face={-1} lado={size} />
        </div>
        <div data-dt="m3-lado m3-esq" style={lateral('esq', size, t)}><DentroDaLateral qual="esq" {...laterais} /></div>
        <div data-dt="m3-lado m3-dir" style={lateral('dir', size, t)}><DentroDaLateral qual="dir" {...laterais} /></div>
        <div data-dt="m3-lado m3-cima" style={lateral('cima', size, t)}><DentroDaLateral qual="cima" {...laterais} /></div>
        <div data-dt="m3-lado m3-baixo" style={lateral('baixo', size, t)}><DentroDaLateral qual="baixo" {...laterais} /></div>
      </div>
    </div>
  );
}
