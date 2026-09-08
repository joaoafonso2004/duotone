import React from 'react';
import { View } from 'react-native';
import { colors } from '../theme';

/** Barras estáticas: não simulam medições do áudio nem geram animação contínua. */
export function EqualizerIcon({ size = 23, color = colors.textSecondary }: { size?: number; color?: string }) {
  return (
    <View accessible={false} pointerEvents="none" style={{
      width: size, height: size, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    }}>
      {[0.32, 0.5, 0.76, 0.92, 0.82, 0.62, 0.5, 0.72, 0.48, 0.3].map((height, index) => (
        <View key={index} style={{ width: size * 0.055, height: size * height, borderRadius: size, backgroundColor: color }} />
      ))}
    </View>
  );
}
