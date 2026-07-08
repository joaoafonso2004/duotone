import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLibrary, removeFromLibrary, removeMultipleFromLibrary } from '../api/library';
import { AddToPlaylistSheet } from '../components/AddToPlaylistSheet';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { TrackRow } from '../components/TrackRow';
import { usePlayer } from '../state/player';
import { colors, MINI_PLAYER_HEIGHT, radii, spacing, type } from '../theme';
import type { Track } from '../types';

export function SongsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  
  const playTrack = usePlayer((s) => s.playTrack);
  const playNext = usePlayer((s) => s.playNext);
  const addToQueue = usePlayer((s) => s.addToQueue);
  const current = usePlayer((s) => s.current);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionTrack, setActionTrack] = useState<Track | null>(null);
  const [playlistTrack, setPlaylistTrack] = useState<Track | null>(null);
  
  // Selection states
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [playlistMultipleOpen, setPlaylistMultipleOpen] = useState(false);

  // Sorting state
  const [sortBy, setSortBy] = useState<'recent' | 'az'>('recent');

  const load = useCallback(async () => {
    try {
      setTracks(await getLibrary());
    } catch {
      // sessão pode ter expirado
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggleSelection = (trackId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      return next;
    });
  };

  const confirmRemoveMultiple = () => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      'Remove from Library',
      `Are you sure you want to remove the ${selectedIds.size} selected tracks?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: doRemoveMultiple },
      ]
    );
  };

  const doRemoveMultiple = async () => {
    const ids = Array.from(selectedIds);
    try {
      const dbIds = tracks
        .filter((t) => t.id && (selectedIds.has(t.id) || (t.source && selectedIds.has(`${t.source}:${t.sourceId}`))))
        .map((t) => t.id)
        .filter(Boolean) as string[];

      if (dbIds.length > 0) {
        await removeMultipleFromLibrary(dbIds);
      }
      setSelectMode(false);
      setSelectedIds(new Set());
      load();
      Alert.alert('Removed', 'Selected tracks removed from library.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not remove tracks.');
    }
  };

  const getSelectedTracksObjects = (): Track[] => {
    return tracks.filter((t) => {
      const id = t.id ?? `${t.source}:${t.sourceId}`;
      return selectedIds.has(id);
    });
  };

  const sortedTracks = [...tracks].sort((a, b) => {
    if (sortBy === 'az') {
      return a.title.localeCompare(b.title);
    }
    return 0; // default order from database (added_at desc)
  });

  const bottomPad = 49 + insets.bottom + MINI_PLAYER_HEIGHT + (selectMode ? 80 : 32);

  return (
    <Screen
      title="Songs"
      subtitle={`${tracks.length} saved ${tracks.length === 1 ? 'song' : 'songs'}`}
      right={
        <Pressable
          hitSlop={10}
          onPress={() => navigation.navigate('Settings')}
          style={{ padding: 4 }}
        >
          <Ionicons name="settings-outline" size={24} color={colors.text} />
        </Pressable>
      }
    >
      {loading ? (
        <ActivityIndicator color={colors.text} style={{ marginTop: 48 }} />
      ) : tracks.length === 0 ? (
        <EmptyState
          icon="heart-outline"
          title="Your library is empty"
          subtitle="Search for tracks and save the ones you love."
        />
      ) : (
        <View style={{ flex: 1 }}>
          {/* Sorting & Edit Mode Filters */}
          <View style={styles.filtersRow}>
            <View style={styles.filters}>
              <Pressable
                style={[styles.chip, sortBy === 'recent' && styles.chipActive]}
                onPress={() => setSortBy('recent')}
              >
                <Text style={[styles.chipLabel, sortBy === 'recent' && { color: colors.text }]}>Recent</Text>
              </Pressable>
              <Pressable
                style={[styles.chip, sortBy === 'az' && styles.chipActive]}
                onPress={() => setSortBy('az')}
              >
                <Text style={[styles.chipLabel, sortBy === 'az' && { color: colors.text }]}>A–Z</Text>
              </Pressable>
            </View>

            <Pressable
              style={styles.selectButton}
              onPress={() => {
                if (selectMode) {
                  setSelectMode(false);
                  setSelectedIds(new Set());
                } else {
                  setSelectMode(true);
                }
              }}
            >
              <Text style={[styles.selectButtonText, selectMode && { color: colors.text }]}>
                {selectMode ? 'Cancel' : 'Select'}
              </Text>
            </Pressable>
          </View>

          <FlatList
            data={sortedTracks}
            keyExtractor={(t) => t.id ?? `${t.source}:${t.sourceId}`}
            contentContainerStyle={{ paddingBottom: bottomPad }}
            renderItem={({ item }) => {
              const itemId = item.id ?? `${item.source}:${item.sourceId}`;
              return (
                <TrackRow
                  track={item}
                  active={
                    !selectMode &&
                    current?.source === item.source &&
                    current?.sourceId === item.sourceId
                  }
                  selectMode={selectMode}
                  selected={selectedIds.has(itemId)}
                  onPress={() => {
                    if (selectMode) {
                      toggleSelection(itemId);
                    } else {
                      playTrack(item, sortedTracks);
                    }
                  }}
                  onAction={() => setActionTrack(item)}
                />
              );
            }}
          />
        </View>
      )}

      {/* Floating Multi-select Action Bar */}
      {selectMode && (
        <View style={[styles.actionBar, { bottom: 49 + insets.bottom + MINI_PLAYER_HEIGHT + 8 }]}>
          <Pressable
            style={styles.actionButton}
            onPress={() => setPlaylistMultipleOpen(true)}
            disabled={selectedIds.size === 0}
          >
            <Ionicons
              name="list-outline"
              size={20}
              color={selectedIds.size === 0 ? colors.textTertiary : colors.text}
            />
            <Text style={[styles.actionLabel, selectedIds.size === 0 && { color: colors.textTertiary }]}>
              Add to Playlist
            </Text>
          </Pressable>
          <Pressable
            style={styles.actionButton}
            onPress={confirmRemoveMultiple}
            disabled={selectedIds.size === 0}
          >
            <Ionicons
              name="trash-outline"
              size={20}
              color={selectedIds.size === 0 ? colors.textTertiary : colors.danger}
            />
            <Text
              style={[
                styles.actionLabel,
                { color: selectedIds.size === 0 ? colors.textTertiary : colors.danger },
              ]}
            >
              Delete
            </Text>
          </Pressable>
        </View>
      )}

      <TrackActionsSheet
        visible={!!actionTrack}
        track={actionTrack}
        onClose={() => setActionTrack(null)}
        actions={[
          {
            icon: 'play-outline',
            label: 'Tocar a seguir',
            onPress: () => {
              const t = actionTrack;
              setActionTrack(null);
              if (t) playNext(t);
            },
          },
          {
            icon: 'add-circle-outline',
            label: 'Adicionar à fila',
            onPress: () => {
              const t = actionTrack;
              setActionTrack(null);
              if (t) addToQueue(t);
            },
          },
          {
            icon: 'list-outline',
            label: 'Add to playlist…',
            onPress: () => {
              const t = actionTrack;
              setActionTrack(null);
              setPlaylistTrack(t);
            },
          },
          {
            icon: 'trash-outline',
            label: 'Remove from Library',
            destructive: true,
            onPress: async () => {
              const t = actionTrack;
              setActionTrack(null);
              if (!t?.id) return;
              try {
                await removeFromLibrary(t.id);
                load();
              } catch (e: any) {
                Alert.alert('Error', e?.message ?? 'Could not remove the track.');
              }
            },
          },
        ]}
      />

      <AddToPlaylistSheet
        visible={!!playlistTrack}
        track={playlistTrack}
        onClose={() => setPlaylistTrack(null)}
      />

      <AddToPlaylistSheet
        visible={playlistMultipleOpen}
        tracks={getSelectedTracksObjects()}
        onClose={() => {
          setPlaylistMultipleOpen(false);
          setSelectMode(false);
          setSelectedIds(new Set());
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  filters: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.surfacePressed,
    borderColor: colors.borderStrong,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  selectButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  selectButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  actionBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 60,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceHigh,
    borderColor: colors.borderStrong,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
});
