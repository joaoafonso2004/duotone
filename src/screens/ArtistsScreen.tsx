import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
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
import { correspondeAPesquisa } from '../lib/searchText';
import { EmptyState } from '../components/EmptyState';
import { Input } from '../components/Input';
import { Screen } from '../components/Screen';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { colors, MINI_PLAYER_HEIGHT, spacing, type } from '../theme';
import { useTheme } from '../state/theme';
import type { Track } from '../types';
import { useAuth } from '../state/auth';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
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
      // Por PESO na biblioteca, e não por alfabeto — que é o que o PC já faz.
      // A ordem alfabética parecia neutra e era o contrário: punha à cabeça
      // tudo o que começa por símbolo ou número, e é exactamente aí que se
      // acumulam os nomes que a extração não acertou. Numa biblioteca de 2.700
      // faixas o primeiro ecrã enchia-se de coisas que não são artistas, e os
      // artistas a sério só apareciam muito mais abaixo.
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [tracks]);

  const filteredArtists = useMemo(() => {
    const query = searchQuery.trim();
    return query
      ? artists.filter((artist) => correspondeAPesquisa(query, artist.name))
      : artists;
  }, [artists, searchQuery]);

  const bottomPad = 49 + insets.bottom + MINI_PLAYER_HEIGHT + 32;

  return (
    <Screen
      title="Artists"
      subtitle={`${artists.length} ${artists.length === 1 ? 'artist' : 'artists'}`}
      right={artists.length > 0 ? (
        <Pressable
          hitSlop={10}
          onPress={() => {
            setSearchOpen((open) => !open);
            if (searchOpen) setSearchQuery('');
          }}
          style={{ padding: 4 }}
        >
          <Ionicons name={searchOpen ? 'close' : 'search-outline'} size={24} color={colors.text} />
        </Pressable>
      ) : undefined}
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
        <View style={{ flex: 1 }}>
          {searchOpen && (
            <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.md }}>
              <Input
                icon="search"
                placeholder="Search artists"
                value={searchQuery}
                onChangeText={setSearchQuery}
                onClear={() => setSearchQuery('')}
              />
            </View>
          )}
          <FlatList
          data={filteredArtists}
          keyExtractor={(a) => a.name}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          windowSize={7}
          removeClippedSubviews
          contentContainerStyle={{ paddingBottom: bottomPad }}
          ListEmptyComponent={<EmptyState icon="search-outline" title="No artists found" subtitle={`No artist matches "${searchQuery}".`} />}
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
        </View>
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
