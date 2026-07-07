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
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLibrary } from '../api/library';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { SettingsButton } from '../components/SettingsButton';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { colors, MINI_PLAYER_HEIGHT, radii, spacing, type } from '../theme';
import type { Track } from '../types';

interface AlbumGroup {
  name: string;
  artist: string | null;
  artworkUrl: string | null;
  count: number;
}

export function AlbumsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();

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

  const albums = useMemo<AlbumGroup[]>(() => {
    const map = new Map<string, AlbumGroup>();
    for (const t of tracks) {
      if (!t.album) continue; // faixas YouTube não têm álbum
      const existing = map.get(t.album);
      if (existing) {
        existing.count++;
        if (!existing.artworkUrl && t.artworkUrl)
          existing.artworkUrl = t.artworkUrl;
      } else {
        map.set(t.album, {
          name: t.album,
          artist: t.artist,
          artworkUrl: t.artworkUrl,
          count: 1,
        });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [tracks]);

  const cardSize = (W - spacing.xl * 2 - spacing.lg) / 2;
  const bottomPad = 49 + insets.bottom + MINI_PLAYER_HEIGHT + 32;

  return (
    <Screen
      title="Albums"
      subtitle={`${albums.length} ${albums.length === 1 ? 'album' : 'albums'}`}
      topLeft={<SettingsButton />}
    >
      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 48 }} />
      ) : albums.length === 0 ? (
        <EmptyState
          icon="disc-outline"
          title="No albums yet"
          subtitle="Albums appear when you save Spotify tracks — YouTube videos don't carry album info."
        />
      ) : (
        <FlatList
          data={albums}
          keyExtractor={(a) => a.name}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.lg, paddingHorizontal: spacing.xl }}
          contentContainerStyle={{ gap: spacing.lg, paddingBottom: bottomPad, paddingTop: spacing.sm }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                navigation.navigate('LibraryGroup', {
                  type: 'album',
                  name: item.name,
                })
              }
              style={({ pressed }) => [{ width: cardSize }, pressed && { opacity: 0.8 }]}
            >
              {item.artworkUrl ? (
                <Image
                  source={{ uri: item.artworkUrl }}
                  style={{ width: cardSize, height: cardSize, borderRadius: radii.md }}
                  contentFit="cover"
                  transition={150}
                />
              ) : (
                <View style={[styles.fallback, { width: cardSize, height: cardSize }]}>
                  <Ionicons name="disc" size={40} color={colors.textTertiary} />
                </View>
              )}
              <Text numberOfLines={1} style={[type.headline, { marginTop: 8 }]}>
                {item.name}
              </Text>
              <Text numberOfLines={1} style={type.caption}>
                {item.artist ?? 'Unknown artist'} · {item.count}
              </Text>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fallback: {
    borderRadius: radii.md,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
