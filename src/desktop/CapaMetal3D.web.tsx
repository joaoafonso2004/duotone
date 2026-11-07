import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { LyricsView } from '../components/LyricsView';
import { acceptsCubeSwipe } from '../lib/lyricsCubeGesture';
import { desfoqueLeve } from '../lib/capaGrande';
import { CAPA_FLUTUANTE } from '../lib/capaFlutuante3D';
import { ENTRADA, ESTADO, SOLTAR, type Mola } from '../lib/movimento';
import {
  LANCAR, LIMIAR_DO_CAMINHO, LIMIAR_DO_GESTO, PAUSA_QUE_NAO_LANCA_MS, POSE_DO_METAL,
  anguloCurto, anguloDoArrasto, anguloDoLado, destinoAoLargar, grausPorSegundo, inclinacao,
  molaAssente, mostraALetra, passoDaMola, ratoNaCapa, type EstadoDaMola,
} from '../lib/capaMetal3D';
import type { Track } from '../types';
import type { LateralDaOcultacao } from './Ocultacao.web';

/**
 * A capa de metal em 3D do Now Playing do PC (5/11, "3D metal cover" nas
 * Definições, `pref:capaMetal3D`). **Desligada de origem** (pedido do João):
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
 * A capa numa caixa de metal, na pose da Floating 3D do iPhone. O lado onde
 * está o rato afunda (até 6°), e agarrar e arrastar roda a caixa sem limite
 * até à letra no verso. As contas estão em `lib/capaMetal3D.ts`.
 *
 * Só se mexem `transform` e opacidade, e o ciclo de animação PÁRA quando a
 * caixa assenta: parada, a capa não custa nada. As arestas são metal escovado
 * desenhado pelo CSS da casca (`m3-*`), sem reflexos (o João tirou-os na
 * maquete). Com "menos movimento" nada inclina e a letra troca por opacidade.
 */
export function CapaMetal3D({ track, size, artwork, front, showLyrics, onChange, capaQueSai = null, faceRef }: {
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
        </div>
        <div data-dt="m3-lado m3-esq" style={lateral('esq', size, t)} />
        <div data-dt="m3-lado m3-dir" style={lateral('dir', size, t)} />
        <div data-dt="m3-lado m3-cima" style={lateral('cima', size, t)} />
        <div data-dt="m3-lado m3-baixo" style={lateral('baixo', size, t)} />
      </div>
    </div>
  );
}
