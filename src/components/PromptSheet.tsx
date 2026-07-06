import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { spacing, type } from '../theme';
import { BottomSheet } from './BottomSheet';
import { Input } from './Input';
import { PillButton } from './PillButton';

interface Props {
  visible: boolean;
  title: string;
  placeholder?: string;
  initialValue?: string;
  submitLabel: string;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
}

/** Substituto limpo do Alert.prompt — input num bottom sheet do design system. */
export function PromptSheet({
  visible,
  title,
  placeholder,
  initialValue,
  submitLabel,
  loading,
  onClose,
  onSubmit,
}: Props) {
  const [value, setValue] = useState(initialValue ?? '');

  useEffect(() => {
    if (visible) setValue(initialValue ?? '');
  }, [visible, initialValue]);

  const submit = () => {
    if (!value.trim()) return;
    onSubmit(value.trim());
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={[type.title, { marginBottom: spacing.lg }]}>{title}</Text>
      <Input
        placeholder={placeholder}
        value={value}
        onChangeText={setValue}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={submit}
        onClear={() => setValue('')}
      />
      <PillButton
        label={submitLabel}
        onPress={submit}
        loading={loading}
        disabled={!value.trim()}
        style={{ marginTop: spacing.lg }}
      />
    </BottomSheet>
  );
}
