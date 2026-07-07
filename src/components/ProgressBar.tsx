import React, { useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from 'react-native';
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

  return (
    <View style={styles.wrap}>
      {/* hitSlop maior em cima/baixo para ser fácil de agarrar */}
      <View style={styles.hit} {...pan.panHandlers}>
        <View style={styles.track} onLayout={onLayout}>
          <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
          <View
            style={[
              styles.knob,
              { left: `${fraction * 100}%` },
              dragging && styles.knobActive,
            ]}
          />
        </View>
      </View>
      <View style={styles.times}>
        <Text style={styles.time}>{fmt(shownMs)}</Text>
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
  knob: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.text,
    marginLeft: -5,
    top: -3,
  },
  knobActive: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginLeft: -8,
    top: -6,
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
});
