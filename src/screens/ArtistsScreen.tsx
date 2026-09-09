import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLibrary } from '../api/library';
import { agruparPorArtista, chaveDeArtista } from '../lib/artistName';
import { comCatalogo, garantirCatalogo, useCatalogoDeFaixas } from '../state/catalogoDeFaixas';
import { ordenarArtistas } from '../lib/ordenacao';
import { getTopArtists } from '../api/plays';
import { correspondeAPesquisa } from '../lib/searchText';
import { getOrdemDosArtistas, setOrdemDosArtistas, type OrdemDosArtistas } from '../lib/prefs';
import { EmptyState } from '../components/EmptyState';
import { Input } from '../components/Input';
import { Screen } from '../components/Screen';
import { SkeletonDeArtistas } from '../components/Skeleton';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { colors, MINI_PLAYER_HEIGHT, spacing, type } from '../theme';
import { useAuth } from '../state/auth';
import type { Track } from '../types';

interface ArtistGroup { name: string; artworkUrl: string | null; count: number }
export function ArtistsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const userId = useAuth(s => s.session?.user.id);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [ranking, setRanking] = useState<Map<string, number>>(new Map());
  const [order, setOrder] = useState<OrdemDosArtistas>('played_most');
  const choseOrder = useRef(false);
  useEffect(() => {
    let alive = true;
    void getOrdemDosArtistas().then(v => { if (alive && !choseOrder.current) setOrder(v); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  // O ranking vive FORA do foco: é uma RPC, e com o paginador basta deslizar
  // por cima deste separador para o focar. A ordem de quem se ouve não muda
  // entre duas visitas à mesma página; a biblioteca muda, e é essa que recarrega.
  useEffect(() => {
    let alive = true;
    if (!userId) { setRanking(new Map()); return; }
    void getTopArtists(200).then(tops => {
      if (alive) setRanking(new Map(tops.filter(a => a.plays > 0).map((a, i) => [chaveDeArtista(a.name), i])));
    }).catch(() => {});
    return () => { alive = false; };
  }, [userId]);
  useFocusEffect(useCallback(() => {
    let alive = true;
    if (!userId) { setTracks([]); setLoading(false); return; }
    void getLibrary().then(items => {
      if (!alive) return;
      setTracks(items); void garantirCatalogo(items);
    }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [userId]));
  const catalogVersion = useCatalogoDeFaixas(s => s.versao);
  const artists = useMemo<ArtistGroup[]>(() => {
    // A versão invalida a projeção quando o catálogo confirma metadados.
    void catalogVersion;
    return ordenarArtistas(agruparPorArtista(tracks.map(comCatalogo)), ranking).map(g => ({
      name: g.nome, artworkUrl: g.faixas.find(t => t.artworkUrl)?.artworkUrl ?? null, count: g.faixas.length,
    }));
  }, [tracks, catalogVersion, ranking]);
  // Memorizado: sem isto, cada tecla da pesquisa varria os 753 artistas outra vez.
  const repeated = useMemo(
    () => artists.filter(a => ranking.has(chaveDeArtista(a.name))).slice(0, 10),
    [artists, ranking],
  );
  const filtered = useMemo(() => {
    const found = artists.filter(a => correspondeAPesquisa(searchQuery.trim(), a.name));
    return order === 'az' ? found.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })) : found;
  }, [artists, searchQuery, order]);
  const cardWidth = (width - spacing.xl * 2 - 24) / 3;
  const renderArtist = (artist: ArtistGroup, shelf = false) => {
    const side = shelf ? 86 : Math.min(120, cardWidth);
    return <Pressable accessibilityRole="button" accessibilityLabel={`${artist.name}, ${artist.count} songs`}
      onPress={() => navigation.navigate('LibraryGroup', { type: 'artist', name: artist.name })}
      style={({ pressed }) => [styles.card, { width: shelf ? 94 : cardWidth, opacity: pressed ? 0.6 : 1 }]}>
      {artist.artworkUrl ? <Image source={{ uri: artist.artworkUrl }} contentFit="cover"
        style={{ width: side, height: side, borderRadius: side / 2, backgroundColor: colors.surfaceHigh }} />
        : <View style={[styles.fallback, { width: side, height: side, borderRadius: side / 2 }]}><Ionicons name="person" size={30} color={colors.textTertiary} /></View>}
      <Text numberOfLines={2} style={styles.name}>{artist.name}</Text>
      {!shelf && <Text style={type.caption}>{artist.count} {artist.count === 1 ? 'song' : 'songs'}</Text>}
    </Pressable>;
  };
  return <Screen title="Artists" subtitle={`${artists.length} ${artists.length === 1 ? 'artist' : 'artists'}`}
    right={artists.length ? <Pressable accessibilityRole="button" accessibilityLabel={searchOpen ? 'Close search' : 'Search artists'}
      style={styles.searchButton} onPress={() => { setSearchOpen(!searchOpen); if (searchOpen) setSearchQuery(''); }}>
      <Ionicons name={searchOpen ? 'close' : 'search-outline'} size={24} color={colors.text} /></Pressable> : undefined}>
    {searchOpen && <View style={styles.search}><Input icon="search" placeholder="Search artists" autoFocus
      value={searchQuery} onChangeText={setSearchQuery} onClear={() => setSearchQuery('')} /></View>}
    {loading ? <SkeletonDeArtistas /> : !artists.length ? <EmptyState icon="people-outline" title="No artists yet"
      subtitle="Save songs to your library and their artists show up here." /> :
      <FlatList data={filtered} numColumns={3} keyExtractor={a => chaveDeArtista(a.name)}
        keyboardShouldPersistTaps="handled" initialNumToRender={15} windowSize={7}
        columnWrapperStyle={{ gap: 12 }} contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 49 + insets.bottom + MINI_PLAYER_HEIGHT + 32 }}
        ListHeaderComponent={<>
          {!searchQuery.trim() && repeated.length > 0 && <View style={styles.shelf}>
            <Text style={type.title}>On repeat</Text>
            <FlatList horizontal data={repeated} keyExtractor={a => chaveDeArtista(a.name)} showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 14 }} renderItem={({ item }) => renderArtist(item, true)} />
          </View>}
          <View style={styles.orderRow}><Text style={[type.body, { flex: 1, fontWeight: '600' }]}>Your artists</Text>
            {(['az', 'played_most'] as const).map(value => <Pressable key={value} accessibilityRole="button"
              accessibilityState={{ selected: order === value }} style={[styles.orderButton, order === value && styles.selected]}
              onPress={() => { choseOrder.current = true; setOrder(value); void setOrdemDosArtistas(value).catch(() => {}); }}>
              <Text style={[type.caption, order === value && { color: colors.text }]}>{value === 'az' ? 'A–Z' : 'Most played'}</Text>
            </Pressable>)}
          </View>
        </>}
        ListEmptyComponent={<EmptyState icon="search-outline" title="No artists found" subtitle={`No artist matches "${searchQuery}".`} />}
        renderItem={({ item }) => renderArtist(item)} />}
  </Screen>;
}
const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: 5, marginBottom: 20 },
  name: { ...type.body, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  fallback: { backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  search: { paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  searchButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  shelf: { gap: 18, marginTop: 4 },
  orderRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 24 },
  orderButton: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center', borderRadius: 22 },
  selected: { backgroundColor: colors.surfaceHigh },
});
