import { CabecalhoDaPlaylist } from '../components/CabecalhoDaPlaylist';
import { comCatalogo } from '../state/catalogoDeFaixas';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLibrary } from '../api/library';
import { searchYouTube, searchYouTubePlaylists } from '../api/youtube';
import { BrilhoInteligente } from '../components/BrilhoInteligente';
import { EmptyState } from '../components/EmptyState';
import { PillButton } from '../components/PillButton';
import { Screen } from '../components/Screen';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { TrackRow } from '../components/TrackRow';
import { YtPlaylistRecommendationSheet } from '../components/YtPlaylistRecommendationSheet';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useSaved } from '../state/saved';
import { usePlayer } from '../state/player';
import { colors, MINI_PLAYER_HEIGHT, spacing, radii, type as typography } from '../theme';
import { useTheme } from '../state/theme';
import { hapticSelection } from '../lib/haptics';
import { agruparPorArtista, chaveDeArtista } from '../lib/artistName';
import { useAuth } from '../state/auth';
import type { Track } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'LibraryGroup'>;

/** Detalhe de um álbum ou artista (vista sobre as faixas guardadas). */
export function LibraryGroupScreen({ route, navigation }: Props) {
  const { type, name } = route.params;
  const insets = useSafeAreaInsets();
  const playTrack = usePlayer((s) => s.playTrack);
  const current = usePlayer((s) => s.current);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const theme = useTheme((s) => s.theme);
  const [actionTrack, setActionTrack] = useState<Track | null>(null);

  // Artist additional content states
  const [activeTab, setActiveTab] = useState<'library' | 'youtube_tracks' | 'youtube_albums'>('library');
  useEffect(() => { setActiveTab('library'); }, [type, name]);
  const [ytTracks, setYtTracks] = useState<Track[]>([]);
  const [ytAlbums, setYtAlbums] = useState<any[]>([]);
  const [loadingYtTracks, setLoadingYtTracks] = useState(false);
  const [loadingYtAlbums, setLoadingYtAlbums] = useState(false);

  // Recommendations sheet states
  const [selectedYtPlaylistId, setSelectedYtPlaylistId] = useState<string | null>(null);
  const [selectedYtPlaylistTitle, setSelectedYtPlaylistTitle] = useState<string | null>(null);
  const [selectedYtPlaylistArtwork, setSelectedYtPlaylistArtwork] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // Marca as faixas do YouTube deste artista que já estão na biblioteca.
      useSaved.getState().refresh();
      const all = await getLibrary();
      if (type === 'album') {
        setTracks(all.filter((t) => t.album === name));
      } else {
        // Pela CHAVE canónica e não pelo nome mostrado — tem de ser o mesmo
        // agrupamento da página de Artistas, senão o cartão dizia cinco
        // faixas e esta página abria com duas.
        const alvo = chaveDeArtista(name);
        setTracks(agruparPorArtista(all.map(comCatalogo)).find((g) => g.chave === alvo)?.faixas ?? []);
      }
    } catch {
      // ignorar
    } finally {
      setLoading(false);
    }
  }, [type, name]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (type !== 'artist' || !name) return;
    let alive = true;
    setLoadingYtTracks(true); setLoadingYtAlbums(true);
    setYtTracks([]); setYtAlbums([]);
    void searchYouTube(name).then(res => { if (alive) setYtTracks(res); }).catch(() => {})
      .finally(() => { if (alive) setLoadingYtTracks(false); });
    void searchYouTubePlaylists(name + ' album').then(res => { if (alive) setYtAlbums(res); }).catch(() => {})
      .finally(() => { if (alive) setLoadingYtAlbums(false); });
    return () => { alive = false; };
  }, [type, name]);
  const otherTracks = useMemo(() => {
    const ids = new Set(tracks.map(t => `${t.source}:${t.sourceId}`));
    return ytTracks.filter(t => !ids.has(`${t.source}:${t.sourceId}`));
  }, [ytTracks, tracks]);

  const bottomPad = 49 + insets.bottom + MINI_PLAYER_HEIGHT + 32;

  /**
   * A fila de acções do artista é a MESMA da playlist, e de propósito.
   *
   * O modo do shuffle vem do leitor e não desta página -- um só sítio decide se
   * ele é inteligente, e o botão daqui mostra-o e respeita-o. O "Play" toca com
   * o modo que estiver escolhido, em vez de o mudar por baixo de quem carregou:
   * era isso que fazia um "Play" desligar o shuffle para sempre.
   */
  const tocarLista = usePlayer((s) => s.tocarLista);
  const shuffleLigado = usePlayer((s) => s.shuffle);
  const shuffleInteligente = usePlayer((s) => s.shuffleInteligente);
  const alternarShuffle = usePlayer((s) => s.toggleShuffle);
  const accoesDoArtista = (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Play ${name}`}
        style={styles.playButton}
        onPress={() => void tocarLista(tracks, shuffleLigado, shuffleInteligente)}
      >
        <LinearGradient
          colors={theme.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.buttonGradient}
        >
          {/* O `marginLeft` acerta o centro optico: um triangulo centrado a
              matematica parece sempre encostado a esquerda. */}
          <Ionicons name="play" size={26} color={theme.textColorOnGradient} style={{ marginLeft: 3 }} />
        </LinearGradient>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: shuffleLigado }}
        accessibilityLabel={shuffleInteligente ? 'Smart shuffle on' : shuffleLigado ? 'Shuffle on' : 'Shuffle off'}
        onPress={() => { hapticSelection(); alternarShuffle(); }}
        style={[
          styles.shuffleButton,
          shuffleLigado && !shuffleInteligente && { borderColor: theme.color, backgroundColor: theme.soft },
        ]}
      >
        {shuffleInteligente && <BrilhoInteligente />}
        <Ionicons name="shuffle" size={20} color={shuffleLigado && !shuffleInteligente ? theme.color : colors.text} />
      </Pressable>
    </>
  );
  const total = tracks.length && tracks.every(t => (t.durationSeconds ?? 0) > 0)
    ? tracks.reduce((sum, t) => sum + t.durationSeconds!, 0) : null;
  const header = <>
    {type === 'artist' ? <CabecalhoDaPlaylist artista nome={name} artworks={tracks.flatMap(t => t.artworkUrl ? [t.artworkUrl] : []).slice(0, 1)}
      faixas={tracks.length} duracaoSegundos={total}
      accoes={tracks.length ? accoesDoArtista : undefined} /> : tracks.length > 0 ? <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.md }}>
        <PillButton label="Play all" small onPress={() => playTrack(tracks[0], tracks, true)} />
      </View> : null}
    {type === 'artist' && <View style={styles.tabsContainer}>
      {([
        ['library', 'In your library'], ['youtube_tracks', 'On YouTube'], ['youtube_albums', 'Albums'],
      ] as const).map(([tab, label]) => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: activeTab === tab }}
        style={[styles.tabChip, activeTab === tab && styles.tabChipActive]} onPress={() => setActiveTab(tab)}>
        <Text style={[styles.tabLabel, activeTab === tab && { color: colors.text }]}>{label}</Text>
      </Pressable>)}
    </View>}
  </>;
  const waiting = loading || (activeTab === 'youtube_tracks' && loadingYtTracks) || (activeTab === 'youtube_albums' && loadingYtAlbums);
  const rows = activeTab === 'youtube_albums' ? ytAlbums : activeTab === 'youtube_tracks' ? otherTracks : tracks;
  return (
    <Screen title={type === 'album' ? name : undefined}
      subtitle={type === 'album' ? `Album · ${tracks.length} songs` : undefined}
      onBack={() => navigation.goBack()}
      topLeft={type === 'artist' ? <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => navigation.goBack()}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: spacing.lg }}>
        <Ionicons name="chevron-back" size={26} color={colors.text} /></Pressable> : undefined}>
      <FlatList key={activeTab} data={waiting ? [] : rows} keyExtractor={(item) => item.id ?? `${item.source}:${item.sourceId}`}
        ListHeaderComponent={header} initialNumToRender={12} windowSize={7}
        contentContainerStyle={{ paddingBottom: bottomPad }}
        ListEmptyComponent={waiting ? <ActivityIndicator color={theme.color} style={{ marginTop: 32 }} /> :
          <EmptyState icon={activeTab === 'youtube_albums' ? 'albums-outline' : 'musical-notes-outline'}
            title={activeTab === 'library' ? 'Nothing here' : activeTab === 'youtube_albums' ? 'No albums found' : 'No tracks found'}
            subtitle={activeTab === 'library' ? 'These songs may have been removed from your library.' : 'No results for this artist on YouTube.'} />}
        renderItem={({ item }) => activeTab === 'youtube_albums' ? <Pressable accessibilityRole="button"
          onPress={() => { setSelectedYtPlaylistId(item.id); setSelectedYtPlaylistTitle(item.title); setSelectedYtPlaylistArtwork(item.artworkUrl); }}
          style={({ pressed }) => [styles.albumRow, pressed && { backgroundColor: colors.surfacePressed }]}>
          {item.artworkUrl ? <Image source={{ uri: item.artworkUrl }} style={styles.albumArt} /> :
            <View style={[styles.albumArt, styles.albumArtFallback]}><Ionicons name="albums-outline" size={20} color={colors.textTertiary} /></View>}
          <View style={{ flex: 1, gap: 2 }}><Text numberOfLines={1} style={[typography.body, { fontWeight: '600' }]}>{item.title}</Text>
            <Text numberOfLines={1} style={typography.caption}>{item.channelTitle || 'YouTube'}</Text></View>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </Pressable> : <TrackRow track={item} showSavedBadge={activeTab === 'youtube_tracks'}
          active={current?.source === item.source && current?.sourceId === item.sourceId}
          onPress={() => playTrack(item, activeTab === 'library' ? tracks : otherTracks, true)} onAction={() => setActionTrack(item)} />}
      />

      <TrackActionsSheet
        visible={!!actionTrack}
        track={actionTrack}
        onClose={() => setActionTrack(null)}
        aoMudarBiblioteca={load}
      />

      <YtPlaylistRecommendationSheet
        visible={!!selectedYtPlaylistId}
        playlistId={selectedYtPlaylistId}
        playlistTitle={selectedYtPlaylistTitle}
        playlistArtwork={selectedYtPlaylistArtwork}
        onClose={() => {
          setSelectedYtPlaylistId(null);
          setSelectedYtPlaylistTitle(null);
          setSelectedYtPlaylistArtwork(null);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Os mesmos numeros do `PlaylistDetailScreen`: e o que faz esta pagina
  // parecer a de uma playlist em vez de parecida com ela.
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
  },
  buttonGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shuffleButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    // O brilho estica-se por este botao; e o raio daqui que lhe da a forma.
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tabsContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  tabChip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  tabChipActive: {
    backgroundColor: colors.surfacePressed,
    borderColor: colors.borderStrong,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  albumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  albumArt: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceHigh,
  },
  albumArtFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
