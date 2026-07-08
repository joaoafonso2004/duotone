import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { hapticImpact } from '../lib/haptics';
import { isShowTrackDurationSync } from '../lib/prefs';
import { colors, radii, spacing, type } from '../theme';
import { useTheme } from '../state/theme';
import type { Track } from '../types';
import { SourceBadge } from './SourceBadge';

interface Props {
  track: Track;
  active?: boolean;
  onPress: () => void;
  onAction?: () => void;
  actionIcon?: keyof typeof Ionicons.glyphMap;
  selectMode?: boolean;
  selected?: boolean;
}

function formatDuration(s: number | null): string {
  if (!s) return '';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function TrackRow({
  track,
  active,
  onPress,
  onAction,
  actionIcon = 'ellipsis-horizontal',
  selectMode = false,
  selected = false,
}: Props) {
  const theme = useTheme((s) => s.theme);

  return (
    <Pressable
      onPress={() => {
        hapticImpact();
        onPress();
      }}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: colors.surface },
        active && { backgroundColor: theme.soft },
      ]}
    >
      {selectMode && (
        <View style={styles.checkboxContainer}>
          <Ionicons
            name={selected ? 'checkbox' : 'square-outline'}
            size={22}
            color={selected ? colors.text : colors.textSecondary}
          />
        </View>
      )}
      <View style={styles.artworkWrap}>
        {track.artworkUrl ? (
          <Image
            source={{ uri: track.artworkUrl }}
            style={styles.artwork}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View style={[styles.artwork, styles.artworkFallback]}>
            <Ionicons
              name="musical-notes"
              size={18}
              color={colors.textTertiary}
            />
          </View>
        )}
      </View>

      <View style={styles.meta}>
        <Text
          numberOfLines={1}
          style={[type.body, { fontWeight: '600' }, active && { color: theme.color }]}
        >
          {track.title}
        </Text>
        <View style={styles.metaRow}>
          <SourceBadge source={track.source} />
          {track.artist ? (
            <Text numberOfLines={1} style={[type.caption, { flexShrink: 1 }]}>
              {track.artist}
            </Text>
          ) : null}
        </View>
      </View>

      {isShowTrackDurationSync() ? (
        <Text style={styles.duration}>{formatDuration(track.durationSeconds)}</Text>
      ) : null}

      {!selectMode && onAction ? (
        <Pressable
          onPress={() => {
            hapticImpact();
            onAction();
          }}
          hitSlop={10}
          style={styles.actionBtn}
        >
          <Ionicons name={actionIcon} size={18} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  active: {
    backgroundColor: colors.accentSoft,
  },
  checkboxContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 2,
  },
  artworkWrap: {
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
  artwork: {
    width: 52,
    height: 52,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceHigh,
  },
  artworkFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    flex: 1,
    gap: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  duration: {
    ...type.caption,
    fontVariant: ['tabular-nums'],
  },
  actionBtn: {
    padding: 4,
  },
});
