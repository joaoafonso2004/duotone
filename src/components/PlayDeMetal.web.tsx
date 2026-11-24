import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { ActivityIndicator, Pressable, View, type Insets, type StyleProp, type ViewStyle } from 'react-native';
import { marcar } from '../desktop/ui.web';
import { COR_DO_ICONE_NO_METAL } from './DiscoDeMetal';

/**
 * O par do PC de `PlayDeMetal.tsx` (24/11): o mesmo disco de metal da barra do
 * leitor, pelas regras `[data-dt~="disco-metal"]` e `reflexo` que a casca escreve
 * (desktop/DiscoDeMetal.web.ts). No PC o metal é sempre o play: não há a opção.
 */

/** Só o desenho: para um play que vive dentro de um toque maior (a linha toda). */
export function DiscoDePlay({ lado, ocupado = false }: { lado: number; ocupado?: boolean }) {
  return (
    <View {...marcar('disco-metal')} style={{ width: lado, height: lado, borderRadius: lado / 2, alignItems: 'center', justifyContent: 'center' }}>
      <View {...marcar('reflexo')} />
      <View style={{ zIndex: 1 }}>
        {ocupado
          ? <ActivityIndicator size="small" color={COR_DO_ICONE_NO_METAL} />
          : <Ionicons name="play" size={Math.round(lado * 0.42)} color={COR_DO_ICONE_NO_METAL} style={{ marginLeft: Math.round(lado * 0.06) }} />}
      </View>
    </View>
  );
}

/** O play com o seu próprio clique. */
export function PlayDeMetal({ lado, label, onPress, desligado = false, ocupado = false, hitSlop, style }: {
  lado: number;
  label: string;
  onPress: () => void;
  desligado?: boolean;
  ocupado?: boolean;
  hitSlop?: number | Insets;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: desligado, busy: ocupado }}
      disabled={desligado} onPress={onPress} hitSlop={hitSlop}
      style={({ pressed }) => [{ width: lado, height: lado, borderRadius: lado / 2 },
        pressed && { transform: [{ scale: 0.97 }] }, desligado && { opacity: 0.5 }, style]}>
      <DiscoDePlay lado={lado} ocupado={ocupado} />
    </Pressable>
  );
}
