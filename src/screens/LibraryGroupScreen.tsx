import { CabecalhoDaSeccao, CapaDoArtista, DiscosDoArtista, ParecidosDoArtista } from '../components/SeccoesDoArtista';
import { useVizinhancaDoArtista } from '../hooks/useVizinhancaDoArtista';
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
import { pesquisarMusica, type DetalheDaPesquisa } from '../api/search';
import { BrilhoDoEcra } from '../components/BrilhoDoEcra';
import { EmptyState } from '../components/EmptyState';
import { SkeletonDeFaixas, SkeletonDePrateleira } from '../components/Skeleton';
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
import { marcarArtistaAberto } from '../state/novosLancamentos';
import { hapticSelection } from '../lib/haptics';
import { chaveDeArtista, displayArtist, tituloDaFaixa } from '../lib/artistName';
import { detalheDaLinha, infoDaPesquisa, infoDe, modosComDados, ordenarMusicasDoArtista } from '../lib/ordemDoArtista';
import { discografia, legendaDoDisco, metaDoAlbum, metaDoArtista, musicasAVista, musicasDoArtista, MUSICAS_A_VISTA } from '../lib/musicasDoArtista';
import { chaveDoTitulo } from '../lib/albunsDoArtista';
import { getOrdemDoArtista, setOrdemDoArtista, type OrdemDoArtista } from '../lib/prefs';
import { useAuth } from '../state/auth';
import type { Track } from '../types';
import { useAlturaDosSeparadores } from '../state/doca';
import { avisarErro } from '../lib/avisoDeRemocao';

type Props = NativeStackScreenProps<RootStackParamList, 'LibraryGroup'>;

/** O lançamento mais recente do artista, por cima das músicas (29/9). */
function UltimoLancamento({ album, onPress }: { album: AlbumDaPagina; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Latest release: ${album.title}`} onPress={onPress}
    style={({ pressed }) => [styles.ultimo, pressed && { backgroundColor: colors.surfacePressed }]}>
    {album.artworkUrl ? <Image source={{ uri: album.artworkUrl }} style={styles.ultimoCapa} contentFit="cover" />
      : <View style={[styles.ultimoCapa, styles.albumArtFallback]}><Ionicons name="albums-outline" size={22} color={colors.textTertiary} /></View>}
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <Text style={styles.ultimoRotulo}>LATEST RELEASE</Text>
      <Text numberOfLines={1} style={[typography.body, { fontWeight: '700' }]}>{album.title}</Text>
      <Text numberOfLines={1} style={typography.caption}>{legendaDoDisco(album)}</Text>
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

  // A página de um artista é uma página só, por secções (20/10, variante A de
  // docs/artista-maquete.html): a foto e o nome, as ações, o último
  // lançamento, as músicas (cinco, ou todas com "See all songs"), a
  // discografia e os parecidos. Eram separadores.
  const [todas, setTodas] = useState(false);
  useEffect(() => { setTodas(false); }, [type, name]);
  const [ytTracks, setYtTracks] = useState<Track[]>([]);
  // As visualizações e a idade de cada vídeo da pesquisa (15/10): a ordem de
  // um artista sem página musical.
  const [detalhesDaPesquisa, setDetalhesDaPesquisa] = useState<Record<string, DetalheDaPesquisa>>({});
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
    setDetalhesDaPesquisa({});
    // Como no PC: só entra o que é deste artista, e pela pesquisa sem quota.
    // Era a `searchYouTube` crua, que trazia os homónimos (28/9).
    const alvo = chaveDeArtista(name);
    void pesquisarMusica(`${name} music`)
      .then(({ faixas, detalhes }) => {
        if (!alive) return;
        setYtTracks(faixas.filter((t) => chaveDeArtista(displayArtist(t)) === alvo));
        setDetalhesDaPesquisa(detalhes ?? {});
      })
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
  // `undefined`: ainda a caminho; `null`: o catálogo não a tem.
  const [foto, setFoto] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (type !== 'artist' || !name) return;
    let vivo = true;
    setFoto(undefined);
    void fotoDoArtista(name).then((url) => { if (vivo) setFoto(url); });
    return () => { vivo = false; };
  }, [type, name]);
  // As do canal primeiro; sem canal (ou sem lista), a pesquisa pelo nome.
  const doCanal = pagina?.musicas.length ? pagina.musicas : null;
  // "Most played" ou "Newest" (10/10, lib/ordemDoArtista.ts): as reproduções e
  // o ano vêm da página do canal, sem pedidos a mais. Nas duas abas de músicas.
  const [ordem, setOrdem] = useState<OrdemDoArtista>('ouvidas');
  useEffect(() => { void getOrdemDoArtista().then(setOrdem).catch(() => {}); }, []);
  const escolherOrdem = (o: OrdemDoArtista) => { hapticSelection(); setOrdem(o); void setOrdemDoArtista(o).catch(() => {}); };
  // Sem lista no canal, as visualizações e a idade dos vídeos da pesquisa
  // (15/10): sem elas os dois botões davam a mesma lista.
  const infoDaBusca = useMemo(() => (doCanal ? null : infoDaPesquisa(ytTracks.map((t) => ({
    videoId: t.sourceId, titulo: tituloDaFaixa(t), ...detalhesDaPesquisa[t.sourceId],
  })), chaveDoTitulo)), [doCanal, ytTracks, detalhesDaPesquisa]);
  const infoDaFaixa = useCallback((t: Track) => (pagina ? infoDe(pagina.info, t.sourceId, tituloDaFaixa(t), chaveDoTitulo) : null)
    ?? (infoDaBusca ? infoDe(infoDaBusca, t.sourceId, tituloDaFaixa(t), chaveDoTitulo) : null), [pagina, infoDaBusca]);
  const ordenar = useCallback((lista: Track[]) => (type === 'artist' ? ordenarMusicasDoArtista(lista, ordem, infoDaFaixa) : lista),
    [type, ordem, infoDaFaixa]);
  const otherTracks = useMemo(() => {
    const ids = new Set(tracks.map(t => `${t.source}:${t.sourceId}`));
    return ordenar((doCanal ?? ytTracks).filter(t => !ids.has(`${t.source}:${t.sourceId}`)));
  }, [doCanal, ytTracks, tracks, ordenar]);
  const tracksDaAba = useMemo(() => ordenar(tracks), [tracks, ordenar]);
  // As do canal chegam com os álbuns; a pesquisa pelo nome é o recurso.
  const aCarregarOutras = loadingYtAlbums || (!doCanal && loadingYtTracks);
  // As tuas primeiro (o coração da linha marca-as), depois as outras dele --
  // só quando a fonte certa responder: a pesquisa pelo nome chega antes do
  // canal, e mostrá-la para a trocar a seguir mudava a lista debaixo do dedo.
  const musicas = useMemo(() => musicasDoArtista(tracksDaAba, aCarregarOutras ? [] : otherTracks),
    [tracksDaAba, otherTracks, aCarregarOutras]);
  // O botão só aparece quando muda alguma coisa na lista (ou ainda a chegar).
  const mostrarOrdem = type === 'artist' && (aCarregarOutras
    || modosComDados(musicas, infoDaFaixa).length > 0);
  const favoritos = useArtistasFavoritos((s) => s.chaves);
  const alternarFavorito = useArtistasFavoritos((s) => s.alternar);
  useEffect(() => { void useArtistasFavoritos.getState().carregar(); }, []);
  const favorito = favoritos.has(chaveDeArtista(name));
  // Abrir o artista tira-lhe o ponto de "lançamento novo" nos Artists (10/10).
  useEffect(() => { if (type === 'artist') marcarArtistaAberto(chaveDeArtista(name)); }, [type, name]);

  const bottomPad = separadores + insets.bottom + MINI_PLAYER_HEIGHT + 32;
  const cab = useCabecalhoQueEncolhe();
  const [fimDoNome, setFimDoNome] = useState(260);
  // De onde vem a lista: o "Jump back in" da Home volta aqui (lib/recentes.ts).
  const origemDaPagina = useMemo(() => ({ tipo: type === 'artist' ? 'artista' : 'album', nome: name } as const), [type, name]);
  // Cada aba é uma lista nova, que começa no topo: o cabeçalho volta a abrir.
  const rolagem = cab.rolagem;
  useEffect(() => { rolagem.setValue(0); }, [type, name, rolagem]);

  /**
   * A fila de acções do artista é a MESMA da playlist, e de propósito.
   *
   * O modo do shuffle vem do leitor e não desta página -- um só sítio decide se
   * ele é inteligente, e o botão daqui mostra-o e respeita-o. O "Play" toca com
   * o modo que estiver escolhido, em vez de o mudar por baixo de quem carregou:
   * era isso que fazia um "Play" desligar o shuffle para sempre.
   */
  const tocarLista = usePlayer((s) => s.tocarLista);
  // O Play toca as músicas da página toda (as tuas e as dele), e não só as
  // cinco que se veem.
  const faixasDaAba = musicas;
  // Só se espera sem nada para mostrar: as tuas aparecem logo, e as outras dele
  // entram por baixo quando chegarem (com o esqueleto no rodapé até lá).
  const waiting = loading || (musicas.length === 0 && aCarregarOutras);
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
    const ok = await tocarMixDoArtista(name, { mix: pagina?.mix, faixas: tracks, musicas: pagina?.musicas }).catch(() => false);
    setAAbrirMix(false);
    if (!ok) avisarErro('Could not load the mix.', 'Check your connection and try again.');
  };
  const accoesDoArtista = (
    <>
      {faixasDaAba.length || waiting ? <>
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
  // A imagem do topo muda no máximo uma vez, num fundido (23/10, João: "a foto
  // de fora do artista não é a mesma de dentro ... faz uma transição clean
  // quando muda de foto"). Abre com a que se tocou (a capa do cartão dos
  // Artists, a foto de um parecido) e passa para a definitiva quando se souber
  // qual é: a do catálogo; se o catálogo não a tiver, a do canal dele no
  // YouTube Music (30/9); sem as duas, fica a capa de uma música dele. Antes
  // passava por três, conforme cada uma chegava: a capa, a do canal e a do
  // catálogo.
  const capaDeEntrada = route.params.capa
    ?? tracks.find((t) => t.artworkUrl)?.artworkUrl
    ?? ytTracks.find((t) => t.artworkUrl)?.artworkUrl
    ?? null;
  const capaDoArtista = foto ?? (foto === null ? pagina?.foto : null) ?? capaDeEntrada;
  // Os fãs e os parecidos (o catálogo, com as tuas como prova de quem ele é), e
  // a discografia partida em álbuns e em singles e EPs.
  const vizinhanca = useVizinhancaDoArtista(name, tracks, type === 'artist' && !loading);
  const discos = useMemo(() => discografia(ytAlbums as AlbumDaPagina[]), [ytAlbums]);
  const abrirDisco = (d: { id: string; title: string; artworkUrl: string | null }) => {
    setSelectedYtPlaylistId(d.id); setSelectedYtPlaylistTitle(d.title); setSelectedYtPlaylistArtwork(d.artworkUrl);
  };
  const ordemDasMusicas = mostrarOrdem ? <View style={styles.ordem} accessibilityRole="radiogroup">
    {([['ouvidas', 'Most played'], ['recentes', 'Newest']] as const).map(([o, rotulo]) => <Pressable key={o}
      accessibilityRole="radio" accessibilityState={{ selected: ordem === o }} hitSlop={6}
      style={[styles.ordemOpcao, ordem === o && styles.ordemOpcaoAtiva]} onPress={() => escolherOrdem(o)}>
      <Text style={[styles.ordemTexto, ordem === o && { color: colors.text }]}>{rotulo}</Text>
    </Pressable>)}
  </View> : null;
  const header = type === 'artist' ? <>
    {/* Por baixo do nome, os fãs e quantas são tuas -- só quando são (o
        "0 songs" ao abrir parecia uma página avariada). */}
    <CapaDoArtista nome={name} foto={capaDoArtista} meta={metaDoArtista(tracks.length, loading, vizinhanca.fas)} aoMedirNome={setFimDoNome} />
    <View style={styles.accoes}>{accoesDoArtista}</View>
    {pagina?.maisRecente ? <UltimoLancamento album={pagina.maisRecente} onPress={() => abrirDisco(pagina.maisRecente!)} /> : null}
    <CabecalhoDaSeccao titulo="Songs" direita={ordemDasMusicas} />
  </> : tracks.length > 0 ? <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.md }}>
    <PillButton label="Play all" small onPress={() => playTrack(tracks[0], tracks, true, false, undefined, origemDaPagina)} />
  </View> : null;
  // Por baixo das músicas: as que ainda chegam, o "See all songs", a
  // discografia e os parecidos.
  const footer = type === 'artist' ? <>
    {!waiting && aCarregarOutras ? <SkeletonDeFaixas linhas={3} /> : null}
    {musicas.length > MUSICAS_A_VISTA ? <Pressable accessibilityRole="button"
      accessibilityLabel={todas ? 'Show fewer songs' : `See all ${musicas.length} songs`}
      onPress={() => { hapticSelection(); setTodas((t) => !t); }}
      style={({ pressed }) => [styles.verTodas, pressed && { backgroundColor: colors.surfacePressed }]}>
      <Text style={styles.verTodasTexto}>{todas ? 'Show fewer' : 'See all songs'}</Text>
    </Pressable> : null}
    {loadingYtAlbums ? <SkeletonDePrateleira /> : <>
      <DiscosDoArtista titulo="Albums" discos={discos.albuns} aoAbrir={abrirDisco} />
      <DiscosDoArtista titulo="Singles & EPs" discos={discos.singles} aoAbrir={abrirDisco} />
    </>}
    <ParecidosDoArtista nomes={vizinhanca.parecidos} aoAbrir={(n, f) => navigation.push('LibraryGroup', { type: 'artist', name: n, capa: f })} />
  </> : null;
  const rows = type === 'artist' ? musicasAVista(musicas, todas) : musicas;
  return (
    // O título encolhe ao rolar (3/10): no álbum, o título do cabeçalho; no
    // artista, o nome grande da capa dá lugar ao pequeno na barra de cima.
    <Screen encolhe={cab} tituloCompacto={type === 'artist' ? { texto: name, aparecerEm: fimDoNome } : undefined}
      title={type === 'album' ? name : undefined}
      subtitle={type === 'album' ? metaDoAlbum(tracks.length, loading) : undefined}
      onBack={() => navigation.goBack()}
      topLeft={type === 'artist' ? <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => navigation.goBack()}
        style={styles.voltarSobreAFoto}>
        <Ionicons name="chevron-back" size={26} color={colors.text} /></Pressable> : undefined}>
      <Animated.FlatList data={waiting ? [] : rows}
        onScroll={cab.onScroll} scrollEventThrottle={cab.scrollEventThrottle} scrollIndicatorInsets={{ top: cab.espaco }} keyExtractor={(item) => `${item.source}:${item.sourceId}`}
        ListHeaderComponent={header} initialNumToRender={12} windowSize={7}
        // O artista começa na foto, por baixo da barra (que flutua sobre ela).
        contentContainerStyle={{ paddingTop: type === 'artist' ? 0 : cab.espaco, paddingBottom: bottomPad }}
        ListEmptyComponent={waiting ? <SkeletonDeFaixas linhas={type === 'artist' ? 5 : 6} /> : type === 'album'
          ? <EmptyState icon="albums-outline" title="Nothing here"
              subtitle="None of this album's songs are in your library." />
          : <EmptyState icon="musical-notes-outline" title="No songs found" subtitle="No songs by this artist were found." />}
        ListFooterComponent={footer}
        renderItem={({ item }) => <TrackRow track={item} showSavedBadge={type === 'artist'}
          acompanharATocar
          contextLabel={type === 'artist' ? detalheDaLinha(ordem, infoDaFaixa(item)) ?? undefined : undefined}
          onPress={() => tocarMusica(item, type === 'artist' ? musicas : tracksDaAba, true, undefined, origemDaPagina)} onAction={() => setActionTrack(item)} />}
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
  // "Most played" / "Newest" (10/10), à direita do título "Songs".
  ordem: {
    flexDirection: 'row',
    gap: 2,
    padding: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  // As ações por baixo do nome, encostadas à esquerda como ele.
  accoes: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  // O voltar fica sobre a foto: um disco escuro, para se ver em qualquer foto.
  voltarSobreAFoto: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginLeft: spacing.lg,
    backgroundColor: 'rgba(10,10,15,0.5)',
  },
  verTodas: {
    marginHorizontal: spacing.xl, marginTop: spacing.sm, minHeight: 44, borderRadius: radii.md, borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center',
  },
  verTodasTexto: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  ordemOpcao: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill },
  ordemOpcaoAtiva: { backgroundColor: colors.surfacePressed },
  ordemTexto: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
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
