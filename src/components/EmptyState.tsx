import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { poseDoVazio } from '../lib/luz';
import { colors, spacing, type } from '../theme';
import { DiscosDoVazio } from './DiscosDoVazio';
import { PillButton } from './PillButton';

interface Props {
  /** Diz a pose dos discos (`poseDoVazio`): o coração é o par, a pesquisa a procura, sem rede o eclipse. */
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  /**
   * O que fazer a seguir (25/11, item 14 do plano de melhorias): a primeira é a
   * principal, a segunda discreta. Um vazio que só diz o que falta deixa a pessoa
   * sem saber para onde ir.
   */
  acoes?: { rotulo: string; aoTocar: () => void }[];
  children?: React.ReactNode;
}

/**
 * Um vazio (ou uma falha no sítio do conteúdo): os dois discos do símbolo numa
 * pose própria do estado (C10, 1/11), o título e a frase. Era um ícone num
 * círculo cinzento.
 */
export function EmptyState({ icon, title, subtitle, acoes, children }: Props) {
  return (
    <View style={styles.wrap}>
      <DiscosDoVazio pose={poseDoVazio(icon)} />
      <Text style={[type.headline, { textAlign: 'center' }]}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {acoes?.length ? (
        <View style={styles.acoes}>
          {acoes.slice(0, 2).map((a, i) => (
            <PillButton key={a.rotulo} label={a.rotulo} onPress={a.aoTocar} variant={i === 0 ? 'primary' : 'ghost'} small />
          ))}
        </View>
      ) : null}
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
  acoes: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md },
  subtitle: {
    ...type.caption,
    textAlign: 'center',
    lineHeight: 18,
  },
});
