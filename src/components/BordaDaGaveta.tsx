import React, { useCallback, useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { PanGestureHandler, State, type PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import { usePlayer } from '../state/player';
import {
  abrirGaveta, dedoDaGaveta, fecharGaveta, largarGaveta, useEcraAtual, useGaveta,
} from '../state/gaveta';
import { dadosDaPrimeiraGaveta } from '../state/dadosDaGaveta';
import { segurarFluidez } from '../state/fluidez';
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
    </Pressable>
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
});
