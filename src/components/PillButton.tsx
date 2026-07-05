import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, gradients, radii } from '../theme';

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
  const inner = (
    <Text
      style={[
        styles.label,
        small && { fontSize: 13 },
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
        colors={gradients.aurora}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.base, small && styles.small]}
      >
        {loading ? <ActivityIndicator color="#fff" /> : inner}
      </LinearGradient>
    ) : (
      <React.Fragment>
        {loading ? <ActivityIndicator color={colors.text} /> : inner}
      </React.Fragment>
    );

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        variant !== 'primary' && [styles.base, styles.ghost, small && styles.small],
        pressed && { opacity: 0.75 },
        (disabled || loading) && { opacity: 0.45 },
        style,
      ]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
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
  label: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
