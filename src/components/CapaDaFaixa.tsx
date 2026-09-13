import React from 'react';
import { Image, StyleSheet } from 'react-native';

type Props = { uri: string; onError: () => void };

/** A capa simples. No iPhone já não existe shader nem análise do áudio. */
export function CapaDaFaixa({ uri, onError }: Props) {
  return <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={onError} />;
}
