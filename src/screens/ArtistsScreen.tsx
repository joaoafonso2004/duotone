import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLibrary } from '../api/library';
import { faixasEmCache, lerFaixas, ouvirFaixas } from '../lib/cacheDaBiblioteca';
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
import { hapticSelection } from '../lib/haptics';
import { useArtistasFavoritos } from '../state/artistasFavoritos';
import { ArtistFavoritesSyncStatus } from '../components/ArtistFavoritesSyncStatus';
import { useAuth } from '../state/auth';
import type { Track } from '../types';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';

interface ArtistGroup { name: string; chave: string; artworkUrl: string | null; count: number }
export function ArtistsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const userId = useAuth(s => s.session?.user.id);
  // O que o arranque já aqueceu (`hooks/useAquecerSeccoes.ts`): com a biblioteca
  // na mão, os Artists abrem desenhados em vez de mostrarem o esqueleto para
  // desenhar, um segundo depois, a mesma lista de sempre.
  const aquecidas = faixasEmCache(getLibrary);
  const [tracks, setTracks] = useState<Track[]>(aquecidas ?? []);
  const [loading, setLoading] = useState(!aquecidas);
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
    // Pela cache: a biblioteca muda quando ELE a muda, e até lá duas visitas
    // seguidas ao separador não são duas consultas ao Supabase.
    void lerFaixas(getLibrary).then(items => {
      if (!alive) return;
      setTracks(items); void garantirCatalogo(items);
    }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [userId]));
  // O que o aquecimento traz com a página já montada: pinta-se logo, em vez de
  // esperar pelo foco (o navegador monta tudo no arranque).
  useEffect(() => ouvirFaixas((leitor, items) => {
    if (leitor !== getLibrary || !userId) return;
    setTracks(items); setLoading(false); void garantirCatalogo(items);
  }), [userId]);
  const catalogVersion = useCatalogoDeFaixas(s => s.versao);
  const favoritos = useArtistasFavoritos(s => s.chaves);
  const alternarFavorito = useArtistasFavoritos(s => s.alternar);
  useEffect(() => { void useArtistasFavoritos.getState().carregar(); }, []);
  const artists = useMemo<ArtistGroup[]>(() => {
    // A versão invalida a projeção quando o catálogo confirma metadados.
    void catalogVersion;
    return ordenarArtistas(agruparPorArtista(tracks.map(comCatalogo)), ranking, favoritos).map(g => ({
      name: g.nome, chave: g.chave,
      artworkUrl: g.faixas.find(t => t.artworkUrl)?.artworkUrl ?? null, count: g.faixas.length,
    }));
  }, [tracks, catalogVersion, ranking, favoritos]);
  // Memorizado: sem isto, cada tecla da pesquisa varria os 753 artistas outra vez.
  const repeated = useMemo(
    () => artists.filter(a => ranking.has(chaveDeArtista(a.name))).slice(0, 10),
    [artists, ranking],
  );
  const filtered = useMemo(() => {
    const found = artists.filter(a => correspondeAPesquisa(searchQuery.trim(), a.name));
    if (order !== 'az') return found;
    // Alfabético continua a pôr os favoritos primeiro: favoritar é para os ter
    // à mão, e uma ordem que os ignorasse desfazia o gesto.
    return [...found].sort((a, b) => {
      const fa = favoritos.has(a.chave) ? 0 : 1;
      const fb = favoritos.has(b.chave) ? 0 : 1;
      return fa !== fb ? fa - fb : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }, [artists, searchQuery, order, favoritos]);
  const cardWidth = (width - spacing.xl * 2 - 24) / 3;
  const renderArtist = (artist: ArtistGroup, shelf = false) => {
    const side = shelf ? 86 : Math.min(120, cardWidth);
    return <Pressable accessibilityRole="button" accessibilityLabel={`${artist.name}, ${artist.count} songs`}
      onPress={() => navigation.navigate('LibraryGroup', { type: 'artist', name: artist.name })}
      style={({ pressed }) => [styles.card, { width: shelf ? 94 : cardWidth, opacity: pressed ? 0.6 : 1 }]}>
      {artist.artworkUrl ? <Image source={{ uri: capaParaLista(artist.artworkUrl)! }} contentFit="cover"
        style={{ width: side, height: side, borderRadius: side / 2, backgroundColor: colors.surfaceHigh }} />
        : <View style={[styles.fallback, { width: side, height: side, borderRadius: side / 2 }]}><Ionicons name="person" size={30} color={colors.textTertiary} /></View>}
      {/* Na prateleira de cima não: são círculos de 86 e já dizem quem se
          ouve mais. A estrela vive na grelha, que é a lista toda. */}
      {!shelf && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: favoritos.has(artist.chave) }}
          accessibilityLabel={favoritos.has(artist.chave) ? `Unfavourite ${artist.name}` : `Favourite ${artist.name}`}
          hitSlop={8}
          onPress={() => { hapticSelection(); alternarFavorito(artist.chave); }}
          style={[styles.estrela, { left: (cardWidth + side) / 2 - 30 }]}>
          <Ionicons name={favoritos.has(artist.chave) ? 'star' : 'star-outline'} size={15}
            color={favoritos.has(artist.chave) ? colors.accent : colors.textSecondary} />
        </Pressable>
      )}
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
          <ArtistFavoritesSyncStatus />
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
  /** A estrela encostada à direita do círculo do artista; o `left` é
   * calculado na linha, porque o lado do cartão muda com a largura do ecrã. */
  estrela: {
    position: 'absolute', top: -2, width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHigh,
  },
  name: { ...type.body, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  fallback: { backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  search: { paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  searchButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  shelf: { gap: 18, marginTop: 4 },
  orderRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 24 },
  orderButton: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center', borderRadius: 22 },
  selected: { backgroundColor: colors.surfaceHigh },
});
