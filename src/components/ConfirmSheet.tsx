import React from 'react';
import { Text, View } from 'react-native';
import { spacing, type } from '../theme';
import { BottomSheet } from './BottomSheet';
import { PillButton } from './PillButton';

interface Props {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  destructive?: boolean;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/** Substituto limpo do Alert de confirmação — ações destrutivas bem sinalizadas. */
export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  destructive,
  loading,
  onClose,
  onConfirm,
}: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={[type.title, { marginBottom: 6 }]}>{title}</Text>
      {message ? (
        <Text style={[type.caption, { lineHeight: 19, marginBottom: spacing.sm }]}>
          {message}
        </Text>
      ) : null}

      <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
        <PillButton
          label={confirmLabel}
          variant={destructive ? 'danger' : 'primary'}
          loading={loading}
          onPress={onConfirm}
        />
        <PillButton label="Cancel" variant="ghost" onPress={onClose} />
      </View>
    </BottomSheet>
  );
}
