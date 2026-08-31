/**
 * Biblioteca: Search, Liked Songs, Artists e a página de um artista.
 *
 * Não há entidade "Liked Songs" separada: a `library_tracks` **é** a lista de
 * gostadas e o separador Songs é a vista dela. Não criar uma segunda porta
 * para a mesma coisa.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { getLikedSongs } from '../../api/library';
import { searchYouTube } from '../../api/youtube';
import {
  getFlowMix, getForgottenFavorites, getHeavyRotation, getProfileRecentlyPlayed, getTopArtists,
} from '../../api/plays';
import { addSearchHistoryEntry, clearSearchHistory, getSearchHistory } from '../../lib/prefs';
import { agruparPorArtista, chaveDeArtista, displayArtist } from '../../lib/artistName';
import { usePlayer } from '../../state/player';
import { useSaved } from '../../state/saved';
import type { Track } from '../../types';
import { styles } from '../estilos.web';
import {
  Artwork, Button, ContentScroll, desktop, Empty, Field, IconButton, Loading, Page, Shelf, TrackTable,
} from '../ui.web';
import type { CommonPageProps, Route } from '../rotas';
import { useLibraryData } from './comum.web';

export function SearchPage({ play, notify, more }: CommonPageProps) {
  const [query, setQuery] = useState(''); const [results, setResults] = useState<Track[]>([]); const [history, setHistory] = useState<string[]>([]); const [loading, setLoading] = useState(false); const input = useRef<any>(null);
  // Recomendacoes, como no telemovel. Todas saem de RPCs do Supabase sobre o
  // historico do proprio utilizador — nenhuma gasta quota da YouTube API.
  const [ouvirDeNovo, setOuvirDeNovo] = useState<Track[]>([]);
  const [flow, setFlow] = useState<Track[]>([]);
  const [maisTocadas, setMaisTocadas] = useState<Track[]>([]);
  const [esquecidas, setEsquecidas] = useState<Track[]>([]);
  const [recsCarregadas, setRecsCarregadas] = useState(false);

  useEffect(() => {
    // Falham em silencio uma a uma: se uma RPC nao existir na base de dados,
    // as outras prateleiras aparecem na mesma.
    const semFalhar = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
    Promise.all([
      semFalhar(getProfileRecentlyPlayed(14)),
      semFalhar(getFlowMix(14)),
      semFalhar(getHeavyRotation(14)),
      semFalhar(getForgottenFavorites(14)),
    ]).then(([recentes, f, m, e]) => {
      // getProfileRecentlyPlayed devolve ProfilePlayEntry, que nao tem `album`.
      setOuvirDeNovo(recentes.map((r: any) => ({ ...r, album: null } as Track)));
      setFlow(f); setMaisTocadas(m); setEsquecidas(e);
      setRecsCarregadas(true);
    });
  }, []);
  // Conjunto das faixas já guardadas, para marcar os resultados com um coração.
  useEffect(() => { useSaved.getState().refresh(); getSearchHistory().then(setHistory); const focus = () => input.current?.focus(); window.addEventListener('duotone:focus-search', focus); return () => window.removeEventListener('duotone:focus-search', focus); }, []);
  const run = async (q = query) => { const clean = q.trim(); if (!clean) return; setQuery(clean); setLoading(true); try { const [items, next] = await Promise.all([searchYouTube(clean), addSearchHistoryEntry(clean)]); setResults(items); setHistory(next); } catch (e: any) { notify(e?.message || 'Search failed.'); } finally { setLoading(false); } };
  return <Page title="Search" subtitle="Search YouTube and add music to your Duotone library."><View style={styles.searchBar}><Field ref={input} icon="search" placeholder="Search songs, artists, or videos" value={query} onChangeText={setQuery} onSubmitEditing={() => run()} /><Button onPress={() => run()}>Search</Button></View>
    {!results.length && !loading && history.length > 0 && <View style={styles.history}><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Recent searches</Text><Pressable onPress={async () => { await clearSearchHistory(); setHistory([]); }}><Text style={styles.textAction}>Clear</Text></Pressable></View><View style={styles.chips}>{history.map((item) => <Pressable key={item} onPress={() => run(item)} style={({ hovered }) => [styles.chip, hovered && styles.chipHover]}><Ionicons name="time-outline" size={14} color={desktop.dim} /><Text style={styles.chipText}>{item}</Text></Pressable>)}</View></View>}
    <ContentScroll>{loading ? <View style={{ height: 320 }}><Loading /></View>
      : results.length ? <TrackTable tracks={results} showSavedBadge onPlay={(t) => play(t, results)} onMore={more} />
      : (ouvirDeNovo.length || flow.length || maisTocadas.length || esquecidas.length) ? <>
          <Shelf titulo="Listen again" tracks={ouvirDeNovo} onPlay={play} onMore={more} />
          <Shelf titulo="Daily flow" nota="based on your listening" tracks={flow} onPlay={play} onMore={more} />
          <Shelf titulo="Heavy rotation" tracks={maisTocadas} onPlay={play} onMore={more} />
          <Shelf titulo="Forgotten favourites" nota="not played in a while" tracks={esquecidas} onPlay={play} onMore={more} />
        </>
      : <Empty icon={recsCarregadas ? 'search-outline' : 'sparkles-outline'}
          title={recsCarregadas ? 'Nothing to recommend yet' : 'Preparing recommendations…'}
          body={recsCarregadas
            ? 'Listen to a few tracks and this page will learn what you enjoy. Until then, search the YouTube catalogue above.'
            : 'One moment.'} />}
    </ContentScroll></Page>;
}

export function SongsPage(props: CommonPageProps) {
  const data = useLibraryData(getLikedSongs);
  const [query, setQuery] = useState('');

  const filteredTracks = useMemo(() => {
    if (!query.trim()) return data.tracks;
    const q = query.toLowerCase();
    return data.tracks.filter(t => 
      t.title.toLowerCase().includes(q) || 
      (t.artist && t.artist.toLowerCase().includes(q))
    );
  }, [data.tracks, query]);

  // O Shuffle liga o modo aleatório do player (Fisher-Yates) em vez de
  // baralhar a lista com `sort(() => Math.random() - 0.5)`, que é enviesado e
  // deixava o botão em desacordo com o interruptor do player.
  const playAll = (shuffle = false) => {
    if (!filteredTracks.length) return;
    if (shuffle) usePlayer.getState().playShuffled(filteredTracks);
    else props.play(filteredTracks[0], filteredTracks);
  };

  return <Page title="Liked Songs" subtitle="Only the tracks you saved with the heart button." action={<View style={{ flexDirection: 'row', gap: 8 }}><Button icon="play" onPress={() => playAll(false)}>Play all</Button><Button secondary icon="shuffle" onPress={() => playAll(true)}>Shuffle</Button></View>}>
    <View style={styles.songsToolbar}>
      <View style={styles.songsSearch}><Field icon="search" placeholder="Search your library" value={query} onChangeText={setQuery} /></View>
      <Text style={styles.songsResultCount}>{query ? `${filteredTracks.length} of ` : ''}{data.tracks.length} {data.tracks.length === 1 ? 'song' : 'songs'}</Text>
      <IconButton name="refresh" label="Refresh library" onPress={data.refresh} />
    </View>
    <ContentScroll>{data.loading ? <View style={{ height: 350 }}><Loading /></View> : <TrackTable plain tracks={filteredTracks} onPlay={(t) => props.play(t, filteredTracks)} onMore={props.more} empty={query ? <Empty icon="search-outline" title="No results found" body={`No liked songs match "${query}"`} /> : <Empty icon="heart-outline" title="No liked songs yet" body="Tap the heart on a track and it will appear here." />} />}</ContentScroll>
  </Page>;
}

export function ArtistsPage({ navigate }: { navigate: (route: Route) => void }) {
  const data = useLibraryData();
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
  const artists = useMemo(
    () => agruparPorArtista(data.tracks).sort((a, b) => {
      const ra = ranking.get(a.chave) ?? Infinity;
      const rb = ranking.get(b.chave) ?? Infinity;
      if (ra !== rb) return ra - rb;
      if (a.faixas.length !== b.faixas.length) return b.faixas.length - a.faixas.length;
      return a.nome.localeCompare(b.nome);
    }),
    [data.tracks, ranking],
  );
  return <Page title="Artists" subtitle={`${artists.length} artists in your library`}><ContentScroll>{data.loading ? <View style={{ height: 350 }}><Loading /></View> : artists.length ? <View style={styles.playlistGrid}>{artists.map(({ nome, chave, faixas }) => <Pressable key={chave} onPress={() => navigate({ name: 'artist', value: nome })} style={({ hovered, focused }) => [styles.playlistCard, (hovered || focused) && styles.playlistCardHover]}><View style={styles.playlistArt}><Artwork track={faixas[0]} size={200} /></View><Text numberOfLines={1} style={styles.playlistTitle}>{nome}</Text><Text style={styles.playlistMeta}>{faixas.length} {faixas.length === 1 ? 'track' : 'tracks'}</Text></Pressable>)}</View> : <Empty icon="people-outline" title="No artists yet" body="Artists are collected automatically from the tracks in your library." />}</ContentScroll></Page>;
}

export function ArtistPage({ name, back, ...props }: { name: string; back: () => void } & CommonPageProps) {
  const data = useLibraryData();
  // Pela chave e nao pelo nome: a pagina tem de trazer as faixas das TRES
  // grafias, senao o cartao dizia 5 faixas e a pagina abria com 2.
  const tracks = useMemo(() => {
    const alvo = chaveDeArtista(name);
    return agruparPorArtista(data.tracks).find((g) => g.chave === alvo)?.faixas ?? [];
  }, [data.tracks, name]);
  const playAll = (shuffle = false) => {
    if (!tracks.length) return;
    if (shuffle) usePlayer.getState().playShuffled(tracks);
    else props.play(tracks[0], tracks);
  };
  return <Page title="Artist" action={<Button secondary icon="arrow-back" onPress={back}>Back to artists</Button>}><ContentScroll>{data.loading ? <View style={{ height: 350 }}><Loading /></View> : <><View style={styles.detailHero}><View style={styles.detailHeroArt}><Artwork track={tracks[0]} size={176} /></View><View style={styles.detailHeroBody}><Text style={styles.detailHeroEyebrow}>ARTIST</Text><Text numberOfLines={2} style={styles.detailHeroTitle}>{name}</Text><Text style={styles.detailHeroMeta}>{tracks.length} saved {tracks.length === 1 ? 'track' : 'tracks'}</Text><View style={styles.detailHeroActions}><Button icon="play" onPress={() => playAll(false)}>Play</Button><Button secondary icon="shuffle" onPress={() => playAll(true)}>Shuffle</Button></View></View></View><TrackTable plain tracks={tracks} onPlay={(t) => props.play(t, tracks)} onMore={props.more} /></>}</ContentScroll></Page>;
}
