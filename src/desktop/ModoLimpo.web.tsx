import { Saida, useASair } from './Saida.web';
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { create } from 'zustand';
import { INACTIVIDADE_MS, disposicaoDoModoLimpo, progressoDaFaixa } from '../lib/modoLimpo';
import { AMBIENTE, passouPorCima, podeEntrar, valePerguntar, type Ponto } from '../lib/ecraAmbiente';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { usePlayer } from '../state/player';
import { useShallow } from 'zustand/react/shallow';
import { comCatalogo, useCatalogoDeFaixas } from '../state/catalogoDeFaixas';
import { ensureLyrics, lyricsCacheKey, useLyrics } from '../state/lyrics';
import {
  getEcraAmbiente, getEffectIntensity, getGlitchMode, type EffectIntensity, type GlitchMode,
} from '../lib/prefs';
import { sentidoDaOcultacao } from '../lib/ocultacao';
import { LyricsView } from '../components/LyricsView';
import { GlitchArtwork } from './glitch/GlitchArtwork.web';
import { useCapaGrande } from './useCapaGrande.web';
import { useCapaQueSai } from './Ocultacao.web';
import { FundoDaCapa } from './FundoDaCapa.web';
import { rodarReflexo } from './DiscoDeMetal.web';
import { IconePlayPause } from './IconesDeEstado.web';
import { COR, FONT } from './tokens.web';
import { formatTime, marcar, useProcurarAoLargar } from './ui.web';
import { valorDaProcura } from '../lib/acessibilidadeDoPc';

const V = View as any;

/**
 * Modo limpo: a app inteira sai do caminho e fica a capa, a letra, a barra e o logo.
 *
 * Para o segundo monitor. A app tem barra de título, barra lateral, barra do
 * leitor e fila -- tudo útil no monitor onde se trabalha, e tudo ruído no
 * monitor que está lá só a tocar música.
 *
 * ## A capa ao som e a letra ao lado (25/11)
 *
 * Até aqui este ecrã era estático de propósito. O João pediu o contrário
 * (`ecra-inteiro-maquete.html`, a disposição A e a troca Eclipse): a capa reage ao
 * som como no Now Playing (o mesmo `GlitchArtwork`, com o efeito e a força das
 * Definições -- "Off" deixa-a parada), a letra corre à direita com a linha que se
 * canta acesa, e a troca de música é o Eclipse, a Ocultação maior e com uma orla de
 * luz. O fundo é a capa desfocada, que troca quando o disco a tapa. Uma música sem
 * letra leva a capa ao centro, do mesmo tamanho (`disposicaoDoModoLimpo`).
 *
 * ## O que só aparece quando faz falta
 *
 * Com o rato parado ficam a capa, o nome, a letra, a barra e o logo -- e o cursor
 * desaparece. Ao mexer, entram os controlos e a saída. Os blocos têm altura FIXA e
 * o que muda é a opacidade: aparecer não pode empurrar a capa.
 *
 * ## O ecrã ambiente (25/11)
 *
 * Com a música a tocar e a app sozinha um minuto, o modo limpo entra sozinho e a
 * janela passa a ecrã inteiro (`lib/ecraAmbiente.ts` decide, a casca põe o ecrã
 * inteiro sem roubar o foco: `desktop/src/ambiente.rs`). Passar o rato por cima
 * volta ao normal. Primeiro o modo limpo aparece por cima da app, na janela; o
 * conteúdo apaga-se enquanto a janela cresce e volta já no tamanho novo.
 */
export const useModoLimpo = create<{
  aberto: boolean;
  /** Entrou sozinho (o ecrã ambiente): sai ao passar o rato, e não tira o mini da frente. */
  automatico: boolean;
  /** A janela está a mudar de tamanho: o conteúdo apaga-se para não se ver a saltar. */
  aMudar: boolean;
}>(() => ({ aberto: false, automatico: false, aMudar: false }));

function pedirEcraInteiro(): void {
  const el = document.documentElement as any;
  const pedir = el.requestFullscreen ?? el.webkitRequestFullscreen;
  // Falhar não é erro: sem ecrã inteiro o modo limpo cobre a janela toda na
  // mesma, que é o essencial. O browser recusa fora de um gesto do utilizador.
  try { void pedir?.call(el)?.catch?.(() => {}); } catch { /* fica em janela */ }
}

function largarEcraInteiro(): void {
  const d = document as any;
  if (!d.fullscreenElement && !d.webkitFullscreenElement) return;
  try { void (d.exitFullscreen ?? d.webkitExitFullscreen)?.call(d)?.catch?.(() => {}); } catch { /* nada */ }
}

export function abrirModoLimpo(): void {
  if (useModoLimpo.getState().aberto) return;
  pedirEcraInteiro();
  useModoLimpo.setState({ aberto: true, automatico: false, aMudar: false });
}

export function fecharModoLimpo(): void {
  const s = useModoLimpo.getState();
  if (!s.aberto) return;
  if (s.automatico) { void sairDoAmbiente(); return; }
  largarEcraInteiro();
  useModoLimpo.setState({ aberto: false });
}

export function alternarModoLimpo(): void {
  if (useModoLimpo.getState().aberto) fecharModoLimpo();
  else abrirModoLimpo();
}

// --- O ecrã ambiente ---------------------------------------------------------

const esperar = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });
/** Cada entrada e saída tem a sua vez: uma saída a meio da entrada acaba-a. */
let vez = 0;

async function entrarNoAmbiente(): Promise<void> {
  const ponte = window.duotoneDesktop;
  if (!ponte?.ecraAmbiente || useModoLimpo.getState().aberto) return;
  const esta = ++vez;
  // 1. O modo limpo aparece por cima da app, ainda na janela.
  useModoLimpo.setState({ aberto: true, automatico: true, aMudar: false });
  await esperar(AMBIENTE.apagarMs);
  if (esta !== vez) return;
  // 2. O conteúdo apaga-se, a janela cresce, e volta já no tamanho novo.
  useModoLimpo.setState({ aMudar: true });
  await esperar(AMBIENTE.mudarMs);
  if (esta !== vez) return;
  try { await ponte.ecraAmbiente(true); } catch { /* fica na janela: o modo limpo cobre-a na mesma */ }
  await esperar(AMBIENTE.mudarMs);
  if (esta !== vez) return;
  useModoLimpo.setState({ aMudar: false });
}

async function sairDoAmbiente(): Promise<void> {
  const s = useModoLimpo.getState();
  if (!s.aberto || !s.automatico) return;
  const esta = ++vez;
  // A janela volta ao tamanho dela com o modo limpo ainda por cima (a app não se vê a
  // encolher), e só depois ele se apaga.
  useModoLimpo.setState({ aMudar: true });
  await esperar(AMBIENTE.mudarMs * 0.75);
  try { await window.duotoneDesktop?.ecraAmbiente?.(false); } catch { /* já não estava */ }
  await esperar(40);
  if (esta !== vez) return;
  useModoLimpo.setState({ aberto: false, automatico: false, aMudar: false });
}

/** Alguém a meio de algo: um diálogo, um menu, uma caixa de texto com o foco. */
function appOcupada(): boolean {
  const a = document.activeElement as HTMLElement | null;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return true;
  return !!document.querySelector('[data-dt~="dialogo"], [role="dialog"], [role="menu"], [aria-modal="true"]');
}

/**
 * Quando entrar sozinho. Custo: nada na rede; um pedido local à casca a cada 5 s,
 * e só com a música a tocar e a app sem lhe mexerem há um minuto.
 */
function useEcraAmbiente(): void {
  const [ligado, setLigado] = useState(false);
  useEffect(() => {
    const ponte = window.duotoneDesktop;
    if (!ponte?.ecraAmbiente || !ponte.estadoDoAmbiente) return undefined;
    // Uma recarga a meio não deixa a janela presa em ecrã inteiro (só tira se estava).
    void ponte.ecraAmbiente(false).catch(() => {});
    let vivo = true;
    void getEcraAmbiente().then((v) => { if (vivo) setLigado(v); });
    const ouvir = (e: Event) => setLigado((e as CustomEvent).detail === true);
    window.addEventListener('duotone:ecra-ambiente', ouvir);
    return () => { vivo = false; window.removeEventListener('duotone:ecra-ambiente', ouvir); };
  }, []);

  useEffect(() => {
    if (!ligado) return undefined;
    let ultimo = Date.now();
    const tocou = () => { ultimo = Date.now(); };
    const eventos = ['pointermove', 'pointerdown', 'keydown', 'wheel'];
    for (const n of eventos) window.addEventListener(n, tocou, { capture: true, passive: true });
    let vivo = true;
    let relogio: ReturnType<typeof setTimeout> | null = null;
    const comoEsta = () => ({
      aTocar: usePlayer.getState().isPlaying,
      segundosSemMexer: (Date.now() - ultimo) / 1000,
      modoLimpoAberto: useModoLimpo.getState().aberto,
      ocupada: appOcupada(),
    });
    const ver = async () => {
      relogio = null;
      const ponte = window.duotoneDesktop;
      if (document.visibilityState === 'visible' && ponte?.estadoDoAmbiente && valePerguntar(comoEsta())) {
        const janela = await ponte.estadoDoAmbiente().catch(() => null);
        // Outra vez: alguém pode ter mexido durante o pedido.
        if (vivo && podeEntrar(janela, comoEsta())) void entrarNoAmbiente();
      }
      if (vivo) relogio = setTimeout(ver, AMBIENTE.verACadaMs);
    };
    relogio = setTimeout(ver, AMBIENTE.verACadaMs);
    return () => {
      vivo = false;
      if (relogio) clearTimeout(relogio);
      for (const n of eventos) window.removeEventListener(n, tocou, { capture: true } as any);
    };
  }, [ligado]);

  // Dentro: passar o rato por cima volta ao normal. A janela a crescer debaixo de um
  // rato parado manda um `mousemove` sem ele mexer: conta-se a distância desde onde
  // estava, e nada durante a graça a seguir a cada mudança de tamanho.
  const automatico = useModoLimpo((s) => s.aberto && s.automatico);
  useEffect(() => {
    if (!automatico) return undefined;
    let desde: Ponto | null = null;
    let quieto = Date.now();
    const cresceu = () => { quieto = Date.now(); desde = null; };
    const mexeu = (e: PointerEvent) => {
      const agora = { x: e.screenX, y: e.screenY };
      if (Date.now() - quieto < AMBIENTE.gracaMs || useModoLimpo.getState().aMudar) { desde = agora; return; }
      if (!desde) { desde = agora; return; }
      if (passouPorCima(desde, agora)) void sairDoAmbiente();
    };
    // Um clique acorda sem fazer o que faria (tocar na capa pausava a música).
    const carregou = (e: Event) => { e.stopPropagation(); e.preventDefault(); void sairDoAmbiente(); };
    window.addEventListener('resize', cresceu);
    window.addEventListener('pointermove', mexeu, true);
    window.addEventListener('pointerdown', carregou, true);
    window.addEventListener('wheel', carregou, { capture: true, passive: false });
    return () => {
      window.removeEventListener('resize', cresceu);
      window.removeEventListener('pointermove', mexeu, true);
      window.removeEventListener('pointerdown', carregou, true);
      window.removeEventListener('wheel', carregou, { capture: true } as any);
    };
  }, [automatico]);
}

/**
 * Montado uma vez na casca. Só subscreve o interruptor: o ecrã, que redesenha
 * a cada segundo com a posição, vive no componente de baixo e nem existe
 * enquanto isto estiver fechado.
 */
export function ModoLimpo() {
  const aberto = useModoLimpo((s) => s.aberto);
  useEcraAmbiente();

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'F11') { e.preventDefault(); alternarModoLimpo(); return; }
      if (e.key === 'Escape' && useModoLimpo.getState().aberto) fecharModoLimpo();
    };
    // Sair do ecrã inteiro pelo caminho do sistema (o Esc do Chromium) tem de
    // fechar o modo também -- senão ficava a janela normal com um ecrã preto
    // por cima. O ecrã ambiente não é o do documento: não passa por aqui.
    const mudouEcraInteiro = () => {
      const d = document as any;
      if (!d.fullscreenElement && !d.webkitFullscreenElement && !useModoLimpo.getState().automatico) useModoLimpo.setState({ aberto: false });
    };
    document.addEventListener('fullscreenchange', mudouEcraInteiro);
    // O Electron vê as teclas antes da página: com o foco dentro do iframe do
    // YouTube (basta carregar em play) o `keydown` da página nunca chega.
    const pararPonte = window.duotoneDesktop?.onTeclaDoModoLimpo?.((t) => {
      if (t === 'F11') alternarModoLimpo();
      else if (t === 'Escape' && useModoLimpo.getState().aberto) fecharModoLimpo();
    });
    // UMA PORTA SÓ. A ponte não consome a tecla (de propósito: o Esc tem de
    // continuar a fechar diálogos), por isso com ela ligada o `keydown` da
    // página era a MESMA tecla contada duas vezes -- o F11 abria e fechava no
    // mesmo instante e parecia não fazer nada. Só se notava conforme o FOCO:
    // dentro do iframe do YouTube a página não recebe a tecla e funcionava;
    // depois de tocar em qualquer coisa da app, deixava de funcionar. Foi
    // assim que apareceu ao João a 13/9.
    //
    // Na captura, para nenhum componente pelo caminho engolir a tecla.
    if (!pararPonte) window.addEventListener('keydown', tecla, true);
    return () => {
      if (!pararPonte) window.removeEventListener('keydown', tecla, true);
      document.removeEventListener('fullscreenchange', mudouEcraInteiro);
      pararPonte?.();
    };
  }, []);

  // Entra e sai a apagar-se (22/11), em vez de aparecer e sumir num fotograma.
  return <Saida aberto={aberto}>{() => <EcraLimpo />}</Saida>;
}

/** A barra e os tempos: a única parte do modo limpo que lê a posição. */
function BarraDoModoLimpo({ lado, escala }: { lado: number; escala: number }) {
  const positionMs = usePlayer((s) => s.positionMs);
  const durationMs = usePlayer((s) => s.durationMs);
  const { arrasto, comecar, teclar } = useProcurarAoLargar();
  const ratio = arrasto ?? progressoDaFaixa(positionMs, durationMs);
  const mostradoS = (arrasto !== null ? Math.round(arrasto * durationMs) : positionMs) / 1000;
  const tempo = [estilos.tempo, { fontSize: Math.round(12 * Math.max(1, escala)) }];
  // O mesmo slider da barra do leitor (20/10): setas, Home e o valor lido.
  return (
    <View style={[estilos.barraLinha, { width: lado }]}>
      <Text style={tempo}>{formatTime(mostradoS)}</Text>
      <V role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(durationMs / 1000)}
        aria-valuenow={Math.round(mostradoS)} aria-valuetext={valorDaProcura(mostradoS, durationMs / 1000)} tabIndex={0}
        onKeyDown={teclar} onMouseDown={comecar} style={estilos.barraAlvo} {...marcar('calha')}>
        <V style={estilos.barra}><V style={[estilos.barraCheia, { width: `${ratio * 100}%` }]} {...marcar('cheio')} /></V>
        <V {...marcar('pega')} style={{ left: `${ratio * 100}%` }} />
      </V>
      <Text style={tempo}>{formatTime(durationMs / 1000)}</Text>
    </View>
  );
}

/** Há letra para pôr ao lado? `null` enquanto não se sabe (fica a disposição que estava). */
function haLetra(e: { status: string; data: { instrumental?: boolean; parsedLines?: unknown[]; plainLyrics?: string | null } | null } | undefined): boolean | null {
  if (!e || e.status === 'loading') return null;
  if (e.status !== 'ready' || !e.data || e.data.instrumental) return false;
  return !!(e.data.parsedLines?.length || e.data.plainLyrics);
}

/** O efeito e a força da capa, os das Definições (os mesmos do Now Playing). */
function useEfeitoDaCapa(): { modo: GlitchMode; intensidade: EffectIntensity } {
  const [modo, setModo] = useState<GlitchMode>('reactive');
  const [intensidade, setIntensidade] = useState<EffectIntensity>('normal');
  useEffect(() => {
    let vivo = true;
    void Promise.all([getGlitchMode(), getEffectIntensity()]).then(([m, i]) => { if (vivo) { setModo(m); setIntensidade(i); } });
    const ouvirModo = (e: Event) => setModo((e as CustomEvent).detail as GlitchMode);
    const ouvirForca = (e: Event) => setIntensidade((e as CustomEvent).detail as EffectIntensity);
    window.addEventListener('duotone:glitch-mode', ouvirModo);
    window.addEventListener('duotone:effect-intensity', ouvirForca);
    return () => {
      vivo = false;
      window.removeEventListener('duotone:glitch-mode', ouvirModo);
      window.removeEventListener('duotone:effect-intensity', ouvirForca);
    };
  }, []);
  return { modo, intensidade };
}

function EcraLimpo() {
  // Sem a posição: essa vive na `BarraDoModoLimpo`. Com o `usePlayer()` sem
  // seletor o ecrã inteiro redesenhava-se a cada segundo (auditoria, §1.5).
  const p = usePlayer(useShallow((s) => ({
    current: s.current, isPlaying: s.isPlaying,
    prev: s.prev, next: s.next, togglePlay: s.togglePlay,
  })));
  const { automatico, aMudar } = useModoLimpo(useShallow((s) => ({ automatico: s.automatico, aMudar: s.aMudar })));
  const versaoDoCatalogo = useCatalogoDeFaixas((s) => s.versao);
  const { width, height } = useWindowDimensions();
  const [quieto, setQuieto] = useState(false);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ao abrir à mão, o foco vem para cá: se ficar dentro do iframe do YouTube, as
  // teclas (o Esc, sobretudo) vão parar lá e não a esta página. Sozinho, não: quem
  // está a escrever noutro monitor continua a escrever lá.
  const ecra = useRef<any>(null);
  useEffect(() => {
    if (useModoLimpo.getState().automatico) return;
    window.focus?.();
    const el = ecra.current;
    if (el && typeof el.focus === 'function') el.focus({ preventScroll: true });
  }, []);

  const acordar = useCallback(() => {
    setQuieto(false);
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = setTimeout(() => setQuieto(true), INACTIVIDADE_MS);
  }, []);

  useEffect(() => {
    // Sozinho começa quieto: ninguém está a olhar para os controlos.
    if (useModoLimpo.getState().automatico) setQuieto(true); else acordar();
    window.addEventListener('mousemove', acordar);
    window.addEventListener('mousedown', acordar);
    return () => {
      window.removeEventListener('mousemove', acordar);
      window.removeEventListener('mousedown', acordar);
      if (relogio.current) clearTimeout(relogio.current);
    };
  }, [acordar]);

  // A versão do catálogo entra nas dependências do render de propósito:
  // quando a resposta chega, a capa quadrada substitui a miniatura 16:9 sem
  // ser preciso sair do modo.
  const actual = p.current;
  const faixa = React.useMemo(
    () => (actual ? comCatalogo(actual) : null),
    [actual, versaoDoCatalogo],
  );
  const faixaAtual = faixa ? `${faixa.source}:${faixa.sourceId}` : '';

  // A letra: pedida aqui também, para se saber se há mesmo com a capa ao centro.
  useEffect(() => { if (faixa) void ensureLyrics(faixa); }, [faixaAtual]); // eslint-disable-line react-hooks/exhaustive-deps
  const entradaDaLetra = useLyrics((s) => (faixa ? s.entries[lyricsCacheKey(faixa)] : undefined));
  const agoraHaLetra = haLetra(entradaDaLetra as any);
  const [comLetra, setComLetra] = useState(false);
  useEffect(() => { if (agoraHaLetra !== null) setComLetra(agoraHaLetra); }, [agoraHaLetra]);

  // A capa grande, o efeito do som e o Eclipse na troca (a capa velha fica por cima
  // da nova até o disco a tapar).
  const capaGrande = useCapaGrande(faixa ?? { source: '', sourceId: '', artworkUrl: null });
  const { modo, intensidade } = useEfeitoDaCapa();
  const caixaDaCapa = useRef<any>(null);
  const capaQueSai = useCapaQueSai(faixaAtual, faixa && capaGrande ? capaGrande : null, {
    caixa: caixaDaCapa, capa: faixa?.artworkUrl, eclipse: true,
    sentido: () => sentidoDaOcultacao(usePlayer.getState().saltoDaFaixa, Date.now()),
  });

  // O laço do disco de metal roda quando o play muda, como na barra (C3).
  const reflexo = useRef<any>(null);
  const tocavaAntes = useRef(p.isPlaying);
  useEffect(() => {
    if (tocavaAntes.current === p.isPlaying) return;
    tocavaAntes.current = p.isPlaying;
    rodarReflexo(reflexo.current, p.isPlaying);
  }, [p.isPlaying]);

  const d = disposicaoDoModoLimpo(width, height);
  const aoLado = d.aoLado && comLetra;
  const { lado, escala } = d;
  const aparece = (visivel: boolean) =>
    ({ opacity: visivel ? 1 : 0, transition: 'opacity 450ms var(--dt-curva)' } as any);
  const alinhar = aoLado ? 'flex-start' : 'center';
  const disco = Math.round(62 * escala);

  const aSair = useASair();
  return (
    <V ref={ecra} {...({ tabIndex: -1 } as any)} {...marcar('veu', aSair ? 'a-sair' : '')} style={[estilos.fundo, { cursor: quieto ? 'none' : 'default' }]}>
      {/* O fundo é a capa desfocada (a da maquete), e troca ao mesmo passo que o
          Eclipse: quando o disco tapa a capa (`useAtrasadoPelaOcultacao`). */}
      <FundoDaCapa uri={faixa?.artworkUrl ?? null} />

      {/* Duas texturas geradas em Python (scripts/gerar-fundo-limpo.py), e as
          duas por baixo do conteudo:

          - a VINHETA escurece os cantos e puxa o olho para a capa. Vai
            esticada de proposito: assim o escuro entra o mesmo de todos os
            lados, seja qual for o formato do monitor;
          - o GRAO quebra o banding. Um fundo escuro muito desfocado num
            monitor grande mostra degraus, porque 8 bits nao chegam para um
            gradiente tao lento; um ruido de 1 px por cima e o que o olho le
            como passagem continua. */}
      <Image
        source={require('../../assets/vinheta-limpa.png')}
        resizeMode="stretch"
        style={[StyleSheet.absoluteFill, estilos.textura]}
      />
      <Image
        source={require('../../assets/grao-limpo.png')}
        resizeMode="repeat"
        style={[StyleSheet.absoluteFill, estilos.textura]}
      />

      <Pressable
        accessibilityLabel="Leave clean mode"
        onPress={fecharModoLimpo}
        style={[estilos.sair, aparece(!quieto)]}
      >
        <Ionicons name="contract-outline" size={20} color={COR.textoMedio} />
      </Pressable>

      {/* Enquanto a janela muda de tamanho (o ecrã ambiente), o conteúdo apaga-se. */}
      <View style={[StyleSheet.absoluteFill, { opacity: aMudar ? 0 : 1, transition: `opacity ${AMBIENTE.mudarMs}ms var(--dt-curva)` } as any]} pointerEvents="box-none">
        {/* A letra ao lado: a linha que se canta acesa, e esbate-se em cima e em baixo. */}
        {d.aoLado && faixa ? (
          <View pointerEvents={aoLado ? 'auto' : 'none'} {...marcar('limpo-letra')}
            style={[estilos.letra, { left: d.letra.x, top: d.letra.topo, width: d.letra.largura, height: d.letra.altura }, aparece(aoLado)]}>
            <View key={`letra:${faixaAtual}`} style={{ flex: 1 }} {...marcar('np-texto-entra')}>
              <LyricsView track={faixa} visible={aoLado} escala={1.85 * escala} />
            </View>
          </View>
        ) : null}

        {/* A coluna da capa: à esquerda com letra, ao centro sem. Desliza entre os
            dois em vez de saltar (o lado é o mesmo). */}
        <View style={[estilos.coluna, {
          top: d.topo, width: lado, alignItems: alinhar,
          transform: [{ translateX: aoLado ? d.colunaX : d.centroX }],
          transition: 'transform 700ms var(--dt-travar)',
        } as any]}>
          <Pressable
            accessibilityLabel={p.isPlaying ? 'Pause' : 'Play'}
            onPress={p.togglePlay}
            style={{ cursor: quieto ? 'none' : 'pointer' } as any}
          >
            <View style={[estilos.capa, { width: lado, height: lado }]}>
              {faixa ? (
                <GlitchArtwork uri={capaGrande} lado={lado} modo={modo} intensidade={intensidade} raio={18} />
              ) : (
                <View style={[estilos.semCapa, { width: lado, height: lado }]}>
                  <Ionicons name="musical-note" size={Math.round(lado * 0.18)} color={COR.textoFraco} />
                </View>
              )}
              {/* Por cima da capa, numa camada que corta o disco do Eclipse. */}
              <View ref={caixaDaCapa} pointerEvents="none" style={[estilos.caixaDoEclipse, { width: lado, height: lado }]}>
                {capaQueSai ? (
                  // Um <img> a sério e não a <Image> do RNW: essa só desenha depois de
                  // voltar a carregar a imagem (mesmo em cache), e ficava um buraco.
                  <img data-dt="capa-sai" src={capaQueSai} alt=""
                    style={{ position: 'absolute', width: lado, height: lado, objectFit: 'cover' }} />
                ) : null}
              </View>
            </View>
          </Pressable>

          <View key={`nome:${faixaAtual}`} {...marcar('np-texto-entra')}
            style={[estilos.identidade, { alignItems: alinhar, height: Math.round(76 * escala) }]}>
            <Text numberOfLines={1} style={[estilos.titulo, { fontSize: Math.max(19, Math.round(32 * escala)), textAlign: aoLado ? 'left' : 'center' }]}>
              {faixa ? tituloDaFaixa(faixa) : 'Nothing playing'}
            </Text>
            <Text numberOfLines={1} style={[estilos.artista, { fontSize: Math.max(13, Math.round(18 * escala)), textAlign: aoLado ? 'left' : 'center' }]}>
              {faixa ? displayArtist(faixa) : ''}
            </Text>
          </View>

          <BarraDoModoLimpo lado={lado} escala={escala} />

          <View style={[estilos.controlos, { width: lado, height: disco + 18, gap: Math.round(34 * escala) }, aparece(!quieto)]}>
            <Botao nome="play-skip-back" rotulo="Previous" tamanho={Math.round(24 * escala)} aoCarregar={p.prev} />
            {/* O disco de metal da barra do leitor (C3): o laço roda quando o play muda. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={p.isPlaying ? 'Pause' : 'Play'}
              onPress={p.togglePlay}
              {...marcar('disco-metal')}
              style={({ pressed }: any) => [estilos.botaoTocar, { width: disco, height: disco, borderRadius: disco / 2 }, pressed && { transform: [{ scale: 0.97 }] }]}
            >
              <View ref={reflexo} {...marcar('reflexo')} />
              <View style={{ zIndex: 1 }}><IconePlayPause tocando={p.isPlaying} tamanho={Math.round(disco * 0.4)} /></View>
            </Pressable>
            <Botao nome="play-skip-forward" rotulo="Next" tamanho={Math.round(24 * escala)} aoCarregar={p.next} />
          </View>
        </View>
      </View>

      {/* O logo fica sempre. É a única coisa que diz de quem é este ecrã, e a
          esta opacidade não compete com a capa. Sozinho, também: não se carrega. */}
      <View style={estilos.marca} pointerEvents="none">
        <Image source={require('../../assets/auth-logo.png')} style={{ width: 17, height: 17 }} resizeMode="contain" />
        <Text style={estilos.marcaTexto}>DUOTONE</Text>
      </View>
    </V>
  );
}

function Botao({ nome, rotulo, tamanho, aoCarregar }: { nome: keyof typeof Ionicons.glyphMap; rotulo: string; tamanho: number; aoCarregar: () => void }) {
  const caixa = tamanho + 22;
  return (
    <Pressable
      accessibilityLabel={rotulo}
      onPress={aoCarregar}
      style={({ hovered }: any) => [estilos.botao, { width: caixa, height: caixa, borderRadius: caixa / 2 }, hovered && { backgroundColor: COR.hover }]}
    >
      <Ionicons name={nome} size={tamanho} color={COR.texto} />
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  fundo: {
    position: 'fixed' as any,
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 60,
    backgroundColor: COR.fundo,
    overflow: 'hidden',
  },
  // O `pointerEvents` no estilo e coisa da web: os tipos do React Native nao
  // o conhecem, e sem ele estas camadas apanhavam os cliques da capa.
  // E o tamanho: no react-native-web uma <Image> com `require` leva o tamanho do
  // PNG, e o `absoluteFill` não o desfaz. Sem ele o grão ficava num quadrado de
  // 256 px no canto e a vinheta num retângulo de 960x540 -- os "quadrados de
  // fundo" do F11 (14/9).
  textura: { width: '100%', height: '100%', pointerEvents: 'none' } as any,
  letra: { position: 'absolute' },
  coluna: { position: 'absolute', left: 0 },
  // A borda é a mesma do Now Playing: sobre a luz ambiente (a própria capa
  // desfocada) uma capa escura ficava sem contorno nenhum.
  capa: {
    borderRadius: 18, backgroundColor: COR.elevado, borderWidth: 1,
    borderColor: 'rgba(233,234,238,.14)', boxShadow: '0 40px 120px rgba(0,0,0,.65)',
  } as any,
  semCapa: { alignItems: 'center', justifyContent: 'center' },
  // O disco do Eclipse sai da capa: a camada corta-o com o raio dela.
  caixaDoEclipse: { position: 'absolute', left: 0, top: 0, borderRadius: 18, overflow: 'hidden', zIndex: 3 },

  identidade: { justifyContent: 'center', gap: 4, marginTop: 14 },
  titulo: { fontFamily: FONT.display, fontWeight: '700' as any, letterSpacing: -0.2, color: COR.texto, maxWidth: '100%' } as any,
  artista: { fontFamily: FONT.body, fontWeight: '500' as any, color: COR.textoMedio, maxWidth: '100%' } as any,

  barraLinha: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 },
  tempo: { fontFamily: FONT.mono, color: COR.textoMedio, width: 46, textAlign: 'center', fontVariant: ['tabular-nums'] } as any,
  barraAlvo: { flex: 1, height: 18, justifyContent: 'center', cursor: 'pointer' } as any,
  barra: { height: 4, backgroundColor: 'rgba(233,234,238,.18)', borderRadius: 2, overflow: 'hidden' },
  barraCheia: { height: 4, backgroundColor: COR.texto, borderRadius: 2 },

  controlos: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  botao: { alignItems: 'center', justifyContent: 'center' },
  botaoTocar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },

  sair: { position: 'absolute', top: 20, right: 22, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', zIndex: 2 },

  marca: { position: 'absolute', left: 0, right: 0, bottom: 26, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, opacity: 0.42 },
  marcaTexto: { fontFamily: FONT.display, fontSize: 12, letterSpacing: 4, color: COR.textoMedio, fontWeight: '600' as any },
});
