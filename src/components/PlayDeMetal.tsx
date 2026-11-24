import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type Insets, type StyleProp, type ViewStyle } from 'react-native';
import { useAparencia } from '../state/aparencia';
import { colors } from '../theme';
import { COR_DO_ICONE_NO_METAL, DiscoDeMetal } from './DiscoDeMetal';

/**
 * Os plays redondos da app (24/11, o João: "o botão de play do song of the moment
 * deve ser o metálico, assim como todos os play buttons da app"): o disco de metal
 * do leitor (`DiscoDeMetal`) na Daily mix, no perfil, na página do artista, numa
 * playlist e numa música de uma conversa.
 *
 * Segue a opção "Play button" da Personalização, como o leitor: com outra que não
 * o metal fica o disco claro de sempre (o "Filled"). O laço não roda: estes não
 * têm pausa, e rodar só quando o play muda é a regra do disco.
 *
 * O PC tem o seu par (`PlayDeMetal.web.tsx`), com o metal em CSS da barra.
 */

/** Só o desenho: para um play que vive dentro de um toque maior (a linha toda). */
export function DiscoDePlay({ lado, ocupado = false }: { lado: number; ocupado?: boolean }) {
  const metal = useAparencia((s) => s.play) === 'metal';
  const cor = metal ? COR_DO_ICONE_NO_METAL : colors.bg;
  const icone = ocupado
    ? <ActivityIndicator size="small" color={cor} />
    // O `marginLeft` acerta o centro ótico do triângulo.
    : <Ionicons name="play" size={Math.round(lado * 0.42)} color={cor} style={{ marginLeft: Math.round(lado * 0.06) }} />;
  if (metal) return <DiscoDeMetal lado={lado} aTocar={false}>{icone}</DiscoDeMetal>;
  return <View style={[styles.cheio, { width: lado, height: lado, borderRadius: lado / 2 }]}>{icone}</View>;
}

/** O play com o seu próprio toque. */
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
        pressed && { transform: [{ scale: 0.96 }] }, desligado && { opacity: 0.5 }, style]}>
      <DiscoDePlay lado={lado} ocupado={ocupado} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cheio: { backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
});
