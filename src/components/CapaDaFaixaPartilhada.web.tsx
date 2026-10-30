import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CapaDuotone } from '../desktop/duotone.web';
import { useSaved } from '../state/saved';
import { colors } from '../theme';
import type { Track } from '../types';

/**
 * A capa de uma música partilhada na conversa, no PC (30/10, passo 7 de
 * `docs/PLANO-ELEVAR-PC.md`): a dois tons enquanto a música não é tua, e a
 * cores quando a guardas (a mesma regra da Discover daily da Home: "new to you,
 * two-tone until you keep it"). O rato na capa devolve-lhe a cor. É o que o
 * leitor tem à mão sem um pedido: a biblioteca (`useSaved`).
 */
const guardada = (faixa: Track) => (s: { keys: Set<string> }) => s.keys.has(`${faixa.source}:${faixa.sourceId}`);

export function CapaDaFaixaPartilhada({ faixa, capa, estilo, estiloVazio }: { faixa: Track; capa: string | null; estilo: any; estiloVazio: any }) {
  const minha = useSaved(guardada(faixa));
  if (!capa) {
    return <View style={estiloVazio}><Ionicons name="musical-notes" size={15} color={colors.textTertiary} /></View>;
  }
  // O `estilo` traz o tamanho e o raio da capa de sempre; o quadro enche-o.
  const { width, height, borderRadius } = StyleSheet.flatten(estilo) as { width: number; height: number; borderRadius: number };
  return <View style={{ width, height, flexShrink: 0 }}>
    <CapaDuotone uri={capa} viva={minha} style={{ borderRadius }} />
  </View>;
}

/** "New to you" por cima do título enquanto a música não é tua. */
export function EtiquetaDaFaixaPartilhada({ faixa }: { faixa: Track }) {
  const minha = useSaved(guardada(faixa));
  if (minha) return null;
  return <Text numberOfLines={1} style={estilos.etiqueta}>NEW TO YOU</Text>;
}

const estilos = StyleSheet.create({
  etiqueta: { fontSize: 10, letterSpacing: 1.4, color: '#d6f26b', marginBottom: 2, fontWeight: '600' },
});
