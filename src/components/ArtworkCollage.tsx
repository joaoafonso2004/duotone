import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radii } from '../theme';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';

/**
 * Colagem 2x2 com as capas das primeiras faixas da playlist.
 *
 * Pelo `capaParaLista` (28/9): as capas do YouTube vêm como `hqdefault`, 4:3
 * com as barras pretas DENTRO da imagem, e cortar para quadrado não as tira --
 * cada quarto do mosaico tinha uma faixa preta. As listas já as tiravam assim.
 */
export function ArtworkCollage({
  artworks: capas,
  size,
}: {
  artworks: string[];
  size: number;
}) {
  const artworks = capas.map(capaParaLista).filter((u): u is string => !!u);
  if (artworks.length === 0) {
    return (
      <View
        style={[
          styles.fallback,
          { width: size, height: size, borderRadius: radii.md },
        ]}
      >
        <Ionicons
          name="musical-notes"
          size={size * 0.28}
          color={colors.textTertiary}
        />
      </View>
    );
  }

  if (artworks.length < 4) {
    return (
      <Image
        source={{ uri: artworks[0] }}
        style={{ width: size, height: size, borderRadius: radii.md }}
        contentFit="cover"
        transition={150}
      />
    );
  }

  const half = size / 2;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radii.md,
        overflow: 'hidden',
        flexDirection: 'row',
        flexWrap: 'wrap',
      }}
    >
      {artworks.slice(0, 4).map((uri, i) => (
        <Image
          key={`${uri}-${i}`}
          source={{ uri }}
          style={{ width: half, height: half }}
          contentFit="cover"
          transition={150}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
