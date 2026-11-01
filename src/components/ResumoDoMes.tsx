import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { lerReproducoes } from '../api/listeningStats';
import { avisarInfo } from '../lib/avisoDeRemocao';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { lerCelulasDaCapa } from '../lib/celulasDaCapa';
import { coresDoGradiente } from '../lib/corDaCapa';
import {
  calcularResumoDoMes, chaveDoMes, inicioDaLeitura, mesAnterior, mostrarResumo, nomeDoMes,
  type ResumoDoMes as Resumo,
} from '../lib/resumoDoMes';
import { getResumoVistoEm, setResumoVistoEm } from '../lib/prefs';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useAbertura } from '../state/abertura';
import { useAuth } from '../state/auth';
import { pedirFluidez } from '../state/fluidez';
import { usePlayer } from '../state/player';
import { useTheme } from '../state/theme';
import type { Track } from '../types';
import { DentroDeUmModal } from './dentroDeUmModal';
import { PAGINAS_DO_RESUMO } from './PaginasDoResumo';
import { useTeclasDoResumo } from './teclasDoResumo';

/** Quanto fica cada página antes de passar sozinha (o cartaz fica mais, e não fecha sozinho). */
export const DURACOES_DAS_PAGINAS_MS = [5200, 7000, 7000, 7500, 7000, 9000] as const;
export const PAGINAS = DURACOES_DAS_PAGINAS_MS.length;

/** O ecrã do iPhone da maquete: as imagens e os números grandes estão desenhados para ele. */
const ALTURA_DE_REFERENCIA = 844;

/**
 * Pedir o resumo outra vez, de fora (as estatísticas: "Your October"). Antes
 * ele mostrava-se uma vez e perdia-se.
 */
const usePedidoDoResumo = create<{ pedido: number }>(() => ({ pedido: 0 }));
export function abrirResumoDoMes(): void {
  usePedidoDoResumo.setState((s) => ({ pedido: s.pedido + 1 }));
}
/** O nome do mês que o resumo mostra agora ("October" durante novembro). */
export function nomeDoResumo(agora = new Date()): string {
  return nomeDoMes(mesAnterior(agora));
}

/**
 * "O teu mês" (7/10; refeito a 1/11, `docs/recap-maquete.html`): seis páginas
 * como uma story, por cima de tudo, na primeira abertura do mês (nos primeiros
 * sete dias). Dá para a rever nas estatísticas (`abrirResumoDoMes`).
 *
 * Toque à direita avança, à esquerda volta; premir pausa; cada página passa
 * sozinha ao fim do seu tempo e o cartaz fica à espera do "Done". O X fecha. No
 * PC é um cartão 9:16 ao centro, com as setas ao lado, e o teclado: ← →, o
 * Espaço pausa, o Esc fecha. As páginas são o `PaginasDoResumo.tsx`; as contas
 * o lib/resumoDoMes.ts, das escutas que já se liam (zero pedidos novos).
 *
 * Marca-se como visto ao MOSTRAR: mudar de separador ou reabrir a app não o
 * traz outra vez. Um mês sem música que chegue (`MINIMO_DE_ESCUTAS`) não
 * mostra nada.
 */
export function ResumoDoMes() {
  const sessao = useAuth((s) => s.session);
  const tapado = useAbertura((s) => s.aFrente);
  const pedido = usePedidoDoResumo((s) => s.pedido);
  const [resumo, setResumo] = useState<Resumo | null>(null);

  useEffect(() => {
    if (!sessao) return;
    let vivo = true;
    void (async () => {
      const agora = new Date();
      const visto = await getResumoVistoEm().catch(() => null);
      if (!vivo || !mostrarResumo(agora, visto)) return;
      const { rows, unavailable } = await lerReproducoes(inicioDaLeitura(agora));
      if (!vivo || unavailable) return;
      const mes = mesAnterior(agora);
      const r = calcularResumoDoMes(rows, mes);
      void setResumoVistoEm(chaveDoMes(mes)).catch(() => {});
      if (r) setResumo(r);
    })();
    return () => { vivo = false; };
  }, [sessao]);

  // Pedido pelas estatísticas: um pedido de leitura por toque, o mesmo da abertura.
  useEffect(() => {
    if (!pedido || !sessao) return;
    let vivo = true;
    void (async () => {
      const agora = new Date();
      const { rows, unavailable } = await lerReproducoes(inicioDaLeitura(agora));
      if (!vivo) return;
      const r = unavailable ? null : calcularResumoDoMes(rows, mesAnterior(agora));
      if (r) setResumo(r);
      else avisarInfo(`Not enough music in ${nomeDoResumo(agora)} for a recap.`);
    })();
    return () => { vivo = false; };
  }, [pedido, sessao]);

  if (!resumo || tapado) return null;
  return <StoryDoResumo resumo={resumo} aoFechar={() => setResumo(null)} />;
}

type Tres = [string, string, string];
const ESCURO = '#0B0B10';

/**
 * As cores de cada página, das capas do mês (a cor que a app já tira de uma
 * capa, em cache): o mês com as três primeiras, o artista com a dele, a música
 * com a dela. Até chegarem, a cor do tema.
 */
function useCoresDasPaginas(resumo: Resumo, tema: string): Tres[] {
  const base: Tres = [tema, '#1C1C2A', ESCURO];
  const [cores, setCores] = useState<Tres[]>(() => Array.from({ length: PAGINAS }, () => base));
  useEffect(() => {
    let vivo = true;
    const m = resumo.musicas;
    const ler = async (uri: string | null | undefined) => coresDoGradiente(await lerCelulasDaCapa(capaParaLista(uri)).catch(() => null));
    void Promise.all([ler(m[0]?.capa), ler(m[1]?.capa), ler(m[2]?.capa), ler(m[3]?.capa), ler(m[4]?.capa), ler(resumo.artistas[0]?.capa)])
      .then(([c1, c2, c3, c4, c5, a1]) => {
        if (!vivo) return;
        const par = (c: [string, string] | null, de: Tres = base): Tres => (c ? [c[0], c[1], ESCURO] : de);
        setCores([
          [c1?.[0] ?? tema, c2?.[0] ?? '#1C1C2A', c3?.[0] ?? ESCURO],
          par(c2 ?? c4),
          par(a1 ?? c1),
          par(c1),
          par(c3 ?? c4),
          par(c5 ?? c1),
        ]);
      });
    return () => { vivo = false; };
  }, [resumo, tema]);
  return cores;
}

/** O fundo: as cores da página, a dissolver de uma para a outra e a derivar devagar. */
function Fundo({ cores, pagina, reduzido }: { cores: Tres[]; pagina: number; reduzido: boolean }) {
  const opacidades = useRef(cores.map((_, i) => new Animated.Value(i === pagina ? 1 : 0))).current;
  const deriva = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // Uma a uma, sem as juntar numa animação composta (a regra da casa para valores animados).
    const as = opacidades.map((v, i) => Animated.timing(v, {
      toValue: i === pagina ? 1 : 0, duration: reduzido ? 0 : 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true,
    }));
    as.forEach((a) => a.start());
    return () => as.forEach((a) => a.stop());
  }, [pagina, reduzido, opacidades]);
  useEffect(() => {
    if (reduzido) return;
    const ida = Animated.timing(deriva, { toValue: 1, duration: 18000, easing: Easing.inOut(Easing.sin), useNativeDriver: true });
    const volta = Animated.timing(deriva, { toValue: 0, duration: 18000, easing: Easing.inOut(Easing.sin), useNativeDriver: true });
    const a = Animated.loop(Animated.sequence([ida, volta]));
    a.start();
    return () => a.stop();
  }, [reduzido, deriva]);
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, {
      transform: [
        { scale: 1.4 },
        { translateX: deriva.interpolate({ inputRange: [0, 1], outputRange: [-12, 10] }) },
        { rotate: deriva.interpolate({ inputRange: [0, 1], outputRange: ['-4deg', '6deg'] }) },
      ],
    }]}>
      {cores.map((c, i) => (
        <Animated.View key={i} style={[StyleSheet.absoluteFill, { opacity: opacidades[i] }]}>
          <LinearGradient colors={c} locations={[0, 0.5, 1]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      ))}
    </Animated.View>
  );
}

function StoryDoResumo({ resumo, aoFechar }: { resumo: Resumo; aoFechar: () => void }) {
  const tema = useTheme((s) => s.theme);
  const safe = useSafeAreaInsets();
  const reduzido = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const pc = Platform.OS === 'web';
  const largura = pc ? Math.min(388, width - 160, (height - 90) * 9 / 16) : width;
  const altura = pc ? largura * 16 / 9 : height;
  const escala = Math.max(0.72, Math.min(1, altura / ALTURA_DE_REFERENCIA));
  const topo = pc ? 14 : safe.top + 6;
  const baixo = pc ? 22 : safe.bottom + 16;
  const [pagina, setPagina] = useState(0);
  const cores = useCoresDasPaginas(resumo, tema.color);
  const progresso = useRef(new Animated.Value(0)).current;
  const animacao = useRef<Animated.CompositeAnimation | null>(null);
  const pausada = useRef(false);

  const avancar = useCallback(() => {
    setPagina((p) => {
      if (p >= PAGINAS - 1) { aoFechar(); return p; }
      return p + 1;
    });
  }, [aoFechar]);
  const recuar = useCallback(() => setPagina((p) => Math.max(0, p - 1)), []);
  const correr = useCallback((desde: number) => {
    animacao.current?.stop();
    progresso.setValue(desde);
    const ms = DURACOES_DAS_PAGINAS_MS[pagina] ?? 7000;
    animacao.current = Animated.timing(progresso, {
      toValue: 1, duration: Math.max(0, (1 - desde) * ms), easing: Easing.linear, useNativeDriver: true,
    });
    // O cartaz não fecha sozinho: fica à espera do "Done".
    animacao.current.start(({ finished }) => { if (finished && pagina < PAGINAS - 1) avancar(); });
  }, [progresso, avancar, pagina]);
  useEffect(() => {
    pausada.current = false;
    pedirFluidez(1500);
    correr(0);
    return () => animacao.current?.stop();
  }, [pagina, correr]);

  const pausar = () => { animacao.current?.stop(); };
  const retomar = () => { if (!pausada.current) progresso.stopAnimation((v) => correr(v)); };
  const alternarPausa = () => {
    pausada.current = !pausada.current;
    if (pausada.current) animacao.current?.stop();
    else progresso.stopAnimation((v) => correr(v));
  };
  // Onde começa o cartão no ecrã: no iPhone é o ecrã todo; no PC está ao meio,
  // entre as duas setas (44) e o espaço delas (20).
  const esquerdaDoCartao = pc ? (width - (largura + 2 * (44 + 20))) / 2 + 44 + 20 : 0;
  // O lado do toque conta-se pela página e não pelo `locationX`, que é relativo
  // ao elemento tocado (um texto, uma capa): um toque à esquerda, em cima de um
  // texto, avançava em vez de voltar (visto no ensaio do PC, 1/11).
  const tocar = (pageX: number) => {
    const x = pageX - esquerdaDoCartao;
    if (x < largura / 3) recuar();
    else avancar();
  };
  useTeclasDoResumo({ seguinte: avancar, anterior: recuar, pausa: alternarPausa, fechar: aoFechar });

  const tocarTop5 = () => {
    const faixas: Track[] = resumo.musicas.map((m) => ({
      source: m.source as Track['source'], sourceId: m.sourceId, title: m.titulo, artist: m.artista,
      album: null, artworkUrl: m.capa, durationSeconds: m.durationSeconds,
    }));
    if (!faixas.length) return;
    void usePlayer.getState().tocarLista(faixas, false, false, { tipo: 'prateleira', nome: `Your ${resumo.nome}` });
    aoFechar();
  };

  const Pagina = PAGINAS_DO_RESUMO[pagina]!;
  // A largura de cada barrinha: a fila tem 12 de margem de cada lado, o X (32) e 12 entre eles, e 4 entre barras.
  const larguraDaBarra = Math.max(1, (largura - 24 - 32 - 12 - 4 * (PAGINAS - 1)) / PAGINAS);
  const cartao = (
    <View style={{ width: largura, height: altura, overflow: 'hidden', borderRadius: pc ? 22 : 0, backgroundColor: '#07070A' }}>
      <Fundo cores={cores} pagina={pagina} reduzido={reduzido} />
      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.72)']} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} />

      {/* A zona dos toques NÃO é um botão: tem botões dentro ("Play your top 5",
          "Done"), e um botão dentro de outro é HTML inválido no PC; no iPhone o
          VoiceOver juntava tudo num elemento só e não chegava a eles. */}
      <Pressable accessible={false} style={StyleSheet.absoluteFill}
        onPressIn={pausar} onPressOut={retomar} onPress={(e) => tocar(e.nativeEvent.pageX)}>
        <View style={[estilos.conteudo, { paddingTop: topo + 44, paddingBottom: baixo + 6 }]}>
          <Pagina key={pagina} resumo={resumo} cor={cores[pagina]![0]} escala={escala} largura={largura - 52}
            reduzido={reduzido} pc={pc} aoTocarTop5={tocarTop5} aoFechar={aoFechar} />
        </View>
      </Pressable>

      <View pointerEvents="box-none" style={[estilos.topo, { top: topo }]}>
        <View style={estilos.barras} pointerEvents="none">
          {Array.from({ length: PAGINAS }, (_, i) => (
            <View key={i} style={estilos.barra}>
              <Animated.View style={[estilos.cheio, { width: larguraDaBarra,
                transform: [{ translateX: i < pagina ? 0 : i === pagina
                  ? progresso.interpolate({ inputRange: [0, 1], outputRange: [-larguraDaBarra, 0] }) : -larguraDaBarra }],
              }]} />
            </View>
          ))}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} onPress={aoFechar} style={estilos.fechar}>
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
      </View>
    </View>
  );

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={aoFechar}>
      <DentroDeUmModal.Provider value>
      <View style={estilos.fora}>
        {pc ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Previous" onPress={recuar}
              style={({ hovered }: any) => [estilos.seta, hovered && { backgroundColor: 'rgba(255,255,255,0.18)' }, pagina === 0 && { opacity: 0.35 }]}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </Pressable>
            {cartao}
            <Pressable accessibilityRole="button" accessibilityLabel="Next page" onPress={avancar}
              style={({ hovered }: any) => [estilos.seta, hovered && { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
              <Ionicons name="chevron-forward" size={22} color="#fff" />
            </Pressable>
          </View>
        ) : cartao}
        {pc ? <Text style={estilos.teclas}>{'←  →   ·   SPACE PAUSES   ·   ESC CLOSES'}</Text> : null}
      </View>
      </DentroDeUmModal.Provider>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fora: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center' },
  conteudo: { flex: 1, paddingHorizontal: 26 },
  topo: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 12, zIndex: 5 },
  barras: { flex: 1, flexDirection: 'row', gap: 4 },
  barra: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.28)', overflow: 'hidden' },
  // A barra enche por translação (nativa): o branco entra da esquerda numa caixa que o corta.
  cheio: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#fff' },
  fechar: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  seta: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  teclas: { marginTop: 18, fontSize: 11, letterSpacing: 1, color: 'rgba(233,234,238,0.5)' },
});
