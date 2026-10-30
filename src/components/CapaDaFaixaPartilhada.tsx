import React from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { colors } from '../theme';
import type { Track } from '../types';

/**
 * A capa de uma música partilhada na conversa (iPhone). O PC tem a sua
 * (`CapaDaFaixaPartilhada.web.tsx`, 30/10): a dois tons até a música ser tua.
 * Aqui fica o que sempre houve: a capa, ou uma nota musical.
 */
export function CapaDaFaixaPartilhada({ capa, estilo, estiloVazio }: { faixa: Track; capa: string | null; estilo: any; estiloVazio: any }) {
  return capa ? (
    <Image source={{ uri: capa }} style={estilo} contentFit="cover" />
  ) : (
    <View style={estiloVazio}>
      <Ionicons name="musical-notes" size={15} color={colors.textTertiary} />
    </View>
  );
}

/** A etiqueta por cima do título: só no PC. */
export function EtiquetaDaFaixaPartilhada(_props: { faixa: Track }): React.ReactElement | null {
  return null;
}
