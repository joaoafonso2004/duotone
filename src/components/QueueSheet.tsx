import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePlayer } from '../state/player';
import { colors, spacing, type, radii } from '../theme';
import { BottomSheet } from './BottomSheet';
import { TrackRow } from './TrackRow';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function QueueSheet({ visible, onClose }: Props) {
  const current = usePlayer((s) => s.current);
  const queue = usePlayer((s) => s.queue);
  const queueIndex = usePlayer((s) => s.queueIndex);
  const playTrack = usePlayer((s) => s.playTrack);

  // Tracks after the current track
  const upNext = queue.slice(queueIndex + 1);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <Text style={type.title}>Play Queue</Text>
        <Text style={type.caption}>
          {queue.length} {queue.length === 1 ? 'song' : 'songs'} in queue
        </Text>
      </View>

      <Text style={[type.micro, styles.sectionTitle]}>NOW PLAYING</Text>
      {current ? (
        <View style={styles.nowPlayingCard}>
          <TrackRow
            track={current}
            active
            onPress={onClose}
          />
        </View>
      ) : (
        <Text style={styles.emptyText}>Nothing playing</Text>
      )}

      <Text style={[type.micro, styles.sectionTitle, { marginTop: spacing.lg }]}>
        UP NEXT ({upNext.length})
      </Text>

      {upNext.length > 0 ? (
        <FlatList
          data={upNext}
          keyExtractor={(item, index) => `${item.source}:${item.sourceId}-${index}`}
          style={styles.list}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item, index }) => (
            <TrackRow
              track={item}
              onPress={() => {
                playTrack(item, queue);
                // The new queue index will be calculated inside playTrack
              }}
            />
          )}
        />
      ) : (
        <Text style={styles.emptyText}>Queue is empty</Text>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    letterSpacing: 1,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  nowPlayingCard: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  list: {
    maxHeight: 300,
  },
  emptyText: {
    ...type.caption,
    textAlign: 'center',
    paddingVertical: spacing.md,
    color: colors.textTertiary,
  },
});
