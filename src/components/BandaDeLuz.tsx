import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  DEGRAU_MS, LARGURA_DA_BANDA, LUZ_A_PASSAR_MS, OPACIDADE_DA_BANDA, OPACIDADE_DO_DEGRAU, pedirLuz, TRAVAO, trajetoDaBanda,
  type DirecaoDaLuz,
} from '../lib/luz';
import { pedirFluidez } from '../state/fluidez';

/**
 * A luz como estado no iPhone (S2, 1/11): a banda de luz que passa por uma
 * superfície. As regras vivem no `lib/luz.ts`. Vai dentro da superfície, que
 * a corta (`overflow: 'hidden'`), e não recebe toques.
 *
 * A banda é atirada e trava (o `Animated.decay`, o travão da física), no
 * driver nativo, e só por `translate`.
 * Com outra luz a andar, ou com menos movimento, é o degrau: acende e apaga
 * no sítio. Corre uma vez por `chave` (um aviso novo, um estado novo).
 */
export function BandaDeLuz({ direcao, chave, atraso = 0 }: {
  direcao: DirecaoDaLuz | null;
  chave: string | number;
  /** Deixa a superfície chegar primeiro. */
  atraso?: number;
}) {
  const reduzido = useReducedMotion();
  const [lado, setLado] = useState<{ w: number; h: number } | null>(null);
  const [anda, setAnda] = useState<boolean | null>(null);
  const passo = useRef(new Animated.Value(0)).current;
  const degrau = useRef(new Animated.Value(0)).current;
  const feita = useRef<string | number | null>(null);
  // A animação para só quando a banda sai ou quando chega a seguinte: o
  // tamanho a mudar a meio (o texto do aviso) não a corta.
  const animacao = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => () => animacao.current?.stop(), []);

  useEffect(() => {
    // Uma vez por chave: um texto que muda o tamanho não volta a acender.
    if (!direcao || !lado || feita.current === chave) return;
    feita.current = chave;
    const vai = !reduzido && pedirLuz(LUZ_A_PASSAR_MS + atraso);
    setAnda(vai);
    pedirFluidez(LUZ_A_PASSAR_MS + atraso);
    animacao.current?.stop();
    if (vai) {
      // Em px e não de 0 a 1: o `decay` pára quando anda menos de 0,1 por
      // fotograma, e de 0 a 1 isso era logo no início. Atirada com a velocidade
      // que, a travar, a leva ao fim do caminho.
      const t = trajetoDaBanda(direcao);
      const caminho = Math.abs(t.para - t.de) * (t.eixo === 'x' ? lado.w : lado.h) * LARGURA_DA_BANDA;
      passo.setValue(0);
      animacao.current = Animated.sequence([
        Animated.delay(atraso),
        Animated.decay(passo, { velocity: caminho * (1 - TRAVAO), deceleration: TRAVAO, useNativeDriver: true }),
      ]);
    } else {
      degrau.setValue(0);
      const metade = DEGRAU_MS / 2;
      animacao.current = Animated.sequence([
        Animated.delay(atraso),
        Animated.timing(degrau, { toValue: 1, duration: metade, useNativeDriver: true }),
        Animated.timing(degrau, { toValue: 0, duration: metade, useNativeDriver: true }),
      ]);
    }
    animacao.current.start();
  }, [chave, direcao, lado, reduzido, atraso, passo, degrau]);

  const medir = (e: { nativeEvent: { layout: { width: number; height: number } } }) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (w > 0 && h > 0 && (lado?.w !== w || lado?.h !== h)) setLado({ w, h });
  };

  let luz: React.ReactNode = null;
  if (direcao && lado && anda === true) {
    const t = trajetoDaBanda(direcao);
    const tamanho = (t.eixo === 'x' ? lado.w : lado.h) * LARGURA_DA_BANDA;
    // O passo são os px andados (o decay); o sentido é o do trajeto.
    const caminho = Math.abs(t.para - t.de) * tamanho;
    const mover = passo.interpolate({ inputRange: [0, caminho], outputRange: [t.de * tamanho, t.para * tamanho], extrapolate: 'clamp' });
    const horizontal = t.eixo === 'x';
    luz = (
      <Animated.View style={[
        horizontal ? { top: 0, bottom: 0, left: 0, width: tamanho } : { left: 0, right: 0, top: 0, height: tamanho },
        { position: 'absolute', transform: [horizontal ? { translateX: mover } : { translateY: mover }] },
      ]}>
        <LinearGradient
          colors={['rgba(255,255,255,0)', `rgba(255,255,255,${OPACIDADE_DA_BANDA})`, 'rgba(255,255,255,0)']}
          start={horizontal ? { x: 0, y: 0.4 } : { x: 0.5, y: 0 }}
          end={horizontal ? { x: 1, y: 0.6 } : { x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    );
  } else if (direcao && anda === false) {
    luz = <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(255,255,255,${OPACIDADE_DO_DEGRAU})`, opacity: degrau }]} />;
  }

  return (
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill} onLayout={medir}>
      {luz}
    </View>
  );
}
