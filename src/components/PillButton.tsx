import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native';
import { hapticImpact, ImpactFeedbackStyle } from '../lib/haptics';
import { colors, gradients, radii, spacing } from '../theme';
import { useTheme } from '../state/theme';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: ViewStyle;
}

export function PillButton({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  small,
  style,
}: Props) {
  const theme = useTheme((s) => s.theme);

  const inner = (
    <Text
      style={[
        styles.label,
        small && { fontSize: 13 },
        variant === 'primary' && { color: theme.textColorOnGradient },
        variant === 'ghost' && { color: colors.text },
        variant === 'danger' && { color: colors.danger },
      ]}
    >
      {label}
    </Text>
  );

  const body =
    variant === 'primary' ? (
      <LinearGradient
        colors={theme.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.base, small && styles.small]}
      >
        {loading ? <><ActivityIndicator color={theme.textColorOnGradient} />{inner}</> : inner}
      </LinearGradient>
    ) : (
      <React.Fragment>
        {loading ? <><ActivityIndicator color={variant === 'danger' ? colors.danger : colors.text} />{inner}</> : inner}
      </React.Fragment>
    );

  return (
    <Pressable
      onPress={() => {
        hapticImpact(ImpactFeedbackStyle.Medium);
        onPress();
      }}
      disabled={disabled || loading}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={({ pressed }) => [
        variant === 'ghost' && [styles.base, styles.ghost, small && styles.small],
        variant === 'danger' && [styles.base, styles.danger, small && styles.small],
        pressed && { opacity: 0.75 },
        // A carregar NÃO apaga (20/10, B3): a roda ao lado do texto, a 100 %. A
        // 45 % parecia o botão indisponível ao lado -- um toque recusado.
        disabled && !loading && { opacity: 0.45 },
        style,
      ]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: radii.pill,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: {
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  ghost: {
    backgroundColor: colors.surfaceHigh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  danger: {
    backgroundColor: 'rgba(255,69,58,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,69,58,0.35)',
  },
  label: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
