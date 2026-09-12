import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { create } from 'zustand';
import { INACTIVIDADE_MS, posicaoDoClique, progressoDaFaixa, tamanhoDaCapa } from '../lib/modoLimpo';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { usePlayer } from '../state/player';
import { comCatalogo, useCatalogoDeFaixas } from '../state/catalogoDeFaixas';
import { COR, ESP, FONT } from './tokens.web';
import { formatTime } from './ui.web';

const P = Pressable as any;
const V = View as any;
/** O react-native-web aceita `className`, os tipos do React Native nao. */
const Img = Image as any;

/**
 * Modo limpo: a app inteira sai do caminho e fica a capa, a barra e o logo.
 *
 * Para o segundo monitor. A app tem barra de título, barra lateral, barra do
 * leitor e fila -- tudo útil no monitor onde se trabalha, e tudo ruído no
 * monitor que está lá só a tocar música.
 *
 * ## Nada se mexe sozinho
 *
 * Fora a barra a andar, este ecrã é estático de propósito: sem glitch, sem
 * captura de áudio, sem WebGL. Num segundo monitor uma coisa a mexer no canto
 * do olho rouba atenção o dia inteiro, que é o contrário do que isto vem
 * fazer. O efeito reativo fica no Now Playing, que é onde se olha para ele.
 *
 * ## O que só aparece quando faz falta
 *
 * Com o rato parado ficam a capa, a barra e o logo -- e o cursor desaparece.
 * Ao mexer, entram o nome, os controlos e a saída. Cada um desses blocos tem
 * altura FIXA e o que muda é a opacidade: aparecer não pode empurrar a capa,
 * senão o ecrã saltava de cada vez que alguém passasse o rato.
 */
export const useModoLimpo = create<{ aberto: boolean }>(() => ({ aberto: false }));

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
  useModoLimpo.setState({ aberto: true });
}

export function fecharModoLimpo(): void {
  if (!useModoLimpo.getState().aberto) return;
  largarEcraInteiro();
  useModoLimpo.setState({ aberto: false });
}

export function alternarModoLimpo(): void {
  if (useModoLimpo.getState().aberto) fecharModoLimpo();
  else abrirModoLimpo();
}

/**
 * Montado uma vez na casca. Só subscreve o interruptor: o ecrã, que redesenha
 * a cada segundo com a posição, vive no componente de baixo e nem existe
 * enquanto isto estiver fechado.
 */
export function ModoLimpo() {
  const aberto = useModoLimpo((s) => s.aberto);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'F11') { e.preventDefault(); alternarModoLimpo(); return; }
      if (e.key === 'Escape' && useModoLimpo.getState().aberto) fecharModoLimpo();
    };
    // Sair do ecrã inteiro pelo caminho do sistema (o Esc do Chromium) tem de
    // fechar o modo também -- senão ficava a janela normal com um ecrã preto
    // por cima.
    const mudouEcraInteiro = () => {
      const d = document as any;
      if (!d.fullscreenElement && !d.webkitFullscreenElement) useModoLimpo.setState({ aberto: false });
    };
    window.addEventListener('keydown', tecla);
    document.addEventListener('fullscreenchange', mudouEcraInteiro);
    return () => {
      window.removeEventListener('keydown', tecla);
      document.removeEventListener('fullscreenchange', mudouEcraInteiro);
    };
  }, []);

  if (!aberto) return null;
  return <EcraLimpo />;
}

function EcraLimpo() {
  const p = usePlayer();
  const versaoDoCatalogo = useCatalogoDeFaixas((s) => s.versao);
  const { width, height } = useWindowDimensions();
  const [quieto, setQuieto] = useState(false);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);

  const acordar = useCallback(() => {
    setQuieto(false);
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = setTimeout(() => setQuieto(true), INACTIVIDADE_MS);
  }, []);

  useEffect(() => {
    acordar();
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

  const lado = tamanhoDaCapa(width, height);
  const ratio = progressoDaFaixa(p.positionMs, p.durationMs);
  const aparece = (visivel: boolean) =>
    ({ opacity: visivel ? 1 : 0, transition: 'opacity .45s cubic-bezier(.4,0,.2,1)' } as any);

  const arrastarNaBarra = (evento: any) => {
    evento.preventDefault?.();
    const alvo = evento.currentTarget;
    const mover = (e: any) => {
      const r = alvo.getBoundingClientRect();
      const x = e.clientX ?? e.touches?.[0]?.clientX;
      if (x === undefined) return;
      p.seekTo(posicaoDoClique(x, r.left, r.width) * p.durationMs);
    };
    mover(evento);
    const parar = () => {
      window.removeEventListener('mousemove', mover);
      window.removeEventListener('mouseup', parar);
    };
    window.addEventListener('mousemove', mover);
    window.addEventListener('mouseup', parar);
  };

  return (
    <V style={[estilos.fundo, { cursor: quieto ? 'none' : 'default' }]}>
      {/* A luz ambiente é a própria capa, desfocada. Sem cor inventada: o que
          está por trás do ecrã é o disco que está a tocar. */}
      {faixa?.artworkUrl ? (
        <Img
          key={faixa.artworkUrl}
          source={{ uri: faixa.artworkUrl }}
          className="modo-limpo-ambiente"
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      <Pressable
        accessibilityLabel="Leave clean mode"
        onPress={fecharModoLimpo}
        style={[estilos.sair, aparece(!quieto)]}
      >
        <Ionicons name="contract-outline" size={20} color={COR.textoMedio} />
      </Pressable>

      <View style={estilos.centro}>
        <Pressable
          accessibilityLabel={p.isPlaying ? 'Pause' : 'Play'}
          onPress={p.togglePlay}
          style={{ cursor: quieto ? 'none' : 'pointer' } as any}
        >
          {faixa?.artworkUrl ? (
            <Image source={{ uri: faixa.artworkUrl }} style={[estilos.capa, { width: lado, height: lado }]} />
          ) : (
            <View style={[estilos.capa, estilos.semCapa, { width: lado, height: lado }]}>
              <Ionicons name="musical-note" size={Math.round(lado * 0.18)} color={COR.textoFraco} />
            </View>
          )}
        </Pressable>

        <View style={[estilos.identidade, aparece(!quieto)]}>
          <Text numberOfLines={1} style={estilos.titulo}>{faixa ? tituloDaFaixa(faixa) : 'Nothing playing'}</Text>
          <Text numberOfLines={1} style={estilos.artista}>{faixa ? displayArtist(faixa) : ''}</Text>
        </View>

        <View style={[estilos.barraLinha, { width: lado }]}>
          <Text style={estilos.tempo}>{formatTime(p.positionMs / 1000)}</Text>
          <P onMouseDown={arrastarNaBarra} style={estilos.barraAlvo} className="slider-container">
            <V style={estilos.barra}><V style={[estilos.barraCheia, { width: `${ratio * 100}%` }]} className="slider-fill" /></V>
            <V className="slider-thumb" style={{ left: `${ratio * 100}%` }} />
          </P>
          <Text style={estilos.tempo}>{formatTime(p.durationMs / 1000)}</Text>
        </View>

        <View style={[estilos.controlos, aparece(!quieto)]}>
          <Botao nome="play-skip-back" rotulo="Previous" aoCarregar={p.prev} />
          <Pressable
            accessibilityLabel={p.isPlaying ? 'Pause' : 'Play'}
            onPress={p.togglePlay}
            style={({ hovered }: any) => [estilos.botaoTocar, hovered && { transform: [{ scale: 1.05 }] }]}
          >
            <Ionicons name={p.buffering ? 'hourglass-outline' : p.isPlaying ? 'pause' : 'play'} size={18} color="#111117" />
          </Pressable>
          <Botao nome="play-skip-forward" rotulo="Next" aoCarregar={p.next} />
        </View>
      </View>

      {/* O logo fica sempre. É a única coisa que diz de quem é este ecrã, e a
          esta opacidade não compete com a capa. */}
      <View style={estilos.marca}>
        <Image source={require('../../assets/auth-logo.png')} style={{ width: 17, height: 17 }} resizeMode="contain" />
        <Text style={estilos.marcaTexto}>DUOTONE</Text>
      </View>
    </V>
  );
}

function Botao({ nome, rotulo, aoCarregar }: { nome: keyof typeof Ionicons.glyphMap; rotulo: string; aoCarregar: () => void }) {
  return (
    <Pressable
      accessibilityLabel={rotulo}
      onPress={aoCarregar}
      style={({ hovered }: any) => [estilos.botao, hovered && { backgroundColor: COR.hover }]}
    >
      <Ionicons name={nome} size={19} color={COR.texto} />
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  fundo: {
    position: 'fixed' as any,
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 60,
    backgroundColor: COR.fundo,
    alignItems: 'center',
    justifyContent: 'center',
    // O logo é absoluto no fundo: sem isto a coluna centrava-se a meio do ecrã
    // inteiro e os controlos iam-lhe parar em cima numa janela baixa.
    paddingBottom: 60,
  },
  centro: { alignItems: 'center' },
  // A borda é a mesma do Now Playing: sobre a luz ambiente (a própria capa
  // desfocada) uma capa escura ficava sem contorno nenhum.
  capa: {
    borderRadius: 18, backgroundColor: COR.elevado, borderWidth: 1,
    borderColor: 'rgba(233,234,238,.14)', boxShadow: '0 40px 120px rgba(0,0,0,.65)',
  } as any,
  semCapa: { alignItems: 'center', justifyContent: 'center' },

  identidade: { height: 48, justifyContent: 'center', alignItems: 'center', gap: 3, maxWidth: 560 },
  titulo: { fontFamily: FONT.display, fontSize: 19, fontWeight: '650' as any, color: COR.texto, textAlign: 'center' },
  artista: { fontFamily: FONT.body, fontSize: 13, color: COR.textoMedio, textAlign: 'center' },

  barraLinha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tempo: { fontFamily: FONT.mono, fontSize: 11, color: COR.textoFraco, width: 42, textAlign: 'center' },
  barraAlvo: { flex: 1, height: 16, justifyContent: 'center', cursor: 'pointer' } as any,
  barra: { height: 3, backgroundColor: 'rgba(233,234,238,.16)', borderRadius: 2, overflow: 'hidden' },
  barraCheia: { height: 3, backgroundColor: COR.texto, borderRadius: 2 },

  controlos: { height: 54, flexDirection: 'row', alignItems: 'center', gap: ESP.sm },
  botao: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  botaoTocar: { width: 38, height: 38, borderRadius: 19, backgroundColor: COR.texto, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4 },

  sair: { position: 'absolute', top: 20, right: 22, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },

  marca: { position: 'absolute', bottom: 26, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: 0.42 },
  marcaTexto: { fontFamily: FONT.display, fontSize: 11, letterSpacing: 3, color: COR.textoMedio, fontWeight: '600' as any },
});
