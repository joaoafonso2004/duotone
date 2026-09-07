import React, { useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { BARRA_A_ARRASTAR, BOTAO_DA_BARRA, ESTADO, SOLTAR } from '../lib/movimento';
import { colors } from '../theme';

interface Props {
  positionMs: number;
  durationMs: number;
  onSeek?: (ms: number) => void;
  /** Avisa quando o utilizador começa/pára de arrastar (para desativar o
   *  scroll da página por baixo, que ficava a competir com o gesto). */
  onScrubbingChange?: (scrubbing: boolean) => void;
}

function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ProgressBar({ positionMs, durationMs, onSeek, onScrubbingChange }: Props) {
  const [width, setWidth] = useState(0);
  const reduzido = useReducedMotion();
  /**
   * 0 em repouso, 1 debaixo do dedo.
   *
   * Antes a barra trocava de geometria de um fotograma para o outro: o
   * botao saltava de 10 para 16 px e a margem mudava com ele. Era a troca
   * de fotograma mais visivel da app, porque acontece exactamente no
   * momento em que o dedo esta pousado a olhar para ali.
   */
  const agarrado = useRef(new Animated.Value(0)).current;
  const onScrubbingRef = useRef(onScrubbingChange);
  onScrubbingRef.current = onScrubbingChange;
  // Enquanto o utilizador arrasta, mostramos a posição do DEDO (suave, a
  // seguir o toque) e só chamamos onSeek ao largar — a posição real do player
  // só chega em saltos de 1s, o que fazia a barra andar aos pulos.
  const [dragFraction, setDragFraction] = useState<number | null>(null);
  const widthRef = useRef(0);
  const durationRef = useRef(0);
  widthRef.current = width;
  durationRef.current = durationMs;

  const fractionFromX = (x: number): number => {
    if (widthRef.current === 0) return 0;
    return Math.min(1, Math.max(0, x / widthRef.current));
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        onScrubbingRef.current?.(true);
        setDragFraction(fractionFromX(e.nativeEvent.locationX));
      },
      onPanResponderMove: (e) => {
        setDragFraction(fractionFromX(e.nativeEvent.locationX));
      },
      onPanResponderRelease: (e) => {
        const f = fractionFromX(e.nativeEvent.locationX);
        setDragFraction(null);
        onScrubbingRef.current?.(false);
        if (durationRef.current > 0) onSeek?.(f * durationRef.current);
      },
      onPanResponderTerminate: () => {
        setDragFraction(null);
        onScrubbingRef.current?.(false);
      },
    })
  ).current;

  const playFraction =
    durationMs > 0 ? Math.min(1, Math.max(0, positionMs / durationMs)) : 0;
  const fraction = dragFraction ?? playFraction;
  const dragging = dragFraction !== null;
  const shownMs = dragging ? fraction * durationMs : positionMs;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  useEffect(() => {
    // Agarrar e imediato; largar e que volta com mola. Mesma assimetria do
    // resto da app -- ver src/lib/movimento.ts.
    Animated.spring(agarrado, {
      toValue: dragging ? 1 : 0,
      ...(dragging ? ESTADO : SOLTAR),
      useNativeDriver: true,
    }).start();
  }, [dragging, agarrado]);

  const espessura = reduzido
    ? 1
    : agarrado.interpolate({ inputRange: [0, 1], outputRange: [1, BARRA_A_ARRASTAR] });
  const tamanhoDoBotao = agarrado.interpolate({
    inputRange: [0, 1],
    outputRange: [BOTAO_DA_BARRA.repouso, 1],
  });

  return (
    <View style={styles.wrap}>
      {/* hitSlop maior em cima/baixo para ser fácil de agarrar */}
      <View style={styles.hit} {...pan.panHandlers}>
        {/* A pista e o botao sao IRMAOS e nao pai/filho: a pista engorda por
            `scaleY`, e se o botao vivesse la dentro engordava com ela. */}
        <View style={styles.pista} onLayout={onLayout}>
          <Animated.View style={[styles.track, { transform: [{ scaleY: espessura }] }]}>
            <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
          </Animated.View>
          <Animated.View
            style={[
              styles.knob,
              { left: `${fraction * 100}%` },
              { transform: [{ scale: tamanhoDoBotao }] },
            ]}
          />
        </View>
      </View>
      <View style={styles.times}>
        {/* O tempo decorrido é o que se lê -- "onde vou" pergunta-se muito mais
            do que "quanto dura". Ficavam os dois no mesmo cinzento fraco, e
            nenhum se lia. A geometria não mudou: só o contraste. */}
        <Text style={[styles.time, styles.decorrido, dragging && styles.aArrastar]}>
          {fmt(shownMs)}
        </Text>
        <Text style={styles.time}>{fmt(durationMs)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  hit: {
    paddingVertical: 12,
    justifyContent: 'center',
  },
  // A caixa que da a largura e onde o botao se posiciona. Sem altura
  // propria: e a pista que a define, e o botao sai dela para os lados.
  pista: {
    justifyContent: 'center',
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.14)',
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
    backgroundColor: colors.text,
  },
  // Desenhado sempre no tamanho GRANDE e encolhido por escala. Assim a
  // margem que o centra nao tem de mudar com o estado -- e escalar e a
  // volta do centro, por isso ele nao se desloca ao crescer.
  knob: {
    position: 'absolute',
    width: BOTAO_DA_BARRA.grande,
    height: BOTAO_DA_BARRA.grande,
    borderRadius: BOTAO_DA_BARRA.grande / 2,
    backgroundColor: colors.text,
    marginLeft: -BOTAO_DA_BARRA.grande / 2,
  },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  time: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  decorrido: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  // A arrastar, o número que muda passa a ser o mais legível do ecrã: é a
  // confirmação de para onde se vai, sem precisar de balão nenhum.
  aArrastar: {
    color: colors.text,
  },
});
