import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { poseDoVazio } from '../lib/luz';
import { colors, spacing, type } from '../theme';
import { DiscosDoVazio } from './DiscosDoVazio';

interface Props {
  /** Diz a pose dos discos (`poseDoVazio`): o coração é o par, a pesquisa a procura, sem rede o eclipse. */
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

/**
 * Um vazio (ou uma falha no sítio do conteúdo): os dois discos do símbolo numa
 * pose própria do estado (C10, 1/11), o título e a frase. Era um ícone num
 * círculo cinzento.
 */
export function EmptyState({ icon, title, subtitle, children }: Props) {
  return (
    <View style={styles.wrap}>
      <DiscosDoVazio pose={poseDoVazio(icon)} />
      <Text style={[type.headline, { textAlign: 'center' }]}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: 56,
    gap: spacing.sm,
  },
  subtitle: {
    ...type.caption,
    textAlign: 'center',
    lineHeight: 18,
  },
});
