import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { saveToLibrary, getLibrary } from '../api/library';
import { searchYouTube, searchYouTubePlaylists, getTrendingMusic, YtRecommendedPlaylist } from '../api/youtube';
import { getFlowMix, getHeavyRotation, getForgottenFavorites, getProfileRecentlyPlayed, getRecentTopArtist, getTopArtists } from '../api/plays';
import { AddToPlaylistSheet } from '../components/AddToPlaylistSheet';
import { YtPlaylistRecommendationSheet } from '../components/YtPlaylistRecommendationSheet';
import { EmptyState } from '../components/EmptyState';
import { Input } from '../components/Input';
import { Screen } from '../components/Screen';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { TrackRow } from '../components/TrackRow';
import { addSearchHistoryEntry, clearSearchHistory, getSearchHistory } from '../api/searchHistory';
import { hapticImpact, hapticNotification, hapticSelection } from '../lib/haptics';
import { usePlayer } from '../state/player';
import { colors, MINI_PLAYER_HEIGHT, radii, spacing, type } from '../theme';
import type { Track } from '../types';

export function SearchScreen() {
  const insets = useSafeAreaInsets();
  const playTrack = usePlayer((s) => s.playTrack);
  const playNext = usePlayer((s) => s.playNext);
  const addToQueue = usePlayer((s) => s.addToQueue);
  const current = usePlayer((s) => s.current);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [actionTrack, setActionTrack] = useState<Track | null>(null);
  const [playlistTrack, setPlaylistTrack] = useState<Track | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  
  // Search focus state
  const [isFocused, setIsFocused] = useState(false);

  // Recommendations states
  const [listenAgain, setListenAgain] = useState<Track[]>([]);
  const [dailyTop, setDailyTop] = useState<Track[]>([]);
  const [newReleases, setNewReleases] = useState<Track[]>([]);
  const [chillFocus, setChillFocus] = useState<Track[]>([]);
  const [flowMix, setFlowMix] = useState<Track[]>([]);
  const [heavyRotation, setHeavyRotation] = useState<Track[]>([]);
  const [forgottenFavorites, setForgottenFavorites] = useState<Track[]>([]);
  const [personalizedArtist, setPersonalizedArtist] = useState<string | null>(null);
  const [newRecommendations, setNewRecommendations] = useState<Track[]>([]);
  const [recommendedPlaylists, setRecommendedPlaylists] = useState<YtRecommendedPlaylist[]>([]);
  const [selectedRecommendPlaylist, setSelectedRecommendPlaylist] = useState<YtRecommendedPlaylist | null>(null);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [becauseArtist, setBecauseArtist] = useState<string | null>(null);
  const [becauseTracks, setBecauseTracks] = useState<Track[]>([]);

  const requestId = useRef(0);

  useEffect(() => {
    getSearchHistory().then(setHistory);
  }, []);

  const loadRecommendations = async () => {
    setLoadingRecs(true);
    try {
      const [flow, heavy, forgotten, libTracks, trendingRes, chillRes, recentRes, recentArtist, userTopArtists] = await Promise.all([
        getFlowMix(12),
        getHeavyRotation(12),
        getForgottenFavorites(12),
        getLibrary(),
        getTrendingMusic(40),
        searchYouTube('lofi hip hop study focus chill beats'),
        getProfileRecentlyPlayed(12).catch(() => []),
        getRecentTopArtist().catch(() => null),
        getTopArtists(3).catch(() => []),
      ]);
      setFlowMix(flow);
      setHeavyRotation(heavy);
      setForgottenFavorites(forgotten);
      setChillFocus(chillRes.slice(0, 12));
      
      const mappedRecent: Track[] = (recentRes ?? []).map((r: any) => ({
        id: r.id,
        source: r.source,
        sourceId: r.sourceId,
        title: r.title,
        artist: r.artist,
        album: null,
        artworkUrl: r.artworkUrl,
        durationSeconds: r.durationSeconds,
      }));
      setListenAgain(mappedRecent);

      // "Porque Ouviste..." — recomendações baseadas no artista mais ouvido recentemente
      setBecauseArtist(recentArtist);
      if (recentArtist) {
        searchYouTube(`${recentArtist} music`).then((tracks) => {
          const savedIds = new Set(libTracks.map((t) => t.sourceId));
          setBecauseTracks(tracks.filter((t) => !savedIds.has(t.sourceId)).slice(0, 12));
        }).catch(() => {});
      }

      // Personalização do "Em Alta" e "Também em Alta":
      // Procura mixes populares dos artistas favoritos do utilizador (que trazem músicas semelhantes e do mesmo género)
      // e mistura com as tendências gerais
      let personalizedTracks: Track[] = [];
      if (userTopArtists && userTopArtists.length > 0) {
        try {
          const searches = await Promise.all(
            userTopArtists.map(artist => searchYouTube(`${artist.name} mix`).catch(() => []))
          );
          // Junta as pesquisas de todos os artistas top e baralha
          const customTracks = searches.flat();
          const savedIds = new Set(libTracks.map((t) => t.sourceId));
          personalizedTracks = customTracks
            .filter(t => !savedIds.has(t.sourceId))
            .sort(() => Math.random() - 0.5); // Baralha para dar variedade de géneros similares
        } catch (e) {
          console.warn('Error fetching personalized trending:', e);
        }
      }

      const mixedTrending: Track[] = [];
      let trendIdx = 0;
      let persIdx = 0;

      // Intercala faixas personalizadas com faixas em alta gerais
      while (mixedTrending.length < 30 && (trendIdx < trendingRes.length || persIdx < personalizedTracks.length)) {
        if (persIdx < personalizedTracks.length) {
          const t = personalizedTracks[persIdx++];
          if (!mixedTrending.some(x => x.sourceId === t.sourceId)) {
            mixedTrending.push(t);
          }
        }
        if (trendIdx < trendingRes.length && mixedTrending.length < 30) {
          const t = trendingRes[trendIdx++];
          if (!mixedTrending.some(x => x.sourceId === t.sourceId)) {
            mixedTrending.push(t);
          }
        }
      }

      const finalTrending = mixedTrending.length >= 10 ? mixedTrending : trendingRes;
      setDailyTop(finalTrending.slice(0, 12));
      setNewReleases(finalTrending.slice(12, 25));

      // Extract unique artists from library
      const artists = Array.from(
        new Set(libTracks.map((t) => t.artist).filter(Boolean))
      ) as string[];

      let chosen = '';
      if (artists.length > 0) {
        chosen = artists[Math.floor(Math.random() * artists.length)];
      }

      const queryForTracks = chosen ? `${chosen} popular` : 'Lofi chill beats study';
      const queryForPlaylists = chosen ? `${chosen} playlist` : 'Chill music playlist';
      
      setPersonalizedArtist(chosen || null);

      const [tracksRes, playlistsRes] = await Promise.all([
        searchYouTube(queryForTracks),
        searchYouTubePlaylists(queryForPlaylists, 6),
      ]);

      // Filter out songs already in library to ensure they are new recommendations
      const savedIds = new Set(libTracks.map((t) => t.sourceId));
      const filteredTracks = tracksRes
        .filter((t) => !savedIds.has(t.sourceId))
        .slice(0, 12);

      setNewRecommendations(filteredTracks);
      setRecommendedPlaylists(playlistsRes);
    } catch (e) {
      console.error('Failed to load recommendations:', e);
    } finally {
      setLoadingRecs(false);
    }
  };

  useEffect(() => {
    if (query.trim() === '') {
      loadRecommendations();
    }
  }, [query]);

  // pesquisa com debounce
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      setErrorMsg(null);
      return;
    }

    const id = ++requestId.current;
    setLoading(true);
    setErrorMsg(null);
    const timer = setTimeout(async () => {
      try {
        const found = await searchYouTube(q);
        if (requestId.current === id) {
          setResults(found);
          if (found.length > 0) {
            addSearchHistoryEntry(q).then(setHistory);
          }
        }
      } catch (e: any) {
        if (requestId.current === id) {
          setResults([]);
          setErrorMsg(e?.message ?? 'Search failed.');
        }
      } finally {
        if (requestId.current === id) setLoading(false);
      }
    }, 550);
    return () => clearTimeout(timer);
  }, [query]);

  const doClearHistory = () => {
    setHistory([]);
    hapticImpact();
    clearSearchHistory();
  };

  const bottomPad = 49 + insets.bottom + MINI_PLAYER_HEIGHT + 32;

  // Render horizontal recommendation lists
  const renderRecommendationSection = (title: string, data: Track[], icon: keyof typeof Ionicons.glyphMap) => {
    if (data.length === 0) return null;
    return (
      <View style={styles.recsSection}>
        <View style={styles.sectionHeader}>
          <Ionicons name={icon} size={18} color={colors.text} />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalScroll}
        >
          {data.map((track) => (
            <Pressable
              key={`${track.source}:${track.sourceId}`}
              onPress={() => playTrack(track, data, true)}
              onLongPress={() => {
                hapticSelection();
                setActionTrack(track);
              }}
              delayLongPress={350}
              style={({ pressed }) => [styles.recCard, pressed && { opacity: 0.8 }]}
            >
              {track.artworkUrl ? (
                <Image
                  source={{ uri: track.artworkUrl }}
                  style={styles.cardArt}
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                <View style={[styles.cardArt, styles.artFallback]}>
                  <Ionicons name="musical-note" size={24} color={colors.textTertiary} />
                </View>
              )}
              <Text numberOfLines={1} style={styles.cardTitle}>
                {track.title}
              </Text>
              <Text numberOfLines={1} style={styles.cardArtist}>
                {track.artist ?? 'YouTube'}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderPlaylistRecommendationSection = (
    title: string,
    data: YtRecommendedPlaylist[],
    icon: keyof typeof Ionicons.glyphMap
  ) => {
    if (data.length === 0) return null;
    return (
      <View style={styles.recsSection}>
        <View style={styles.sectionHeader}>
          <Ionicons name={icon} size={18} color={colors.text} />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalScroll}
        >
          {data.map((playlist) => (
            <Pressable
              key={playlist.id}
              onPress={() => {
                hapticImpact();
                setSelectedRecommendPlaylist(playlist);
              }}
              style={({ pressed }) => [styles.recCard, pressed && { opacity: 0.8 }]}
            >
              {playlist.artworkUrl ? (
                <Image
                  source={{ uri: playlist.artworkUrl }}
                  style={styles.cardArt}
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                <View style={[styles.cardArt, styles.artFallback]}>
                  <Ionicons name="albums-outline" size={24} color={colors.textTertiary} />
                </View>
              )}
              <Text numberOfLines={1} style={styles.cardTitle}>
                {playlist.title}
              </Text>
              <Text numberOfLines={1} style={styles.cardArtist}>
                {playlist.channelTitle ?? 'YouTube'}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  };

  return (
    <Screen title="Search" subtitle="Find tracks on YouTube">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.controls}>
          <Input
            icon="search"
            placeholder="Search YouTube…"
            value={query}
            onChangeText={setQuery}
            onClear={() => setQuery('')}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
        </View>

        {loading ? (
          <ActivityIndicator color={colors.text} style={{ marginTop: 48 }} />
        ) : errorMsg ? (
          <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss}>
            <EmptyState
              icon="cloud-offline-outline"
              title="Something went wrong"
              subtitle={errorMsg}
            />
          </Pressable>
        ) : query.trim().length < 2 && isFocused && history.length > 0 ? (
          /* Focused Search input - Show Search History */
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: bottomPad }}
          >
            <View style={styles.historyHeader}>
              <Text style={type.micro}>Recent searches</Text>
              <Pressable hitSlop={8} onPress={doClearHistory}>
                <Text style={[type.caption, { color: colors.text, fontWeight: '700' }]}>
                  Clear
                </Text>
              </Pressable>
            </View>
            {history.map((q) => (
              <Pressable
                key={q}
                onPress={() => {
                  setQuery(q);
                  Keyboard.dismiss();
                }}
                style={({ pressed }) => [
                  styles.historyRow,
                  pressed && { backgroundColor: colors.surface },
                ]}
              >
                <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                <Text numberOfLines={1} style={[type.body, { flex: 1 }]}>
                  {q}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : query.trim().length < 2 && !isFocused ? (
          /* Default state - Show Recommendations */
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingBottom: bottomPad }}
            showsVerticalScrollIndicator={false}
          >
            {loadingRecs && flowMix.length === 0 ? (
              <ActivityIndicator color={colors.text} style={{ marginTop: 48 }} />
            ) : (
              <View>
                {listenAgain.length > 0 && renderRecommendationSection('Ouvir Novamente', listenAgain, 'time-outline')}
                {renderRecommendationSection('Em Alta 🔥', dailyTop, 'trending-up-outline')}
                {newReleases.length > 0 && renderRecommendationSection('Também em Alta', newReleases, 'musical-notes-outline')}
                {becauseArtist && becauseTracks.length > 0 && renderRecommendationSection(`Porque Ouviste ${becauseArtist}`, becauseTracks, 'heart-outline')}
                {renderRecommendationSection('Foco & Relaxar', chillFocus, 'cafe-outline')}
                {renderRecommendationSection('Flow do Dia', flowMix, 'sparkles-outline')}
                {renderRecommendationSection('Mais Tocadas Recentes', heavyRotation, 'flame-outline')}
                {renderRecommendationSection('Favoritos Esquecidos', forgottenFavorites, 'heart-dislike-outline')}
                
                {/* New Recommendations (not heard yet) */}
                {renderRecommendationSection(
                  personalizedArtist ? `Descobrir ${personalizedArtist}` : 'Descobrir Novidades',
                  newRecommendations,
                  'compass-outline'
                )}

                {/* YouTube Playlists Recommendations */}
                {renderPlaylistRecommendationSection(
                  personalizedArtist ? `Playlists de ${personalizedArtist}` : 'Playlists Recomendadas',
                  recommendedPlaylists,
                  'albums-outline'
                )}
                
                {flowMix.length === 0 && heavyRotation.length === 0 && forgottenFavorites.length === 0 && newRecommendations.length === 0 && (
                  <Text style={styles.emptyRecsText}>
                    No recommendations yet. Start playing songs and saving them to your library to generate your Flow!
                  </Text>
                )}
              </View>
            )}
          </ScrollView>
        ) : results.length === 0 ? (
          <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss}>
            <EmptyState
              icon="logo-youtube"
              title={query.trim().length >= 2 ? 'No results' : 'Start typing to search'}
              subtitle={
                query.trim().length >= 2
                  ? 'Try a different search term.'
                  : 'Search YouTube and play tracks as native audio.'
              }
            />
          </Pressable>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(t) => `${t.source}:${t.sourceId}`}
            contentContainerStyle={{ paddingBottom: bottomPad }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            renderItem={({ item }) => (
              <TrackRow
                track={item}
                active={
                  current?.source === item.source &&
                  current?.sourceId === item.sourceId
                }
                onPress={() => {
                  Keyboard.dismiss();
                  playTrack(item, results, true);
                }}
                onAction={() => setActionTrack(item)}
                actionIcon="add-circle-outline"
              />
            )}
          />
        )}
      </KeyboardAvoidingView>

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
            icon: 'heart-outline',
            label: 'Save to Library',
            onPress: async () => {
              const t = actionTrack;
              setActionTrack(null);
              if (!t) return;
              try {
                await saveToLibrary(t);
                hapticNotification();
              } catch (e: any) {
                Alert.alert('Error', e?.message ?? 'Could not save the track.');
              }
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
        ]}
      />

      <AddToPlaylistSheet
        visible={!!playlistTrack}
        track={playlistTrack}
        onClose={() => setPlaylistTrack(null)}
      />

      <YtPlaylistRecommendationSheet
        visible={!!selectedRecommendPlaylist}
        playlistId={selectedRecommendPlaylist?.id ?? null}
        playlistTitle={selectedRecommendPlaylist?.title ?? null}
        playlistArtwork={selectedRecommendPlaylist?.artworkUrl ?? null}
        onClose={() => setSelectedRecommendPlaylist(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 10,
    borderRadius: radii.sm,
  },
  recsSection: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  horizontalScroll: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  recCard: {
    width: 120,
    gap: 4,
  },
  cardArt: {
    width: 120,
    height: 120,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  artFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginTop: 4,
  },
  cardArtist: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  emptyRecsText: {
    ...type.caption,
    textAlign: 'center',
    padding: spacing.xl,
    marginTop: 24,
  },
});
