import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { PoseDoVazio } from '../lib/luz';

/**
 * Os dois discos do símbolo num vazio (C10, 1/11, `docs/elevacao-maquete.html`),
 * numa pose por estado (`poseDoVazio`, `lib/luz.ts`). As duas plataformas: o
 * `Empty` do PC e o `EmptyState` do iPhone. É decoração: o título e a frase
 * do vazio é que o dizem, por isso não chega ao VoiceOver.
 */
const LARGURA = 110;
const ALTURA = 64;
const MEIO = ALTURA / 2;

/** Metal escovado: claro em cima à esquerda, escuro em baixo à direita. */
const METAL_CLARO = ['#D9DBE1', '#8F929B', '#4D5059'] as const;
const METAL_ESCURO = ['#9DA0AA', '#5C5F68', '#2E3038'] as const;

function Disco({ cx, r, tom }: { cx: number; r: number; tom: 'claro' | 'escuro' }) {
  return (
    <View style={{ position: 'absolute', left: cx - r, top: MEIO - r, width: r * 2, height: r * 2, borderRadius: r, overflow: 'hidden' }}>
      <LinearGradient colors={tom === 'claro' ? METAL_CLARO : METAL_ESCURO} start={{ x: 0.2, y: 0.1 }} end={{ x: 0.85, y: 0.95 }} style={StyleSheet.absoluteFill} />
    </View>
  );
}

function Circulo({ cx, r, estilo }: { cx: number; r: number; estilo: object }) {
  return <View style={[{ position: 'absolute', left: cx - r, top: MEIO - r, width: r * 2, height: r * 2, borderRadius: r }, estilo]} />;
}

export function DiscosDoVazio({ pose }: { pose: PoseDoVazio }) {
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: LARGURA, height: ALTURA, marginBottom: 6 }}>
      {pose === 'par' ? <><Disco cx={32} r={20} tom="claro" /><Disco cx={80} r={20} tom="escuro" /></> : null}
      {pose === 'procura' ? <><Disco cx={30} r={20} tom="claro" /><Disco cx={80} r={20} tom="escuro" /></> : null}
      {pose === 'espaco' ? <>
        <Disco cx={42} r={20} tom="claro" />
        <Circulo cx={72} r={20} estilo={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(233,234,238,0.3)' }} />
      </> : null}
      {pose === 'eclipse' ? <>
        <Disco cx={50} r={22} tom="escuro" />
        <Circulo cx={62} r={21} estilo={{ backgroundColor: '#0D0D11', borderWidth: 1, borderColor: 'rgba(233,234,238,0.85)' }} />
      </> : null}
    </View>
  );
}
