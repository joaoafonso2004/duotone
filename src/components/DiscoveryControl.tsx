import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DISCOVERY_MODES, DISCOVERY_MODE_COPY, type DiscoveryMode } from '../lib/discoveryControl';
import { definirDiscoveryMode, useDiscoveryControl } from '../state/discoveryControl';
import { useTheme } from '../state/theme';
import { colors, radii, spacing, type } from '../theme';

/** O mesmo controlo no iPhone e no Windows; muda o motor, não só a copy. */
export function DiscoveryControl({ compact = false }: { compact?: boolean }) {
  const tema = useTheme((s) => s.theme);
  const mode = useDiscoveryControl((s) => s.mode);
  const ready = useDiscoveryControl((s) => s.ready);

  return (
    <View style={[styles.root, compact && styles.compact]} accessibilityLabel="Discovery control">
      <View style={styles.heading}>
        <View style={[styles.icon, { backgroundColor: tema.soft }]}>
          <Ionicons name="options-outline" size={16} color={tema.color} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>Discovery control</Text>
          <Text style={styles.description}>{DISCOVERY_MODE_COPY[mode].description}</Text>
        </View>
      </View>
      <View style={styles.options} accessibilityRole="radiogroup">
        {DISCOVERY_MODES.map((item: DiscoveryMode) => {
          const active = item === mode;
          return (
            <Pressable
              key={item}
              accessibilityRole="radio"
              accessibilityState={{ checked: active, disabled: !ready }}
              disabled={!ready}
              onPress={() => void definirDiscoveryMode(item)}
              style={({ pressed, hovered }: any) => [
                styles.option,
                active && { backgroundColor: tema.soft, borderColor: tema.color },
                (pressed || hovered) && !active && styles.optionHover,
                !ready && { opacity: 0.5 },
              ]}
            >
              <Text style={[styles.optionText, active && { color: tema.color, fontWeight: '800' }]}>
                {DISCOVERY_MODE_COPY[item].label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  compact: { maxWidth: 620 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  title: { ...type.body, fontWeight: '800' },
  description: { ...type.caption, fontSize: 12, marginTop: 2 },
  options: {
    flexDirection: 'row', padding: 3, borderRadius: radii.pill,
    backgroundColor: colors.surfaceHigh, gap: 3,
  },
  option: {
    flex: 1, minHeight: 34, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.sm, borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent',
  },
  optionHover: { backgroundColor: colors.surfacePressed },
  optionText: { ...type.caption, fontSize: 12, color: colors.textSecondary },
});
