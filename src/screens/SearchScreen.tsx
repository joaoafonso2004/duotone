import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { searchSpotify } from '../api/spotify';
import { searchYouTube } from '../api/youtube';
import { AddToPlaylistSheet } from '../components/AddToPlaylistSheet';
import { EmptyState } from '../components/EmptyState';
import { Input } from '../components/Input';
import { PillButton } from '../components/PillButton';
import { Screen } from '../components/Screen';
import { SegmentedControl } from '../components/SegmentedControl';
import { SettingsButton } from '../components/SettingsButton';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { TrackRow } from '../components/TrackRow';
import { hapticImpact, hapticNotification } from '../lib/haptics';
import {
  addSearchHistoryEntry,
  clearSearchHistory,
  getDefaultSearchTab,
  getSearchHistory,
} from '../lib/prefs';
import { connectSpotify, isSpotifyConnected } from '../lib/spotifyAuth';
import { usePlayer } from '../state/player';
import { colors, MINI_PLAYER_HEIGHT, radii, spacing, type } from '../theme';
import type { Track } from '../types';

export function SearchScreen() {
  const insets = useSafeAreaInsets();
  const playTrack = usePlayer((s) => s.playTrack);
  const current = usePlayer((s) => s.current);

  const [tab, setTab] = useState(0); // 0 = YouTube, 1 = Spotify
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [spotifyOk, setSpotifyOk] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);

  const [actionTrack, setActionTrack] = useState<Track | null>(null);
  const [playlistTrack, setPlaylistTrack] = useState<Track | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  const requestId = useRef(0);

  useEffect(() => {
    isSpotifyConnected().then(setSpotifyOk);
    getDefaultSearchTab().then((v) => setTab(v === 'spotify' ? 1 : 0));
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
    if (tab === 1 && spotifyOk === false) return;

    const id = ++requestId.current;
    setLoading(true);
    setErrorMsg(null);
    const timer = setTimeout(async () => {
      try {
        const found =
          tab === 0 ? await searchYouTube(q) : await searchSpotify(q);
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
  }, [query, tab, spotifyOk]);

  const doClearHistory = () => {
    setHistory([]);
    hapticImpact();
    clearSearchHistory();
  };

  const doConnectSpotify = useCallback(async () => {
    setConnecting(true);
    try {
      const ok = await connectSpotify();
      setSpotifyOk(ok);
      if (ok) hapticNotification();
    } catch (e: any) {
      Alert.alert('Spotify', e?.message ?? 'Could not connect to Spotify.');
    } finally {
      setConnecting(false);
    }
  }, []);

  const bottomPad = 49 + insets.bottom + MINI_PLAYER_HEIGHT + 32;
  const showConnectCard = tab === 1 && spotifyOk === false;

  return (
    <Screen
      title="Search"
      subtitle="Find tracks on YouTube and Spotify"
      topLeft={<SettingsButton />}
    >
      <View style={styles.controls}>
        <Input
          icon="search"
          placeholder={tab === 0 ? 'Search YouTube…' : 'Search Spotify…'}
          value={query}
          onChangeText={setQuery}
          onClear={() => setQuery('')}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => Keyboard.dismiss()}
        />
        <SegmentedControl
          options={['YouTube', 'Spotify']}
          accents={[colors.youtube, colors.spotify]}
          value={tab}
          onChange={(i) => {
            setTab(i);
            setResults([]);
          }}
        />
      </View>

      {showConnectCard ? (
        <View style={styles.connectCard}>
          <View style={styles.spotifyIcon}>
            <Ionicons name="musical-note" size={22} color={colors.spotify} />
          </View>
          <Text style={[type.headline, { textAlign: 'center' }]}>
            Connect your Spotify account
          </Text>
          <Text style={[type.caption, { textAlign: 'center', lineHeight: 18 }]}>
            Search Spotify's catalog and play full tracks through the Spotify
            app. Requires Spotify installed and a Premium account.
          </Text>
          <PillButton
            label="Connect Spotify"
            onPress={doConnectSpotify}
            loading={connecting}
            style={{ marginTop: spacing.sm, alignSelf: 'center' }}
          />
        </View>
      ) : loading ? (
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
          icon={tab === 0 ? 'logo-youtube' : 'musical-notes-outline'}
          title={query.trim().length >= 2 ? 'No results' : 'Start typing to search'}
          subtitle={
            query.trim().length >= 2
              ? 'Try a different search term.'
              : tab === 0
              ? 'YouTube results play through the official YouTube player.'
              : 'Spotify results play through the Spotify app.'
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
  connectCard: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  spotifyIcon: {
    alignSelf: 'center',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.spotifySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
});
