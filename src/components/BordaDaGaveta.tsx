import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PanGestureHandler, State, type PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import { usePlayer } from '../state/player';
import {
  aberturaDaGaveta, abrirGaveta, dedoDaGaveta, fecharGaveta, garantirPrimeira, largarGaveta, useEcraAtual, useGaveta,
} from '../state/gaveta';
import { carregarDescoberta, marcarEmpurrada, useDescoberta } from '../state/descobertaDaGaveta';
import { useAbertura } from '../state/abertura';
import { molaIOS } from '../state/transicaoDoLeitor';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { dadosDaPrimeiraGaveta } from '../state/dadosDaGaveta';
import { pedirFluidez, segurarFluidez } from '../state/fluidez';
import { hapticSelection } from '../lib/haptics';
import { colors } from '../theme';

/** A largura da borda que abre a gaveta: a margem da Home, para não tapar o que se toca. */
const BORDA = 16;

/**
 * Abrir a gaveta da borda esquerda da Home (6.0.4). Uma tira estreita POR CIMA
 * de tudo, e não um gesto dentro da Home: lá dentro competia com o paginador dos
 * separadores. Só existe na Home, na raiz, com o leitor fechado. O dedo escreve
 * no motor nativo (`dedoDaGaveta`); o JavaScript só decide no fim.
 */
export function BordaDaGaveta({ largura }: { largura: number }) {
  const ecra = useEcraAtual((s) => s.nome);
  const aberta = useGaveta((s) => s.aberta);
  const expandido = usePlayer((s) => s.expanded);
  const ativa = ecra === 'Search' && !aberta && !expandido;
  const reduzido = useReducedMotion();
  const empurrar = useDescoberta((s) => s.empurrar);
  const tapado = useAbertura((s) => s.aFrente);

  useEffect(() => { void carregarDescoberta(); }, []);

  // O empurrão (6.0.4, a maquete "Descobrir a gaveta"): UMA vez, no primeiro
  // arranque, a Home desliza 30 pontos para a direita com a mola da app e volta,
  // e deixa ver a ponta da gaveta -- já com as peças, que se fazem aqui. Espera
  // que a abertura da app saia; com Reduzir movimento não há.
  useEffect(() => {
    if (!ativa || !empurrar || reduzido || tapado) return;
    const t = setTimeout(() => {
      if (!useDescoberta.getState().empurrar || useGaveta.getState().aberta) return;
      marcarEmpurrada();
      garantirPrimeira(dadosDaPrimeiraGaveta);
      pedirFluidez(1800);
      Animated.sequence([
        Animated.timing(aberturaDaGaveta, { toValue: 30 / largura, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.delay(650),
        Animated.spring(aberturaDaGaveta, { toValue: 0, useNativeDriver: true, ...molaIOS(0.45, 0.8) }),
      ]).start();
    }, 1400);
    return () => clearTimeout(t);
  }, [ativa, empurrar, reduzido, tapado, largura]);

  const evento = useMemo(() => Animated.event([{ nativeEvent: { translationX: dedoDaGaveta } }], { useNativeDriver: true }), []);
  const largar = useRef<(() => void) | null>(null);
  const aoMudar = useCallback((e: PanGestureHandlerStateChangeEvent) => {
    const { state, oldState, translationX, velocityX } = e.nativeEvent;
    if (state === State.ACTIVE) {
      largar.current?.();
      largar.current = segurarFluidez(900);
      hapticSelection();
      return;
    }
    if (oldState !== State.ACTIVE) return;
    largar.current?.();
    largar.current = null;
    largarGaveta({ deslocacao: translationX, velocidade: velocityX, largura, deAbrir: true, dados: dadosDaPrimeiraGaveta });
  }, [largura]);
  return (
    <PanGestureHandler enabled={ativa} activeOffsetX={10} failOffsetX={-6} failOffsetY={[-18, 18]}
      onGestureEvent={evento} onHandlerStateChange={aoMudar}>
      <Animated.View pointerEvents={ativa ? 'auto' : 'none'} style={styles.borda} />
    </PanGestureHandler>
  );
}

/**
 * Por cima da app enquanto a gaveta está aberta: escurece-a, fecha-a ao toque e
 * ao arrasto para a esquerda, e desliza com ela.
 */
export function VeuDaGaveta({ largura, deslize, visto, raio }: {
  largura: number;
  deslize: Animated.AnimatedInterpolation<number>;
  visto: Animated.AnimatedInterpolation<number>;
  raio: Animated.AnimatedAddition<number>;
}) {
  const aberta = useGaveta((s) => s.aberta);
  const evento = useMemo(() => Animated.event([{ nativeEvent: { translationX: dedoDaGaveta } }], { useNativeDriver: true }), []);
  const largar = useRef<(() => void) | null>(null);
  const aoMudar = useCallback((e: PanGestureHandlerStateChangeEvent) => {
    const { state, oldState, translationX, velocityX } = e.nativeEvent;
    if (state === State.ACTIVE) {
      largar.current?.();
      largar.current = segurarFluidez(900);
      return;
    }
    if (oldState !== State.ACTIVE) return;
    largar.current?.();
    largar.current = null;
    largarGaveta({ deslocacao: translationX, velocidade: velocityX, largura, deAbrir: false, dados: dadosDaPrimeiraGaveta });
  }, [largura]);
  const opacidade = useMemo(() => visto.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] }), [visto]);
  return (
    <PanGestureHandler enabled={aberta} activeOffsetX={-8} failOffsetY={[-16, 16]}
      onGestureEvent={evento} onHandlerStateChange={aoMudar}>
      <Animated.View pointerEvents={aberta ? 'auto' : 'none'}
        style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderRadius: raio, transform: [{ translateX: deslize }] }]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: opacidade }]} />
        <Pressable accessibilityRole="button" accessibilityLabel="Close the drawer" style={StyleSheet.absoluteFill}
          onPress={() => { hapticSelection(); fecharGaveta(); }} />
      </Animated.View>
    </PanGestureHandler>
  );
}

/**
 * O botão da gaveta, ao lado do título da Home: para quem não conhece o gesto.
 * O desenho é o da maquete (uma moldura com a lateral marcada), feito com vistas.
 */
export function BotaoDaGaveta() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open your drawer"
      hitSlop={8}
      onPress={() => { hapticSelection(); abrirGaveta(dadosDaPrimeiraGaveta); }}
      style={({ pressed }) => [styles.botao, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.moldura}>
        <View style={styles.lateral} />
      </View>
      <PontoDaGaveta />
    </Pressable>
  );
}

/** O ponto de luz no botão até a gaveta abrir pela primeira vez (ou passarem cinco aberturas da app). */
function PontoDaGaveta() {
  const costura = useDescoberta((s) => s.costura);
  const reduzido = useReducedMotion();
  const brilho = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!costura || reduzido) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(brilho, { toValue: 0.35, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(brilho, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [costura, reduzido, brilho]);
  if (!costura) return null;
  return <Animated.View pointerEvents="none" style={[styles.ponto, { opacity: brilho }]} />;
}

/**
 * A linha de luz na borda esquerda da Home (6.0.4): a borda da gaveta a dizer
 * que há ali alguma coisa, com um reflexo a descer devagar. Vive DENTRO da app,
 * e desliza com ela. Sai para sempre quando a gaveta abre; com Reduzir
 * movimento fica parada.
 */
export function CosturaDaGaveta() {
  const costura = useDescoberta((s) => s.costura);
  const ecra = useEcraAtual((s) => s.nome);
  const expandido = usePlayer((s) => s.expanded);
  const aberta = useGaveta((s) => s.aberta);
  const reduzido = useReducedMotion();
  const { height } = useWindowDimensions();
  const altura = Math.round(height * 0.62);
  const luz = useRef(new Animated.Value(0)).current;
  const mostrar = costura && ecra === 'Search' && !expandido && !aberta;
  useEffect(() => {
    if (!mostrar || reduzido) return;
    luz.setValue(0);
    // Um reflexo e uma pausa: sempre a descer cansava, e parado não se via.
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(luz, { toValue: 1, duration: 2800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.delay(2200),
    ]));
    loop.start();
    return () => loop.stop();
  }, [mostrar, reduzido, luz]);
  if (!mostrar) return null;
  return (
    <View pointerEvents="none" style={[styles.costura, { top: Math.round(height * 0.18), height: altura }]}>
      <LinearGradient colors={['rgba(201,205,214,0)', 'rgba(201,205,214,0.5)', 'rgba(201,205,214,0)']} style={StyleSheet.absoluteFill} />
      {reduzido ? null : (
        <Animated.View style={[styles.reflexo, {
          opacity: luz.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 1, 1, 0] }),
          transform: [{ translateY: luz.interpolate({ inputRange: [0, 1], outputRange: [-64, altura] }) }],
        }]}>
          <LinearGradient colors={['rgba(233,234,238,0)', '#E9EAEE', 'rgba(233,234,238,0)']} style={StyleSheet.absoluteFill} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  borda: { position: 'absolute', left: 0, top: 0, bottom: 0, width: BORDA },
  botao: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#16161B', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(233,234,238,0.18)',
  },
  moldura: { width: 18, height: 15, borderRadius: 3.5, borderWidth: 1.7, borderColor: colors.text },
  lateral: { position: 'absolute', left: 4.3, top: 0, bottom: 0, width: 1.7, backgroundColor: colors.text },
  ponto: {
    position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: 4, backgroundColor: '#E9EAEE',
    shadowColor: '#E9EAEE', shadowOpacity: 0.8, shadowRadius: 5, shadowOffset: { width: 0, height: 0 },
  },
  costura: {
    position: 'absolute', left: 0, width: 3, borderRadius: 2,
    shadowColor: '#C9CDD6', shadowOpacity: 0.35, shadowRadius: 7, shadowOffset: { width: 0, height: 0 },
  },
  reflexo: { position: 'absolute', left: -1, top: 0, width: 5, height: 64, borderRadius: 3, overflow: 'hidden' },
});
