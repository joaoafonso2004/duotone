import React from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BottomSheet, BottomSheetScrollView } from './BottomSheet';
import { Toque } from './Toque';
import { hapticSelection } from '../lib/haptics';
import { colors, spacing, type } from '../theme';

export type PlayerAction = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

export function PlayerActionsContent({ title, actions }: { title: string; actions: PlayerAction[] }) {
  const { height } = useWindowDimensions();
  return (
    <BottomSheetScrollView style={{ maxHeight: height * 0.65 }} contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={type.title}>{title}</Text>
      <View>
        {actions.map(action => (
          <Toque
            key={action.label}
            acende
            accessibilityRole="button"
            accessibilityLabel={action.label}
            accessibilityState={{ disabled: !!action.disabled }}
            disabled={action.disabled}
            onPress={() => { hapticSelection(); action.onPress(); }}
            style={[styles.action, action.disabled && styles.disabled]}
          >
            <Ionicons name={action.icon} size={21} color={action.destructive ? colors.danger : colors.textSecondary} />
            <Text style={[type.body, styles.label, action.destructive && { color: colors.danger }]}>{action.label}</Text>
          </Toque>
        ))}
      </View>
    </BottomSheetScrollView>
  );
}

export function PlayerActionsSheet({ visible, onClose, ...content }: {
  visible: boolean; onClose: () => void; title: string; actions: PlayerAction[];
}) {
  return <BottomSheet visible={visible} onClose={onClose}><PlayerActionsContent {...content} /></BottomSheet>;
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.sm },
  action: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  label: { flex: 1 },
  disabled: { opacity: 0.4 },
});
