/**
 * Playlists: a grelha e a página de uma playlist.
 *
 * `sort(() => Math.random() - 0.5)` está PROIBIDO aqui: comparador
 * inconsistente dá baralhamento enviesado, e o botão discordava do
 * interruptor. Usar o `playShuffled()` da store.
 */
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Image, Pressable, Text, View as NativeView } from 'react-native';
import {
  createPlaylist, deletePlaylist, getPlaylistTracks, getPlaylistDetails, listPlaylists, mergePlaylists, renamePlaylist,
} from '../../api/playlists';
import { correspondeAPesquisa } from '../../lib/searchText';
import { usePlayer } from '../../state/player';
import { useAuth } from '../../state/auth';
import type { Playlist, PlaylistTrack, Track } from '../../types';
import { styles } from '../estilos.web';
import {
  Button, ContentScroll, Dialog, Empty, Field, IconButton, Loading, Page, TrackTable,
} from '../ui.web';
import type { CommonPageProps, Route, ShareTarget } from '../rotas';
import { PlaylistArtwork } from './comum.web';

// As páginas são exclusivamente web e usam uma propriedade CSS (`overflowY`)
// que não existe no tipo comum de View do React Native.
const View = NativeView as any;

type Ordenacao = 'default' | 'title' | 'artist' | 'recent' | 'duration';
const NOMES_DA_ORDENACAO: Record<Ordenacao, string> = {
  default: 'Playlist order', title: 'Title', artist: 'Artist', recent: 'Recently added', duration: 'Duration',
};
const cacheDePlaylist = new Map<string, { tracks: PlaylistTrack[]; ownerId: string; name: string }>();
export const invalidarCacheDaPlaylist = (id: string) => { cacheDePlaylist.delete(id); };

export function PlaylistsPage({ navigate, notify, share }: { navigate: (route: Route) => void; notify: (s: string) => void; share: (target: ShareTarget) => void }) {
  const [items, setItems] = useState<Playlist[]>([]); const [loading, setLoading] = useState(true); const [createOpen, setCreateOpen] = useState(false); const [name, setName] = useState('');
  const [loadError,setLoadError]=useState('');
  /** A playlist sobre a qual se carregou com o botao direito. */
  const [menuAlvo, setMenuAlvo] = useState<Playlist | null>(null);
  const [renomear, setRenomear] = useState<Playlist | null>(null);
  const [nomeNovo, setNomeNovo] = useState('');
  const [apagar, setApagar] = useState<Playlist | null>(null);
  const request=useRef(0);
  const refresh=useCallback(async()=>{
    const id=++request.current;setLoading(true);setLoadError('');
    try{const rows=await listPlaylists();if(id===request.current)setItems(rows);}
    catch{if(id===request.current)setLoadError('Could not load your playlists. Please try again.');}
    finally{if(id===request.current)setLoading(false);}
  },[]);
  useEffect(() => {
    refresh();
    window.addEventListener('duotone:refresh-playlists', refresh);
    return () => {request.current++;window.removeEventListener('duotone:refresh-playlists', refresh);};
  }, [refresh]);
  const confirmarNome = async () => {
    if (!renomear || !nomeNovo.trim()) return;
    try { await renamePlaylist(renomear.id, nomeNovo.trim()); setRenomear(null); void refresh(); }
    catch (e: any) { notify(e?.message || 'Could not rename the playlist.'); }
  };
  const confirmarApagar = async () => {
    if (!apagar) return;
    try { await deletePlaylist(apagar.id); setApagar(null); void refresh(); }
    catch (e: any) { notify(e?.message || 'Could not delete the playlist.'); }
  };

  const create = async () => { if (!name.trim()) return; try { const item = await createPlaylist(name.trim()); setCreateOpen(false); setName(''); navigate({ name: 'playlist', id: item.id, title: item.name }); } catch (e: any) { notify(e?.message || 'Could not create playlist.'); } };
  return <><Page title="Playlists" subtitle="Build collections for any moment." action={<View style={{ flexDirection: 'row', gap: 10 }}><Button secondary icon="logo-youtube" onPress={() => navigate({ name: 'import' })}>YouTube</Button><Button secondary iconNode={<Image source={require('../../../assets/spotify.png')} style={{ width: 16, height: 16 }} />} onPress={() => navigate({ name: 'spotify-import' })}>Spotify</Button><Button icon="add" onPress={() => setCreateOpen(true)}>New playlist</Button></View>}><ContentScroll scrollKey="playlists">{!!loadError&&<Empty icon="alert-circle-outline" title="Playlists unavailable" body={loadError} action={<Button secondary onPress={refresh}>Try again</Button>}/>} {loading ? <View style={{ height: 350 }}><Loading /></View> : items.length ? <View style={styles.playlistGrid}>{items.map((item) => <Pressable key={item.id} onPress={() => navigate({ name: 'playlist', id: item.id, title: item.name })} onContextMenu={((e: any) => { e.preventDefault(); setMenuAlvo(item); }) as any} style={({ hovered, focused }) => [styles.playlistCard, (hovered || focused) && styles.playlistCardHover]}><PlaylistArtwork artworks={item.artworks} /><Text numberOfLines={1} style={styles.playlistTitle}>{item.name}</Text><Text style={styles.playlistMeta}>{item.trackCount} {item.trackCount === 1 ? 'track' : 'tracks'}</Text></Pressable>)}</View> : loadError?null:<Empty icon="albums-outline" title="Create your first playlist" body="Group tracks into focused collections, or import an existing YouTube playlist." action={<Button onPress={() => setCreateOpen(true)}>New playlist</Button>} />}</ContentScroll></Page><Dialog open={!!menuAlvo} title={menuAlvo?.name ?? ''} onClose={() => setMenuAlvo(null)}><View style={{ gap: 8 }}><Button secondary icon="share-social-outline" onPress={() => { const alvo = menuAlvo; setMenuAlvo(null); if (alvo) share({ itemType: 'playlist', item: { id: alvo.id, name: alvo.name }, name: alvo.name }); }}>Share</Button><Button secondary icon="pencil-outline" onPress={() => { const alvo = menuAlvo; setMenuAlvo(null); if (alvo) { setNomeNovo(alvo.name); setRenomear(alvo); } }}>Rename</Button><NativeView style={styles.menuDivisor} /><Button danger icon="trash-outline" onPress={() => { const alvo = menuAlvo; setMenuAlvo(null); setApagar(alvo); }}>Delete playlist</Button></View></Dialog><Dialog open={!!renomear} title="Rename playlist" onClose={() => setRenomear(null)}><View style={{ paddingBottom: 16 }}><Field autoFocus placeholder="Playlist name" value={nomeNovo} onChangeText={setNomeNovo} onSubmitEditing={confirmarNome} /></View><View style={styles.dialogActions}><Button secondary onPress={() => setRenomear(null)}>Cancel</Button><Button onPress={confirmarNome} disabled={!nomeNovo.trim()}>Save</Button></View></Dialog><Dialog open={!!apagar} title="Delete playlist?" onClose={() => setApagar(null)}><Text style={styles.dialogBody}>“{apagar?.name}” will be deleted. Tracks in your library will not be affected.</Text><View style={styles.dialogActions}><Button secondary onPress={() => setApagar(null)}>Cancel</Button><Button danger onPress={confirmarApagar}>Delete</Button></View></Dialog><Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="New playlist"><Field autoFocus placeholder="Playlist name" value={name} onChangeText={setName} onSubmitEditing={create} /><View style={styles.dialogActions}><Button secondary onPress={() => setCreateOpen(false)}>Cancel</Button><Button onPress={create}>Create</Button></View></Dialog></>;
}

export function PlaylistPage({ id, title, back, share, ...props }: { id: string; title: string; back: () => void; share: (target: ShareTarget) => void } & CommonPageProps) {
  const inicial = cacheDePlaylist.get(id);
  const [tracks, setTracks] = useState<PlaylistTrack[]>(inicial?.tracks ?? []); const [loading, setLoading] = useState(!inicial); const [confirm, setConfirm] = useState(false);
  const [playlistTitle, setPlaylistTitle] = useState(title);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameVal, setRenameVal] = useState(title);
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<Ordenacao>('default');
  const [sortOpen, setSortOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeItems, setMergeItems] = useState<Playlist[]>([]);
  const [merging, setMerging] = useState(false);
  const userId=useAuth(s=>s.session?.user.id);
  const [ownerId,setOwnerId]=useState<string|null>(inicial?.ownerId ?? null);
  const [loadError,setLoadError]=useState('');
  const canEdit=ownerId===userId;
  const detailRequest=useRef(0);

  useEffect(() => {
    setPlaylistTitle(title);
    setRenameVal(title);
  }, [title]);

  const refresh = useCallback(async () => {
    const token=++detailRequest.current;
    setLoading(true);setOwnerId(null);setLoadError('');
    try {const [info,rows]=await Promise.all([getPlaylistDetails(id),getPlaylistTracks(id)]);if(token!==detailRequest.current)return;cacheDePlaylist.set(id,{tracks:rows,ownerId:info.ownerId,name:info.name});setOwnerId(info.ownerId);setPlaylistTitle(info.name);setRenameVal(info.name);setTracks(rows);}
    catch(e:any){if(token!==detailRequest.current)return;setTracks([]);setLoadError(e?.message || 'Could not load playlist.');}
    finally{if(token===detailRequest.current)setLoading(false);}
  }, [id]);
  useEffect(() => {
    if (!cacheDePlaylist.has(id)) void refresh();
    const atualizar = (event: Event) => {
      const alvo = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (!alvo || alvo === id) { cacheDePlaylist.delete(id); void refresh(); }
    };
    window.addEventListener('duotone:refresh-playlist', atualizar);
    return()=>{detailRequest.current++;window.removeEventListener('duotone:refresh-playlist', atualizar);};
  }, [id, refresh]);
  const remove = async () => { try { await deletePlaylist(id); cacheDePlaylist.delete(id); back(); } catch (e: any) { props.notify(e?.message || 'Could not delete playlist.'); } };

  const doRename = async () => {
    const trimmed = renameVal.trim();
    if (!trimmed) return;
    try {
      await renamePlaylist(id, trimmed);
      setPlaylistTitle(trimmed);
      const guardada = cacheDePlaylist.get(id);
      if (guardada) cacheDePlaylist.set(id, { ...guardada, name: trimmed });
      setRenameOpen(false);
      props.notify('Playlist renamed.');
      window.dispatchEvent(new CustomEvent('duotone:refresh-playlists'));
    } catch (e: any) {
      props.notify(e?.message || 'Could not rename playlist.');
    }
  };

  const filteredTracks = useMemo(() => {
    const filtradas = tracks.filter(t => correspondeAPesquisa(query, t.title, t.artist));
    if (sortMode === 'default') return filtradas;
    if (sortMode === 'recent') return [...filtradas].sort((a, b) => (b.position ?? 0) - (a.position ?? 0));
    if (sortMode === 'duration') return [...filtradas].sort((a, b) => (a.durationSeconds ?? 0) - (b.durationSeconds ?? 0));
    if (sortMode === 'artist') return [...filtradas].sort((a, b) => (a.artist ?? '').localeCompare(b.artist ?? '', undefined, { sensitivity: 'base' }));
    return [...filtradas].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  }, [tracks, query, sortMode]);

  const partilhar = () => share({ itemType: 'playlist', item: { id, name: playlistTitle }, name: playlistTitle });

  const abrirMerge = async () => {
    setMergeOpen(true);
    try { setMergeItems((await listPlaylists()).filter((playlist) => playlist.id !== id)); }
    catch (e: any) { setMergeOpen(false); props.notify(e?.message || 'Could not load your playlists.'); }
  };
  const fazerMerge = async (source: Playlist) => {
    setMerging(true);
    try {
      const resultado = await mergePlaylists(id, source.id);
      setMergeOpen(false);
      cacheDePlaylist.delete(id);
      await refresh();
      props.notify(`${resultado.adicionadas} added; ${resultado.repetidas} duplicates skipped. “${source.name}” was not changed.`);
      window.dispatchEvent(new CustomEvent('duotone:refresh-playlists'));
    } catch (e: any) { props.notify(e?.message || 'Could not merge the playlists.'); }
    finally { setMerging(false); }
  };

  // O Shuffle liga o modo aleatório do player (Fisher-Yates) em vez de
  // baralhar a lista com `sort(() => Math.random() - 0.5)`, que é enviesado e
  // deixava o botão em desacordo com o interruptor do player.
  const inteligente = usePlayer((s) => s.shuffleInteligente);
  const ligado = usePlayer((s) => s.shuffle);
  const alternarShuffle = usePlayer((s) => s.toggleShuffle);
  const playAll = () => {
    if (!filteredTracks.length) return;
    if (ligado) usePlayer.getState().playShuffled(filteredTracks, inteligente);
    else props.play(filteredTracks[0], filteredTracks);
  };
  const artworks = tracks.map((track) => track.artworkUrl).filter((uri): uri is string => !!uri);
  return <><Page title="Playlist" action={<Button secondary icon="arrow-back" onPress={back}>Back to playlists</Button>}><ContentScroll scrollKey={`playlist:${id}`}>{!!loadError&&<Empty icon="alert-circle-outline" title="Playlists unavailable" body={loadError} action={<Button secondary onPress={refresh}>Try again</Button>}/>} {loading ? <View style={{ height: 350 }}><Loading /></View> : loadError ? <Empty icon="alert-circle-outline" title="Playlist unavailable" body={loadError} action={<Button onPress={refresh}>Try again</Button>}/> : <><View style={styles.detailHero}><PlaylistArtwork artworks={artworks} lado={176} /><View style={styles.detailHeroBody}><Text style={styles.detailHeroEyebrow}>PLAYLIST</Text><Text numberOfLines={2} style={styles.detailHeroTitle}>{playlistTitle}</Text><Text style={styles.detailHeroMeta}>{tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}</Text><View style={styles.detailHeroActions}><Button icon="play" onPress={playAll}>Play</Button><Button secondary marcado={ligado} icon="shuffle" onPress={alternarShuffle}>{inteligente ? 'Smart shuffle' : 'Shuffle'}</Button>{canEdit ? <IconButton name="ellipsis-horizontal" label="More playlist actions" onPress={() => setMenuOpen(true)} /> : <Button secondary icon="share-social-outline" onPress={partilhar}>Share</Button>}</View></View></View><View style={styles.detailToolbar}><View style={[styles.detailSearch, { marginBottom: 0 }]}><Field icon="search" placeholder="Search this playlist" value={query} onChangeText={setQuery} /></View><Button secondary icon="swap-vertical" onPress={() => setSortOpen(true)}>{NOMES_DA_ORDENACAO[sortMode]}</Button></View><TrackTable plain listKey={`playlist:${id}:${query}:${sortMode}`} tracks={filteredTracks} onPlay={(t) => props.play(t, filteredTracks)} onMore={props.more} empty={query ? <Empty icon="search-outline" title="No results found" body={`No playlist tracks match "${query}"`} /> : <Empty icon="add-circle-outline" title="This playlist is empty" body="Use track actions from Search or Liked Songs to add music here." />} /></>}</ContentScroll></Page><Dialog open={menuOpen} title={playlistTitle} onClose={() => setMenuOpen(false)}><View style={{ gap: 8 }}><Button secondary icon="share-social-outline" onPress={() => { setMenuOpen(false); partilhar(); }}>Share</Button><Button secondary icon="git-merge-outline" onPress={() => { setMenuOpen(false); void abrirMerge(); }}>Merge another playlist</Button><Button secondary icon="pencil-outline" onPress={() => { setMenuOpen(false); setRenameVal(playlistTitle); setRenameOpen(true); }}>Rename</Button><NativeView style={styles.menuDivisor} /><Button danger icon="trash-outline" onPress={() => { setMenuOpen(false); setConfirm(true); }}>Delete playlist</Button></View></Dialog><Dialog open={sortOpen} title="Sort tracks" onClose={() => setSortOpen(false)}><View style={{ gap: 8 }}>{(Object.keys(NOMES_DA_ORDENACAO) as Ordenacao[]).map((modo) => <Button key={modo} secondary={sortMode !== modo} onPress={() => { setSortMode(modo); setSortOpen(false); }}>{NOMES_DA_ORDENACAO[modo]}</Button>)}</View></Dialog><Dialog open={mergeOpen} title={`Merge into ${playlistTitle}`} onClose={() => !merging && setMergeOpen(false)}><Text style={styles.dialogBody}>Only missing tracks are copied. The source playlist stays unchanged.</Text><View style={{ gap: 8, maxHeight: 420, overflowY: 'auto' as any }}>{mergeItems.length ? mergeItems.map((playlist) => <Button key={playlist.id} secondary disabled={merging} onPress={() => void fazerMerge(playlist)}>{playlist.name} · {playlist.trackCount} tracks</Button>) : <Text style={styles.dialogBody}>You need another playlist to merge.</Text>}</View></Dialog><Dialog open={confirm} title="Delete playlist?" onClose={() => setConfirm(false)}><Text style={styles.dialogBody}>“{playlistTitle}” will be deleted. Tracks in your library will not be affected.</Text><View style={styles.dialogActions}><Button secondary onPress={() => setConfirm(false)}>Cancel</Button><Button danger onPress={remove}>Delete</Button></View></Dialog><Dialog open={renameOpen} title="Rename playlist" onClose={() => setRenameOpen(false)}><View style={{ paddingBottom: 16 }}><Field autoFocus placeholder="Playlist name" value={renameVal} onChangeText={setRenameVal} onSubmitEditing={doRename} /></View><View style={styles.dialogActions}><Button secondary onPress={() => setRenameOpen(false)}>Cancel</Button><Button onPress={doRename} disabled={!renameVal.trim()}>Save</Button></View></Dialog></>;
}
