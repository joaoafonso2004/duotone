import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLibrary, removeFromLibrary, saveToLibrary } from '../api/library';
import { searchYouTube, searchYouTubePlaylists } from '../api/youtube';
import { AddToPlaylistSheet } from '../components/AddToPlaylistSheet';
import { EmptyState } from '../components/EmptyState';
import { PillButton } from '../components/PillButton';
import { Screen } from '../components/Screen';
import { TrackActionsSheet, SheetAction } from '../components/TrackActionsSheet';
import { TrackRow } from '../components/TrackRow';
import { YtPlaylistRecommendationSheet } from '../components/YtPlaylistRecommendationSheet';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useSaved } from '../state/saved';
import { usePlayer } from '../state/player';
import { colors, MINI_PLAYER_HEIGHT, spacing, radii, type as typography } from '../theme';
import { useTheme } from '../state/theme';
import { hapticNotification } from '../lib/haptics';
import { agruparPorArtista, chaveDeArtista } from '../lib/artistName';
import type { Track } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'LibraryGroup'>;

/** Detalhe de um álbum ou artista (vista sobre as faixas guardadas). */
export function LibraryGroupScreen({ route, navigation }: Props) {
  const { type, name } = route.params;
  const insets = useSafeAreaInsets();
  const playTrack = usePlayer((s) => s.playTrack);
  const playNext = usePlayer((s) => s.playNext);
  const addToQueue = usePlayer((s) => s.addToQueue);
  const current = usePlayer((s) => s.current);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const theme = useTheme((s) => s.theme);
  const [actionTrack, setActionTrack] = useState<Track | null>(null);
  const [playlistTrack, setPlaylistTrack] = useState<Track | null>(null);

  // Artist additional content states
  const [activeTab, setActiveTab] = useState<'library' | 'youtube_tracks' | 'youtube_albums'>('library');
  const [ytTracks, setYtTracks] = useState<Track[]>([]);
  const [ytAlbums, setYtAlbums] = useState<any[]>([]);
  const [loadingYtTracks, setLoadingYtTracks] = useState(false);
  const [loadingYtAlbums, setLoadingYtAlbums] = useState(false);

  // Recommendations sheet states
  const [selectedYtPlaylistId, setSelectedYtPlaylistId] = useState<string | null>(null);
  const [selectedYtPlaylistTitle, setSelectedYtPlaylistTitle] = useState<string | null>(null);
  const [selectedYtPlaylistArtwork, setSelectedYtPlaylistArtwork] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // Marca as faixas do YouTube deste artista que já estão na biblioteca.
      useSaved.getState().refresh();
      const all = await getLibrary();
      if (type === 'album') {
        setTracks(all.filter((t) => t.album === name));
      } else {
        // Pela CHAVE canónica e não pelo nome mostrado — tem de ser o mesmo
        // agrupamento da página de Artistas, senão o cartão dizia cinco
        // faixas e esta página abria com duas.
        const alvo = chaveDeArtista(name);
        setTracks(agruparPorArtista(all).find((g) => g.chave === alvo)?.faixas ?? []);
      }
    } catch {
      // ignorar
    } finally {
      setLoading(false);
    }
  }, [type, name]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Fetch YouTube tracks & albums when artist name is ready
  useEffect(() => {
    if (type === 'artist' && name) {
      setLoadingYtTracks(true);
      searchYouTube(name)
        .then((res) => {
          // Filter out tracks that are already in our library tracks to avoid duplication
          const libraryIds = new Set(tracks.map((t) => t.sourceId));
          const filtered = res.filter((t) => !libraryIds.has(t.sourceId));
          setYtTracks(filtered);
        })
        .catch(() => {})
        .finally(() => setLoadingYtTracks(false));

      setLoadingYtAlbums(true);
      searchYouTubePlaylists(name + ' album')
        .then((res) => {
          setYtAlbums(res);
        })
        .catch(() => {})
        .finally(() => setLoadingYtAlbums(false));
    }
  }, [type, name, tracks.length]);

  const isSaved = useMemo(() => {
    if (!actionTrack) return false;
    return tracks.some((t) => t.source === actionTrack.source && t.sourceId === actionTrack.sourceId);
  }, [actionTrack, tracks]);

  const sheetActions = useMemo(() => {
    if (!actionTrack) return [];
    
    const base: SheetAction[] = [
      {
        icon: 'play-outline' as const,
        label: 'Tocar a seguir',
        onPress: () => {
          playNext(actionTrack);
          setActionTrack(null);
        },
      },
      {
        icon: 'add-circle-outline' as const,
        label: 'Adicionar à fila',
        onPress: () => {
          addToQueue(actionTrack);
          setActionTrack(null);
        },
      },
      {
        icon: 'list-outline' as const,
        label: 'Add to playlist…',
        onPress: () => {
          setPlaylistTrack(actionTrack);
          setActionTrack(null);
        },
      },
    ];

    if (isSaved) {
      const savedTrackObject = tracks.find(
        (t) => t.source === actionTrack.source && t.sourceId === actionTrack.sourceId
      );
      base.push({
        icon: 'trash-outline' as const,
        label: 'Remove from Library',
        destructive: true,
        onPress: async () => {
          setActionTrack(null);
          if (!savedTrackObject?.id) return;
          try {
            await removeFromLibrary(savedTrackObject.id);
            load();
          } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Could not remove the track.');
          }
        },
      });
    } else {
      base.push({
        icon: 'heart-outline' as const,
        label: 'Save to Library',
        onPress: async () => {
          setActionTrack(null);
          try {
            useSaved.getState().markSaved(actionTrack, true);
            await saveToLibrary(actionTrack);
            hapticNotification();
            load();
          } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Could not save the track.');
          }
        },
      });
    }

    return base;
  }, [actionTrack, isSaved, tracks, playNext, addToQueue, load]);

  const bottomPad = 49 + insets.bottom + MINI_PLAYER_HEIGHT + 32;

  return (
    <Screen
      title={name}
      subtitle={`${type === 'album' ? 'Album' : 'Artist'} · ${tracks.length} ${
        tracks.length === 1 ? 'song' : 'songs'
      }`}
      onBack={() => navigation.goBack()}
    >
      {type === 'artist' && (
        <View style={styles.tabsContainer}>
          <Pressable
            style={[styles.tabChip, activeTab === 'library' && styles.tabChipActive]}
            onPress={() => setActiveTab('library')}
          >
            <Text style={[styles.tabLabel, activeTab === 'library' && { color: colors.text }]}>
              Na Biblioteca
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tabChip, activeTab === 'youtube_tracks' && styles.tabChipActive]}
            onPress={() => setActiveTab('youtube_tracks')}
          >
            <Text style={[styles.tabLabel, activeTab === 'youtube_tracks' && { color: colors.text }]}>
              Outras Músicas
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tabChip, activeTab === 'youtube_albums' && styles.tabChipActive]}
            onPress={() => setActiveTab('youtube_albums')}
          >
            <Text style={[styles.tabLabel, activeTab === 'youtube_albums' && { color: colors.text }]}>
              Álbuns
            </Text>
          </Pressable>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={theme.color} style={{ marginTop: 48 }} />
      ) : (
        <>
          {activeTab === 'library' && (
            <>
              {tracks.length > 0 ? (
                <View style={{ flexDirection: 'row', paddingHorizontal: spacing.xl, marginBottom: spacing.md }}>
                  <PillButton
                    label="Play all"
                    small
                    onPress={() => playTrack(tracks[0], tracks, true)}
                  />
                </View>
              ) : null}

              {tracks.length === 0 ? (
                <EmptyState
                  icon="musical-notes-outline"
                  title="Nothing here"
                  subtitle="These songs may have been removed from your library."
                />
              ) : (
                <FlatList
                  data={tracks}
                  keyExtractor={(t) => t.id ?? `${t.source}:${t.sourceId}`}
                  contentContainerStyle={{ paddingBottom: bottomPad }}
                  renderItem={({ item }) => (
                    <TrackRow
                      track={item}
                      active={
                        current?.source === item.source &&
                        current?.sourceId === item.sourceId
                      }
                      onPress={() => playTrack(item, tracks, true)}
                      onAction={() => setActionTrack(item)}
                    />
                  )}
                />
              )}
            </>
          )}

          {activeTab === 'youtube_tracks' && (
            <>
              {loadingYtTracks ? (
                <ActivityIndicator color={theme.color} style={{ marginTop: 48 }} />
              ) : ytTracks.length === 0 ? (
                <EmptyState
                  icon="search"
                  title="No tracks found"
                  subtitle="We couldn't find other songs by this artist on YouTube."
                />
              ) : (
                <FlatList
                  data={ytTracks}
                  keyExtractor={(t) => t.sourceId}
                  contentContainerStyle={{ paddingBottom: bottomPad }}
                  renderItem={({ item }) => (
                    <TrackRow
                      track={item}
                      showSavedBadge
                      active={
                        current?.source === item.source &&
                        current?.sourceId === item.sourceId
                      }
                      onPress={() => playTrack(item, ytTracks, true)}
                      onAction={() => setActionTrack(item)}
                    />
                  )}
                />
              )}
            </>
          )}

          {activeTab === 'youtube_albums' && (
            <>
              {loadingYtAlbums ? (
                <ActivityIndicator color={theme.color} style={{ marginTop: 48 }} />
              ) : ytAlbums.length === 0 ? (
                <EmptyState
                  icon="albums-outline"
                  title="No albums found"
                  subtitle="We couldn't find albums by this artist on YouTube."
                />
              ) : (
                <FlatList
                  data={ytAlbums}
                  keyExtractor={(t) => t.id}
                  contentContainerStyle={{ paddingBottom: bottomPad }}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => {
                        setSelectedYtPlaylistId(item.id);
                        setSelectedYtPlaylistTitle(item.title);
                        setSelectedYtPlaylistArtwork(item.artworkUrl);
                      }}
                      style={({ pressed }) => [
                        styles.albumRow,
                        pressed && { backgroundColor: colors.surfacePressed },
                      ]}
                    >
                      {item.artworkUrl ? (
                        <Image source={{ uri: item.artworkUrl }} style={styles.albumArt} />
                      ) : (
                        <View style={[styles.albumArt, styles.albumArtFallback]}>
                          <Ionicons name="albums-outline" size={20} color={colors.textTertiary} />
                        </View>
                      )}
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text numberOfLines={1} style={[typography.body, { fontWeight: '600' }]}>
                          {item.title}
                        </Text>
                        <Text numberOfLines={1} style={typography.caption}>
                          {item.channelTitle || 'YouTube'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                    </Pressable>
                  )}
                />
              )}
            </>
          )}
        </>
      )}

      <TrackActionsSheet
        visible={!!actionTrack}
        track={actionTrack}
        onClose={() => setActionTrack(null)}
        actions={sheetActions}
      />

      <AddToPlaylistSheet
        visible={!!playlistTrack}
        track={playlistTrack}
        onClose={() => setPlaylistTrack(null)}
      />

      <YtPlaylistRecommendationSheet
        visible={!!selectedYtPlaylistId}
        playlistId={selectedYtPlaylistId}
        playlistTitle={selectedYtPlaylistTitle}
        playlistArtwork={selectedYtPlaylistArtwork}
        onClose={() => {
          setSelectedYtPlaylistId(null);
          setSelectedYtPlaylistTitle(null);
          setSelectedYtPlaylistArtwork(null);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabsContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  tabChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  tabChipActive: {
    backgroundColor: colors.surfacePressed,
    borderColor: colors.borderStrong,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  albumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  albumArt: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceHigh,
  },
  albumArtFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
