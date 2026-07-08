import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radii, spacing } from '../theme';
import { useTheme } from '../state/theme';

interface Props extends TextInputProps {
  icon?: keyof typeof Ionicons.glyphMap;
  onClear?: () => void;
  containerStyle?: StyleProp<ViewStyle>;
  right?: React.ReactNode;
}

export function Input({ icon, onClear, containerStyle, right, ...rest }: Props) {
  const theme = useTheme((s) => s.theme);
  return (
    <View style={[styles.wrap, containerStyle]}>
      {icon ? (
        <Ionicons name={icon} size={17} color={colors.textTertiary} />
      ) : null}
      <TextInput
        placeholderTextColor={colors.textTertiary}
        selectionColor={theme.color}
        style={styles.input}
        {...rest}
      />
      {onClear && rest.value ? (
        <Pressable onPress={onClear} hitSlop={8}>
          <Ionicons
            name="close-circle"
            size={17}
            color={colors.textTertiary}
          />
        </Pressable>
      ) : null}
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    minHeight: 46,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    paddingVertical: 12,
  },
});
