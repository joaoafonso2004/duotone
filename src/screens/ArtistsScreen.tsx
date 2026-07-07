import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLibrary } from '../api/library';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { SettingsButton } from '../components/SettingsButton';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { colors, MINI_PLAYER_HEIGHT, spacing, type } from '../theme';
import type { Track } from '../types';

interface ArtistGroup {
  name: string;
  artworkUrl: string | null;
  count: number;
  hasYouTube: boolean;
  hasSpotify: boolean;
}

export function ArtistsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setTracks(await getLibrary());
    } catch {
      // ignorar
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const artists = useMemo<ArtistGroup[]>(() => {
    const map = new Map<string, ArtistGroup>();
    for (const t of tracks) {
      const name = t.artist ?? 'Unknown artist';
      const existing = map.get(name);
      if (existing) {
        existing.count++;
        if (!existing.artworkUrl && t.artworkUrl)
          existing.artworkUrl = t.artworkUrl;
        if (t.source === 'youtube') existing.hasYouTube = true;
        else existing.hasSpotify = true;
      } else {
        map.set(name, {
          name,
          artworkUrl: t.artworkUrl,
          count: 1,
          hasYouTube: t.source === 'youtube',
          hasSpotify: t.source === 'spotify',
        });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [tracks]);

  const bottomPad = 49 + insets.bottom + MINI_PLAYER_HEIGHT + 32;

  return (
    <Screen
      title="Artists"
      subtitle={`${artists.length} ${artists.length === 1 ? 'artist' : 'artists'}`}
      topLeft={<SettingsButton />}
    >
      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 48 }} />
      ) : artists.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No artists yet"
          subtitle="Save songs to your library and their artists (or YouTube channels) show up here."
        />
      ) : (
        <FlatList
          data={artists}
          keyExtractor={(a) => a.name}
          contentContainerStyle={{ paddingBottom: bottomPad }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                navigation.navigate('LibraryGroup', {
                  type: 'artist',
                  name: item.name,
                })
              }
              style={({ pressed }) => [
                styles.row,
                pressed && { backgroundColor: colors.surface },
              ]}
            >
              {item.artworkUrl ? (
                <Image
                  source={{ uri: item.artworkUrl }}
                  style={styles.avatar}
                  contentFit="cover"
                  transition={150}
                />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Ionicons name="person" size={20} color={colors.textTertiary} />
                </View>
              )}
              <View style={{ flex: 1, gap: 2 }}>
                <Text numberOfLines={1} style={[type.body, { fontWeight: '600' }]}>
                  {item.name}
                </Text>
                <View style={styles.dotsRow}>
                  {item.hasYouTube ? (
                    <View style={[styles.dot, { backgroundColor: colors.youtube }]} />
                  ) : null}
                  {item.hasSpotify ? (
                    <View style={[styles.dot, { backgroundColor: colors.spotify }]} />
                  ) : null}
                  <Text style={type.caption}>
                    {item.count} {item.count === 1 ? 'song' : 'songs'}
                  </Text>
                </View>
              </View>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.textTertiary}
              />
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: 10,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surfaceHigh,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
