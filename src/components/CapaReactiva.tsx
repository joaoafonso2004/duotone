import React from 'react';
import { Image, StyleSheet } from 'react-native';
export type CapaReactivaProps = { uri: string; size: number; active: boolean; onError: () => void };
export function CapaReactiva({ uri, onError }: CapaReactivaProps) {
  return <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={onError} />;
}
