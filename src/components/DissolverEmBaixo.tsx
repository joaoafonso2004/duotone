import React from 'react';
import { StyleSheet, View } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * O que está dentro apaga-se para baixo a partir de `desde` (0 a 1): fica
 * transparente, e deixa ver o que está por trás. É uma MÁSCARA, e não um
 * degradê de cor por cima -- é assim que a capa do perfil se dissolve na
 * própria fotografia desfocada (7/10, variante B de `docs/perfil-capa.html`)
 * em vez de escurecer até ao preto. No PC é a `mask-image` do CSS
 * (`DissolverEmBaixo.web.tsx`): a versão web do MaskedView não mascara nada.
 */
export function DissolverEmBaixo({ desde, children }: { desde: number; children: React.ReactNode }) {
  return (
    <MaskedView
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      maskElement={
        <LinearGradient
          colors={['#000', '#000', 'transparent']}
          locations={[0, desde, 1]}
          style={StyleSheet.absoluteFill}
        />
      }
    >
      <View style={StyleSheet.absoluteFill}>{children}</View>
    </MaskedView>
  );
}
