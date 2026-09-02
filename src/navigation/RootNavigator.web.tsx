import { Ionicons } from '@expo/vector-icons';
import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { displayArtist } from '../lib/artistName';
import { addTracksToPlaylist, createPlaylist, deletePlaylist, getPlaylistTracks, importSharedPlaylist, listPlaylists, removeTrackFromPlaylist, renamePlaylist } from '../api/playlists';
import { addSearchHistoryEntry, clearSearchHistory, getSearchHistory } from '../api/searchHistory';
import { getLibrary, getLikedSongs, removeFromLibrary, saveToLibrary, checkIsSaved } from '../api/library';
import { fetchYouTubePlaylist, searchYouTube } from '../api/youtube';
import { YouTubePlayerView } from '../components/YouTubePlayerView';
import { FriendAvatar } from '../components/FriendAvatar';
import { useSaved } from '../state/saved';
import { useRecomendacoes } from '../state/recomendacoes';
import { fetchListeningStats, type StatsResult } from '../api/listeningStats';
import { formatListeningTime, type StatsPeriod, type TimelineBucket } from '../lib/listeningStats';
import { HandoffBanner } from '../components/HandoffBanner';
import { endSession, publishSession, publishSessionNow } from '../lib/sessionSync';
import { useAutoplayRadio } from '../lib/radioSync';
import { Artwork, Button, ContentScroll, desktop, Dialog, Empty, Field, formatTime, IconButton, Loading, Page, Shelf, Toast, TrackTable, ui } from '../desktop/ui.web';
import { COR, ESP, FONT, FONTES, LINHA_LISTA, RAIO, TIPO } from '../desktop/tokens.web';
import { styles } from '../desktop/estilos.web';
import { GlitchArtwork } from '../desktop/glitch/GlitchArtwork.web';
import { SpotifyImportPage } from '../desktop/SpotifyImportPage.web';
import {
  getEffectIntensity, getGlitchMode,
  setEffectIntensity, setGlitchMode,
  type EffectIntensity, type GlitchMode,
  getShowRewindButton, getShowTrackDuration,
  setShowRewindButton, setShowTrackDuration, setShowTrackDurationCache,
  setAutoplayRadio as persistAutoplayRadio
} from '../lib/prefs';
import {
  AVATAR_EMOJIS, AVATAR_GRADIENTS, getAvatarChoice, setAvatarChoice,
  type AvatarChoice,
} from '../lib/avatarPrefs';
import {
  getProfilePlayStats, getProfileMostPlayed, getProfileRecentlyPlayed, getTopArtists,
  getHeavyRotation, getForgottenFavorites,
  type ProfilePlayEntry, type DbPlayStats,
} from '../api/plays';
import {
  acceptFriendRequest, archiveInboxItem, declineOrRemoveFriendship,
  getFriendCount, getFriendships, getInboxItems, searchProfiles,
  shareItem, publishPresence, clearPresence, sendFriendRequest, getChatMessages, type Friendship, type SharedItem
} from '../api/social';
import { APP_VERSION, BUILD_ID } from '../lib/buildInfo';
import { historico, limparHistorico, relatorio, resumo } from '../lib/playbackDiagnostics';
import { supabase } from '../lib/supabase';
import { useAuth } from '../state/auth';
import { usePlayer } from '../state/player';
import { useTheme } from '../state/theme';
import type { Playlist, Track } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { SocialPage } from '../desktop/paginas/SocialPage.web';

import { SettingsPage } from '../desktop/paginas/SettingsPage.web';

import { ProfilePage, StatsPage } from '../desktop/paginas/ProfilePage.web';

import { ArtistPage, ArtistsPage, SearchPage, SongsPage } from '../desktop/paginas/BibliotecaPages.web';

import { PlaylistPage, PlaylistsPage } from '../desktop/paginas/PlaylistPages.web';

import { ImportPage } from '../desktop/paginas/ImportPage.web';

import { NowPlayingPage } from '../desktop/paginas/NowPlayingPage.web';

import { injectDesktopDocumentStyles, PlayerBar, Sidebar, TitleBar } from '../desktop/casca.web';
import { PRIMARY, type CommonPageProps, type Route, type ShareTarget } from '../desktop/rotas';
import {
  memberSince, newerVersion, playEntryToTrack,
  PlaylistArtwork, relativeTime, useLibraryData,
} from '../desktop/paginas/comum.web';
const P = Pressable as any;
const V = View as any;

function AuthDesktop() {
  const signIn = useAuth((s) => s.signIn); const signUp = useAuth((s) => s.signUp);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin'); const [identifier, setIdentifier] = useState(''); const [email, setEmail] = useState(''); const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const submit = async () => { setBusy(true); setError(null); const message = mode === 'signin' ? await signIn(identifier, password) : await signUp(email, password, username); setError(message); setBusy(false); };
  return <View style={styles.auth}><View style={styles.authGlow} /><View style={styles.authCard}><View style={[styles.authLogo, { alignItems: 'center', gap: 12, flexDirection: 'row' }]}><Image source={require('../../assets/auth-logo.png')} style={{ width: 44, height: 44 }} resizeMode="contain" /></View><Text style={styles.authTitle}>Your music, in one place.</Text><Text style={styles.authBody}>Sign in to your Duotone library and continue listening across devices.</Text><View style={styles.segment}><Pressable onPress={() => setMode('signin')} style={[styles.segmentItem, mode === 'signin' && styles.segmentActive]}><Text style={styles.segmentText}>Sign in</Text></Pressable><Pressable onPress={() => setMode('signup')} style={[styles.segmentItem, mode === 'signup' && styles.segmentActive]}><Text style={styles.segmentText}>Create account</Text></Pressable></View>
    <View style={{ gap: 12 }}>{mode === 'signin' ? <Field icon="person-outline" placeholder="Email or username" value={identifier} onChangeText={setIdentifier} onSubmitEditing={submit} /> : <><Field icon="person-outline" placeholder="Username" value={username} onChangeText={setUsername} /><Field icon="mail-outline" placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" /></>}<Field icon="lock-closed-outline" placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry onSubmitEditing={submit} />{error && <Text style={styles.error}>{error}</Text>}<Button onPress={submit} disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</Button></View></View><Text style={styles.authFoot}>Duotone for Windows</Text></View>;
}

function DesktopShell() {
  const [route, setRoute] = useState<Route>({ name: 'search' }); const history = useRef<Route[]>([]); const [toast, setToast] = useState('');
  const [trackMenu, setTrackMenu] = useState<Track | null>(null); const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [trackMenuOpen, setTrackMenuOpen] = useState(false);
  const [playlistDialog, setPlaylistDialog] = useState(false);
  const [shareDialog, setShareDialog] = useState(false);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const [friends, setFriends] = useState<Friendship[]>([]);
  // VARIOS destinatarios, nao um. Mandar a mesma musica a tres pessoas
  // eram tres idas ao dialogo; o `shareItem` ja aceita uma lista e
  // insere-as de uma vez.
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [shareMessage, setShareMessage] = useState('');
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [savedTrackId, setSavedTrackId] = useState<string | null>(null);
  const [currentIsSaved, setCurrentIsSaved] = useState(false);

  const p = usePlayer();
  const currentTrack = p.current;

  const checkCurrentSaved = useCallback(() => {
    if (!currentTrack) {
      setCurrentIsSaved(false);
      return;
    }
    checkIsSaved(currentTrack.source, currentTrack.sourceId)
      .then(({ saved }) => setCurrentIsSaved(saved))
      .catch(() => setCurrentIsSaved(false));
  }, [currentTrack]);

  useEffect(() => {
    checkCurrentSaved();
    window.addEventListener('duotone:refresh-library', checkCurrentSaved);
    return () => window.removeEventListener('duotone:refresh-library', checkCurrentSaved);
  }, [checkCurrentSaved]);

  const toggleSaveCurrent = async () => {
    if (!currentTrack) return;
    try {
      const { saved, trackId } = await checkIsSaved(currentTrack.source, currentTrack.sourceId);
      if (saved) {
        const idToRemove = trackId || currentTrack.id;
        if (idToRemove) {
          await removeFromLibrary(idToRemove);
          useSaved.getState().markSaved(currentTrack, false);
          notify('Removed from library.');
        }
      } else {
        await saveToLibrary(currentTrack);
        useSaved.getState().markSaved(currentTrack, true);
        notify('Saved to library.');
      }
      window.dispatchEvent(new Event('duotone:refresh-library'));
    } catch (e: any) {
      notify(e?.message || 'Could not update library.');
    }
  };

  const [panelOpacity, setPanelOpacity] = useState(0.72);
  const theme = useTheme((s) => s.theme);

  const navigate = useCallback((next: Route) => { setRoute((current) => { history.current.push(current); return next; }); }, []);
  const back = useCallback(() => setRoute(history.current.pop() || { name: 'playlists' }), []);
  const notify = useCallback((s: string) => setToast(s), []);
  const play = useCallback((track: Track, queue?: Track[]) => { usePlayer.getState().playTrack(track, queue); }, []);

  useEffect(() => {
    const onPlaybackNotice = (event: any) => notify(String(event.detail || 'Playback changed.'));
    window.addEventListener('duotone:playback-notice', onPlaybackNotice);
    return () => window.removeEventListener('duotone:playback-notice', onPlaybackNotice);
  }, [notify]);

  const isPlayingState = p.isPlaying;
  // Evita mandar um delete ao arrancar sem nada a tocar.
  const hadTrackRef = useRef(false);

  // Rádio: abastece a fila antes de ela acabar (ver useAutoplayRadio).
  useAutoplayRadio();

  useEffect(() => {
    AsyncStorage.getItem('pref:panelOpacity').then((val) => {
      if (val) setPanelOpacity(Number(val));
    });
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent-color', theme.color);
    document.documentElement.style.setProperty('--panel-opacity', String(panelOpacity));
  }, [theme.color, panelOpacity]);

  useEffect(() => {
    const handleOpacity = (e: any) => {
      if (e.detail) setPanelOpacity(Number(e.detail));
    };
    window.addEventListener('duotone:panel-opacity', handleOpacity);
    return () => window.removeEventListener('duotone:panel-opacity', handleOpacity);
  }, []);

  useEffect(() => {
    const handleNav = (e: any) => {
      if (e.detail) setRoute(e.detail);
    };
    window.addEventListener('duotone:navigate', handleNav);
    return () => window.removeEventListener('duotone:navigate', handleNav);
  }, []);

  // Broadcast currently playing track for friends list sync
  useEffect(() => {
    publishPresence(currentTrack, isPlayingState);
  }, [currentTrack, isPlayingState]);

  // Sem isto, fechar a janela deixava o último tema gravado no perfil e os
  // amigos viam "Listening to" indefinidamente. `pagehide` é o único que
  // dispara de forma fiável ao fechar no Electron e no Safari.
  useEffect(() => {
    const bye = () => {
      clearPresence();
      // A sessão do handoff sobrevive de propósito a fechar a janela: é o
      // que permite pegar no telemóvel e continuar de onde o PC ficou.
      if (usePlayer.getState().current) publishSessionNow();
    };
    window.addEventListener('pagehide', bye);
    return () => {
      window.removeEventListener('pagehide', bye);
      clearPresence();
    };
  }, []);

  // Sessão deste PC, para o telemóvel poder continuar. Mesma assimetria do
  // telemóvel: o presence é apagado ao sair, a sessão fica.
  useEffect(() => {
    if (currentTrack) publishSession();
    else if (hadTrackRef.current) void endSession();
    hadTrackRef.current = !!currentTrack;
  }, [currentTrack, isPlayingState, p.queueIndex]);

  // Media Session Keyboard API sync + Electron hardware keys integration
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => {
        usePlayer.getState()._setIsPlaying(true);
        usePlayer.getState()._yt?.play();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        usePlayer.getState()._setIsPlaying(false);
        usePlayer.getState()._yt?.pause();
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        usePlayer.getState().prev();
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        usePlayer.getState().next();
      });
    }

    // Electron hardware key listeners
    const desktop = (window as any).duotoneDesktop;
    if (desktop) {
      const unsubPlayPause = desktop.onMediaKeyPlayPause(() => {
        usePlayer.getState().togglePlay();
      });
      const unsubNext = desktop.onMediaKeyNext(() => {
        usePlayer.getState().next();
      });
      const unsubPrev = desktop.onMediaKeyPrev(() => {
        usePlayer.getState().prev();
      });

      return () => {
        unsubPlayPause();
        unsubNext();
        unsubPrev();
      };
    }
  }, []);

  useEffect(() => {
    if ('mediaSession' in navigator) {
      if (currentTrack) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.title,
          artist: currentTrack.artist || 'YouTube',
          album: currentTrack.album || 'Duotone',
          artwork: currentTrack.artworkUrl ? [{ src: currentTrack.artworkUrl }] : []
        });
      } else {
        navigator.mediaSession.metadata = null;
      }
    }
  }, [currentTrack]);

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlayingState ? 'playing' : 'paused';
    }
  }, [isPlayingState]);

  // **As recomendacoes comecam com a app, e nao com a pagina.** Preparar a
  // descoberta demora -- fala com um catalogo e com o YouTube faixa a faixa --
  // e faze-lo so quando ele abre a Pesquisa e faze-lo a horas de ele estar a
  // olhar. Aqui ja ha sessao (esta casca so existe com ela).
  useEffect(() => { void useRecomendacoes.getState().carregar(); }, []);

  const more = useCallback(async (track: Track) => {
    setTrackMenu(track);
    setTrackMenuOpen(true);
    try {
      const { saved, trackId } = await checkIsSaved(track.source, track.sourceId);
      setIsSaved(saved);
      setSavedTrackId(trackId);
    } catch {
      setIsSaved(false);
      setSavedTrackId(null);
    }
  }, []);

  const toggleSave = async () => {
    if (!trackMenu) return;
    setTrackMenuOpen(false);
    const idToRemove = savedTrackId || trackMenu.id;
    try {
      if (isSaved && idToRemove) {
        await removeFromLibrary(idToRemove);
        useSaved.getState().markSaved(trackMenu, false);
        notify('Removed from library.');
      } else {
        await saveToLibrary(trackMenu);
        useSaved.getState().markSaved(trackMenu, true);
        notify('Saved to library.');
      }
      window.dispatchEvent(new Event('duotone:refresh-library'));
    } catch (e: any) {
      notify(e?.message || 'Could not update library.');
    }
  };

  const removeFromCurrentPlaylist = async () => {
    if (!trackMenu || route.name !== 'playlist' || !trackMenu.id) return;
    setTrackMenuOpen(false);
    try {
      await removeTrackFromPlaylist(route.id, trackMenu.id);
      notify('Removed from playlist.');
      window.dispatchEvent(new CustomEvent('duotone:refresh-playlist'));
    } catch (e: any) {
      notify(e?.message || 'Could not remove track.');
    }
  };

  const openPlaylistDialog = async () => {
    // A leitura pode falhar (sessao expirada, sem rede). Sem isto a promessa
    // ficava por apanhar e carregar no botao nao fazia NADA -- nem abria, nem
    // dizia porque nao. Abre-se na mesma: o dialogo sabe mostrar-se vazio.
    try {
      setPlaylists(await listPlaylists());
    } catch (e: any) {
      setPlaylists([]);
      notify(e?.message || 'Could not load your playlists.');
    }
    setPlaylistDialog(true);
  };

  const addTo = async (id: string) => {
    if (!trackMenu) return;
    try {
      await addTracksToPlaylist(id, [trackMenu]);
      setPlaylistDialog(false);
      notify('Added to playlist.');
    } catch (e: any) {
      notify(e?.message || 'Could not add track.');
    }
  };

  const openShareDialog = async (target: ShareTarget) => {
    setShareTarget(target);
    setSelectedFriends([]);
    setShareMessage('');
    setShareDialog(true);
    setLoadingFriends(true);
    try {
      const list = await getFriendships();
      setFriends(list.filter(f => f.status === 'accepted'));
    } catch {
      setFriends([]);
    } finally {
      setLoadingFriends(false);
    }
  };

  const sendShare = async () => {
    if (!shareTarget || selectedFriends.length === 0) return;
    setSharing(true);
    try {
      await shareItem(selectedFriends, shareTarget.itemType, shareTarget.item, shareMessage);
      setShareDialog(false);
      setShareTarget(null);
      setShareMessage('');
      setSelectedFriends([]);
      const oQue = shareTarget.itemType === 'playlist' ? 'Playlist' : 'Song';
      notify(selectedFriends.length === 1
        ? `${oQue} shared successfully.`
        : `${oQue} shared with ${selectedFriends.length} friends.`);
    } catch (e: any) {
      notify(e?.message || `Could not share ${shareTarget.itemType}.`);
    } finally {
      setSharing(false);
    }
  };

  const common = { play, notify, more };
  let page: ReactNode;
  switch (route.name) {
    case 'search': page = <SearchPage {...common} />; break; case 'songs': page = <SongsPage {...common} />; break; case 'artists': page = <ArtistsPage navigate={navigate} />; break;
    case 'artist': page = <ArtistPage name={route.value} back={back} {...common} />; break; case 'playlists': page = <PlaylistsPage navigate={navigate} notify={notify} />; break; case 'playlist': page = <PlaylistPage id={route.id} title={route.title} back={back} share={openShareDialog} {...common} />; break;
    case 'stats': page = <StatsPage back={back} play={play} />; break;
    case 'import': page = <ImportPage back={back} notify={notify} />; break; case 'spotify-import': page = <SpotifyImportPage back={back} notify={notify} />; break; case 'profile': page = <ProfilePage navigate={navigate} notify={notify} />; break; case 'settings': page = <SettingsPage notify={notify} />; break;
    case 'social': page = <SocialPage notify={notify} play={play} more={more} />; break;
    case 'now-playing': page = <NowPlayingPage play={play} notify={notify} more={more} currentIsSaved={currentIsSaved} toggleSaveCurrent={toggleSaveCurrent} navigate={navigate} aoAdicionarAPlaylist={(t) => { setTrackMenu(t); void openPlaylistDialog(); }} />; break;
  }

  // Painel dos tokens, com a opacidade que o utilizador escolher nas
  // Definicoes. Era `rgba(18,18,24)` a martelo, fora de qualquer paleta.
  const bgStyle = { backgroundColor: `rgba(12, 12, 16, ${panelOpacity})` };

  return <View style={[styles.root, { backgroundColor: 'transparent' }]}><TitleBar /><View style={styles.main}><V style={[styles.sidebar, bgStyle]} className="glass-panel"><Sidebar route={route} navigate={navigate} /></V><V style={[styles.content, bgStyle]} className="glass-panel">{page}</V></View><PlayerBar currentIsSaved={currentIsSaved} toggleSaveCurrent={toggleSaveCurrent} /><HandoffBanner />{toast && <Toast message={toast} onDone={() => setToast('')} />}
    
    {/* CUSTOM ACTIONS DIALOG */}
    <Dialog open={trackMenuOpen} title="Track Actions" onClose={() => setTrackMenuOpen(false)}>
      {trackMenu && (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: desktop.border }}>
            <Artwork track={trackMenu} size={48} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: desktop.text, fontSize: 14, fontWeight: '700' }}>{trackMenu.title}</Text>
              <Text numberOfLines={1} style={{ color: desktop.muted, fontSize: 12 }}>{trackMenu.artist || 'Unknown Artist'}</Text>
            </View>
          </View>
          <Pressable onPress={() => { play(trackMenu); setTrackMenuOpen(false); }} style={({ hovered }) => [styles.destination, hovered && styles.settingHover]}><Ionicons name="play-circle-outline" size={18} color={theme.color} /><Text style={styles.destinationText}>Play now</Text></Pressable>
          <Pressable onPress={() => { usePlayer.getState().addToQueue(trackMenu); setTrackMenuOpen(false); notify('Added to queue.'); }} style={({ hovered }) => [styles.destination, hovered && styles.settingHover]}><Ionicons name="list-outline" size={18} color={theme.color} /><Text style={styles.destinationText}>Add to queue</Text></Pressable>
          <Pressable onPress={toggleSave} style={({ hovered }) => [styles.destination, hovered && styles.settingHover]}><Ionicons name={isSaved ? "heart" : "heart-outline"} size={18} color={isSaved ? '#EF4444' : theme.color} /><Text style={styles.destinationText}>{isSaved ? 'Remove from library' : 'Save to library'}</Text></Pressable>
          <Pressable onPress={() => { setTrackMenuOpen(false); openPlaylistDialog(); }} style={({ hovered }) => [styles.destination, hovered && styles.settingHover]}><Ionicons name="albums-outline" size={18} color={theme.color} /><Text style={styles.destinationText}>Add to playlist…</Text></Pressable>
          {/* O artista sai do `displayArtist` e nao do campo `artist`, que no
              YouTube e o CANAL: com o campo cru abria-se a pagina de um canal
              de uploads em vez da do artista. */}
          <Pressable onPress={() => { setTrackMenuOpen(false); navigate({ name: 'artist', value: displayArtist(trackMenu) }); }} style={({ hovered }) => [styles.destination, hovered && styles.settingHover]}><Ionicons name="mic-outline" size={18} color={theme.color} /><Text style={styles.destinationText}>View artist</Text></Pressable>
          <Pressable onPress={() => { setTrackMenuOpen(false); openShareDialog({ itemType: 'track', item: trackMenu, name: trackMenu.title }); }} style={({ hovered }) => [styles.destination, hovered && styles.settingHover]}><Ionicons name="share-social-outline" size={18} color={theme.color} /><Text style={styles.destinationText}>Share with a friend…</Text></Pressable>
          {route.name === 'playlist' && (
            <Pressable onPress={removeFromCurrentPlaylist} style={({ hovered }) => [styles.destination, hovered && styles.settingHover]}><Ionicons name="trash-outline" size={18} color="#EF4444" /><Text style={[styles.destinationText, { color: '#EF4444' }]}>Remove from this playlist</Text></Pressable>
          )}
        </View>
      )}
    </Dialog>

    {/* PLAYLIST DIALOG */}
    <Dialog open={playlistDialog} title="Add to playlist" onClose={() => setPlaylistDialog(false)}>
      {playlists.length ? <View style={{ gap: 6 }}>{playlists.map((p) => <Pressable key={p.id} onPress={() => addTo(p.id)} style={({ hovered }) => [styles.destination, hovered && styles.settingHover]}><Ionicons name="albums-outline" size={18} color={theme.color} /><Text style={styles.destinationText}>{p.name}</Text></Pressable>)}</View> : <Empty icon="albums-outline" title="No playlists" body="Create a playlist first, then add this track." />}
    </Dialog>

    {/* SHARE DIALOG */}
    <Dialog open={shareDialog} title={shareTarget?.itemType === 'playlist' ? 'Share playlist' : 'Share song'} onClose={() => { setShareDialog(false); setSelectedFriends([]); }}>
      {shareTarget && (
        <View style={{ gap: 12 }}>
          <Text numberOfLines={1} style={styles.dialogBody}>Sharing “{shareTarget.name}”</Text>
          <Text style={styles.formLabel}>SELECT FRIENDS</Text>
          {loadingFriends ? <Loading /> : friends.length ? (
            <View style={{ gap: 6, maxHeight: 180, overflow: 'auto' as any }}>
              {friends.map((f) => (
                // Caixas e nao circulos: o circulo diz "escolhe UM", e agora
                // escolhem-se quantos se quiser.
                <Pressable
                  key={f.friendId}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selectedFriends.includes(f.friendId) }}
                  onPress={() => setSelectedFriends((antes) => antes.includes(f.friendId)
                    ? antes.filter((id) => id !== f.friendId)
                    : [...antes, f.friendId])}
                  style={[styles.destination, selectedFriends.includes(f.friendId) && { borderColor: theme.color, backgroundColor: theme.soft }]}
                >
                  <Ionicons
                    name={selectedFriends.includes(f.friendId) ? 'checkbox' : 'square-outline'}
                    color={selectedFriends.includes(f.friendId) ? theme.color : desktop.dim}
                    size={18}
                  />
                  <Text style={styles.destinationText}>{f.name} (@{f.username})</Text>
                </Pressable>
              ))}
            </View>
          ) : <Text style={styles.dialogBody}>No friends found. Go to the Social page to add friends.</Text>}

          {friends.length > 0 && (
            <>
              <Text style={styles.formLabel}>MESSAGE (OPTIONAL)</Text>
              <Field placeholder={`Add a note about this ${shareTarget.itemType}…`} value={shareMessage} onChangeText={setShareMessage} />
              <View style={styles.dialogActions}>
                <Button secondary onPress={() => setShareDialog(false)}>Cancel</Button>
                <Button onPress={sendShare} disabled={selectedFriends.length === 0 || sharing}>{
                  sharing ? 'Sharing…'
                    : selectedFriends.length > 1
                      // Diz quantos: quem escolheu cinco pessoas quer ver o cinco
                      // antes de carregar, e nao depois no aviso.
                      ? `Share with ${selectedFriends.length}`
                      : shareTarget.itemType === 'playlist' ? 'Share Playlist' : 'Share Song'
                }</Button>
              </View>
            </>
          )}
        </View>
      )}
    </Dialog>
  </View>;
}

export function RootNavigator() {
  const initialized = useAuth((s) => s.initialized); const session = useAuth((s) => s.session);
  useEffect(injectDesktopDocumentStyles, []);
  if (!initialized) return <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}><Loading /></View>;
  return <View style={styles.root}><Image source={require('../../assets/wallpaper.png')} style={styles.backgroundImage} />{session ? <DesktopShell /> : <View style={{ flex: 1, backgroundColor: 'transparent' }}><TitleBar /><AuthDesktop /></View>}</View>;
}
