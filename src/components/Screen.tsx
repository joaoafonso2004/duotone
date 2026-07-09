import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, type } from '../theme';

interface Props {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  /** Fila pequena acima do título (ex.: botão de Definições) — canto superior esquerdo. */
  topLeft?: React.ReactNode;
  onBack?: () => void;
  children: React.ReactNode;
  style?: ViewStyle;
}

/** Wrapper de ecrã: fundo, safe area e cabeçalho com título grande. */
export function Screen({ title, subtitle, right, topLeft, onBack, children, style }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      {/* Imagem de fundo abstrata */}
      <Image
        source={require('../../assets/login_bg.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={300}
      />

      {/* Camada de desfoque (blur) */}
      <BlurView
        intensity={20}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />

      {/* Camada preta semi-transparente para alto contraste e legibilidade */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: 'rgba(10, 10, 15, 0.88)' }
        ]}
      />

      {/* Conteúdo do ecrã com margem segura notch */}
      <View style={{ flex: 1, paddingTop: insets.top + spacing.sm }}>
        {topLeft ? <View style={styles.topLeftRow}>{topLeft}</View> : null}
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topLeftRow: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xs,
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
