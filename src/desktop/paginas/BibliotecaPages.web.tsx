import { useRecommendationFeedback } from '../../state/recommendationFeedback';
/**
 * Biblioteca: Search, Liked Songs, Artists e a página de um artista.
 *
 * Não há entidade "Liked Songs" separada: a `library_tracks` **é** a lista de
 * gostadas e o separador Songs é a vista dela. Não criar uma segunda porta
 * para a mesma coisa.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getLikedSongs } from '../../api/library';
import {
  fetchYouTubePlaylistById, searchYouTube, searchYouTubePlaylists,
  type YtRecommendedPlaylist,
} from '../../api/youtube';
import { addTracksToPlaylist, createPlaylist } from '../../api/playlists';
import { getTopArtists } from '../../api/plays';
import { addSearchHistoryEntry, clearSearchHistory, getSearchHistory } from '../../lib/prefs';
import { agruparPorArtista, chaveDeArtista, displayArtist, extractArtist } from '../../lib/artistName';
import { comCatalogo, garantirCatalogo, useCatalogoDeFaixas } from '../../state/catalogoDeFaixas';
import { useAuth } from '../../state/auth';
import { correspondeAPesquisa } from '../../lib/searchText';
import { useMusicSearch } from '../../hooks/useMusicSearch';
import { usePlayer } from '../../state/player';
import { temRecomendacoes, useRecomendacoes } from '../../state/recomendacoes';
import { useSaved } from '../../state/saved';
import type { Track } from '../../types';
import { styles } from '../estilos.web';
import {
  Artwork, Button, ContentScroll, desktop, Dialog, Empty, Field, IconButton, Loading, Page, Shelf, TrackTable,
} from '../ui.web';
import type { CommonPageProps, Route } from '../rotas';
import { COR, ESP, FONT, RAIO, TIPO } from '../tokens.web';
import { useLibraryData } from './comum.web';

export function SearchPage({ play, notify, more }: CommonPageProps) {
  const [query, setQuery] = useState(''); const [history, setHistory] = useState<string[]>([]); const input = useRef<any>(null);
  // **As recomendacoes vivem fora desta pagina** (`state/recomendacoes.ts`).
  // Estavam num `useState` daqui, e esta pagina desmonta ao mudar de
  // separador: ir aos Artists e voltar recomecava o "Preparing
  // recommendations..." do zero, e a espera nao e pequena.
  const hasFeedback=useRecommendationFeedback(s=>s.items.length>0);
  const recs = useRecomendacoes();
  const { descobrir, ouvirDeNovo, flow, maisTocadas, esquecidas } = recs;
  const recsCarregadas = recs.estado === 'pronto';
  // Nao repete o trabalho: se ja estao carregadas ou a carregar, isto e um
  // no-op. Existe para o caso de a app nao as ter comecado no arranque.
  useEffect(() => { void recs.carregar(); }, []);
  // Conjunto das faixas já guardadas, para marcar os resultados com um coração.
  useEffect(() => { useSaved.getState().refresh(); getSearchHistory().then(setHistory); const focus = () => input.current?.focus(); window.addEventListener('duotone:focus-search', focus); return () => window.removeEventListener('duotone:focus-search', focus); }, []);
  const { results, loading, errorMsg, pesquisarAgora } = useMusicSearch(query, (q) => {
    void addSearchHistoryEntry(q).then(setHistory).catch(() => {});
  });
  const run = (q = query) => { setQuery(q); pesquisarAgora(); };
  return <Page title="Search" subtitle="Search YouTube and add music to your Duotone library."
    action={<IconButton name="refresh" label="Refresh recommendations"
      onPress={() => { void recs.carregar(true); }} active={recs.estado === 'a-carregar'} />}>
    <View style={styles.searchBar}><Field ref={input} icon="search" placeholder="Search songs, artists, or videos" value={query} onChangeText={setQuery} onSubmitEditing={() => run()} /><Button onPress={() => run()}>Search</Button></View>
    {query.trim().length < 2 && !loading && history.length > 0 && <View style={styles.history}><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Recent searches</Text><Pressable onPress={async () => { await clearSearchHistory(); setHistory([]); }}><Text style={styles.textAction}>Clear</Text></Pressable></View><View style={styles.chips}>{history.map((item) => <Pressable key={item} onPress={() => run(item)} style={({ hovered }) => [styles.chip, hovered && styles.chipHover]}><Ionicons name="time-outline" size={14} color={desktop.dim} /><Text style={styles.chipText}>{item}</Text></Pressable>)}</View></View>}
    <ContentScroll>{loading ? <View style={{ height: 320 }}><Loading /></View>
      : results.length ? <TrackTable tracks={results} showSavedBadge onPlay={(t) => play(t, results)} onMore={more} />
      : errorMsg ? <Empty icon="cloud-offline-outline" title="Search failed" body={errorMsg} />
      : query.trim().length >= 2 ? <Empty icon="search-outline" title="No results" body="Try a different search term." />
      : temRecomendacoes(recs) ? <>
          <Shelf titulo="Discover new" nota="music you don't have yet, based on what you listen to" tracks={descobrir} onPlay={play} onMore={more} />
          <Shelf titulo="Listen again" tracks={ouvirDeNovo} onPlay={play} onMore={more} />
          <Shelf titulo="Daily flow" nota="based on your listening" tracks={flow} onPlay={play} onMore={more} />
          <Shelf titulo="Heavy rotation" tracks={maisTocadas} onPlay={play} onMore={more} />
          <Shelf titulo="Forgotten favourites" nota="not played in a while" tracks={esquecidas} onPlay={play} onMore={more} />
        </>
      : <Empty icon={recsCarregadas ? 'search-outline' : 'sparkles-outline'}
          title={recsCarregadas ? 'Nothing to recommend yet' : 'Preparing recommendations…'}
          body={recsCarregadas
            ? hasFeedback?'No suggestions match your current preferences. Review them in Settings → Recommendations, or search for music above.':'Listen to a few tracks and this page will learn what you enjoy. Until then, search the YouTube catalogue above.'
            : 'One moment.'} />}
    </ContentScroll></Page>;
}

export function SongsPage(props: CommonPageProps) {
  const data = useLibraryData(getLikedSongs);
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<'recent' | 'title' | 'artist' | 'duration'>('recent');
  const [sortOpen, setSortOpen] = useState(false);
  const nomes = { recent: 'Recently added', title: 'Title', artist: 'Artist', duration: 'Duration' } as const;

  const filteredTracks = useMemo(() => {
    const filtradas = data.tracks.filter(t => correspondeAPesquisa(query, t.title, t.artist));
    if (sortMode === 'recent') return filtradas;
    if (sortMode === 'duration') return [...filtradas].sort((a, b) => (a.durationSeconds ?? 0) - (b.durationSeconds ?? 0));
    if (sortMode === 'artist') return [...filtradas].sort((a, b) => (a.artist ?? '').localeCompare(b.artist ?? '', undefined, { sensitivity: 'base' }));
    return [...filtradas].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  }, [data.tracks, query, sortMode]);

  // O Shuffle liga o modo aleatório do player (Fisher-Yates) em vez de
  // baralhar a lista com `sort(() => Math.random() - 0.5)`, que é enviesado e
  // deixava o botão em desacordo com o interruptor do player.
  // O MODO vem do leitor e nao desta pagina: um so sitio decide se o shuffle
  // e inteligente, e o botao daqui mostra-o e respeita-o. Ter cada pagina com
  // a sua opiniao dava dois sitios a discordar.
  const inteligente = usePlayer((s) => s.shuffleInteligente);
  const ligado = usePlayer((s) => s.shuffle);
  const alternarShuffle = usePlayer((s) => s.toggleShuffle);
  // Modelo do Spotify: o botao de shuffle ALTERNA o modo e nao toca; quem
  // toca e o "Play all", que respeita o modo escolhido. Com um botao que
  // tocasse E alternasse, o que se ve no botao seria o que NAO se ia ouvir.
  const playAll = () => {
    if (!filteredTracks.length) return;
    if (ligado) usePlayer.getState().playShuffled(filteredTracks, inteligente);
    else props.play(filteredTracks[0], filteredTracks);
  };

  return <><Page title="Liked Songs" subtitle="Only the tracks you saved with the heart button." action={<View style={{ flexDirection: 'row', gap: 8 }}><Button icon="play" onPress={playAll}>Play all</Button><Button secondary={!ligado} brilho={inteligente} icon="shuffle" onPress={alternarShuffle}>{inteligente ? 'Smart shuffle' : 'Shuffle'}</Button><Button secondary icon="swap-vertical" onPress={() => setSortOpen(true)}>{nomes[sortMode]}</Button></View>}>
    <View style={styles.songsToolbar}>
      <View style={styles.songsSearch}><Field icon="search" placeholder="Search your library" value={query} onChangeText={setQuery} /></View>
      <Text style={styles.songsResultCount}>{query ? `${filteredTracks.length} of ` : ''}{data.tracks.length} {data.tracks.length === 1 ? 'song' : 'songs'}</Text>
      <IconButton name="refresh" label="Refresh library" onPress={data.refresh} />
    </View>
    <ContentScroll scrollKey="songs">{data.loading ? <View style={{ height: 350 }}><Loading /></View> : <TrackTable plain listKey="songs" tracks={filteredTracks} onPlay={(t) => props.play(t, filteredTracks)} onMore={props.more} empty={query ? <Empty icon="search-outline" title="No results found" body={`No liked songs match "${query}"`} /> : <Empty icon="heart-outline" title="No liked songs yet" body="Tap the heart on a track and it will appear here." />} />}</ContentScroll>
  </Page><Dialog open={sortOpen} title="Sort liked songs" onClose={() => setSortOpen(false)}><View style={{ gap: 8 }}>{(Object.keys(nomes) as Array<keyof typeof nomes>).map((modo) => <Button key={modo} secondary={sortMode !== modo} onPress={() => { setSortMode(modo); setSortOpen(false); }}>{nomes[modo]}</Button>)}</View></Dialog></>;
}

export function ArtistsPage({ navigate }: { navigate: (route: Route) => void }) {
  const data = useLibraryData();
  const [query, setQuery] = useState('');
  // Ordem por ESCUTA. Alfabetica era neutra e por isso inutil: quem tem 200
  // artistas nao procura pelo nome, procura por quem ouve. O ranking vem do
  // historico (get_top_artists); quem nao aparece la ordena-se pelo numero de
  // faixas na biblioteca, que e o melhor sinal que sobra.
  const [ranking, setRanking] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    getTopArtists(200)
      // Pela chave canonica e nao por toLowerCase(): o ranking vem do
      // historico, onde o mesmo artista pode estar escrito de outra maneira.
      .then((tops) => setRanking(new Map(tops.map((a, i) => [chaveDeArtista(a.name), i]))))
      .catch(() => {});
  }, []);
  // Agrupado por CHAVE canonica e nao pelo nome mostrado -- era isso que punha
  // `Juice WRLD`, `juice wrld` e `JUICE WRLD` em tres cartoes diferentes.
  const versaoDoCatalogo = useCatalogoDeFaixas((s) => s.versao);
  const artists = useMemo(
    () => agruparPorArtista(data.tracks.map(comCatalogo)).sort((a, b) => {
      const ra = ranking.get(a.chave) ?? Infinity;
      const rb = ranking.get(b.chave) ?? Infinity;
      if (ra !== rb) return ra - rb;
      if (a.faixas.length !== b.faixas.length) return b.faixas.length - a.faixas.length;
      return a.nome.localeCompare(b.nome);
    }),
    [data.tracks, ranking, versaoDoCatalogo],
  );
  const filteredArtists = useMemo(() => {
    const q = chaveDeArtista(query);
    return q ? artists.filter((artist) => artist.chave.includes(q)) : artists;
  }, [artists, query]);

  return <Page title="Artists" subtitle={`${artists.length} artists in your library`}>
    <View style={styles.songsToolbar}>
      <View style={styles.songsSearch}><Field icon="search" placeholder="Search artists" value={query} onChangeText={setQuery} /></View>
      <Text style={styles.songsResultCount}>{query ? `${filteredArtists.length} of ` : ''}{artists.length} {artists.length === 1 ? 'artist' : 'artists'}</Text>
    </View>
    <ContentScroll scrollKey="artists">{data.loading ? <View style={{ height: 350 }}><Loading /></View> : filteredArtists.length ? <View style={styles.playlistGrid}>{filteredArtists.map(({ nome, chave, faixas }) => <Pressable key={chave} onPress={() => navigate({ name: 'artist', value: nome })} style={({ hovered, focused }) => [styles.playlistCard, (hovered || focused) && styles.playlistCardHover]}><View style={styles.playlistArt}><Artwork track={faixas[0]} size={200} /></View><Text numberOfLines={1} style={styles.playlistTitle}>{nome}</Text><Text style={styles.playlistMeta}>{faixas.length} {faixas.length === 1 ? 'track' : 'tracks'}</Text></Pressable>)}</View> : query ? <Empty icon="search-outline" title="No artists found" body={`No artist matches "${query}".`} /> : <Empty icon="people-outline" title="No artists yet" body="Artists are collected automatically from the tracks in your library." />}</ContentScroll>
  </Page>;
}

export function ArtistPage({ name, back, ...props }: { name: string; back: () => void } & CommonPageProps) {
  const data = useLibraryData();
  const [separador, setSeparador] = useState<'library' | 'tracks' | 'albums'>('library');
  const [outras, setOutras] = useState<Track[]>([]);
  const [albuns, setAlbuns] = useState<YtRecommendedPlaylist[]>([]);
  const [aDescobrir, setADescobrir] = useState(true);
  const [albumAberto, setAlbumAberto] = useState<YtRecommendedPlaylist | null>(null);
  const [faixasDoAlbum, setFaixasDoAlbum] = useState<Track[]>([]);
  const [aCarregarAlbum, setACarregarAlbum] = useState(false);
  const [aGuardarAlbum, setAGuardarAlbum] = useState(false);
  const pedidoDeAlbum = useRef(0);
  // Pela chave e nao pelo nome: a pagina tem de trazer as faixas das TRES
  // grafias, senao o cartao dizia 5 faixas e a pagina abria com 2.
  const tracks = useMemo(() => {
    const alvo = chaveDeArtista(name);
    return agruparPorArtista(data.tracks).find((g) => g.chave === alvo)?.faixas ?? [];
  }, [data.tracks, name]);

  useEffect(() => {
    let cancelado = false;
    setADescobrir(true);
    setOutras([]);
    setAlbuns([]);
    setSeparador('library');
    setAlbumAberto(null);
    useSaved.getState().refresh();

    const alvo = chaveDeArtista(name);
    const contemArtista = (texto: string | null | undefined) => {
      const chave = chaveDeArtista(texto);
      return !!alvo && (chave === alvo || chave.startsWith(`${alvo} `) || chave.includes(` ${alvo} `));
    };

    Promise.all([
      searchYouTube(`${name} music`),
      searchYouTubePlaylists(`${name} album`, 12),
    ]).then(([resultados, playlists]) => {
      if (cancelado) return;
      // Uma pesquisa por nome também devolve reações, covers e entrevistas.
      // Só entram resultados cujo artista extraído é realmente este artista.
      setOutras(resultados.filter((t) => chaveDeArtista(displayArtist(t)) === alvo));
      // Nas playlists não há metadados de artista: exigimos que o nome apareça
      // no título ou no canal, em vez de mostrar qualquer playlist do resultado.
      setAlbuns(playlists.filter((p) => contemArtista(p.title) || contemArtista(p.channelTitle)));
    }).catch((e: any) => {
      if (!cancelado) props.notify(e?.message || 'Could not discover more from this artist.');
    }).finally(() => {
      if (!cancelado) setADescobrir(false);
    });

    return () => { cancelado = true; };
  }, [name, props.notify]);

  const chavesDaBiblioteca = useMemo(
    () => new Set(tracks.map((t) => `${t.source}:${t.sourceId}`)),
    [tracks],
  );
  const outrasSemRepetir = useMemo(
    () => outras.filter((t) => !chavesDaBiblioteca.has(`${t.source}:${t.sourceId}`)),
    [outras, chavesDaBiblioteca],
  );

  const abrirAlbum = async (album: YtRecommendedPlaylist) => {
    const pedido = ++pedidoDeAlbum.current;
    setAlbumAberto(album);
    setFaixasDoAlbum([]);
    setACarregarAlbum(true);
    try {
      const resultado = await fetchYouTubePlaylistById(album.id);
      if (pedido !== pedidoDeAlbum.current) return;
      setFaixasDoAlbum(resultado.items.map((item) => ({
        source: 'youtube' as const,
        sourceId: item.videoId,
        title: item.title,
        artist: extractArtist(item.title, item.channel || null),
        album: resultado.title,
        artworkUrl: item.thumbnail,
        durationSeconds: null,
      })));
    } catch (e: any) {
      if (pedido !== pedidoDeAlbum.current) return;
      props.notify(e?.message || 'Could not load this album.');
      setAlbumAberto(null);
    } finally {
      if (pedido === pedidoDeAlbum.current) setACarregarAlbum(false);
    }
  };

  const guardarAlbum = async () => {
    if (!albumAberto || !faixasDoAlbum.length || aGuardarAlbum) return;
    setAGuardarAlbum(true);
    try {
      const playlist = await createPlaylist(albumAberto.title);
      await addTracksToPlaylist(playlist.id, faixasDoAlbum);
      props.notify(`Saved “${albumAberto.title}” with ${faixasDoAlbum.length} tracks.`);
      window.dispatchEvent(new CustomEvent('duotone:refresh-playlists'));
      setAlbumAberto(null);
    } catch (e: any) {
      props.notify(e?.message || 'Could not save this album.');
    } finally {
      setAGuardarAlbum(false);
    }
  };

  const inteligente = usePlayer((s) => s.shuffleInteligente);
  const ligado = usePlayer((s) => s.shuffle);
  const alternarShuffle = usePlayer((s) => s.toggleShuffle);
  const playAll = () => {
    if (!tracks.length) return;
    if (ligado) usePlayer.getState().playShuffled(tracks, inteligente);
    else props.play(tracks[0], tracks);
  };
  const tocarAlbum = () => {
    if (!faixasDoAlbum.length) return;
    props.play(faixasDoAlbum[0], faixasDoAlbum);
    setAlbumAberto(null);
  };

  return <>
    <Page title="Artist" action={<Button secondary icon="arrow-back" onPress={back}>Back to artists</Button>}>
      <ContentScroll scrollKey={`artist:${chaveDeArtista(name)}`}>{data.loading ? <View style={{ height: 350 }}><Loading /></View> : <>
        <View style={styles.detailHero}>
          <View style={[styles.detailHeroArt, !tracks[0] && artistStyles.heroFallback]}>{tracks[0] ? <Artwork track={tracks[0]} size={176} /> :
            <Ionicons name="person" size={48} color={desktop.dim} />}</View>
          <View style={styles.detailHeroBody}>
            <Text style={styles.detailHeroEyebrow}>ARTIST</Text>
            <Text numberOfLines={2} style={styles.detailHeroTitle}>{name}</Text>
            <Text style={styles.detailHeroMeta}>{tracks.length} saved {tracks.length === 1 ? 'track' : 'tracks'}</Text>
            <View style={styles.detailHeroActions}>
              <Button icon="play" onPress={playAll} disabled={!tracks.length}>Play</Button>
              <Button secondary={!ligado} brilho={inteligente} icon="shuffle" onPress={alternarShuffle} disabled={!tracks.length}>{inteligente ? 'Smart shuffle' : 'Shuffle'}</Button>
            </View>
          </View>
        </View>

        <View style={artistStyles.tabs}>
          {([
            ['library', 'In your library', 'heart-outline'],
            ['tracks', 'More tracks', 'musical-notes-outline'],
            ['albums', 'Albums', 'albums-outline'],
          ] as const).map(([id, label, icon]) => <Pressable key={id} onPress={() => setSeparador(id)}
            style={({ hovered }) => [artistStyles.tab, separador === id && artistStyles.tabActive, hovered && artistStyles.tabHover]}>
            <Ionicons name={icon} size={15} color={separador === id ? desktop.text : desktop.dim} />
            <Text style={[artistStyles.tabText, separador === id && artistStyles.tabTextActive]}>{label}</Text>
          </Pressable>)}
        </View>

        {separador === 'library' && <TrackTable plain tracks={tracks} onPlay={(t) => props.play(t, tracks)} onMore={props.more}
          empty={<Empty icon="heart-outline" title="Nothing saved" body="Save a track by this artist and it will appear here." />} />}

        {separador === 'tracks' && (aDescobrir ? <View style={{ height: 280 }}><Loading /></View> :
          <TrackTable plain showSavedBadge tracks={outrasSemRepetir} onPlay={(t) => props.play(t, outrasSemRepetir)} onMore={props.more}
            empty={<Empty icon="search-outline" title="No other tracks found" body="No verified additional tracks by this artist were found on YouTube." />} />)}

        {separador === 'albums' && (aDescobrir ? <View style={{ height: 280 }}><Loading /></View> : albuns.length ?
          <View style={artistStyles.albumGrid}>{albuns.map((album) => <Pressable key={album.id} onPress={() => void abrirAlbum(album)}
            style={({ hovered, focused }) => [artistStyles.albumCard, (hovered || focused) && artistStyles.albumCardHover]}>
            {album.artworkUrl ? <Image source={{ uri: album.artworkUrl }} style={artistStyles.albumArt} /> :
              <View style={[artistStyles.albumArt, artistStyles.albumFallback]}><Ionicons name="albums-outline" size={34} color={desktop.dim} /></View>}
            <Text numberOfLines={2} style={artistStyles.albumTitle}>{album.title}</Text>
            <Text numberOfLines={1} style={artistStyles.albumMeta}>{album.channelTitle || 'YouTube'}</Text>
          </Pressable>)}</View> :
          <Empty icon="albums-outline" title="No albums found" body="No verified albums by this artist were found on YouTube." />)}
      </>}</ContentScroll>
    </Page>

    <Dialog open={!!albumAberto} title={albumAberto?.title || 'Album'} onClose={() => { pedidoDeAlbum.current++; setAlbumAberto(null); }} width={720}>
      {aCarregarAlbum ? <View style={{ height: 260 }}><Loading /></View> : <>
        <View style={artistStyles.albumDialogActions}>
          <Button icon="play" onPress={tocarAlbum} disabled={!faixasDoAlbum.length}>Play</Button>
          <Button secondary icon="download-outline" onPress={() => void guardarAlbum()} disabled={!faixasDoAlbum.length || aGuardarAlbum}>
            {aGuardarAlbum ? 'Saving…' : 'Save as playlist'}
          </Button>
          <Text style={artistStyles.albumDialogMeta}>{faixasDoAlbum.length} {faixasDoAlbum.length === 1 ? 'track' : 'tracks'}</Text>
        </View>
        <ScrollView style={artistStyles.albumDialogList}>
          <TrackTable plain tracks={faixasDoAlbum} onPlay={(t) => props.play(t, faixasDoAlbum)} onMore={props.more} />
        </ScrollView>
      </>}
    </Dialog>
  </>;
}

const artistStyles = StyleSheet.create({
  heroFallback: { alignItems: 'center', justifyContent: 'center' },
  tabs: {
    flexDirection: 'row', alignItems: 'center', gap: ESP.sm,
    paddingBottom: ESP.xl, marginBottom: ESP.lg, borderBottomWidth: 1, borderBottomColor: COR.linhaSuave,
  },
  tab: {
    minHeight: 38, paddingHorizontal: ESP.lg, borderRadius: RAIO.pilula,
    borderWidth: 1, borderColor: COR.linha, flexDirection: 'row', alignItems: 'center', gap: ESP.sm,
  },
  tabActive: { backgroundColor: COR.metalSuave, borderColor: 'rgba(233,234,238,0.24)' },
  tabHover: { backgroundColor: COR.hover },
  tabText: { ...TIPO.corpo, color: COR.textoFraco, fontWeight: '600' as any },
  tabTextActive: { color: COR.texto },
  albumGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: ESP.xxl, rowGap: ESP.xxl },
  albumCard: { width: 190 },
  albumCardHover: { opacity: .88, transform: [{ translateY: -3 }] },
  albumArt: {
    width: 190, height: 190, borderRadius: RAIO.superficie, backgroundColor: COR.elevado,
    borderWidth: 1, borderColor: COR.linhaSuave,
  },
  albumFallback: { alignItems: 'center', justifyContent: 'center' },
  albumTitle: {
    fontFamily: FONT.display, color: COR.texto, fontSize: 14, lineHeight: 19,
    fontWeight: '650' as any, marginTop: ESP.md,
  },
  albumMeta: { ...TIPO.legenda, color: COR.textoFraco, marginTop: ESP.xs },
  albumDialogActions: {
    flexDirection: 'row', alignItems: 'center', gap: ESP.sm,
    paddingBottom: ESP.lg, borderBottomWidth: 1, borderBottomColor: COR.linhaSuave,
  },
  albumDialogMeta: { ...TIPO.numero, color: COR.textoFraco, marginLeft: 'auto' as any },
  albumDialogList: { maxHeight: 430, marginHorizontal: -ESP.xl, marginBottom: -ESP.xl },
});
