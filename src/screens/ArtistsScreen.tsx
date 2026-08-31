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
import { agruparPorArtista } from '../lib/artistName';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { colors, MINI_PLAYER_HEIGHT, spacing, type } from '../theme';
import { useTheme } from '../state/theme';
import type { Track } from '../types';

interface ArtistGroup {
  name: string;
  artworkUrl: string | null;
  count: number;
}

export function ArtistsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const theme = useTheme((s) => s.theme);

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
    // Agrupa por CHAVE canónica e não pelo nome mostrado: era pelo nome que
    // `Juice WRLD`, `juice wrld` e `JUICE WRLD` apareciam como três artistas
    // diferentes. O `agruparPorArtista` também aprende a grafia certa com as
    // fontes fiáveis da própria biblioteca (canais `- Topic`, VEVO).
    return agruparPorArtista(tracks)
      .map((g) => ({
        name: g.nome,
        artworkUrl: g.faixas.find((t) => t.artworkUrl)?.artworkUrl ?? null,
        count: g.faixas.length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tracks]);

  const bottomPad = 49 + insets.bottom + MINI_PLAYER_HEIGHT + 32;

  return (
    <Screen
      title="Artists"
      subtitle={`${artists.length} ${artists.length === 1 ? 'artist' : 'artists'}`}
    >
      {loading ? (
        <ActivityIndicator color={theme.color} style={{ marginTop: 48 }} />
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
                <Text style={type.caption}>
                  {item.count} {item.count === 1 ? 'song' : 'songs'}
                </Text>
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
