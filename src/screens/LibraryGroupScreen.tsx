import {
  alturaDaCapaDoArtista, BolaDeVidro, BotaoDeTocar, CabecalhoDaSeccao, CapaDoArtista, DiscosDoArtista, FundoDaCorDoArtista,
  GrelhaDeMusicas, LancamentoEmDestaque, ParecidosDoArtista, PilulaDeVidro, SobreOArtista,
} from '../components/SeccoesDoArtista';
import { MusicasDoArtistaSheet } from '../components/MusicasDoArtistaSheet';
import { useVizinhancaDoArtista } from '../hooks/useVizinhancaDoArtista';
import { gruposDaBiblioteca } from '../state/gruposDaBiblioteca';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, Animated, useWindowDimensions } from 'react-native';
import { tocarMixDoArtista } from '../state/mixDoArtista';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLibrary } from '../api/library';
import { lerFaixas } from '../lib/cacheDaBiblioteca';
import { fotoDoArtista } from '../api/catalogo';
import { paginaDoArtista, type AlbumDaPagina, type PaginaDoArtista } from '../api/albunsDoArtista';
import { useArtistasFavoritos } from '../state/artistasFavoritos';
import { pesquisarMusica, type DetalheDaPesquisa } from '../api/search';
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
import { MINI_PLAYER_HEIGHT, spacing } from '../theme';
import { marcarArtistaAberto } from '../state/novosLancamentos';
import { hapticSelection } from '../lib/haptics';
import { chaveDeArtista, displayArtist, tituloDaFaixa } from '../lib/artistName';
import { detalheDaLinha, infoDaPesquisa, infoDe, modosComDados, ordenarMusicasDoArtista } from '../lib/ordemDoArtista';
import { discografia, fasDoArtista, metaDoAlbum, musicasAVista, musicasDoArtista, MUSICAS_NA_GRELHA } from '../lib/musicasDoArtista';
import { chaveDoTitulo } from '../lib/albunsDoArtista';
import { getOrdemDoArtista, setOrdemDoArtista, type OrdemDoArtista } from '../lib/prefs';
import { useAuth } from '../state/auth';
import type { Track } from '../types';
import { useAlturaDosSeparadores } from '../state/doca';
import { avisarErro } from '../lib/avisoDeRemocao';

type Props = NativeStackScreenProps<RootStackParamList, 'LibraryGroup'>;

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
  const [actionTrack, setActionTrack] = useState<Track | null>(null);
  const { width } = useWindowDimensions();

  // A página de um artista (23/10, docs/artista-ios-maquete.html, escolhida
  // pelo João): a foto com o nome e as ações por cima, a cor dela a descer pela
  // página, as Top Songs numa grelha que se folheia de lado, o último
  // lançamento em destaque, a discografia, os parecidos e o About. Todas as
  // músicas estão no "›" das Top Songs, numa folha (`MusicasDoArtistaSheet`).
  const [verTodas, setVerTodas] = useState(false);
  useEffect(() => { setVerTodas(false); }, [type, name]);
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
  const tocarTudo = () => { if (!waiting) void tocarLista(faixasDaAba, shuffleLigado, shuffleInteligente, { tipo: 'artista', nome: name }); };
  const chavesTuas = useMemo(() => new Set(tracks.map((t) => `${t.source}:${t.sourceId}`)), [tracks]);
  const detalheDe = useCallback((t: Track) => detalheDaLinha(ordem, infoDaFaixa(t)) ?? undefined, [ordem, infoDaFaixa]);
  const tocarDaPagina = useCallback((t: Track) => tocarMusica(t, musicas, true, undefined, origemDaPagina),
    [tocarMusica, musicas, origemDaPagina]);
  const linhaDaGrelha = useCallback((t: Track) => <TrackRow track={t} showSavedBadge acompanharATocar mostrarDuracao={false}
    contextLabel={detalheDe(t)} onPress={() => tocarDaPagina(t)} onAction={() => setActionTrack(t)} />, [detalheDe, tocarDaPagina]);

  // Ao rolar, a barra de cima ganha o nome (o `Screen`) e um Play pequeno, que
  // só se pode tocar depois de o nome grande passar por baixo dela.
  const [passouONome, setPassouONome] = useState(false);
  const verSeOPassou = (e: { nativeEvent: { contentOffset: { y: number } } }) => setPassouONome(e.nativeEvent.contentOffset.y > fimDoNome);
  const playPequeno = useMemo(() => rolagem.interpolate({
    inputRange: [fimDoNome - 6, fimDoNome + 10], outputRange: [0, 1], extrapolate: 'clamp',
  }), [rolagem, fimDoNome]);

  const accoes = <>
    <PilulaDeVidro icone="radio-outline" texto="Mix" label={`${name} Mix`} ocupado={aAbrirMix} onPress={() => void tocarMix()} />
    <View style={{ flex: 1 }} />
    {faixasDaAba.length || waiting ? <>
      <BolaDeVidro icone="shuffle" lado={46} ativo={shuffleLigado} desligado={waiting}
        label={shuffleInteligente ? 'Smart shuffle on' : shuffleLigado ? 'Shuffle on' : 'Shuffle off'}
        onPress={() => { hapticSelection(); alternarShuffle(); }} />
      <BotaoDeTocar label={`Play ${name}`} desligado={waiting} onPress={tocarTudo} />
    </> : null}
  </>;
  const barraDoArtista = <View style={styles.barra} pointerEvents="box-none">
    <BolaDeVidro icone="chevron-back" label="Back" onPress={() => navigation.goBack()} />
    <View style={{ flex: 1 }} pointerEvents="none" />
    {faixasDaAba.length ? <Animated.View style={{ opacity: playPequeno }} pointerEvents={passouONome ? 'auto' : 'none'}
      accessibilityElementsHidden={!passouONome} importantForAccessibility={passouONome ? 'auto' : 'no-hide-descendants'}>
      <BotaoDeTocar label={`Play ${name}`} lado={36} desligado={waiting} onPress={tocarTudo} />
    </Animated.View> : null}
    {/* Favoritar dentro da página (29/9): só se podia na lista dos artistas. */}
    <BolaDeVidro icone={favorito ? 'heart' : 'heart-outline'} ativo={favorito}
      label={favorito ? `Unfavourite ${name}` : `Favourite ${name}`}
      onPress={() => { hapticSelection(); alternarFavorito(chaveDeArtista(name)); }} />
  </View>;

  const fas = fasDoArtista(vizinhanca.fas);
  // Quantas são tuas, só quando se sabe e são (o "0 songs" parecia uma página avariada).
  const tuas = !loading && tracks.length > 0 ? `${tracks.length} in your library` : null;
  const numerosDoArtista = [
    ...(tracks.length ? [{ valor: tracks.length, rotulo: 'in your library' }] : []),
    ...(!aCarregarOutras && musicas.length ? [{ valor: musicas.length, rotulo: musicas.length === 1 ? 'song' : 'songs' }] : []),
    ...(discos.albuns.length ? [{ valor: discos.albuns.length, rotulo: discos.albuns.length === 1 ? 'album' : 'albums' }] : []),
  ];

  const folhas = <>
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
  </>;

  if (type === 'artist') {
    return (
      // O nome grande da capa dá lugar ao pequeno na barra de cima (3/10).
      <Screen encolhe={cab} tituloCompacto={{ texto: name, aparecerEm: fimDoNome }} onBack={() => navigation.goBack()} topLeft={barraDoArtista}>
        <Animated.ScrollView onScroll={cab.onScroll} scrollEventThrottle={cab.scrollEventThrottle} showsVerticalScrollIndicator={false}
          onScrollEndDrag={verSeOPassou} onMomentumScrollEnd={verSeOPassou}
          // A página começa na foto, por baixo da barra (que flutua sobre ela).
          contentContainerStyle={{ paddingBottom: bottomPad }}>
          <FundoDaCorDoArtista foto={capaDoArtista} altura={alturaDaCapaDoArtista(width)} />
          <CapaDoArtista nome={name} foto={capaDoArtista} fas={fas} tuas={tuas} accoes={accoes} aoMedirNome={setFimDoNome} />

          <CabecalhoDaSeccao titulo="Top Songs" aoCarregar={!waiting && musicas.length ? () => { hapticSelection(); setVerTodas(true); } : undefined} />
          {waiting ? <SkeletonDeFaixas linhas={4} />
            : musicas.length ? <GrelhaDeMusicas musicas={musicasAVista(musicas, false, MUSICAS_NA_GRELHA)} renderLinha={linhaDaGrelha} />
            : <EmptyState icon="musical-notes-outline" title="No songs found" subtitle="No songs by this artist were found." />}
          {/* As outras dele ainda a chegar (as tuas já estão à vista). */}
          {!waiting && aCarregarOutras ? <SkeletonDeFaixas linhas={2} /> : null}

          {pagina?.maisRecente ? <LancamentoEmDestaque album={pagina.maisRecente} aoAbrir={abrirDisco} /> : null}
          {loadingYtAlbums ? <SkeletonDePrateleira /> : <>
            <DiscosDoArtista titulo="Albums" discos={discos.albuns} aoAbrir={abrirDisco} />
            <DiscosDoArtista titulo="Singles & EPs" discos={discos.singles} aoAbrir={abrirDisco} lado={136} />
          </>}
          <ParecidosDoArtista nomes={vizinhanca.parecidos} aoAbrir={(n, f) => navigation.push('LibraryGroup', { type: 'artist', name: n, capa: f })} />
          {fas ? <SobreOArtista foto={capaDoArtista} fas={fas} numeros={numerosDoArtista} /> : null}
        </Animated.ScrollView>

        {folhas}
        <MusicasDoArtistaSheet
          visible={verTodas}
          onClose={() => setVerTodas(false)}
          nome={name}
          musicas={musicas}
          chavesTuas={chavesTuas}
          ordem={ordem}
          mostrarOrdem={mostrarOrdem}
          aoMudarOrdem={escolherOrdem}
          detalhe={detalheDe}
          aoTocar={tocarDaPagina}
          aoTocarTudo={(baralhar) => void tocarLista(musicas, baralhar || shuffleLigado, shuffleInteligente, { tipo: 'artista', nome: name })}
          aoMudarBiblioteca={load}
        />
      </Screen>
    );
  }

  // O álbum da biblioteca: o título encolhe ao rolar (3/10), e a lista das tuas.
  return (
    <Screen encolhe={cab} title={name} subtitle={metaDoAlbum(tracks.length, loading)} onBack={() => navigation.goBack()}>
      <Animated.FlatList data={waiting ? [] : tracksDaAba}
        onScroll={cab.onScroll} scrollEventThrottle={cab.scrollEventThrottle} scrollIndicatorInsets={{ top: cab.espaco }} keyExtractor={(item) => `${item.source}:${item.sourceId}`}
        ListHeaderComponent={tracks.length > 0 ? <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.md }}>
          <PillButton label="Play all" small onPress={() => playTrack(tracks[0], tracks, true, false, undefined, origemDaPagina)} />
        </View> : null}
        initialNumToRender={12} windowSize={7}
        contentContainerStyle={{ paddingTop: cab.espaco, paddingBottom: bottomPad }}
        ListEmptyComponent={waiting ? <SkeletonDeFaixas linhas={6} />
          : <EmptyState icon="albums-outline" title="Nothing here" subtitle="None of this album's songs are in your library." />}
        renderItem={({ item }) => <TrackRow track={item} acompanharATocar
          onPress={() => tocarMusica(item, tracksDaAba, true, undefined, origemDaPagina)} onAction={() => setActionTrack(item)} />}
      />
      {folhas}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // A barra de cima do artista: voltar à esquerda; o Play pequeno (ao rolar) e o coração à direita.
  barra: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
