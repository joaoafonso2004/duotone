import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

interface Props {
  positionMs: number;
  durationMs: number;
  onSeek?: (ms: number) => void;
}

function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ProgressBar({ positionMs, durationMs, onSeek }: Props) {
  const [width, setWidth] = useState(0);
  const fraction =
    durationMs > 0 ? Math.min(1, Math.max(0, positionMs / durationMs)) : 0;

  return (
    <View style={styles.wrap}>
      <Pressable
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onPress={(e) => {
          if (!onSeek || width === 0 || durationMs === 0) return;
          const f = Math.min(1, Math.max(0, e.nativeEvent.locationX / width));
          onSeek(f * durationMs);
        }}
        hitSlop={{ top: 12, bottom: 12 }}
        style={styles.track}
      >
        <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
        <View style={[styles.knob, { left: `${fraction * 100}%` }]} />
      </Pressable>
      <View style={styles.times}>
        <Text style={styles.time}>{fmt(positionMs)}</Text>
        <Text style={styles.time}>{fmt(durationMs)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
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
