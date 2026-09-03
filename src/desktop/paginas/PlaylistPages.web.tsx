/**
 * Playlists: a grelha e a página de uma playlist.
 *
 * `sort(() => Math.random() - 0.5)` está PROIBIDO aqui: comparador
 * inconsistente dá baralhamento enviesado, e o botão discordava do
 * interruptor. Usar o `playShuffled()` da store.
 */
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import {
  createPlaylist, deletePlaylist, getPlaylistTracks, getPlaylistDetails, listPlaylists, renamePlaylist,
} from '../../api/playlists';
import { usePlayer } from '../../state/player';
import { useAuth } from '../../state/auth';
import type { Playlist, Track } from '../../types';
import { styles } from '../estilos.web';
import {
  Button, ContentScroll, Dialog, Empty, Field, IconButton, Loading, Page, TrackTable,
} from '../ui.web';
import type { CommonPageProps, Route, ShareTarget } from '../rotas';
import { PlaylistArtwork } from './comum.web';

export function PlaylistsPage({ navigate, notify }: { navigate: (route: Route) => void; notify: (s: string) => void }) {
  const [items, setItems] = useState<Playlist[]>([]); const [loading, setLoading] = useState(true); const [createOpen, setCreateOpen] = useState(false); const [name, setName] = useState('');
  const [loadError,setLoadError]=useState('');
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
  const create = async () => { if (!name.trim()) return; try { const item = await createPlaylist(name.trim()); setCreateOpen(false); setName(''); navigate({ name: 'playlist', id: item.id, title: item.name }); } catch (e: any) { notify(e?.message || 'Could not create playlist.'); } };
  return <><Page title="Playlists" subtitle="Build collections for any moment." action={<View style={{ flexDirection: 'row', gap: 10 }}><Button secondary icon="logo-youtube" onPress={() => navigate({ name: 'import' })}>YouTube</Button><Button secondary iconNode={<Image source={require('../../../assets/spotify.png')} style={{ width: 16, height: 16 }} />} onPress={() => navigate({ name: 'spotify-import' })}>Spotify</Button><Button icon="add" onPress={() => setCreateOpen(true)}>New playlist</Button></View>}><ContentScroll>{!!loadError&&<Empty icon="alert-circle-outline" title="Playlists unavailable" body={loadError} action={<Button secondary onPress={refresh}>Try again</Button>}/>} {loading ? <View style={{ height: 350 }}><Loading /></View> : items.length ? <View style={styles.playlistGrid}>{items.map((item) => <Pressable key={item.id} onPress={() => navigate({ name: 'playlist', id: item.id, title: item.name })} style={({ hovered, focused }) => [styles.playlistCard, (hovered || focused) && styles.playlistCardHover]}><PlaylistArtwork artworks={item.artworks} /><Text numberOfLines={1} style={styles.playlistTitle}>{item.name}</Text><Text style={styles.playlistMeta}>{item.trackCount} {item.trackCount === 1 ? 'track' : 'tracks'}</Text></Pressable>)}</View> : loadError?null:<Empty icon="albums-outline" title="Create your first playlist" body="Group tracks into focused collections, or import an existing YouTube playlist." action={<Button onPress={() => setCreateOpen(true)}>New playlist</Button>} />}</ContentScroll></Page><Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="New playlist"><Field autoFocus placeholder="Playlist name" value={name} onChangeText={setName} onSubmitEditing={create} /><View style={styles.dialogActions}><Button secondary onPress={() => setCreateOpen(false)}>Cancel</Button><Button onPress={create}>Create</Button></View></Dialog></>;
}

export function PlaylistPage({ id, title, back, share, ...props }: { id: string; title: string; back: () => void; share: (target: ShareTarget) => void } & CommonPageProps) {
  const [tracks, setTracks] = useState<Track[]>([]); const [loading, setLoading] = useState(true); const [confirm, setConfirm] = useState(false);
  const [playlistTitle, setPlaylistTitle] = useState(title);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameVal, setRenameVal] = useState(title);
  const [query, setQuery] = useState('');
  const userId=useAuth(s=>s.session?.user.id);
  const [ownerId,setOwnerId]=useState<string|null>(null);
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
    try {const [info,rows]=await Promise.all([getPlaylistDetails(id),getPlaylistTracks(id)]);if(token!==detailRequest.current)return;setOwnerId(info.ownerId);setPlaylistTitle(info.name);setRenameVal(info.name);setTracks(rows);}
    catch(e:any){if(token!==detailRequest.current)return;setTracks([]);setLoadError(e?.message || 'Could not load playlist.');}
    finally{if(token===detailRequest.current)setLoading(false);}
  }, [id]);
  useEffect(() => { refresh();return()=>{detailRequest.current++;}; }, [refresh]);
  const remove = async () => { try { await deletePlaylist(id); back(); } catch (e: any) { props.notify(e?.message || 'Could not delete playlist.'); } };

  const doRename = async () => {
    const trimmed = renameVal.trim();
    if (!trimmed) return;
    try {
      await renamePlaylist(id, trimmed);
      setPlaylistTitle(trimmed);
      setRenameOpen(false);
      props.notify('Playlist renamed.');
      window.dispatchEvent(new CustomEvent('duotone:refresh-playlists'));
    } catch (e: any) {
      props.notify(e?.message || 'Could not rename playlist.');
    }
  };

  const filteredTracks = useMemo(() => {
    if (!query.trim()) return tracks;
    const q = query.toLowerCase();
    return tracks.filter(t => 
      t.title.toLowerCase().includes(q) || 
      (t.artist && t.artist.toLowerCase().includes(q))
    );
  }, [tracks, query]);

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
  return <><Page title="Playlist" action={<Button secondary icon="arrow-back" onPress={back}>Back to playlists</Button>}><ContentScroll>{!!loadError&&<Empty icon="alert-circle-outline" title="Playlists unavailable" body={loadError} action={<Button secondary onPress={refresh}>Try again</Button>}/>} {loading ? <View style={{ height: 350 }}><Loading /></View> : loadError ? <Empty icon="alert-circle-outline" title="Playlist unavailable" body={loadError} action={<Button onPress={refresh}>Try again</Button>}/> : <><View style={styles.detailHero}><PlaylistArtwork artworks={artworks} lado={176} /><View style={styles.detailHeroBody}><Text style={styles.detailHeroEyebrow}>PLAYLIST</Text><Text numberOfLines={2} style={styles.detailHeroTitle}>{playlistTitle}</Text><Text style={styles.detailHeroMeta}>{tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}</Text><View style={styles.detailHeroActions}><Button icon="play" onPress={playAll}>Play</Button><Button secondary={!ligado} brilho={inteligente} icon="shuffle" onPress={alternarShuffle}>{inteligente ? 'Smart shuffle' : 'Shuffle'}</Button><Button secondary icon="share-social-outline" onPress={() => share({ itemType: 'playlist', item: { id, name: playlistTitle }, name: playlistTitle })}>Share</Button>{canEdit&&<><IconButton name="pencil-outline" label="Rename playlist" onPress={() => { setRenameVal(playlistTitle); setRenameOpen(true); }} /><IconButton name="trash-outline" label="Delete playlist" onPress={() => setConfirm(true)} /></>}</View></View></View><View style={styles.detailSearch}><Field icon="search" placeholder="Search this playlist" value={query} onChangeText={setQuery} /></View><TrackTable plain tracks={filteredTracks} onPlay={(t) => props.play(t, filteredTracks)} onMore={props.more} empty={query ? <Empty icon="search-outline" title="No results found" body={`No playlist tracks match "${query}"`} /> : <Empty icon="add-circle-outline" title="This playlist is empty" body="Use track actions from Search or Liked Songs to add music here." />} /></>}</ContentScroll></Page><Dialog open={confirm} title="Delete playlist?" onClose={() => setConfirm(false)}><Text style={styles.dialogBody}>“{playlistTitle}” will be deleted. Tracks in your library will not be affected.</Text><View style={styles.dialogActions}><Button secondary onPress={() => setConfirm(false)}>Cancel</Button><Button danger onPress={remove}>Delete</Button></View></Dialog><Dialog open={renameOpen} title="Rename playlist" onClose={() => setRenameOpen(false)}><View style={{ paddingBottom: 16 }}><Field autoFocus placeholder="Playlist name" value={renameVal} onChangeText={setRenameVal} onSubmitEditing={doRename} /></View><View style={styles.dialogActions}><Button secondary onPress={() => setRenameOpen(false)}>Cancel</Button><Button onPress={doRename} disabled={!renameVal.trim()}>Save</Button></View></Dialog></>;
}
