import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
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
import { saveToLibrary } from '../api/library';
import { useMusicSearch } from '../hooks/useMusicSearch';
import { temRecomendacoes, useRecomendacoes } from '../state/recomendacoes';
import { displayArtist } from '../lib/artistName';
import { useSaved } from '../state/saved';
import { AddToPlaylistSheet } from '../components/AddToPlaylistSheet';
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
  const refreshSaved = useSaved((s) => s.refresh);
  const markSaved = useSaved((s) => s.markSaved);

  const [query, setQuery] = useState('');
  const [actionTrack, setActionTrack] = useState<Track | null>(null);
  const [playlistTrack, setPlaylistTrack] = useState<Track | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  
  // Search focus state
  const [isFocused, setIsFocused] = useState(false);

  const recs = useRecomendacoes();
  const { descobrir, ouvirDeNovo: listenAgain, flow: flowMix,
    maisTocadas: heavyRotation, esquecidas: forgottenFavorites } = recs;
  const loadingRecs = recs.estado === 'a-carregar';
  const { results, loading, errorMsg, pesquisarAgora } = useMusicSearch(query, (q) => {
    void addSearchHistoryEntry(q).then(setHistory).catch(() => {});
  });
  useEffect(() => { void recs.carregar(); }, [recs.carregar]);

  useEffect(() => {
    getSearchHistory().then(setHistory);
    // Conjunto das faixas já guardadas, para marcar os resultados. Um pedido
    // para a lista toda, em vez de um checkIsSaved por linha.
    refreshSaved();
  }, [refreshSaved]);

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
                {displayArtist(track)}
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
            onSubmitEditing={() => { pesquisarAgora(); Keyboard.dismiss(); }}
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
            <Pressable accessibilityRole="button" accessibilityLabel="Refresh recommendations"
              disabled={loadingRecs} onPress={() => void recs.carregar(true)}
              style={{ alignSelf: 'flex-end', padding: spacing.lg, flexDirection: 'row', gap: spacing.sm }}>
              <Ionicons name="refresh" size={18} color={colors.text} />
              <Text style={type.caption}>Refresh recommendations</Text>
            </Pressable>
            {loadingRecs && !temRecomendacoes(recs) ? (
              <ActivityIndicator color={colors.text} style={{ marginTop: 48 }} />
            ) : (
              <View>
                {/* A PRIMEIRA prateleira e so descoberta: musica que ele nao tem,
                    escolhida pelo que ele ouve. */}
                {renderRecommendationSection('Discover new', descobrir, 'sparkles-outline')}
                {listenAgain.length > 0 && renderRecommendationSection('Ouvir Novamente', listenAgain, 'time-outline')}
                {renderRecommendationSection('Flow do Dia', flowMix, 'sparkles-outline')}
                {renderRecommendationSection('Mais Tocadas Recentes', heavyRotation, 'flame-outline')}
                {renderRecommendationSection('Favoritos Esquecidos', forgottenFavorites, 'heart-dislike-outline')}
                
                {!temRecomendacoes(recs) && (
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
                showSavedBadge
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
            label: 'Add to queue',
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
                // Otimista: o coração aparece no toque, não daqui a 300ms.
                markSaved(t, true);
                await saveToLibrary(t);
                hapticNotification();
              } catch (e: any) {
                markSaved(t, false);
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
