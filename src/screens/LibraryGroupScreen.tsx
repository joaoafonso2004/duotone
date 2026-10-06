import { CabecalhoDaPlaylist } from '../components/CabecalhoDaPlaylist';
import { gruposDaBiblioteca } from '../state/gruposDaBiblioteca';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View, Animated } from 'react-native';
import { tocarMixDoArtista } from '../state/mixDoArtista';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLibrary } from '../api/library';
import { lerFaixas } from '../lib/cacheDaBiblioteca';
import { fotoDoArtista } from '../api/catalogo';
import { paginaDoArtista, type AlbumDaPagina, type PaginaDoArtista } from '../api/albunsDoArtista';
import { useArtistasFavoritos } from '../state/artistasFavoritos';
import { pesquisarFaixas } from '../api/search';
import { BrilhoDoEcra } from '../components/BrilhoDoEcra';
import { EmptyState } from '../components/EmptyState';
import { SkeletonDeFaixas } from '../components/Skeleton';
import { PillButton } from '../components/PillButton';
import { Screen, useCabecalhoQueEncolhe } from '../components/Screen';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { TrackRow } from '../components/TrackRow';
import { YtPlaylistRecommendationSheet } from '../components/YtPlaylistRecommendationSheet';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useSaved } from '../state/saved';
import { usePlayer } from '../state/player';
import { colors, MINI_PLAYER_HEIGHT, spacing, radii, type as typography } from '../theme';
import { useTheme } from '../state/theme';
import { hapticSelection } from '../lib/haptics';
import { chaveDeArtista, displayArtist } from '../lib/artistName';
import { useAuth } from '../state/auth';
import type { Track } from '../types';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { useAlturaDosSeparadores } from '../state/doca';
import { avisarErro } from '../lib/avisoDeRemocao';

type Props = NativeStackScreenProps<RootStackParamList, 'LibraryGroup'>;

/** O lançamento mais recente do artista, por cima dos separadores (29/9). */
function UltimoLancamento({ album, onPress }: { album: AlbumDaPagina; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Latest release: ${album.title}`} onPress={onPress}
    style={({ pressed }) => [styles.ultimo, pressed && { backgroundColor: colors.surfacePressed }]}>
    {album.artworkUrl ? <Image source={{ uri: album.artworkUrl }} style={styles.ultimoCapa} contentFit="cover" />
      : <View style={[styles.ultimoCapa, styles.albumArtFallback]}><Ionicons name="albums-outline" size={22} color={colors.textTertiary} /></View>}
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <Text style={styles.ultimoRotulo}>LATEST RELEASE</Text>
      <Text numberOfLines={1} style={[typography.body, { fontWeight: '700' }]}>{album.title}</Text>
      <Text numberOfLines={1} style={typography.caption}>{album.channelTitle}</Text>
    </View>
    <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
  </Pressable>;
}

/** Detalhe de um álbum ou artista (vista sobre as faixas guardadas). */
export function LibraryGroupScreen({ route, navigation }: Props) {
  const { type, name } = route.params;
  const insets = useSafeAreaInsets();
  // A barra dos separadores MEDIDA (auditoria 1.3), não um 49 à mão.
  const separadores = useAlturaDosSeparadores();
  const playTrack = usePlayer((s) => s.playTrack);
  // Tocar numa música: com "Start Radio from a song" é o Radio (ver `tocarMusica`).
  const tocarMusica = usePlayer((s) => s.tocarMusica);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const leitura = useRef(0);
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
    const pedido = ++leitura.current;
    try {
      // Marca as faixas do YouTube deste artista que já estão na biblioteca.
      useSaved.getState().refresh();
      // Da cache partilhada: cada página de artista relia a biblioteca
      // inteira (30/9, egress).
      const all = await lerFaixas(getLibrary);
      if (pedido !== leitura.current) return;
      if (type === 'album') {
        setTracks(all.filter((t) => t.album === name));
      } else {
        // Pela CHAVE canónica e não pelo nome mostrado — tem de ser o mesmo
        // agrupamento da página de Artistas, senão o cartão dizia cinco
        // faixas e esta página abria com duas.
        const alvo = chaveDeArtista(name);
        setTracks(gruposDaBiblioteca(all).find((g) => g.chave === alvo)?.faixas ?? []);
      }
    } catch {
      // ignorar
    } finally {
      if (pedido === leitura.current) setLoading(false);
    }
  }, [type, name]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      // A cache resolve numa microtask. Ceder um frame impede a biblioteca
      // inteira de bloquear a primeira imagem da navegação.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const frame = requestAnimationFrame(() => { timer = setTimeout(() => void load(), 0); });
      return () => { cancelAnimationFrame(frame); clearTimeout(timer); ++leitura.current; };
    }, [load])
  );

  useEffect(() => {
    if (type !== 'artist' || !name) return;
    let alive = true;
    setLoadingYtTracks(true);
    setYtTracks([]);
    // Como no PC: só entra o que é deste artista, e pela pesquisa sem quota.
    // Era a `searchYouTube` crua, que trazia os homónimos (28/9).
    const alvo = chaveDeArtista(name);
    void pesquisarFaixas(`${name} music`)
      .then(res => { if (alive) setYtTracks(res.filter((t) => chaveDeArtista(displayArtist(t)) === alvo)); })
      .catch(() => {})
      .finally(() => { if (alive) setLoadingYtTracks(false); });
    return () => { alive = false; };
  }, [type, name]);
  // Os álbuns, o mais recente e as músicas vêm do canal do artista no YouTube
  // Music, escolhido pelas músicas dele na biblioteca (28/9 e 29/9,
  // `paginaDoArtista`): pelo nome vinham os de um homónimo. Por isso espera que
  // a biblioteca seja lida.
  const [pagina, setPagina] = useState<PaginaDoArtista | null>(null);
  useEffect(() => { setPagina(null); }, [type, name]);
  const provas = tracks.slice(0, 3).map((t) => t.sourceId).join(',');
  useEffect(() => {
    if (type !== 'artist' || !name || loading) return;
    let alive = true;
    setLoadingYtAlbums(true);
    void paginaDoArtista(name, tracks).then(res => { if (alive) { setPagina(res); setYtAlbums(res.albuns); } })
      .finally(() => { if (alive) setLoadingYtAlbums(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `provas` resume as faixas que contam
  }, [type, name, loading, provas]);
  // A FOTO do artista vem do catálogo (27/9, `fotoDoArtista`). Era a capa da
  // primeira música dele na biblioteca, e quem não tinha nenhuma via uma nota.
  const [foto, setFoto] = useState<string | null>(null);
  useEffect(() => {
    if (type !== 'artist' || !name) return;
    let vivo = true;
    setFoto(null);
    void fotoDoArtista(name).then((url) => { if (vivo) setFoto(url); });
    return () => { vivo = false; };
  }, [type, name]);
  // As do canal primeiro; sem canal (ou sem lista), a pesquisa pelo nome.
  const doCanal = pagina?.musicas.length ? pagina.musicas : null;
  const otherTracks = useMemo(() => {
    const ids = new Set(tracks.map(t => `${t.source}:${t.sourceId}`));
    return (doCanal ?? ytTracks).filter(t => !ids.has(`${t.source}:${t.sourceId}`));
  }, [doCanal, ytTracks, tracks]);
  const favoritos = useArtistasFavoritos((s) => s.chaves);
  const alternarFavorito = useArtistasFavoritos((s) => s.alternar);
  useEffect(() => { void useArtistasFavoritos.getState().carregar(); }, []);
  const favorito = favoritos.has(chaveDeArtista(name));

  const bottomPad = separadores + insets.bottom + MINI_PLAYER_HEIGHT + 32;
  const cab = useCabecalhoQueEncolhe();
  const [fimDoNome, setFimDoNome] = useState(260);
  // De onde vem a lista: o "Jump back in" da Home volta aqui (lib/recentes.ts).
  const origemDaPagina = useMemo(() => ({ tipo: type === 'artist' ? 'artista' : 'album', nome: name } as const), [type, name]);
  // Cada aba é uma lista nova, que começa no topo: o cabeçalho volta a abrir.
  const rolagem = cab.rolagem;
  useEffect(() => { rolagem.setValue(0); }, [activeTab, rolagem]);

  /**
   * A fila de acções do artista é a MESMA da playlist, e de propósito.
   *
   * O modo do shuffle vem do leitor e não desta página -- um só sítio decide se
   * ele é inteligente, e o botão daqui mostra-o e respeita-o. O "Play" toca com
   * o modo que estiver escolhido, em vez de o mudar por baixo de quem carregou:
   * era isso que fazia um "Play" desligar o shuffle para sempre.
   */
  const tocarLista = usePlayer((s) => s.tocarLista);
  // O Play usa a mesma lista que está à vista. Em Albums abre-se primeiro um
  // álbum; não há uma lista de músicas para o Play do topo tocar.
  const faixasDaAba = activeTab === 'library' ? tracks : activeTab === 'youtube_tracks' ? otherTracks : [];
  // As músicas do canal chegam com os álbuns; a pesquisa pelo nome é o recurso.
  const waiting = loading || (activeTab === 'youtube_tracks' && (loadingYtAlbums || (!doCanal && loadingYtTracks)))
    || (activeTab === 'youtube_albums' && loadingYtAlbums);
  const shuffleLigado = usePlayer((s) => s.shuffle);
  const shuffleInteligente = usePlayer((s) => s.shuffleInteligente);
  const alternarShuffle = usePlayer((s) => s.toggleShuffle);
  // O Mix é uma ação permanente. O canal e as músicas chegam ao carregar;
  // artistas sem uma rádio publicada usam as suas músicas como contexto.
  const [aAbrirMix, setAAbrirMix] = useState(false);
  const tocarMix = async () => {
    if (aAbrirMix) return;
    hapticSelection();
    setAAbrirMix(true);
    const ok = await tocarMixDoArtista(name, { mix: pagina?.mix, faixas: tracks }).catch(() => false);
    setAAbrirMix(false);
    if (!ok) avisarErro('Could not load the mix.', 'Check your connection and try again.');
  };
  const accoesDoArtista = (
    <>
      {faixasDaAba.length || (activeTab !== 'youtube_albums' && waiting) ? <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Play ${name}`}
        accessibilityState={{ disabled: waiting }}
        disabled={waiting}
        style={[styles.playButton, waiting && { opacity: 0.5 }]}
        onPress={() => { if (!waiting) void tocarLista(faixasDaAba, shuffleLigado, shuffleInteligente, { tipo: 'artista', nome: name }); }}
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
        accessibilityState={{ selected: shuffleLigado, disabled: waiting }}
        disabled={waiting}
        accessibilityLabel={shuffleInteligente ? 'Smart shuffle on' : shuffleLigado ? 'Shuffle on' : 'Shuffle off'}
        onPress={() => { hapticSelection(); alternarShuffle(); }}
        style={[
          styles.shuffleButton,
          waiting && { opacity: 0.5 },
          shuffleLigado && !shuffleInteligente && { borderColor: theme.color, backgroundColor: theme.soft },
        ]}
      >
        {shuffleInteligente && <BrilhoDoEcra />}
        <Ionicons name="shuffle" size={20} color={shuffleLigado && !shuffleInteligente ? theme.color : colors.text} />
      </Pressable>
      </> : null}
      {(
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${name} Mix`}
          accessibilityState={{ busy: aAbrirMix }}
          disabled={aAbrirMix}
          onPress={() => void tocarMix()}
          style={[styles.shuffleButton, aAbrirMix && { opacity: 0.5 }]}
        >
          {aAbrirMix ? <ActivityIndicator size="small" color={colors.text} /> : <Ionicons name="radio-outline" size={20} color={colors.text} />}
        </Pressable>
      )}
      {/* Favoritar dentro da página (29/9): só se podia na lista dos artistas. */}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: favorito }}
        accessibilityLabel={favorito ? `Unfavourite ${name}` : `Favourite ${name}`}
        onPress={() => { hapticSelection(); alternarFavorito(chaveDeArtista(name)); }}
        style={[styles.shuffleButton, favorito && { borderColor: theme.color, backgroundColor: theme.soft }]}
      >
        <Ionicons name={favorito ? 'heart' : 'heart-outline'} size={20} color={favorito ? theme.color : colors.text} />
      </Pressable>
    </>
  );
  // A foto do catálogo; sem ela, a do canal dele no YouTube Music (30/9); sem
  // as duas, a capa de uma música dele -- da biblioteca e, se lá não houver
  // nenhuma, das que se encontraram fora dela.
  const capaDoArtista = foto
    ?? pagina?.foto
    ?? tracks.find((t) => t.artworkUrl)?.artworkUrl
    ?? ytTracks.find((t) => t.artworkUrl)?.artworkUrl
    ?? null;
  const faixasDoCabecalho = activeTab === 'youtube_albums' ? tracks : faixasDaAba;
  const total = faixasDoCabecalho.length && faixasDoCabecalho.every(t => (t.durationSeconds ?? 0) > 0)
    ? faixasDoCabecalho.reduce((sum, t) => sum + t.durationSeconds!, 0) : null;
  const header = <>
    {type === 'artist' ? <CabecalhoDaPlaylist artista aoMedirNome={setFimDoNome} nome={name} artworks={capaDoArtista ? [capaDoArtista] : []}
      faixas={faixasDoCabecalho.length} duracaoSegundos={total}
      accoes={accoesDoArtista} /> : tracks.length > 0 ? <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.md }}>
        <PillButton label="Play all" small onPress={() => playTrack(tracks[0], tracks, true, false, undefined, origemDaPagina)} />
      </View> : null}
    {type === 'artist' && pagina?.maisRecente ? <UltimoLancamento album={pagina.maisRecente}
      onPress={() => { const a = pagina.maisRecente!; setSelectedYtPlaylistId(a.id); setSelectedYtPlaylistTitle(a.title); setSelectedYtPlaylistArtwork(a.artworkUrl); }} /> : null}
    {type === 'artist' && <View style={styles.tabsContainer}>
      {([
        ['library', 'In your library'], ['youtube_tracks', 'More songs'], ['youtube_albums', 'Albums'],
      ] as const).map(([tab, label]) => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: activeTab === tab }}
        style={[styles.tabChip, activeTab === tab && styles.tabChipActive]} onPress={() => setActiveTab(tab)}>
        <Text style={[styles.tabLabel, activeTab === tab && { color: colors.text }]}>{label}</Text>
      </Pressable>)}
    </View>}
  </>;
  const rows = activeTab === 'youtube_albums' ? ytAlbums : activeTab === 'youtube_tracks' ? otherTracks : tracks;
  return (
    // O título encolhe ao rolar (3/10): no álbum, o título do cabeçalho; no
    // artista, o nome grande da capa dá lugar ao pequeno na barra de cima.
    <Screen encolhe={cab} tituloCompacto={type === 'artist' ? { texto: name, aparecerEm: fimDoNome } : undefined}
      title={type === 'album' ? name : undefined}
      subtitle={type === 'album' ? `Album · ${tracks.length} songs` : undefined}
      onBack={() => navigation.goBack()}
      topLeft={type === 'artist' ? <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => navigation.goBack()}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: spacing.lg }}>
        <Ionicons name="chevron-back" size={26} color={colors.text} /></Pressable> : undefined}>
      <Animated.FlatList key={activeTab} data={waiting ? [] : rows}
        onScroll={cab.onScroll} scrollEventThrottle={cab.scrollEventThrottle} scrollIndicatorInsets={{ top: cab.espaco }} keyExtractor={(item) => item.id ?? `${item.source}:${item.sourceId}`}
        ListHeaderComponent={header} initialNumToRender={12} windowSize={7}
        contentContainerStyle={{ paddingTop: cab.espaco, paddingBottom: bottomPad }}
        ListEmptyComponent={waiting ? <SkeletonDeFaixas linhas={6} /> :
          <EmptyState icon={activeTab === 'youtube_albums' ? 'albums-outline' : 'musical-notes-outline'}
            title={activeTab === 'library' ? 'Nothing here' : activeTab === 'youtube_albums' ? 'No albums found' : 'No tracks found'}
            subtitle={activeTab === 'library' ? 'These songs may have been removed from your library.' : 'No other songs found for this artist.'} />}
        renderItem={({ item }) => activeTab === 'youtube_albums' ? <Pressable accessibilityRole="button"
          onPress={() => { setSelectedYtPlaylistId(item.id); setSelectedYtPlaylistTitle(item.title); setSelectedYtPlaylistArtwork(item.artworkUrl); }}
          style={({ pressed }) => [styles.albumRow, pressed && { backgroundColor: colors.surfacePressed }]}>
          {item.artworkUrl ? <Image source={{ uri: capaParaLista(item.artworkUrl)! }} style={styles.albumArt} /> :
            <View style={[styles.albumArt, styles.albumArtFallback]}><Ionicons name="albums-outline" size={20} color={colors.textTertiary} /></View>}
          <View style={{ flex: 1, gap: 2 }}><Text numberOfLines={1} style={[typography.body, { fontWeight: '600' }]}>{item.title}</Text>
            <Text numberOfLines={1} style={typography.caption}>{item.channelTitle || 'Album'}</Text></View>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </Pressable> : <TrackRow track={item} showSavedBadge={activeTab === 'youtube_tracks'}
          acompanharATocar
          onPress={() => tocarMusica(item, activeTab === 'library' ? tracks : otherTracks, true, undefined, origemDaPagina)} onAction={() => setActionTrack(item)} />}
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
  ultimo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    padding: spacing.sm,
    paddingRight: spacing.md,
    borderRadius: radii.lg,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
  },
  ultimoCapa: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    borderCurve: 'continuous',
    backgroundColor: colors.surfaceHigh,
  },
  ultimoRotulo: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    color: colors.textTertiary,
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
    borderCurve: 'continuous',
    backgroundColor: colors.surfaceHigh,
  },
  albumArtFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
