import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { saveToLibrary } from '../api/library';
import { searchYouTube } from '../api/youtube';
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
  const current = usePlayer((s) => s.current);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [actionTrack, setActionTrack] = useState<Track | null>(null);
  const [playlistTrack, setPlaylistTrack] = useState<Track | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  const requestId = useRef(0);

  useEffect(() => {
    getSearchHistory().then(setHistory);
  }, []);

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

  return (
    <Screen title="Search" subtitle="Find tracks on YouTube">
      <View style={styles.controls}>
        <Input
          icon="search"
          placeholder="Search YouTube…"
          value={query}
          onChangeText={setQuery}
          onClear={() => setQuery('')}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => Keyboard.dismiss()}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 48 }} />
      ) : errorMsg ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Something went wrong"
          subtitle={errorMsg}
        />
      ) : query.trim().length < 2 && history.length > 0 ? (
        <View style={{ paddingHorizontal: spacing.xl }}>
          <View style={styles.historyHeader}>
            <Text style={type.micro}>Recent searches</Text>
            <Pressable hitSlop={8} onPress={doClearHistory}>
              <Text style={[type.caption, { color: colors.accent, fontWeight: '700' }]}>
                Clear
              </Text>
            </Pressable>
          </View>
          {history.map((q) => (
            <Pressable
              key={q}
              onPress={() => setQuery(q)}
              style={({ pressed }) => [
                styles.historyRow,
                pressed && { backgroundColor: colors.surface },
              ]}
            >
              <Ionicons name="time-outline" size={16} color={colors.textTertiary} />
              <Text numberOfLines={1} style={[type.body, { flex: 1 }]}>
                {q}
              </Text>
            </Pressable>
          ))}
        </View>
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
});
