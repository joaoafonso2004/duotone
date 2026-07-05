import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, type } from '../theme';

interface Props {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  onBack?: () => void;
  children: React.ReactNode;
  style?: ViewStyle;
}

/** Wrapper de ecrã: fundo, safe area e cabeçalho com título grande. */
export function Screen({ title, subtitle, right, onBack, children, style }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      {title ? (
        <View style={styles.header}>
          {onBack ? (
            <Pressable hitSlop={10} onPress={onBack} style={styles.back}>
              <Ionicons name="chevron-back" size={26} color={colors.text} />
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={onBack ? type.title : type.largeTitle}>
              {title}
            </Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      ) : null}
      <View style={[{ flex: 1 }, style]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  back: {
    marginRight: spacing.sm,
    marginBottom: 2,
    marginLeft: -8,
  },
  subtitle: {
    ...type.caption,
    marginTop: 2,
  },
});
