import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useState, useMemo } from 'react';
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
import { Input } from '../components/Input';
import { useSaved } from '../state/saved';
import { usePlayer } from '../state/player';
import { BrilhoInteligente } from '../components/BrilhoInteligente';
import { useTheme } from '../state/theme';
import { colors, MINI_PLAYER_HEIGHT, radii, spacing, type } from '../theme';
import type { Track } from '../types';

export function SongsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  
  const playTrack = usePlayer((s) => s.playTrack);
  const playShuffled = usePlayer((s) => s.playShuffled);
  const inteligente = usePlayer((s) => s.shuffleInteligente);
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

  // Search & Theme states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const theme = useTheme((s) => s.theme);

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
      // O conjunto de "já guardadas" alimenta a marca nos resultados de
      // pesquisa; sem isto o coração ficava lá até reiniciar a app (os
      // separadores ficam montados).
      useSaved.getState().refresh();
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

  const filteredTracks = useMemo(() => {
    if (!searchQuery.trim()) return tracks;
    const query = searchQuery.toLowerCase();
    return tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(query) ||
        (t.artist ?? '').toLowerCase().includes(query)
    );
  }, [tracks, searchQuery]);

  const sortedTracks = useMemo(() => {
    const list = [...filteredTracks];
    if (sortBy === 'az') {
      return list.sort((a, b) => a.title.localeCompare(b.title));
    }
    return list; // default order from database (added_at desc)
  }, [filteredTracks, sortBy]);

  const bottomPad = 49 + insets.bottom + MINI_PLAYER_HEIGHT + (selectMode ? 80 : 32);

  return (
    <Screen
      title="Songs"
      subtitle={`${tracks.length} saved ${tracks.length === 1 ? 'song' : 'songs'}`}
      right={
        tracks.length > 0 ? (
          <Pressable
            hitSlop={10}
            onPress={() => {
              setSearchOpen(!searchOpen);
              if (searchOpen) setSearchQuery('');
            }}
            style={{ padding: 4 }}
          >
            <Ionicons name={searchOpen ? "close" : "search-outline"} size={24} color={colors.text} />
          </Pressable>
        ) : undefined
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
          {searchOpen && (
            <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.md }}>
              <Input
                icon="search"
                placeholder="Search saved songs"
                value={searchQuery}
                onChangeText={setSearchQuery}
                onClear={() => setSearchQuery('')}
              />
            </View>
          )}

          {!selectMode && sortedTracks.length > 0 && (
            <View style={styles.actionRow}>
              <Pressable
                style={styles.playButton}
                onPress={() => playTrack(sortedTracks[0], sortedTracks, true)}
              >
                <LinearGradient
                  colors={theme.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.buttonGradient}
                >
                  <Ionicons name="play" size={18} color={theme.textColorOnGradient} />
                  <Text style={[styles.buttonTextPlay, { color: theme.textColorOnGradient }]}>Play</Text>
                </LinearGradient>
              </Pressable>

              <Pressable
                style={styles.shuffleButton}
                onPress={() => playShuffled(sortedTracks, inteligente)}
              >
                {/* O MODO vem do leitor: um so sitio decide se o shuffle e
                    inteligente, e este botao mostra-o e respeita-o. */}
                {inteligente && <BrilhoInteligente largura={132} altura={40} />}
                <Ionicons name="shuffle" size={20} color={colors.text} />
                <Text style={styles.buttonTextShuffle}>Shuffle</Text>
              </Pressable>
            </View>
          )}
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
                      playTrack(item, sortedTracks, true);
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
                useSaved.getState().markSaved(t, false);
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
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  playButton: {
    flex: 1,
    height: 48,
    borderRadius: radii.xl,
    overflow: 'hidden',
  },
  buttonGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonTextPlay: {
    fontSize: 16,
    fontWeight: '700',
  },
  shuffleButton: {
    flex: 1,
    height: 48,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceHigh,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonTextShuffle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
});
