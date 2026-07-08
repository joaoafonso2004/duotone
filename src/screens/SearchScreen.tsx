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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { saveToLibrary } from '../api/library';
import { searchYouTube } from '../api/youtube';
import { getFlowMix, getHeavyRotation, getForgottenFavorites } from '../api/plays';
import { AddToPlaylistSheet } from '../components/AddToPlaylistSheet';
import { EmptyState } from '../components/EmptyState';
import { Input } from '../components/Input';
import { Screen } from '../components/Screen';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { TrackRow } from '../components/TrackRow';
import { addSearchHistoryEntry, clearSearchHistory, getSearchHistory } from '../api/searchHistory';
import { hapticImpact, hapticNotification } from '../lib/haptics';
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
  const [flowMix, setFlowMix] = useState<Track[]>([]);
  const [heavyRotation, setHeavyRotation] = useState<Track[]>([]);
  const [forgottenFavorites, setForgottenFavorites] = useState<Track[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);

  const requestId = useRef(0);

  useEffect(() => {
    getSearchHistory().then(setHistory);
  }, []);

  const loadRecommendations = async () => {
    setLoadingRecs(true);
    try {
      const [flow, heavy, forgotten] = await Promise.all([
        getFlowMix(12),
        getHeavyRotation(12),
        getForgottenFavorites(12),
      ]);
      setFlowMix(flow);
      setHeavyRotation(heavy);
      setForgottenFavorites(forgotten);
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
              onPress={() => playTrack(track, data)}
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

  return (
    <Screen title="Search" subtitle="Find tracks on YouTube">
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
        <EmptyState
          icon="cloud-offline-outline"
          title="Something went wrong"
          subtitle={errorMsg}
        />
      ) : query.trim().length < 2 && isFocused && history.length > 0 ? (
        /* Focused Search input - Show Search History */
        <View style={{ paddingHorizontal: spacing.xl }}>
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
        </View>
      ) : query.trim().length < 2 && !isFocused ? (
        /* Default state - Show Recommendations */
        <ScrollView contentContainerStyle={{ paddingBottom: bottomPad }} showsVerticalScrollIndicator={false}>
          {loadingRecs && flowMix.length === 0 ? (
            <ActivityIndicator color={colors.text} style={{ marginTop: 48 }} />
          ) : (
            <View>
              {renderRecommendationSection('Flow do Dia', flowMix, 'sparkles-outline')}
              {renderRecommendationSection('Mais Tocadas Recentes', heavyRotation, 'flame-outline')}
              {renderRecommendationSection('Favoritos Esquecidos', forgottenFavorites, 'heart-dislike-outline')}
              
              {flowMix.length === 0 && heavyRotation.length === 0 && forgottenFavorites.length === 0 && (
                <Text style={styles.emptyRecsText}>
                  No recommendations yet. Start playing songs and saving them to your library to generate your Flow!
                </Text>
              )}
            </View>
          )}
        </ScrollView>
      ) : results.length === 0 ? (
        <EmptyState
          icon="logo-youtube"
          title={query.trim().length >= 2 ? 'No results' : 'Start typing to search'}
          subtitle={
            query.trim().length >= 2
              ? 'Try a different search term.'
              : 'Search YouTube and play tracks as native audio.'
          }
        />
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
                playTrack(item, results);
              }}
              onAction={() => setActionTrack(item)}
              actionIcon="add-circle-outline"
            />
          )}
        />
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
