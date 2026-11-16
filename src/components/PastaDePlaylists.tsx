import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { FRASES_DAS_PASTAS } from '../lib/pastasDePlaylists';
import { colors, radii, type } from '../theme';

/**
 * Uma pasta de playlists na grelha das Playlists (16/11, lib/pastasDePlaylists.ts):
 * como as pastas do ecrã principal do iPhone, um quadrado de vidro escuro com
 * as capas das primeiras quatro lá dentro, pequenas e em grelha. Do tamanho de
 * um cartão de playlist, com o nome e quantas tem por baixo.
 */
export function PastaDePlaylists({ nome, capas, quantas, lado, onPress, onLongPress }: {
  nome: string;
  capas: readonly string[];
  quantas: number;
  lado: number;
  onPress: () => void;
  onLongPress?: () => void;
  /** Só no PC (o par .web.tsx): o botão direito e o arrastar do HTML. Aqui não há. */
  eventos?: Record<string, unknown>;
  alvo?: boolean;
}) {
  const dentro = lado * 0.78;
  const espaco = lado * 0.05;
  const mini = (dentro - espaco) / 2;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${nome}, folder, ${FRASES_DAS_PASTAS.quantas(quantas)}`}
      style={({ pressed }) => [{ width: lado }, pressed && { opacity: 0.8 }]}
    >
      <View style={[styles.vidro, { width: lado, height: lado }]}>
        <View style={{ width: dentro, height: dentro, flexDirection: 'row', flexWrap: 'wrap', gap: espaco }}>
          {[0, 1, 2, 3].map((i) => {
            const uri = capaParaLista(capas[i] ?? null);
            return (
              <View key={i} style={[styles.mini, { width: mini, height: mini }]}>
                {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : null}
              </View>
            );
          })}
        </View>
      </View>
      <View style={styles.titulo}>
        <Ionicons name="folder-outline" size={14} color={colors.textSecondary} />
        <Text numberOfLines={1} style={[type.headline, { flex: 1 }]}>{nome}</Text>
      </View>
      <Text numberOfLines={1} style={type.caption}>{FRASES_DAS_PASTAS.quantas(quantas)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  vidro: {
    borderRadius: radii.lg,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mini: { borderRadius: radii.sm, overflow: 'hidden', backgroundColor: colors.surfaceHigh },
  titulo: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
});
