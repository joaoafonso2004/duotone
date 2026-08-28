import { Ionicons } from '@expo/vector-icons';
import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { displayArtist } from '../lib/artistName';
import { addTracksToPlaylist, createPlaylist, deletePlaylist, getPlaylistTracks, listPlaylists, removeTrackFromPlaylist, renamePlaylist } from '../api/playlists';
import { addSearchHistoryEntry, clearSearchHistory, getSearchHistory } from '../api/searchHistory';
import { getLibrary, removeFromLibrary, saveToLibrary, checkIsSaved } from '../api/library';
import { fetchYouTubePlaylist, searchYouTube } from '../api/youtube';
import { YouTubePlayerView } from '../components/YouTubePlayerView';
import { HandoffBanner } from '../components/HandoffBanner';
import { endSession, publishSession, publishSessionNow } from '../lib/sessionSync';
import { Artwork, Button, ContentScroll, desktop, Dialog, Empty, Field, formatTime, IconButton, Loading, Page, Toast, TrackTable, ui } from '../desktop/ui.web';
import { SpotifyImportPage } from '../desktop/SpotifyImportPage.web';
import {
  getAudioQuality, getDefaultYtViewMode, getShowRewindButton, getShowTrackDuration,
  setAudioQuality, setDefaultYtViewMode, setShowRewindButton, setShowTrackDuration, getPoTokenServerUrl, setPoTokenServerUrl
} from '../lib/prefs';
import {
  AVATAR_EMOJIS, AVATAR_GRADIENTS, getAvatarChoice, setAvatarChoice,
  type AvatarChoice,
} from '../lib/avatarPrefs';
import {
  getProfilePlayStats, getProfileMostPlayed, getProfileRecentlyPlayed,
  type ProfilePlayEntry, type DbPlayStats,
} from '../api/plays';
import {
  acceptFriendRequest, archiveInboxItem, declineOrRemoveFriendship,
  getFriendCount, getFriendships, getInboxItems, searchProfiles,
  shareItem, publishPresence, clearPresence, sendFriendRequest, getChatMessages, type Friendship, type SharedItem
} from '../api/social';
import { clearPoTokenMemo, pingPoTokenServer } from '../api/potProvider';
import { clearStreamMemo, clearVisitorData } from '../api/ytstream';
import { APP_VERSION, BUILD_ID } from '../lib/buildInfo';
import { clearDownloadedAudioCache } from '../lib/youtubeCache';
import { supabase } from '../lib/supabase';
import { useAuth } from '../state/auth';
import { usePlayer } from '../state/player';
import { useTheme } from '../state/theme';
import type { Playlist, Track } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

const P = Pressable as any;
const V = View as any;

type PrimaryRoute = 'search' | 'songs' | 'artists' | 'playlists' | 'profile' | 'settings' | 'social' | 'now-playing';
type Route =
  | { name: PrimaryRoute }
  | { name: 'artist'; value: string }
  | { name: 'playlist'; id: string; title: string }
  | { name: 'import' }
  | { name: 'spotify-import' };

const PRIMARY: { id: PrimaryRoute; label: string; icon: keyof typeof Ionicons.glyphMap; shortcut?: string }[] = [
  { id: 'search', label: 'Search', icon: 'search-outline', shortcut: 'Ctrl+K' },
  { id: 'songs', label: 'Songs', icon: 'musical-notes-outline' },
  { id: 'artists', label: 'Artists', icon: 'mic-outline' },
  { id: 'playlists', label: 'Playlists', icon: 'albums-outline' },
  { id: 'social', label: 'Social', icon: 'people-outline' },
];

function injectDesktopDocumentStyles() {
  if (document.getElementById('duotone-desktop-css')) return;
  const style = document.createElement('style');
  style.id = 'duotone-desktop-css';
  style.textContent = `
    html,body,#root{width:100%;height:100%;margin:0;overflow:hidden;background:#060608}
    *{box-sizing:border-box} body{font-family:Inter,"Segoe UI Variable Text","Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
    ::selection{background:rgba(155,123,255,.32)} ::-webkit-scrollbar{width:11px;height:11px}
    ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:#30303b;border:3px solid transparent;border-radius:8px;background-clip:padding-box}
    ::-webkit-scrollbar-thumb:hover{background:#494857;border:3px solid transparent;background-clip:padding-box}
    [data-focusable="true"]:focus-visible{outline:2px solid var(--accent-color, #7659D4)!important;outline-offset:-2px}
    .slider-container { position: relative; }
    .slider-container:hover .slider-fill { background: var(--accent-color, #7659D4)!important; }
    .slider-thumb {
      position: absolute;
      top: 50%;
      width: 12px;
      height: 12px;
      border-radius: 6px;
      background-color: #FFF;
      transform: translate(-50%, -50%) scale(0);
      transition: transform 0.15s cubic-bezier(0.25, 0.8, 0.25, 1);
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
      pointer-events: none;
    }
    .slider-container:hover .slider-thumb {
      transform: translate(-50%, -50%) scale(1);
    }
    .glass-panel{backdrop-filter:blur(28px) saturate(140%);-webkit-backdrop-filter:blur(28px) saturate(140%);will-change:transform,filter;transform:translateZ(0)}
    @keyframes pulse {
      0% { opacity: 0.6; }
      50% { opacity: 1; }
      100% { opacity: 0.6; }
    }
    @keyframes spin-vinyl {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .vinyl-spin {
      animation: spin-vinyl var(--vinyl-duration, 15s) linear infinite;
    }
    .vinyl-container {
      transition: left 0.8s cubic-bezier(0.25, 1, 0.5, 1), transform 0.8s cubic-bezier(0.25, 1, 0.5, 1)!important;
    }
    .control-btn-animate {
      transition: transform 0.2s cubic-bezier(0.25, 0.8, 0.25, 1), background-color 0.2s, opacity 0.2s!important;
      cursor: pointer;
    }
    .control-btn-animate:hover {
      transform: scale(1.1);
    }
    .control-btn-animate:active {
      transform: scale(0.93);
    }
    .btn-animate {
      transition: transform 0.2s cubic-bezier(0.25, 0.8, 0.25, 1), background-color 0.2s, box-shadow 0.2s!important;
      cursor: pointer;
    }
    .btn-animate:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(155, 123, 255, 0.2);
    }
    .btn-animate:active {
      transform: translateY(1px) scale(0.98);
    }
    .nav-item-animate {
      transition: transform 0.2s cubic-bezier(0.25, 0.8, 0.25, 1), background-color 0.2s, opacity 0.2s!important;
      cursor: pointer;
    }
    .nav-item-animate:hover {
      transform: translateX(4px);
    }
    .nav-item-animate:active {
      transform: scale(0.97) translateX(2px);
    }
    .vinyl-paused {
      animation-play-state: paused!important;
    }
    @keyframes ambient-pulse {
      0% { transform: scale(1) translate(0px, 0px) rotate(0deg); opacity: 0.14; }
      33% { transform: scale(1.18) translate(40px, -30px) rotate(120deg); opacity: 0.22; }
      66% { transform: scale(0.88) translate(-30px, 45px) rotate(240deg); opacity: 0.10; }
      100% { transform: scale(1) translate(0px, 0px) rotate(360deg); opacity: 0.14; }
    }
    .ambient-glow {
      position: absolute;
      width: 700px;
      height: 700px;
      border-radius: 350px;
      filter: blur(120px);
      mix-blend-mode: screen;
      animation: ambient-pulse 25s ease-in-out infinite;
      pointer-events: none;
      z-index: 0;
    }
    @keyframes bounce-bar-1 {
      0%, 100% { transform: scaleY(0.2); }
      50% { transform: scaleY(0.85); }
    }
    @keyframes bounce-bar-2 {
      0%, 100% { transform: scaleY(0.35); }
      50% { transform: scaleY(0.98); }
    }
    @keyframes bounce-bar-3 {
      0%, 100% { transform: scaleY(0.15); }
      50% { transform: scaleY(0.7); }
    }
    @keyframes bounce-bar-4 {
      0%, 100% { transform: scaleY(0.4); }
      50% { transform: scaleY(0.9); }
    }
    .equalizer-bar {
      width: 3px;
      height: 100%;
      background-color: var(--accent-color, #7659D4);
      border-radius: 2px;
      transform-origin: bottom;
      transition: transform 0.15s ease;
    }
    .eq-bar-1 { animation: bounce-bar-1 1.2s ease-in-out infinite alternate; }
    .eq-bar-2 { animation: bounce-bar-2 0.8s ease-in-out infinite alternate; }
    .eq-bar-3 { animation: bounce-bar-3 1.4s ease-in-out infinite alternate; }
    .eq-bar-4 { animation: bounce-bar-4 1.0s ease-in-out infinite alternate; }
    .eq-paused { animation: none!important; transform: scaleY(0.15); }
    
    /* 3D Visualizer Overhauls */
    .visualizer-perspective {
      perspective: 1200px;
      transform-style: preserve-3d;
    }
    .artwork-card {
      transform: rotateY(-14deg) rotateX(6deg);
      transform-style: preserve-3d;
      transition: transform 0.6s cubic-bezier(0.25, 0.8, 0.25, 1), box-shadow 0.4s ease;
      box-shadow: 0 15px 35px rgba(0, 0, 0, 0.6);
    }
    .artwork-card:hover {
      transform: rotateY(-3deg) rotateX(3deg) scale(1.04);
      box-shadow: 0 25px 50px rgba(0, 0, 0, 0.8);
    }
    .vinyl-grooves {
      background: radial-gradient(circle, #222 10%, #111 11%, #15151b 20%, #111 21%, #181822 30%, #111 31%, #1a1a24 40%, #111 41%, #1e1e28 50%, #111 51%, #222 60%, #111 61%, #252530 70%, #111 71%, #2a2a38 80%, #111 81%, #2f2f3d 90%, #111 91%, #333 100%)!important;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), inset 0 0 15px rgba(0,0,0,0.8);
      transform: rotateY(-14deg) rotateX(6deg) translateZ(-10px);
      transform-style: preserve-3d;
    }
    .vinyl-shine {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      border-radius: 50%;
      background: conic-gradient(
        from 0deg,
        transparent 0deg,
        rgba(255,255,255,0.06) 45deg,
        transparent 90deg,
        rgba(255,255,255,0.06) 135deg,
        transparent 180deg,
        rgba(255,255,255,0.06) 225deg,
        transparent 270deg,
        rgba(255,255,255,0.06) 315deg,
        transparent 360deg
      );
      pointer-events: none;
    }
    .premium-card {
      transition: border-color 0.25s, background-color 0.25s, transform 0.25s;
    }
    .premium-card:hover {
      border-color: rgba(255, 255, 255, 0.12)!important;
      background-color: rgba(255, 255, 255, 0.04)!important;
      transform: translateY(-2px);
    }
    .now-playing-queue-row-web {
      border: 1px solid transparent;
      transition: border-color 0.2s, background-color 0.2s, transform 0.2s;
    }
    .now-playing-queue-row-web:hover {
      background-color: rgba(255, 255, 255, 0.06)!important;
      border-color: rgba(255, 255, 255, 0.1)!important;
      transform: translateY(-1px);
    }
    .now-playing-queue-row-web:active {
      cursor: grabbing;
    }
  `;
  document.head.appendChild(style);
  document.title = 'Duotone';
}

function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const bridge = window.duotoneDesktop;
    bridge?.isMaximized().then(setMaximized);
    return bridge?.onMaximizedChange(setMaximized);
  }, []);
  return <View style={styles.titleBar as any} onDoubleClick={() => window.duotoneDesktop?.toggleMaximize()}>
    <View style={styles.titleBrand}><Image source={require('../../assets/auth-logo.png')} style={{ width: 22, height: 22 }} resizeMode="contain" /><Text style={styles.titleText}>Duotone</Text></View>
    <View style={styles.dragRegion as any} />
    <View style={styles.windowButtons as any}>
      <Pressable accessibilityLabel="Minimize" onPress={() => window.duotoneDesktop?.minimize()} style={({ hovered }) => [styles.windowButton, hovered && styles.windowButtonHover]}><Ionicons name="remove-outline" size={17} color={desktop.muted} /></Pressable>
      <Pressable accessibilityLabel={maximized ? 'Restore' : 'Maximize'} onPress={() => window.duotoneDesktop?.toggleMaximize()} style={({ hovered }) => [styles.windowButton, hovered && styles.windowButtonHover]}><Ionicons name={maximized ? 'copy-outline' : 'square-outline'} size={13} color={desktop.muted} /></Pressable>
      <Pressable accessibilityLabel="Close" onPress={() => window.duotoneDesktop?.close()} style={({ hovered }) => [styles.windowButton, hovered && styles.closeHover]}><Ionicons name="close-outline" size={20} color={desktop.muted} /></Pressable>
    </View>
  </View>;
}

function Sidebar({ route, navigate }: { route: Route; navigate: (route: Route) => void }) {
  const session = useAuth((s) => s.session);
  const active = route.name === 'artist' ? 'artists' : route.name === 'playlist' || route.name === 'import' ? 'playlists' : route.name;

  const [name, setName] = useState('Profile');
  const [avatar, setAvatar] = useState<AvatarChoice>({ emoji: '🎧', gradientIndex: 0 });
  const [hasSocialNotification, setHasSocialNotification] = useState(false);

  useEffect(() => {
    if (!session) return;
    
    // 1) Set initial values from cached session
    const currentName = (session?.user.user_metadata?.username as string | undefined) || (session?.user.user_metadata?.name as string | undefined) || session?.user.email?.split('@')[0] || 'Profile';
    setName(currentName);
    
    const userMeta = session?.user?.user_metadata;
    setAvatar({
      emoji: userMeta?.avatar_emoji || '🎧',
      gradientIndex: Number(userMeta?.avatar_gradient ?? 0),
      avatarUrl: userMeta?.avatar_url && !userMeta.avatar_url.startsWith('emoji:') ? userMeta.avatar_url : undefined
    });

    // 2) Asynchronously fetch fresh data from Supabase DB to sync with mobile
    const refreshProfile = async () => {
      const freshAvatar = await getAvatarChoice();
      setAvatar(freshAvatar);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: dbProf } = await supabase.from('profiles').select('name, username').eq('id', user.id).maybeSingle();
        const freshName = dbProf?.username || dbProf?.name || user.user_metadata?.username || user.user_metadata?.name || user.email?.split('@')[0] || 'Profile';
        setName(freshName);
      }
    };
    refreshProfile();
    window.addEventListener('duotone:refresh-profile', refreshProfile);

    // 3) Check inbox notification badge
    getInboxItems().then((items) => {
      setHasSocialNotification(items.length > 0);
    }).catch(() => {});
    const interval = setInterval(() => {
      getInboxItems().then((items) => {
        setHasSocialNotification(items.length > 0);
      }).catch(() => {});
    }, 10000);
    return () => {
      clearInterval(interval);
      window.removeEventListener('duotone:refresh-profile', refreshProfile);
    };
  }, [session]);

  const avatarEmoji = avatar.emoji || '🎧';
  const avatarGradientIdx = avatar.gradientIndex ?? 0;
  const avatarUrl = avatar.avatarUrl;
  const cleanAvatarUrl = avatarUrl && !avatarUrl.startsWith('emoji:') ? avatarUrl : undefined;
  const colorsPair = AVATAR_GRADIENTS[avatarGradientIdx] || AVATAR_GRADIENTS[0];

  const avatarDisplay = cleanAvatarUrl ? (
    <Image source={{ uri: cleanAvatarUrl }} style={{ width: 31, height: 31, borderRadius: 9 }} />
  ) : (
    <View style={[styles.avatar, { backgroundImage: `linear-gradient(135deg, ${colorsPair[0]}, ${colorsPair[1]})` } as any]}>
      <Text style={{ fontSize: 13 }}>{avatarEmoji}</Text>
    </View>
  );

  return <View style={styles.sidebar}>
    <ScrollView contentContainerStyle={styles.sidebarContent}>
      <Text style={styles.navLabel}>DISCOVER</Text>
      {PRIMARY.map((item) => <NavItem key={item.id} active={active === item.id} {...item} badge={item.id === 'social' && hasSocialNotification} onPress={() => navigate({ name: item.id })} />)}
      <View style={styles.navDivider} /><Text style={styles.navLabel}>ACCOUNT</Text>
      <NavItem label="Profile" icon="person-circle-outline" active={active === 'profile'} onPress={() => navigate({ name: 'profile' })} />
      <NavItem label="Settings" icon="settings-outline" active={active === 'settings'} onPress={() => navigate({ name: 'settings' })} />
    </ScrollView>
    <Pressable onPress={() => navigate({ name: 'profile' })} style={({ hovered }) => [styles.account, hovered && styles.navHover]}>{avatarDisplay}<View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.accountName}>{name}</Text><Text numberOfLines={1} style={styles.accountEmail}>{session?.user.email}</Text></View><Ionicons name="chevron-forward" size={14} color={desktop.dim} /></Pressable>
  </View>;
}

function NavItem({ label, icon, active, shortcut, badge, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; active: boolean; shortcut?: string; badge?: boolean; onPress: () => void }) {
  const theme = useTheme((s) => s.theme);
  const P = Pressable as any;
  return <P className="nav-item-animate" onPress={onPress} style={({ hovered, focused, pressed }: any) => [styles.navItem, (hovered || focused) && styles.navHover, active && { backgroundColor: theme.soft }, pressed && ui.pressed]}><Ionicons name={icon} size={19} color={active ? theme.color : desktop.muted} /><Text style={[styles.navText, active && styles.navTextActive, active && { color: theme.color }]}>{label}</Text>{badge && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', marginRight: 4 }} />}{shortcut && <Text style={styles.shortcut}>{shortcut}</Text>}</P>;
}

function AuthDesktop() {
  const signIn = useAuth((s) => s.signIn); const signUp = useAuth((s) => s.signUp);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin'); const [identifier, setIdentifier] = useState(''); const [email, setEmail] = useState(''); const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const submit = async () => { setBusy(true); setError(null); const message = mode === 'signin' ? await signIn(identifier, password) : await signUp(email, password, username); setError(message); setBusy(false); };
  return <View style={styles.auth}><View style={styles.authGlow} /><View style={styles.authCard}><View style={[styles.authLogo, { alignItems: 'center', gap: 12, flexDirection: 'row' }]}><Image source={require('../../assets/auth-logo.png')} style={{ width: 44, height: 44 }} resizeMode="contain" /></View><Text style={styles.authTitle}>Your music, in one place.</Text><Text style={styles.authBody}>Sign in to your Duotone library and continue listening across devices.</Text><View style={styles.segment}><Pressable onPress={() => setMode('signin')} style={[styles.segmentItem, mode === 'signin' && styles.segmentActive]}><Text style={styles.segmentText}>Sign in</Text></Pressable><Pressable onPress={() => setMode('signup')} style={[styles.segmentItem, mode === 'signup' && styles.segmentActive]}><Text style={styles.segmentText}>Create account</Text></Pressable></View>
    <View style={{ gap: 12 }}>{mode === 'signin' ? <Field icon="person-outline" placeholder="Email or username" value={identifier} onChangeText={setIdentifier} onSubmitEditing={submit} /> : <><Field icon="person-outline" placeholder="Username" value={username} onChangeText={setUsername} /><Field icon="mail-outline" placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" /></>}<Field icon="lock-closed-outline" placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry onSubmitEditing={submit} />{error && <Text style={styles.error}>{error}</Text>}<Button onPress={submit} disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</Button></View></View><Text style={styles.authFoot}>Duotone for Windows</Text></View>;
}

function useLibraryData() {
  const [tracks, setTracks] = useState<Track[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => { setLoading(true); try { setTracks(await getLibrary()); setError(null); } catch (e: any) { setError(e?.message || 'Could not load your library.'); } finally { setLoading(false); } }, []);
  useEffect(() => {
    refresh();
    window.addEventListener('duotone:refresh-library', refresh);
    return () => window.removeEventListener('duotone:refresh-library', refresh);
  }, [refresh]);
  return { tracks, loading, error, refresh };
}

function SearchPage({ play, notify, more }: CommonPageProps) {
  const [query, setQuery] = useState(''); const [results, setResults] = useState<Track[]>([]); const [history, setHistory] = useState<string[]>([]); const [loading, setLoading] = useState(false); const input = useRef<any>(null);
  useEffect(() => { getSearchHistory().then(setHistory); const focus = () => input.current?.focus(); window.addEventListener('duotone:focus-search', focus); return () => window.removeEventListener('duotone:focus-search', focus); }, []);
  const run = async (q = query) => { const clean = q.trim(); if (!clean) return; setQuery(clean); setLoading(true); try { const [items, next] = await Promise.all([searchYouTube(clean), addSearchHistoryEntry(clean)]); setResults(items); setHistory(next); } catch (e: any) { notify(e?.message || 'Search failed.'); } finally { setLoading(false); } };
  return <Page title="Search" subtitle="Search YouTube and add music to your Duotone library."><View style={styles.searchBar}><Field ref={input} icon="search" placeholder="Search songs, artists, or videos" value={query} onChangeText={setQuery} onSubmitEditing={() => run()} /><Button onPress={() => run()}>Search</Button></View>
    {!results.length && !loading && history.length > 0 && <View style={styles.history}><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Recent searches</Text><Pressable onPress={async () => { await clearSearchHistory(); setHistory([]); }}><Text style={styles.textAction}>Clear</Text></Pressable></View><View style={styles.chips}>{history.map((item) => <Pressable key={item} onPress={() => run(item)} style={({ hovered }) => [styles.chip, hovered && styles.chipHover]}><Ionicons name="time-outline" size={14} color={desktop.dim} /><Text style={styles.chipText}>{item}</Text></Pressable>)}</View></View>}
    <ContentScroll>{loading ? <View style={{ height: 320 }}><Loading /></View> : <TrackTable tracks={results} onPlay={(t) => play(t, results)} onMore={more} empty={<Empty icon="search-outline" title="Find something to play" body="Search the complete YouTube catalogue. Results appear here in a desktop-friendly table." />} />}</ContentScroll></Page>;
}

interface CommonPageProps { play: (track: Track, queue?: Track[]) => void; notify: (message: string) => void; more: (track: Track) => void; }

function SongsPage(props: CommonPageProps) {
  const data = useLibraryData();
  const [query, setQuery] = useState('');

  const filteredTracks = useMemo(() => {
    if (!query.trim()) return data.tracks;
    const q = query.toLowerCase();
    return data.tracks.filter(t => 
      t.title.toLowerCase().includes(q) || 
      (t.artist && t.artist.toLowerCase().includes(q))
    );
  }, [data.tracks, query]);

  const playAll = (shuffle = false) => {
    if (!filteredTracks.length) return;
    let list = [...filteredTracks];
    if (shuffle) list.sort(() => Math.random() - 0.5);
    props.play(list[0], list);
  };

  return <Page title="Songs" subtitle={`${data.tracks.length} saved ${data.tracks.length === 1 ? 'song' : 'songs'}`} action={<View style={{ flexDirection: 'row', gap: 8 }}><Button icon="play" onPress={() => playAll(false)}>Play</Button><Button secondary icon="shuffle" onPress={() => playAll(true)}>Shuffle</Button><Button secondary icon="refresh" onPress={data.refresh}>Refresh</Button></View>}><View style={styles.searchBar}><Field icon="search" placeholder="Search saved songs..." value={query} onChangeText={setQuery} /></View><ContentScroll>{data.loading ? <View style={{ height: 350 }}><Loading /></View> : <TrackTable tracks={filteredTracks} onPlay={(t) => props.play(t, filteredTracks)} onMore={props.more} empty={query ? <Empty icon="search-outline" title="No results found" body={`No saved songs match "${query}"`} /> : <Empty icon="musical-notes-outline" title="Your library is quiet" body="Save tracks from Search and they will be organised here." />} />}</ContentScroll></Page>;
}

function ArtistsPage({ navigate }: { navigate: (route: Route) => void }) {
  const data = useLibraryData();
  const artists = useMemo(() => { const map = new Map<string, Track[]>(); data.tracks.forEach((t) => { const key = displayArtist(t); map.set(key, [...(map.get(key) || []), t]); }); return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])); }, [data.tracks]);
  return <Page title="Artists" subtitle={`${artists.length} artists in your library`}><ContentScroll>{data.loading ? <View style={{ height: 350 }}><Loading /></View> : artists.length ? <View style={styles.cardGrid}>{artists.map(([name, tracks]) => <Pressable key={name} onPress={() => navigate({ name: 'artist', value: name })} style={({ hovered, focused }) => [styles.mediaCard, (hovered || focused) && styles.cardHover]}><Artwork track={tracks[0]} size={138} /><Text numberOfLines={1} style={styles.cardTitle}>{name}</Text><Text style={styles.cardMeta}>{tracks.length} {tracks.length === 1 ? 'song' : 'songs'}</Text></Pressable>)}</View> : <Empty icon="people-outline" title="No artists yet" body="Artists are collected automatically from the tracks in your library." />}</ContentScroll></Page>;
}

function ArtistPage({ name, back, ...props }: { name: string; back: () => void } & CommonPageProps) {
  const data = useLibraryData(); const tracks = data.tracks.filter((t) => displayArtist(t) === name);
  return <Page title={name} subtitle={`${tracks.length} saved ${tracks.length === 1 ? 'song' : 'songs'}`} action={<Button secondary icon="arrow-back" onPress={back}>Back to artists</Button>}><ContentScroll>{data.loading ? <View style={{ height: 350 }}><Loading /></View> : <TrackTable tracks={tracks} onPlay={(t) => props.play(t, tracks)} onMore={props.more} />}</ContentScroll></Page>;
}

function PlaylistsPage({ navigate, notify }: { navigate: (route: Route) => void; notify: (s: string) => void }) {
  const [items, setItems] = useState<Playlist[]>([]); const [loading, setLoading] = useState(true); const [createOpen, setCreateOpen] = useState(false); const [name, setName] = useState('');
  const refresh = useCallback(async () => { setLoading(true); try { setItems(await listPlaylists()); } catch (e: any) { notify(e?.message || 'Could not load playlists.'); } finally { setLoading(false); } }, [notify]);
  useEffect(() => {
    refresh();
    window.addEventListener('duotone:refresh-playlists', refresh);
    return () => window.removeEventListener('duotone:refresh-playlists', refresh);
  }, [refresh]);
  const create = async () => { if (!name.trim()) return; try { const item = await createPlaylist(name.trim()); setCreateOpen(false); setName(''); navigate({ name: 'playlist', id: item.id, title: item.name }); } catch (e: any) { notify(e?.message || 'Could not create playlist.'); } };
  return <><Page title="Playlists" subtitle="Build collections for any moment." action={<View style={{ flexDirection: 'row', gap: 10 }}><Button secondary icon="logo-youtube" onPress={() => navigate({ name: 'import' })}>YouTube</Button><Button secondary iconNode={<Image source={require('../../assets/spotify.png')} style={{ width: 16, height: 16 }} />} onPress={() => navigate({ name: 'spotify-import' })}>Spotify</Button><Button icon="add" onPress={() => setCreateOpen(true)}>New playlist</Button></View>}><ContentScroll>{loading ? <View style={{ height: 350 }}><Loading /></View> : items.length ? <View style={styles.playlistGrid}>{items.map((item) => <Pressable key={item.id} onPress={() => navigate({ name: 'playlist', id: item.id, title: item.name })} style={({ hovered, focused }) => [styles.playlistCard, (hovered || focused) && styles.cardHover]}><View style={styles.playlistArt}>{item.artworks[0] ? <Image source={{ uri: item.artworks[0] }} style={StyleSheet.absoluteFill} /> : <Ionicons name="musical-notes" size={36} color={desktop.dim} />}</View><Text numberOfLines={1} style={styles.cardTitle}>{item.name}</Text><Text style={styles.cardMeta}>{item.trackCount} {item.trackCount === 1 ? 'track' : 'tracks'}</Text></Pressable>)}</View> : <Empty icon="albums-outline" title="Create your first playlist" body="Group tracks into focused collections, or import an existing YouTube playlist." action={<Button onPress={() => setCreateOpen(true)}>New playlist</Button>} />}</ContentScroll></Page><Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="New playlist"><Field autoFocus placeholder="Playlist name" value={name} onChangeText={setName} onSubmitEditing={create} /><View style={styles.dialogActions}><Button secondary onPress={() => setCreateOpen(false)}>Cancel</Button><Button onPress={create}>Create</Button></View></Dialog></>;
}

function PlaylistPage({ id, title, back, ...props }: { id: string; title: string; back: () => void } & CommonPageProps) {
  const [tracks, setTracks] = useState<Track[]>([]); const [loading, setLoading] = useState(true); const [confirm, setConfirm] = useState(false);
  const [playlistTitle, setPlaylistTitle] = useState(title);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameVal, setRenameVal] = useState(title);
  const [query, setQuery] = useState('');

  useEffect(() => {
    setPlaylistTitle(title);
    setRenameVal(title);
  }, [title]);

  const refresh = useCallback(async () => { setLoading(true); try { setTracks(await getPlaylistTracks(id)); } catch (e: any) { props.notify(e?.message || 'Could not load playlist.'); } finally { setLoading(false); } }, [id, props.notify]);
  useEffect(() => { refresh(); }, [refresh]);
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

  const playAll = (shuffle = false) => {
    if (!filteredTracks.length) return;
    let list = [...filteredTracks];
    if (shuffle) list.sort(() => Math.random() - 0.5);
    props.play(list[0], list);
  };
  return <><Page title={playlistTitle} subtitle={`${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'}`} action={<View style={{ flexDirection: 'row', gap: 8 }}><Button icon="play" onPress={() => playAll(false)}>Play</Button><Button secondary icon="shuffle" onPress={() => playAll(true)}>Shuffle</Button><Button secondary icon="arrow-back" onPress={back}>Playlists</Button><IconButton name="pencil-outline" label="Rename playlist" onPress={() => { setRenameVal(playlistTitle); setRenameOpen(true); }} /><IconButton name="trash-outline" label="Delete playlist" onPress={() => setConfirm(true)} /></View>}><View style={styles.searchBar}><Field icon="search" placeholder="Search tracks in playlist..." value={query} onChangeText={setQuery} /></View><ContentScroll>{loading ? <View style={{ height: 350 }}><Loading /></View> : <TrackTable tracks={filteredTracks} onPlay={(t) => props.play(t, filteredTracks)} onMore={props.more} empty={query ? <Empty icon="search-outline" title="No results found" body={`No playlist tracks match "${query}"`} /> : <Empty icon="add-circle-outline" title="This playlist is empty" body="Use track actions from Search or Songs to add music here." />} />}</ContentScroll></Page><Dialog open={confirm} title="Delete playlist?" onClose={() => setConfirm(false)}><Text style={styles.dialogBody}>“{playlistTitle}” will be deleted. Tracks in your library will not be affected.</Text><View style={styles.dialogActions}><Button secondary onPress={() => setConfirm(false)}>Cancel</Button><Button danger onPress={remove}>Delete</Button></View></Dialog><Dialog open={renameOpen} title="Rename playlist" onClose={() => setRenameOpen(false)}><View style={{ paddingBottom: 16 }}><Field autoFocus placeholder="Playlist name" value={renameVal} onChangeText={setRenameVal} onSubmitEditing={doRename} /></View><View style={styles.dialogActions}><Button secondary onPress={() => setRenameOpen(false)}>Cancel</Button><Button onPress={doRename} disabled={!renameVal.trim()}>Save</Button></View></Dialog></>;
}

function ImportPage({ back, notify }: { back: () => void; notify: (s: string) => void }) {
  const [url, setUrl] = useState(''); const [loading, setLoading] = useState(false); const [preview, setPreview] = useState<any>(null); const [playlists, setPlaylists] = useState<Playlist[]>([]); const [target, setTarget] = useState<string>('');
  const [newPlName, setNewPlName] = useState(''); const [creatingNew, setCreatingNew] = useState(false);
  const theme = useTheme((s) => s.theme);
  const refreshPlaylists = () => { listPlaylists().then((p) => { setPlaylists(p); if (p.length && !target) setTarget(p[0].id); }); };
  useEffect(() => { refreshPlaylists(); }, []);
  const inspect = async () => { setLoading(true); try { setPreview(await fetchYouTubePlaylist(url)); } catch (e: any) { notify(e?.message || 'Could not read playlist.'); } finally { setLoading(false); } };
  const runImport = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      let finalTarget = target;
      if (creatingNew && newPlName.trim()) {
        const newPl = await createPlaylist(newPlName.trim());
        finalTarget = newPl.id;
      }
      if (!finalTarget) throw new Error('Please select or create a destination playlist.');
      await addTracksToPlaylist(finalTarget, preview.items.map((x: any) => ({ source: 'youtube', sourceId: x.videoId, title: x.title, artist: x.channel || null, album: null, artworkUrl: x.thumbnail, durationSeconds: null })));
      notify(`Imported ${preview.items.length} tracks.`);
      back();
    } catch (e: any) {
      notify(e?.message || 'Import failed.');
    } finally {
      setLoading(false);
    }
  };
  return <Page title="Import from YouTube" subtitle="Bring an existing playlist into your Duotone collection." action={<Button secondary icon="arrow-back" onPress={back}>Playlists</Button>}><ContentScroll><View style={styles.importPanel}><Text style={styles.formLabel}>YOUTUBE PLAYLIST URL</Text><View style={styles.searchBar}><Field icon="logo-youtube" placeholder="https://youtube.com/playlist?list=…" value={url} onChangeText={setUrl} onSubmitEditing={inspect} /><Button onPress={inspect} disabled={loading}>Preview</Button></View>{preview && <><View style={styles.importSummary}><View><Text style={styles.sectionTitle}>{preview.title}</Text><Text style={styles.cardMeta}>{preview.items.length} available tracks</Text></View></View><Text style={styles.formLabel}>DESTINATION</Text><View style={styles.destinationGrid}><Pressable onPress={() => setCreatingNew(false)} style={[styles.destination, !creatingNew && { backgroundColor: theme.soft, borderColor: theme.color }]}><Ionicons name={!creatingNew ? 'radio-button-on' : 'radio-button-off'} color={!creatingNew ? theme.color : desktop.dim} size={18} /><Text style={styles.destinationText}>Select existing playlist:</Text></Pressable>{!creatingNew && playlists.map((p) => <Pressable key={p.id} onPress={() => setTarget(p.id)} style={[styles.destination, target === p.id && { marginLeft: 16, borderColor: theme.color }]}><Ionicons name={target === p.id ? 'checkmark-circle' : 'ellipse-outline'} color={target === p.id ? theme.color : desktop.dim} size={16} /><Text style={styles.destinationText}>{p.name}</Text></Pressable>)}<Pressable onPress={() => setCreatingNew(true)} style={[styles.destination, creatingNew && { backgroundColor: theme.soft, borderColor: theme.color }]}><Ionicons name={creatingNew ? 'radio-button-on' : 'radio-button-off'} color={creatingNew ? theme.color : desktop.dim} size={18} /><Text style={styles.destinationText}>Or create a new playlist:</Text></Pressable>{creatingNew && <View style={{ marginLeft: 16, marginTop: 4, width: '100%', maxWidth: 400 }}><Field placeholder="New playlist name" value={newPlName} onChangeText={setNewPlName} /></View>}</View><View style={styles.dialogActions}><Button onPress={runImport} disabled={loading || (creatingNew && !newPlName.trim()) || (!creatingNew && !target)}>Import {preview.items.length} tracks</Button></View></>}</View></ContentScroll></Page>;
}

function playEntryToTrack(entry: ProfilePlayEntry): Track {
  return { id: entry.id, source: entry.source, sourceId: entry.sourceId, title: entry.title, artist: entry.artist, album: null, artworkUrl: entry.artworkUrl, durationSeconds: entry.durationSeconds };
}

function memberSince(iso?: string): string {
  if (!iso) return 'Member';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'Member' : `Member since ${date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
}

function ProfilePage({ navigate, notify }: { navigate: (r: Route) => void; notify: (s: string) => void }) {
  const session = useAuth((s) => s.session); const updateName = useAuth((s) => s.updateName); const signOut = useAuth((s) => s.signOut); const resetPassword = useAuth((s) => s.resetPassword);
  const currentName = (session?.user.user_metadata?.username as string | undefined) || (session?.user.user_metadata?.name as string | undefined) || session?.user.email?.split('@')[0] || 'Listener';
  const [name, setName] = useState(currentName);
  const [dbName, setDbName] = useState(currentName);
  const [editing, setEditing] = useState(false);
  const [avatar, setAvatar] = useState<AvatarChoice>({ emoji: AVATAR_EMOJIS[0], gradientIndex: 0 }); const [avatarOpen, setAvatarOpen] = useState(false); const [stats, setStats] = useState<DbPlayStats | null>(null); const [mostPlayed, setMostPlayed] = useState<ProfilePlayEntry[]>([]); const [recent, setRecent] = useState<ProfilePlayEntry[]>([]); const [friendCount, setFriendCount] = useState(0); const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let avChoice: AvatarChoice = { emoji: AVATAR_EMOJIS[0], gradientIndex: 0 };
      let nameVal = currentName;
      if (user) {
        const { data: dbProf } = await supabase.from('profiles').select('name, username, avatar_url').eq('id', user.id).maybeSingle();
        if (dbProf) {
          nameVal = dbProf.username || dbProf.name || currentName;
          if (dbProf.avatar_url) {
            if (dbProf.avatar_url.startsWith('emoji:')) {
              const parts = dbProf.avatar_url.split(':');
              avChoice = { emoji: parts[1] || AVATAR_EMOJIS[0], gradientIndex: Number(parts[2]) || 0 };
            } else {
              avChoice = { avatarUrl: dbProf.avatar_url };
            }
          } else {
            avChoice = await getAvatarChoice();
          }
        } else {
          avChoice = await getAvatarChoice();
        }
      } else {
        avChoice = await getAvatarChoice();
      }

      const [s, m, r, f] = await Promise.all([getProfilePlayStats(), getProfileMostPlayed(20), getProfileRecentlyPlayed(12), getFriendCount()]);
      setAvatar(avChoice);
      setStats(s);
      setMostPlayed(m);
      setRecent(r);
      setFriendCount(f);
      setName(nameVal);
      setDbName(nameVal);
    } catch (err) {
      console.warn(err);
    }
  }, [currentName]);

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
    window.addEventListener('duotone:refresh-profile', loadData);
    return () => window.removeEventListener('duotone:refresh-profile', loadData);
  }, [loadData]);

  const save = async () => {
    const e = await updateName(name);
    if (e) notify(e);
    else {
      setDbName(name);
      setEditing(false);
      notify('Profile updated.');
      window.dispatchEvent(new Event('duotone:refresh-profile'));
    }
  };

  const saveAvatar = async (choice: AvatarChoice) => {
    setAvatar(choice);
    await setAvatarChoice(choice);
    window.dispatchEvent(new Event('duotone:refresh-profile'));
  };

  const playHistory = (entry: ProfilePlayEntry) => usePlayer.getState().playTrack(playEntryToTrack(entry), mostPlayed.map(playEntryToTrack));
  const avatarUrl = avatar.avatarUrl;
  const cleanAvatarUrl = avatarUrl && !avatarUrl.startsWith('emoji:') ? avatarUrl : undefined;

  const profileAvatarDisplay = cleanAvatarUrl ? (
    <Image source={{ uri: cleanAvatarUrl }} style={{ width: 96, height: 96, borderRadius: 30 }} />
  ) : (
    <View style={[styles.profileAvatar, { backgroundImage: `linear-gradient(135deg, ${AVATAR_GRADIENTS[avatar.gradientIndex ?? 0][0]}, ${AVATAR_GRADIENTS[avatar.gradientIndex ?? 0][1]})` } as any]}><Text style={styles.profileEmoji}>{avatar.emoji}</Text></View>
  );

  return <Page title="Profile" subtitle="Your account and listening history." action={<Button secondary icon="settings-outline" onPress={() => navigate({ name: 'settings' })}>Settings</Button>}><ContentScroll>{loading ? <View style={{ height: 350 }}><Loading /></View> : <><View style={styles.profileHero}><Pressable onPress={() => setAvatarOpen(true)} style={({ hovered }) => [styles.profileAvatarWrap, hovered && styles.profileAvatarHover]}>{profileAvatarDisplay}<View style={styles.profileAvatarEdit}><Ionicons name="pencil" size={12} color={desktop.text} /></View></Pressable><View style={{ flex: 1 }}><View style={styles.profileNameRow}><Text style={styles.profileName}>{dbName}</Text><IconButton name="pencil-outline" label="Edit username" onPress={() => setEditing(true)} /></View><Text style={styles.profileEmail}>{session?.user.email}</Text><Text style={styles.profileSince}>{memberSince(session?.user.created_at)}</Text></View><View style={styles.profileActions}><Button secondary icon="key-outline" onPress={async () => { const e = await resetPassword(); notify(e || 'Password reset email sent.'); }}>Reset password</Button><Button secondary icon="log-out-outline" onPress={() => signOut()}>Sign out</Button></View></View>
    <View style={styles.profileStats}><ProfileStat icon="play" label="TOTAL PLAYS" value={String(stats?.totalPlays || 0)} /><ProfileStat icon="musical-notes" label="UNIQUE TRACKS" value={String(stats?.uniqueTracks || 0)} /><ProfileStat icon="people" label="FRIENDS" value={String(friendCount)} /><ProfileStat icon="person" label="TOP ARTIST" value={stats?.topArtist?.name || '—'} wide /></View>
    <View style={styles.profileColumns}><View style={styles.profileSection}><View style={styles.profileSectionHead}><View><Text style={styles.profileSectionEyebrow}>LISTENING INSIGHTS</Text><Text style={styles.profileSectionTitle}>Most played</Text></View><Text style={styles.profileSectionMeta}>{mostPlayed.length} tracks</Text></View><ProfileHistory entries={mostPlayed} ranked onPlay={playHistory} empty="Play some music and your favourites will appear here." /></View><View style={styles.profileSection}><View style={styles.profileSectionHead}><View><Text style={styles.profileSectionEyebrow}>HISTORY</Text><Text style={styles.profileSectionTitle}>Recently played</Text></View></View><ProfileHistory entries={recent} onPlay={playHistory} empty="Your recent listening history will appear here." /></View></View></>}</ContentScroll>
    <Dialog open={editing} title="Edit profile" onClose={() => setEditing(false)}><Text style={styles.formLabel}>USERNAME</Text><Field autoFocus maxLength={24} value={name} onChangeText={setName} onSubmitEditing={save} /><View style={styles.dialogActions}><Button secondary onPress={() => setEditing(false)}>Cancel</Button><Button onPress={save}>Save changes</Button></View></Dialog>
    <AvatarDialog open={avatarOpen} value={avatar} onChange={saveAvatar} onClose={() => setAvatarOpen(false)} />
  </Page>;
}

function ProfileStat({ icon, label, value, wide = false }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; wide?: boolean }) { return <View style={[styles.profileStat, wide && { flex: 1.5 }]}><View style={styles.profileStatIcon}><Ionicons name={icon} size={17} color={desktop.accent} /></View><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={[styles.profileStatValue, wide && { fontSize: 17 }]}>{value}</Text><Text style={styles.profileStatLabel}>{label}</Text></View></View>; }

function ProfileHistory({ entries, ranked = false, onPlay, empty }: { entries: ProfilePlayEntry[]; ranked?: boolean; onPlay: (entry: ProfilePlayEntry) => void; empty: string }) {
  if (!entries.length) return <View style={styles.profileHistoryEmpty}><Ionicons name="musical-notes-outline" size={24} color={desktop.dim} /><Text style={styles.profileHistoryEmptyText}>{empty}</Text></View>;
  return <View style={styles.profileHistory}>{entries.map((entry, index) => <Pressable key={`${ranked ? 'm' : 'r'}:${entry.source}:${entry.sourceId}`} onPress={() => onPlay(entry)} style={({ hovered, focused }) => [styles.profileHistoryRow, (hovered || focused) && styles.profileHistoryHover]}>{ranked && <Text style={styles.profileRank}>{index + 1}</Text>}<Artwork track={playEntryToTrack(entry)} size={42} /><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={styles.profileTrackTitle}>{entry.title}</Text><Text numberOfLines={1} style={styles.profileTrackArtist}>{entry.artist || 'YouTube'}</Text></View>{ranked ? <View style={styles.profileCount}><Ionicons name="play" size={9} color={desktop.muted} /><Text style={styles.profileCountText}>{entry.count}</Text></View> : null}</Pressable>)}</View>;
}

function relativeTime(timestamp: number): string { const delta = Date.now() - timestamp; const mins = Math.floor(delta / 60000); if (mins < 1) return 'Now'; if (mins < 60) return `${mins}m`; const hours = Math.floor(mins / 60); if (hours < 24) return `${hours}h`; return `${Math.floor(hours / 24)}d`; }

function AvatarDialog({ open, value, onChange, onClose }: { open: boolean; value: AvatarChoice; onChange: (value: AvatarChoice) => void; onClose: () => void }) {
  const gradient = AVATAR_GRADIENTS[value.gradientIndex ?? 0];
  return <Dialog open={open} title="Your avatar" onClose={onClose} width={510}><View style={[styles.avatarPreview, { backgroundImage: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` } as any]}><Text style={styles.avatarPreviewEmoji}>{value.emoji}</Text></View><Text style={styles.formLabel}>COLOUR</Text><View style={styles.avatarSwatches}>{AVATAR_GRADIENTS.map((pair, index) => <Pressable key={pair.join('-')} accessibilityLabel={`Colour ${index + 1}`} onPress={() => onChange({ ...value, gradientIndex: index })} style={[styles.avatarSwatchOuter, (value.gradientIndex ?? 0) === index && styles.avatarSwatchSelected]}><View style={[styles.avatarSwatch, { backgroundImage: `linear-gradient(135deg, ${pair[0]}, ${pair[1]})` } as any]} /></Pressable>)}</View><Text style={[styles.formLabel, { marginTop: 20 }]}>EMOJI</Text><View style={styles.avatarEmojiGrid}>{AVATAR_EMOJIS.map((emoji) => <Pressable key={emoji} onPress={() => onChange({ ...value, emoji })} style={({ hovered }) => [styles.avatarEmojiCell, hovered && styles.settingHover, value.emoji === emoji && styles.avatarEmojiSelected]}><Text style={styles.avatarEmojiText}>{emoji}</Text></Pressable>)}</View><View style={styles.dialogActions}><Button onPress={onClose}>Done</Button></View></Dialog>;
}

function SettingsPage({ notify }: { notify: (s: string) => void }) {
  const [duration, setDurationState] = useState(true);
  const [rewind, setRewindState] = useState(false);
  const [quality, setQualityState] = useState<'high' | 'saver'>('high');
  const [view, setViewState] = useState<'video' | 'photo'>('video');
   const [opacity, setOpacity] = useState('0.72');
  const [potUrl, setPotUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const [flowFocus, setFlowFocus] = useState(false);
  const [vinylSpeed, setVinylSpeed] = useState('33');
  const [glowIntensity, setGlowIntensity] = useState('medium');

  const themeName = useTheme((s) => s.themeName);
  const setTheme = useTheme((s) => s.setTheme);
  const soundPreset = usePlayer((s) => s.soundPreset);
  const setSoundPreset = usePlayer((s) => s.setSoundPreset);

  useEffect(() => {
    Promise.all([
      getShowTrackDuration(),
      getShowRewindButton(),
      getAudioQuality(),
      getDefaultYtViewMode(),
      AsyncStorage.getItem('pref:panelOpacity'),
      getPoTokenServerUrl(),
      AsyncStorage.getItem('pref:flowFocus'),
      AsyncStorage.getItem('pref:vinylSpeed'),
      AsyncStorage.getItem('pref:glowIntensity')
    ]).then(([a, b, c, d, e, f, focus, speed, glow]) => {
      setDurationState(a);
      setRewindState(b);
      setQualityState(c);
      setViewState(d);
      if (e) setOpacity(e);
      if (f) setPotUrl(f);
      if (focus) setFlowFocus(focus === 'true');
      if (speed) setVinylSpeed(speed);
      if (glow) setGlowIntensity(glow);
    });
  }, []);

  const changeOpacity = async (val: string) => {
    setOpacity(val);
    await AsyncStorage.setItem('pref:panelOpacity', val);
    window.dispatchEvent(new CustomEvent('duotone:panel-opacity', { detail: val }));
  };

  const changeFlowFocus = async (val: boolean) => {
    setFlowFocus(val);
    await AsyncStorage.setItem('pref:flowFocus', String(val));
    window.dispatchEvent(new CustomEvent('duotone:flow-focus', { detail: val }));
  };

  const changeVinylSpeed = async (val: string) => {
    setVinylSpeed(val);
    await AsyncStorage.setItem('pref:vinylSpeed', val);
    window.dispatchEvent(new CustomEvent('duotone:vinyl-speed', { detail: val }));
  };

  const changeGlowIntensity = async (val: string) => {
    setGlowIntensity(val);
    await AsyncStorage.setItem('pref:glowIntensity', val);
    window.dispatchEvent(new CustomEvent('duotone:glow-intensity', { detail: val }));
  };

  const savePotUrl = async (val: string) => {
    setPotUrl(val);
    await setPoTokenServerUrl(val);
  };

  const testPot = async () => {
    setTesting(true);
    try {
      const ok = await pingPoTokenServer(potUrl);
      notify(ok ? 'PO Token server is online!' : 'Could not reach server.');
    } catch {
      notify('Connection failed.');
    } finally {
      setTesting(false);
    }
  };

  const doClearCache = () => {
    clearDownloadedAudioCache();
    clearStreamMemo();
    clearPoTokenMemo();
    clearVisitorData();
    notify('YouTube resolver caches cleared.');
  };

  const runDeleteAccount = async () => {
    try {
      const { error } = await supabase.rpc('delete_user_account');
      if (error) throw error;
      setDeleteConfirm(false);
      notify('Your account has been deleted.');
      useAuth.getState().signOut();
    } catch (e: any) {
      notify(e?.message || 'Could not delete your account.');
    }
  };

  return (
    <Page title="Settings" subtitle="Desktop playback, appearance, and account preferences.">
      <ContentScroll>
        <View style={styles.settingsGrid}>
          <SettingsCard icon="play-circle-outline" title="Playback">
            <ToggleLine label="Show track duration" description="Display a time column in track lists." value={duration} onChange={(v) => { setDurationState(v); setShowTrackDuration(v); }} />
            <ToggleLine label="15-second rewind" description="Show a rewind control in the desktop player." value={rewind} onChange={(v) => { setRewindState(v); setShowRewindButton(v); usePlayer.getState().setShowRewindButton(v); }} />
            <ChoiceLine label="Audio quality" value={quality} choices={[['high', 'High'], ['saver', 'Data saver']]} onChange={(v) => { const next = v as 'high' | 'saver'; setQualityState(next); setAudioQuality(next); }} />
            <ChoiceLine label="Sound Presets" value={soundPreset} choices={[['normal', 'Standard'], ['slowed', 'Slowed & Reverb'], ['fast', 'Nightcore']]} onChange={(v) => setSoundPreset(v as any)} />
          </SettingsCard>
          
          <SettingsCard icon="desktop-outline" title="Appearance & Visuals">
            <ToggleLine label="Flow Focus Mode" description="Disables chats & queue skips, replacing the queue with a breathing timer." value={flowFocus} onChange={changeFlowFocus} />
            <ChoiceLine label="Ambient Aura Glow" value={glowIntensity} choices={[['none', 'None'], ['subtle', 'Subtle'], ['medium', 'Medium'], ['max', 'Max Glow']]} onChange={changeGlowIntensity} />
            <ChoiceLine label="Now playing artwork" value={view} choices={[['video', 'Video'], ['photo', 'Artwork']]} onChange={(v) => { const next = v as 'video' | 'photo'; setViewState(next); setDefaultYtViewMode(next); }} />
            <ChoiceLine label="Accent Theme" value={themeName} choices={[['violet', 'Violet'], ['blue', 'Blue'], ['orange', 'Orange'], ['green', 'Green'], ['pink', 'Pink'], ['red', 'Red'], ['mono', 'White'], ['steel', 'Steel']]} onChange={(v) => setTheme(v as any)} />
            <ChoiceLine label="Glass Transparency" value={opacity} choices={[['0.95', 'Solid'], ['0.72', 'Default'], ['0.55', 'Translucent'], ['0.35', 'Neon blur']]} onChange={changeOpacity} />
          </SettingsCard>

          <SettingsCard icon="logo-youtube" title="YouTube Advanced">
            <View style={{ paddingVertical: 8, paddingHorizontal: 17, gap: 8 }}>
              <Text style={styles.settingLabel}>PO Token Server URL</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Field placeholder="https://..." value={potUrl} onChangeText={savePotUrl} /></View>
                <Button onPress={testPot} disabled={testing}>{testing ? 'Testing…' : 'Test'}</Button>
              </View>
            </View>
            <SettingAction label="Clear resolved YouTube caches" onPress={doClearCache} />
          </SettingsCard>

          <SettingsCard icon="information-circle-outline" title="About">
            <SettingLine label="Application" value="Duotone for Windows" />
            {/* Vem do buildInfo.ts, que a CI reescreve a cada build (build-windows.yml).
                Escrito à mão ficava preso no 1.0.0 mesmo em builds mais recentes. */}
            <SettingLine label="Version" value={APP_VERSION} />
            <SettingLine label="Build" value={BUILD_ID} />
            <SettingAction danger label="Delete account permanently" onPress={() => setDeleteConfirm(true)} />
          </SettingsCard>
        </View>
      </ContentScroll>
      <Dialog open={deleteConfirm} title="Delete account permanently?" onClose={() => setDeleteConfirm(false)}>
        <Text style={styles.dialogBody}>Your account and all profile data will be permanently deleted. This cannot be undone.</Text>
        <View style={styles.dialogActions}>
          <Button secondary onPress={() => setDeleteConfirm(false)}>Cancel</Button>
          <Button danger onPress={runDeleteAccount}>Delete Account</Button>
        </View>
      </Dialog>
    </Page>
  );
}

function SettingsCard({ icon, title, children }: { icon: keyof typeof Ionicons.glyphMap; title: string; children: ReactNode }) { return <View style={styles.settingsCard}><View style={styles.settingsCardTitle}><Ionicons name={icon} size={19} color={desktop.accent} /><Text style={styles.sectionTitle}>{title}</Text></View>{children}</View>; }
function SettingLine({ label, value }: { label: string; value: string }) { return <View style={styles.settingLine}><Text style={styles.settingLabel}>{label}</Text><Text numberOfLines={1} style={styles.settingValue}>{value}</Text></View>; }
function SettingAction({ label, onPress, danger = false }: { label: string; onPress: () => void; danger?: boolean }) { return <Pressable onPress={onPress} style={({ hovered }) => [styles.settingLine, hovered && styles.settingHover]}><Text style={[styles.settingLabel, danger && { color: desktop.danger }]}>{label}</Text><Ionicons name="chevron-forward" size={15} color={desktop.dim} /></Pressable>; }
function ToggleLine({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: (v: boolean) => void }) { return <View style={styles.settingLine}><View style={{ flex: 1 }}><Text style={styles.settingLabel}>{label}</Text><Text style={styles.settingDescription}>{description}</Text></View><Switch value={value} onValueChange={onChange} trackColor={{ false: '#33333D', true: '#7659D4' }} thumbColor="#F4F3F7" /></View>; }
function ChoiceLine({ label, value, choices, onChange }: { label: string; value: string; choices: [string, string][]; onChange: (v: string) => void }) { return <View style={[styles.settingLine, { alignItems: 'flex-start' }]}><Text style={[styles.settingLabel, { flex: 1, marginTop: 8 }]}>{label}</Text><View style={styles.smallSegment}>{choices.map(([id, text]) => <Pressable key={id} onPress={() => onChange(id)} style={[styles.smallSegmentItem, value === id && styles.smallSegmentActive]}><Text style={[styles.smallSegmentText, value === id && { color: desktop.text }]}>{text}</Text></Pressable>)}</View></View>; }

function SocialPage({ notify, play, more }: { notify: (s: string) => void; play: (t: Track, q?: Track[]) => void; more: (t: Track) => void }) {
  const [activeTab, setActiveTab] = useState<'inbox' | 'friends' | 'add'>('inbox');
  const [inbox, setInbox] = useState<SharedItem[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const theme = useTheme((s) => s.theme);

  // Chat states
  const [activeChatFriend, setActiveChatFriend] = useState<Friendship | null>(null);
  const [chatMessages, setChatMessages] = useState<SharedItem[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const chatScrollRef = useRef<any>(null);

  const loadSocialData = useCallback(async () => {
    try {
      const [ib, fs] = await Promise.all([getInboxItems(), getFriendships()]);
      setInbox(ib);
      setFriendships(fs);
    } catch (e: any) {
      console.warn(e);
    }
  }, []);

  useEffect(() => {
    loadSocialData();
    const interval = setInterval(loadSocialData, 10000);
    return () => clearInterval(interval);
  }, [loadSocialData]);

  // Load and poll chat messages
  const loadChat = useCallback(async () => {
    if (!activeChatFriend) return;
    setChatLoading(true);
    try {
      const msgs = await getChatMessages(activeChatFriend.friendId);
      setChatMessages(msgs);
      setTimeout(() => chatScrollRef.current?.scrollToEnd?.({ animated: false }), 100);
    } catch (err) {
      console.warn(err);
    } finally {
      setChatLoading(false);
    }
  }, [activeChatFriend]);

  useEffect(() => {
    if (!activeChatFriend) {
      setChatMessages([]);
      return;
    }
    loadChat();
    const chatInterval = setInterval(async () => {
      try {
        const msgs = await getChatMessages(activeChatFriend.friendId);
        setChatMessages(msgs);
      } catch {}
    }, 6000);
    return () => clearInterval(chatInterval);
  }, [activeChatFriend, loadChat]);

  const sendChatMessage = async () => {
    if (!activeChatFriend || !chatInput.trim() || sendingMessage) return;
    const msg = chatInput.trim();
    setChatInput('');
    setSendingMessage(true);
    try {
      await shareItem(activeChatFriend.friendId, 'track', null, msg);
      const msgs = await getChatMessages(activeChatFriend.friendId);
      setChatMessages(msgs);
      setTimeout(() => chatScrollRef.current?.scrollToEnd?.({ animated: true }), 100);
    } catch (err: any) {
      notify(err?.message || 'Could not send message.');
      setChatInput(msg);
    } finally {
      setSendingMessage(false);
    }
  };

  const archiveItem = async (id: string) => {
    try {
      await archiveInboxItem(id);
      notify('Inbox item archived.');
      loadSocialData();
    } catch (e: any) {
      notify(e?.message || 'Could not archive.');
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    try {
      await declineOrRemoveFriendship(friendId);
      notify('Friend removed.');
      loadSocialData();
    } catch (e: any) {
      notify(e?.message || 'Could not remove friend.');
    }
  };

  const handleAddFriend = async (targetId: string) => {
    try {
      await sendFriendRequest(targetId);
      notify('Friend request sent!');
      loadSocialData();
    } catch (e: any) {
      notify(e?.message || 'Could not send request.');
    }
  };

  const handleAcceptRequest = async (friendId: string) => {
    try {
      await acceptFriendRequest(friendId);
      notify('Friend request accepted.');
      loadSocialData();
    } catch (e: any) {
      notify(e?.message || 'Could not accept request.');
    }
  };

  const runSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const res = await searchProfiles(searchQuery);
      setSearchResults(res);
    } catch {
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const activeFriends = friendships.filter(f => f.status === 'accepted');
  const pendingRequests = friendships.filter(f => f.status === 'pending');

  return (
    <Page title="Social" subtitle="Connect and share music with friends.">
      <View style={styles.socialTabBar}>
        <Pressable onPress={() => setActiveTab('inbox')} style={[styles.socialTab, activeTab === 'inbox' && { borderBottomColor: theme.color }]}>
          <Text style={[styles.socialTabText, activeTab === 'inbox' && { color: desktop.text }]}>
            Inbox {inbox.length > 0 && `(${inbox.length})`}
          </Text>
        </Pressable>
        <Pressable onPress={() => setActiveTab('friends')} style={[styles.socialTab, activeTab === 'friends' && { borderBottomColor: theme.color }]}>
          <Text style={[styles.socialTabText, activeTab === 'friends' && { color: desktop.text }]}>
            Friends {activeFriends.length > 0 && `(${activeFriends.length})`}
          </Text>
        </Pressable>
        <Pressable onPress={() => setActiveTab('add')} style={[styles.socialTab, activeTab === 'add' && { borderBottomColor: theme.color }]}>
          <Text style={[styles.socialTabText, activeTab === 'add' && { color: desktop.text }]}>Find Profiles</Text>
        </Pressable>
      </View>

      <ContentScroll>
        <View style={{ marginTop: 16 }}>
        {loading && !inbox.length && !friendships.length && <Loading />}

        {activeTab === 'inbox' && (
          <View style={{ gap: 12 }}>
            {inbox.map((item) => (
              <View key={item.id} style={styles.inboxCard}>
                <View style={styles.inboxCardHeader}>
                  <Text style={styles.inboxSender}>{item.sender.name} (@{item.sender.username}) shared:</Text>
                  <IconButton name="archive-outline" label="Archive message" onPress={() => archiveItem(item.id)} />
                </View>
                {item.trackData && (
                  <Pressable onPress={() => play(item.trackData!)} style={styles.inboxTrack}>
                    <Artwork track={item.trackData} size={40} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: desktop.text, fontSize: 12, fontWeight: '600' }}>{item.trackData.title}</Text>
                      <Text numberOfLines={1} style={{ color: desktop.dim, fontSize: 10, marginTop: 2 }}>{item.trackData.artist || 'YouTube'}</Text>
                    </View>
                    <Ionicons name="play-circle" size={24} color={theme.color} />
                  </Pressable>
                )}
                {item.message && (
                  <View style={styles.inboxMessageBubble}>
                    <Text style={styles.inboxMessageText}>{item.message}</Text>
                  </View>
                )}
              </View>
            ))}
            {!inbox.length && !loading && <Empty icon="mail-outline" title="Inbox is empty" body="Shared tracks and messages from your friends will appear here." />}
          </View>
        )}

        {activeTab === 'friends' && (
          <View style={{ gap: 12 }}>
            {pendingRequests.length > 0 && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.formLabel}>PENDING REQUESTS</Text>
                <View style={{ gap: 6, marginTop: 8 }}>
                  {pendingRequests.map((req) => (
                    <View key={req.friendId} style={styles.friendRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: desktop.text, fontSize: 13, fontWeight: '600' }}>{req.name}</Text>
                        <Text style={{ color: desktop.dim, fontSize: 11 }}>@{req.username}</Text>
                      </View>
                      {req.isSender ? (
                        <Text style={{ color: desktop.dim, fontSize: 11 }}>Request Sent</Text>
                      ) : (
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <Button onPress={() => handleAcceptRequest(req.friendId)}>Accept</Button>
                          <IconButton name="close" label="Decline request" onPress={() => handleRemoveFriend(req.friendId)} />
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            )}

            <Text style={styles.formLabel}>ALL FRIENDS</Text>
            {activeFriends.map((f) => (
              <View key={f.friendId} style={styles.friendRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: desktop.text, fontSize: 13, fontWeight: '600' }}>{f.name} (@{f.username})</Text>
                  {f.currentlyPlaying ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                      <Ionicons name="musical-notes" size={12} color={theme.color} style={{ animation: 'pulse 1.5s infinite' } as any} />
                      <Text numberOfLines={1} style={{ color: theme.color, fontSize: 11, fontWeight: '500' }}>
                        Listening to: {f.currentlyPlaying.title}
                      </Text>
                    </View>
                  ) : (
                    // "Sem tocar" e "offline" são coisas diferentes: com o
                    // filtro de presença, quem está online mas em pausa
                    // apareceria como offline se olhássemos só para a faixa.
                    <Text style={{ color: desktop.dim, fontSize: 11, marginTop: 3 }}>
                      {f.lastSeenAt && Date.now() - new Date(f.lastSeenAt).getTime() < 3 * 60 * 1000
                        ? 'Online'
                        : 'Offline'}
                    </Text>
                  )}
                </View>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  {f.currentlyPlaying && (
                    <Button onPress={() => play({ source: f.currentlyPlaying!.source as any, sourceId: f.currentlyPlaying!.sourceId, title: f.currentlyPlaying!.title, artist: f.currentlyPlaying!.artist, album: null, artworkUrl: f.currentlyPlaying!.artworkUrl, durationSeconds: f.currentlyPlaying!.durationSeconds })}>
                      Listen Along
                    </Button>
                  )}
                  <IconButton name="chatbubble-ellipses-outline" label="Chat" onPress={() => setActiveChatFriend(f)} />
                  <IconButton name="trash-outline" label="Remove friend" onPress={() => handleRemoveFriend(f.friendId)} />
                </View>
              </View>
            ))}
            {!activeFriends.length && !pendingRequests.length && !loading && (
              <Empty icon="people-outline" title="No friends yet" body="Search for profiles to send a friend request." />
            )}
          </View>
        )}

        {activeTab === 'add' && (
          <View style={{ gap: 12 }}>
            <View style={styles.searchBar}>
              <Field icon="search" placeholder="Type username or name…" value={searchQuery} onChangeText={setSearchQuery} onSubmitEditing={runSearch} />
              <Button onPress={runSearch}>Search</Button>
            </View>
            <View style={{ gap: 8 }}>
              {searchResults.map((p) => {
                const friendship = friendships.find(f => f.friendId === p.id);
                return (
                  <View key={p.id} style={styles.friendRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: desktop.text, fontSize: 13, fontWeight: '600' }}>{p.name || 'No name'}</Text>
                      <Text style={{ color: desktop.dim, fontSize: 11 }}>@{p.username}</Text>
                    </View>
                    {friendship ? (
                      friendship.status === 'accepted' ? (
                        <Text style={{ color: desktop.dim, fontSize: 12 }}>Friend</Text>
                      ) : friendship.isSender ? (
                        <Text style={{ color: desktop.dim, fontSize: 12 }}>Requested</Text>
                      ) : (
                        <Button onPress={() => handleAcceptRequest(p.id)}>Accept Request</Button>
                      )
                    ) : (
                      <Button onPress={() => handleAddFriend(p.id)}>Add Friend</Button>
                    )}
                  </View>
                );
              })}
              {!searchResults.length && !loading && searchQuery && <Empty icon="search-outline" title="No profiles found" body="Try searching for another name or username." />}
            </View>
          </View>
        )}
        </View>
      </ContentScroll>

      {/* CHAT DIALOG */}
      <Dialog open={!!activeChatFriend} title={activeChatFriend ? `Chat with ${activeChatFriend.name}` : 'Chat'} onClose={() => setActiveChatFriend(null)} width={500}>
        {activeChatFriend && (
          <View style={{ height: 420, justifyContent: 'space-between' }}>
            <ScrollView 
              ref={chatScrollRef}
              contentContainerStyle={{ gap: 10, paddingVertical: 10 }}
              style={{ flex: 1, marginBottom: 12 }}
            >
              {chatLoading && chatMessages.length === 0 ? (
                <Loading />
              ) : chatMessages.map((msg) => {
                const isMe = msg.sender.id !== activeChatFriend.friendId;
                const isDarkText = isMe && getContrastTextColor(theme.color) === '#0F0F14';
                return (
                  <View key={msg.id} style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '80%', gap: 4 }}>
                    <Text style={{ color: desktop.dim, fontSize: 9, textAlign: isMe ? 'right' : 'left' }}>
                      {isMe ? 'You' : msg.sender.name} • {relativeTime(new Date(msg.createdAt).getTime())}
                    </Text>
                    <View style={{ 
                      padding: 10, 
                      borderRadius: 12, 
                      backgroundColor: isMe ? theme.color : desktop.raised,
                      borderBottomRightRadius: isMe ? 2 : 12,
                      borderBottomLeftRadius: isMe ? 12 : 2
                    }}>
                      {msg.trackData && (
                        <Pressable onPress={() => play(msg.trackData!)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: msg.message ? 8 : 0, backgroundColor: isMe ? (isDarkText ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.12)') : 'rgba(255,255,255,0.06)', padding: 6, borderRadius: 6 }}>
                          <Artwork track={msg.trackData} size={28} />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text numberOfLines={1} style={{ color: isMe ? (isDarkText ? '#0F0F14' : '#FFF') : '#FFF', fontSize: 11, fontWeight: '600' }}>{msg.trackData.title}</Text>
                            <Text numberOfLines={1} style={{ color: isMe ? (isDarkText ? 'rgba(15,15,20,0.65)' : 'rgba(255,255,255,0.65)') : 'rgba(255,255,255,0.65)', fontSize: 9 }}>{displayArtist(msg.trackData)}</Text>
                          </View>
                          <Ionicons name="play-circle" size={18} color={isMe ? (isDarkText ? '#0F0F14' : '#FFF') : '#FFF'} />
                        </Pressable>
                      )}
                      {msg.message && (
                        <Text style={{ color: isMe ? (isDarkText ? '#0F0F14' : '#FFF') : desktop.text, fontSize: 12, lineHeight: 16 }}>{msg.message}</Text>
                      )}
                    </View>
                  </View>
                );
              })}
              {!chatMessages.length && !chatLoading && (
                <Text style={{ color: desktop.dim, fontSize: 12, textAlign: 'center', marginVertical: 60, fontStyle: 'italic' }}>
                  No messages. Say hello to {activeChatFriend.name}!
                </Text>
              )}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', borderTopWidth: 1, borderTopColor: desktop.border, paddingTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Field 
                  placeholder="Send a message…" 
                  value={chatInput} 
                  onChangeText={setChatInput} 
                  onSubmitEditing={sendChatMessage}
                />
              </View>
              <Button onPress={sendChatMessage} disabled={!chatInput.trim() || sendingMessage}>
                Send
              </Button>
            </View>
          </View>
        )}
      </Dialog>
    </Page>
  );
}

function FocusTimer({ themeColor }: { themeColor: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  const format = (totalSecs: number) => {
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ color: themeColor, fontSize: 36, fontWeight: 'bold', fontFamily: 'monospace' }}>{format(seconds)}</Text>
      <Text style={{ color: desktop.dim, fontSize: 10, marginTop: 6, letterSpacing: 1 }}>FOCUS TIME ELAPSED</Text>
    </View>
  );
}

function NowPlayingPage({ play, notify, more, currentIsSaved, toggleSaveCurrent }: CommonPageProps & { currentIsSaved: boolean; toggleSaveCurrent: () => void }) {
  const p = usePlayer();
  const theme = useTheme((s) => s.theme);

  const [glowOpacity, setGlowOpacity] = useState(0.12);
  const [flowFocus, setFlowFocus] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('pref:glowIntensity').then((val) => {
      if (val === 'none') setGlowOpacity(0);
      else if (val === 'subtle') setGlowOpacity(0.05);
      else if (val === 'medium') setGlowOpacity(0.12);
      else if (val === 'max') setGlowOpacity(0.25);
    });
    AsyncStorage.getItem('pref:flowFocus').then((val) => { if (val) setFlowFocus(val === 'true'); });

    const handleGlow = (e: any) => {
      const val = e.detail;
      if (val === 'none') setGlowOpacity(0);
      else if (val === 'subtle') setGlowOpacity(0.05);
      else if (val === 'medium') setGlowOpacity(0.12);
      else if (val === 'max') setGlowOpacity(0.25);
    };
    const handleFocus = (e: any) => setFlowFocus(e.detail === 'true' || e.detail === true);

    window.addEventListener('duotone:glow-intensity', handleGlow);
    window.addEventListener('duotone:flow-focus', handleFocus);
    return () => {
      window.removeEventListener('duotone:glow-intensity', handleGlow);
      window.removeEventListener('duotone:flow-focus', handleFocus);
    };
  }, []);

  if (!p.current) {
    return <Page title="Now Playing" subtitle="Nothing is playing right now."><Empty icon="play-circle-outline" title="Silent" body="Start playing a track to see it here." /></Page>;
  }
  const track = p.current;

  return (
    <Page title="Now Playing" subtitle="Immersive desktop music page.">
      {/* Blurred background backdrop reflection */}
      {track.artworkUrl && (
        <Image 
          source={{ uri: track.artworkUrl }} 
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            opacity: glowOpacity,
            filter: 'blur(90px) saturate(160%)',
            pointerEvents: 'none',
            zIndex: 0,
            transition: 'opacity 0.5s ease',
          } as any} 
        />
      )}

      <ContentScroll>
        <V className="ambient-glow" style={{ backgroundColor: theme.color, top: 80, left: 100 }} />
        <View style={[styles.nowPlayingContainer, { zIndex: 1, minHeight: 500, alignItems: 'center' }]}>
          <View style={styles.nowPlayingLeft}>
            <V className="visualizer-perspective" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: 320, height: 320, position: 'relative', marginBottom: 12 }}>
              {/* Primary Artwork Card */}
              <V 
                className="artwork-card"
                style={[
                  styles.nowPlayingArtworkWrap, 
                  { 
                    shadowColor: theme.color,
                    width: 320,
                    height: 320,
                  }
                ]}
              >
                {track.artworkUrl ? (
                  <Image source={{ uri: track.artworkUrl }} style={styles.nowPlayingArtwork} />
                ) : (
                  <View style={styles.nowPlayingArtworkFallback}>
                    <Ionicons name="musical-note" size={120} color={desktop.dim} />
                  </View>
                )}
              </V>
            </V>
            
            <View style={[styles.nowPlayingMeta, { marginTop: 16 }]}>
              <Text numberOfLines={2} style={styles.nowPlayingTitle}>{track.title}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 12 }}>
                <Text numberOfLines={1} style={[styles.nowPlayingArtist, { marginBottom: 0 }]}>{displayArtist(track)}</Text>
                <IconButton 
                  name={currentIsSaved ? "heart" : "heart-outline"} 
                  label={currentIsSaved ? "Saved" : "Save"} 
                  onPress={toggleSaveCurrent} 
                  active={currentIsSaved}
                />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, justifyContent: 'center' }}>
                <View style={styles.nowPlayingSourceTag}>
                  <Ionicons name={track.source === 'spotify' ? 'logo-usd' : 'logo-youtube'} size={12} color={desktop.dim} />
                  <Text style={styles.nowPlayingSourceText}>{track.source.toUpperCase()}</Text>
                </View>
                {/* Equalizer Visualizer */}
                <V style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 16 }}>
                  <V className={`equalizer-bar eq-bar-1 ${!p.isPlaying ? 'eq-paused' : ''}`} style={{ height: 14 }} />
                  <V className={`equalizer-bar eq-bar-2 ${!p.isPlaying ? 'eq-paused' : ''}`} style={{ height: 16 }} />
                  <V className={`equalizer-bar eq-bar-3 ${!p.isPlaying ? 'eq-paused' : ''}`} style={{ height: 12 }} />
                  <V className={`equalizer-bar eq-bar-4 ${!p.isPlaying ? 'eq-paused' : ''}`} style={{ height: 15 }} />
                </V>
              </View>
            </View>
          </View>

          {/* Frosted Glass Queue Card or Focus Mode card */}
          {flowFocus ? (
            <V className="glass-panel" style={[styles.nowPlayingRight, { backgroundColor: 'rgba(20,20,30,0.4)', backdropFilter: 'blur(20px)', padding: 30, alignItems: 'center', justifyContent: 'center', minHeight: 300 } as any]}>
              <Ionicons name="leaf-outline" size={48} color={theme.color} style={{ marginBottom: 16 }} />
              <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' }}>Focus Flow Active</Text>
              <Text style={{ color: desktop.muted, fontSize: 12, textAlign: 'center', lineHeight: 18, marginBottom: 24 }}>Stay in the zone. Social notifications and queue skipping are paused.</Text>
              <FocusTimer themeColor={theme.color} />
            </V>
          ) : (
            <V className="glass-panel" style={[styles.nowPlayingRight, { backgroundColor: 'rgba(20,20,30,0.4)', backdropFilter: 'blur(20px)', padding: 22, shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.3, shadowRadius: 24 } as any]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={[styles.nowPlayingQueueTitle, { marginBottom: 0 }]}>UP NEXT</Text>
                <Ionicons name="list" size={16} color={desktop.dim} />
              </View>
              <View style={styles.nowPlayingQueueList}>
                {p.queue.slice(p.queueIndex + 1, p.queueIndex + 6).map((item, idx) => {
                  const originalIndex = p.queueIndex + 1 + idx;
                  return (
                    <div 
                      key={`${idx}:${item.sourceId}`} 
                      className="premium-card now-playing-queue-row-web"
                      draggable={true}
                      onDragStart={(e: any) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', String(originalIndex));
                        e.currentTarget.style.opacity = '0.5';
                      }}
                      onDragEnd={(e: any) => {
                        e.currentTarget.style.opacity = '1';
                      }}
                      onDragOver={(e: any) => {
                        e.preventDefault();
                      }}
                      onDrop={(e: any) => {
                        e.preventDefault();
                        const fromIdx = Number(e.dataTransfer.getData('text/plain'));
                        if (!isNaN(fromIdx) && fromIdx !== originalIndex) {
                          p.moveQueueItem(fromIdx, originalIndex);
                        }
                      }}
                      onClick={() => p.playTrack(item, p.queue)}
                      style={{ 
                        padding: '8px 10px', 
                        borderRadius: '8px', 
                        cursor: 'grab', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '10px',
                        userSelect: 'none'
                      } as any}
                    >
                      <Artwork track={item} size={36} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={styles.nowPlayingQueueTrackTitle}>{item.title}</Text>
                        <Text numberOfLines={1} style={styles.nowPlayingQueueTrackArtist}>{displayArtist(item)}</Text>
                      </View>
                      <Ionicons name="menu-outline" size={16} color={desktop.dim} style={{ opacity: 0.6 }} />
                    </div>
                  );
                })}
                {p.queue.length <= p.queueIndex + 1 && (
                  <Text style={{ color: desktop.dim, fontSize: 12, fontStyle: 'italic', marginTop: 12, textAlign: 'center' }}>Queue ends after this track.</Text>
                )}
              </View>
            </V>
          )}
        </View>
      </ContentScroll>
    </Page>
  );
}

function PlayerBar({ currentIsSaved, toggleSaveCurrent }: { currentIsSaved: boolean; toggleSaveCurrent: () => void }) {
  const p = usePlayer(); const ratio = p.durationMs ? Math.min(1, p.positionMs / p.durationMs) : 0;
  if (!p.current) return null;

  const startDragProgress = (mouseDownEvent: any) => {
    mouseDownEvent.preventDefault();
    const target = mouseDownEvent.currentTarget;
    const update = (moveEvent: any) => {
      const rect = target.getBoundingClientRect();
      const clientX = moveEvent.clientX ?? moveEvent.touches?.[0]?.clientX;
      if (clientX === undefined) return;
      const r = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      p.seekTo(r * p.durationMs);
    };
    update(mouseDownEvent);
    const stop = () => {
      window.removeEventListener('mousemove', update);
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('touchmove', update);
      window.removeEventListener('touchend', stop);
    };
    window.addEventListener('mousemove', update);
    window.addEventListener('mouseup', stop);
    window.addEventListener('touchmove', update);
    window.addEventListener('touchend', stop);
  };

  const startDragVolume = (mouseDownEvent: any) => {
    mouseDownEvent.preventDefault();
    const target = mouseDownEvent.currentTarget;
    const update = (moveEvent: any) => {
      const rect = target.getBoundingClientRect();
      const clientX = moveEvent.clientX ?? moveEvent.touches?.[0]?.clientX;
      if (clientX === undefined) return;
      const pct = Math.min(100, Math.max(0, Math.round(((clientX - rect.left) / rect.width) * 100)));
      p.setVolume(pct);
    };
    update(mouseDownEvent);
    const stop = () => {
      window.removeEventListener('mousemove', update);
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('touchmove', update);
      window.removeEventListener('touchend', stop);
    };
    window.addEventListener('mousemove', update);
    window.addEventListener('mouseup', stop);
    window.addEventListener('touchmove', update);
    window.addEventListener('touchend', stop);
  };

  return <V style={styles.player} className="glass-panel"><YouTubePlayerView track={p.current} /><View style={{ flexDirection: 'row', alignItems: 'center', width: '30%', minWidth: 210, maxWidth: 390, gap: 10 }}><Pressable style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11, minWidth: 0 }} onPress={() => window.dispatchEvent(new CustomEvent('duotone:navigate', { detail: { name: 'now-playing' } }))}><Artwork track={p.current} size={52} /><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={styles.playerTitle}>{p.current.title}</Text><Text numberOfLines={1} style={styles.playerArtist}>{displayArtist(p.current)}</Text></View></Pressable><IconButton name={currentIsSaved ? "heart" : "heart-outline"} label={currentIsSaved ? "Remove from Saved Songs" : "Save to Saved Songs"} onPress={toggleSaveCurrent} active={currentIsSaved} /></View><View style={styles.playerCenter}><View style={styles.playerControls}><IconButton name="shuffle" label="Shuffle" active={p.shuffle} onPress={p.toggleShuffle} /><IconButton name="play-skip-back" label="Previous" onPress={p.prev} /><Pressable accessibilityLabel={p.isPlaying ? 'Pause' : 'Play'} onPress={p.togglePlay} style={({ hovered, pressed }) => [styles.playButton, hovered && { transform: [{ scale: 1.05 }] }, pressed && { transform: [{ scale: .97 }] }]}><Ionicons name={p.buffering ? 'hourglass-outline' : p.isPlaying ? 'pause' : 'play'} size={19} color="#111117" /></Pressable><IconButton name="play-skip-forward" label="Next" onPress={p.next} /><IconButton name={p.repeatMode === 'one' ? 'repeat' : 'repeat-outline'} label="Repeat" active={p.repeatMode !== 'off'} onPress={p.cycleRepeat} /></View><View style={styles.progressRow}><Text style={styles.timeText}>{formatTime(p.positionMs / 1000)}</Text><P onMouseDown={startDragProgress} onTouchStart={startDragProgress} style={styles.progressHit} className="slider-container"><V style={styles.progressTrack}><V style={[styles.progressFill, { width: `${ratio * 100}%` }]} className="slider-fill" /></V><V className="slider-thumb" style={{ left: `${ratio * 100}%` }} /></P><Text style={styles.timeText}>{formatTime(p.durationMs / 1000)}</Text></View></View><View style={styles.playerRight}>{p.error && <Text numberOfLines={1} style={styles.playerError}>{p.error}</Text>}<V style={styles.volumeRow} className="slider-container"><Ionicons name={p.volume === 0 ? 'volume-mute-outline' : p.volume < 35 ? 'volume-low-outline' : p.volume < 70 ? 'volume-medium-outline' : 'volume-high-outline'} size={18} color={desktop.muted} onPress={() => p.setVolume(p.volume === 0 ? 80 : 0)} style={{ cursor: 'pointer', transition: 'color 0.2s' } as any} /><P onMouseDown={startDragVolume} onTouchStart={startDragVolume} style={styles.volumeHit}><V style={styles.volumeTrack}><V style={[styles.volumeFill, { width: `${p.volume}%` }]} className="slider-fill" /></V><V className="slider-thumb" style={{ left: `${p.volume}%` }} /></P></V><IconButton name="close" label="Close player" onPress={p.close} /></View></V>;
}

function getContrastTextColor(hex: string): string {
  if (!hex) return '#FFFFFF';
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(char => char + char).join('');
  }
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return luma > 170 ? '#0F0F14' : '#FFFFFF';
}

function DesktopShell() {
  const [route, setRoute] = useState<Route>({ name: 'search' }); const history = useRef<Route[]>([]); const [toast, setToast] = useState('');
  const [trackMenu, setTrackMenu] = useState<Track | null>(null); const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [trackMenuOpen, setTrackMenuOpen] = useState(false);
  const [playlistDialog, setPlaylistDialog] = useState(false);
  const [shareDialog, setShareDialog] = useState(false);
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [selectedFriend, setSelectedFriend] = useState('');
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
          notify('Removed from library.');
        }
      } else {
        await saveToLibrary(currentTrack);
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

  const isPlayingState = p.isPlaying;
  // Evita mandar um delete ao arrancar sem nada a tocar.
  const hadTrackRef = useRef(false);

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
        notify('Removed from library.');
      } else {
        await saveToLibrary(trackMenu);
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
    setPlaylists(await listPlaylists());
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

  const openShareDialog = async () => {
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
    if (!trackMenu || !selectedFriend) return;
    setSharing(true);
    try {
      await shareItem(selectedFriend, 'track', trackMenu, shareMessage);
      setShareDialog(false);
      setShareMessage('');
      setSelectedFriend('');
      notify('Shared successfully!');
    } catch (e: any) {
      notify(e?.message || 'Could not share track.');
    } finally {
      setSharing(false);
    }
  };

  const common = { play, notify, more };
  let page: ReactNode;
  switch (route.name) {
    case 'search': page = <SearchPage {...common} />; break; case 'songs': page = <SongsPage {...common} />; break; case 'artists': page = <ArtistsPage navigate={navigate} />; break;
    case 'artist': page = <ArtistPage name={route.value} back={back} {...common} />; break; case 'playlists': page = <PlaylistsPage navigate={navigate} notify={notify} />; break; case 'playlist': page = <PlaylistPage id={route.id} title={route.title} back={back} {...common} />; break;
    case 'import': page = <ImportPage back={back} notify={notify} />; break; case 'spotify-import': page = <SpotifyImportPage back={back} notify={notify} />; break; case 'profile': page = <ProfilePage navigate={navigate} notify={notify} />; break; case 'settings': page = <SettingsPage notify={notify} />; break;
    case 'social': page = <SocialPage notify={notify} play={play} more={more} />; break;
    case 'now-playing': page = <NowPlayingPage play={play} notify={notify} more={more} currentIsSaved={currentIsSaved} toggleSaveCurrent={toggleSaveCurrent} />; break;
  }

  const bgStyle = { backgroundColor: `rgba(18, 18, 24, ${panelOpacity})` };

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
          <Pressable onPress={() => { setTrackMenuOpen(false); openShareDialog(); }} style={({ hovered }) => [styles.destination, hovered && styles.settingHover]}><Ionicons name="share-social-outline" size={18} color={theme.color} /><Text style={styles.destinationText}>Share with a friend…</Text></Pressable>
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
    <Dialog open={shareDialog} title="Share with a friend" onClose={() => setShareDialog(false)}>
      {trackMenu && (
        <View style={{ gap: 12 }}>
          <Text style={styles.formLabel}>SELECT FRIEND</Text>
          {loadingFriends ? <Loading /> : friends.length ? (
            <View style={{ gap: 6, maxHeight: 180, overflow: 'auto' as any }}>
              {friends.map((f) => (
                <Pressable key={f.friendId} onPress={() => setSelectedFriend(f.friendId)} style={[styles.destination, selectedFriend === f.friendId && { borderColor: theme.color, backgroundColor: theme.soft }]}><Ionicons name={selectedFriend === f.friendId ? "radio-button-on" : "radio-button-off"} color={selectedFriend === f.friendId ? theme.color : desktop.dim} size={18} /><Text style={styles.destinationText}>{f.name} (@{f.username})</Text></Pressable>
              ))}
            </View>
          ) : <Text style={styles.dialogBody}>No friends found. Go to the Social page to add friends.</Text>}

          {friends.length > 0 && (
            <>
              <Text style={styles.formLabel}>MESSAGE (OPTIONAL)</Text>
              <Field placeholder="Add a note about this song…" value={shareMessage} onChangeText={setShareMessage} />
              <View style={styles.dialogActions}>
                <Button secondary onPress={() => setShareDialog(false)}>Cancel</Button>
                <Button onPress={sendShare} disabled={!selectedFriend || sharing}>{sharing ? 'Sharing…' : 'Share Song'}</Button>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent', color: desktop.text } as any,
  backgroundImage: { position: 'absolute', top: -20, left: -20, right: -20, bottom: -20, width: 'calc(100% + 40px)' as any, height: 'calc(100% + 40px)' as any, resizeMode: 'cover', zIndex: 0, filter: 'blur(8px) brightness(45%)' } as any,
  titleBar: { height: 38, backgroundColor: 'rgba(0,0,0,0.15)', flexDirection: 'row', alignItems: 'stretch', zIndex: 20, WebkitAppRegion: 'drag' } as any,
  titleBrand: { width: 224, flexDirection: 'row', alignItems: 'center', paddingLeft: 15, gap: 9 }, brandDots: { flexDirection: 'row', gap: 3 }, brandDot: { width: 8, height: 8, borderRadius: 4 }, titleText: { color: desktop.muted, fontSize: 12, fontWeight: '600' }, dragRegion: { flex: 1 }, windowButtons: { flexDirection: 'row', WebkitAppRegion: 'no-drag' } as any, windowButton: { width: 46, height: 37, alignItems: 'center', justifyContent: 'center' }, windowButtonHover: { backgroundColor: desktop.hover }, closeHover: { backgroundColor: '#C42B3B' },
  main: { flex: 1, flexDirection: 'row', minHeight: 0, backgroundColor: 'transparent' }, sidebar: { width: 224, backgroundColor: 'rgba(18,18,24,0.72)', borderRadius: 8, marginLeft: 8, marginRight: 4, marginTop: 4, marginBottom: 4, overflow: 'hidden' } as any, sidebarContent: { padding: 12, paddingTop: 22 }, navLabel: { color: desktop.dim, fontSize: 9, fontWeight: '800', letterSpacing: 1.35, marginHorizontal: 10, marginBottom: 8, marginTop: 5 }, navItem: { height: 38, paddingHorizontal: 10, borderRadius: 7, flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 3 }, navHover: { backgroundColor: desktop.hover }, navActive: { backgroundColor: desktop.accentSoft }, navText: { color: desktop.muted, fontSize: 13, fontWeight: '550' as any, flex: 1 }, navTextActive: { color: desktop.text, fontWeight: '650' as any }, shortcut: { color: desktop.dim, fontSize: 9 }, navDivider: { height: 1, backgroundColor: desktop.border, marginVertical: 14, marginHorizontal: 8 },
  account: { minHeight: 67, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.03)', flexDirection: 'row', alignItems: 'center', gap: 10 }, avatar: { width: 31, height: 31, borderRadius: 9, backgroundColor: '#3D315E', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: desktop.text, fontSize: 12, fontWeight: '800' }, accountName: { color: desktop.text, fontSize: 12, fontWeight: '650' as any }, accountEmail: { color: desktop.dim, fontSize: 10, marginTop: 2 }, content: { flex: 1, minWidth: 0, backgroundColor: 'rgba(18,18,24,0.72)', borderRadius: 8, marginLeft: 4, marginRight: 8, marginTop: 4, marginBottom: 4, overflow: 'hidden' } as any,
  auth: { flex: 1, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, authGlow: { position: 'absolute', width: 720, height: 720, borderRadius: 360, backgroundColor: 'rgba(111,72,210,.12)', top: -360 }, authCard: { width: 440, maxWidth: 'calc(100vw - 48px)' as any, padding: 36, borderRadius: 14, backgroundColor: desktop.panel, borderWidth: 1, borderColor: desktop.border, boxShadow: '0 30px 100px rgba(0,0,0,.55)' } as any, authLogo: { flexDirection: 'row', gap: 5, marginBottom: 25 }, authTitle: { color: desktop.text, fontSize: 27, fontWeight: '750' as any, letterSpacing: -.4 }, authBody: { color: desktop.muted, fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: 24 }, segment: { height: 38, padding: 3, borderRadius: 8, backgroundColor: desktop.bg, flexDirection: 'row', marginBottom: 18 }, segmentItem: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 6 }, segmentActive: { backgroundColor: desktop.raised }, segmentText: { color: desktop.text, fontSize: 12, fontWeight: '600' }, error: { color: '#FF858A', fontSize: 12, lineHeight: 17 }, authFoot: { color: desktop.dim, fontSize: 10, marginTop: 20 },
  searchBar: { paddingHorizontal: 38, flexDirection: 'row', gap: 10, marginBottom: 22 }, history: { paddingHorizontal: 38, marginBottom: 20 }, sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 }, sectionTitle: { color: desktop.text, fontSize: 14, fontWeight: '700', flex: 1 }, textAction: { color: desktop.accent, fontSize: 12 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, chip: { height: 31, borderRadius: 16, paddingHorizontal: 11, borderWidth: 1, borderColor: desktop.border, flexDirection: 'row', alignItems: 'center', gap: 6 }, chipHover: { backgroundColor: desktop.hover }, chipText: { color: desktop.muted, fontSize: 11 },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 }, mediaCard: { width: 164, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: 'transparent' }, cardHover: { backgroundColor: desktop.raised, borderColor: desktop.border, transform: [{ translateY: -2 }] }, cardTitle: { color: desktop.text, fontSize: 13, fontWeight: '650' as any, marginTop: 11 }, cardMeta: { color: desktop.dim, fontSize: 11, marginTop: 4 }, playlistGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 }, playlistCard: { width: 190, padding: 13, borderRadius: 10, borderWidth: 1, borderColor: desktop.border, backgroundColor: desktop.panel }, playlistArt: { width: 162, height: 162, borderRadius: 8, backgroundColor: desktop.raised, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 20 }, dialogBody: { color: desktop.muted, fontSize: 13, lineHeight: 20 }, formLabel: { color: desktop.dim, fontSize: 9, fontWeight: '800', letterSpacing: 1.1, marginBottom: 8 }, importPanel: { maxWidth: 760, padding: 24, borderWidth: 1, borderColor: desktop.border, borderRadius: 11, backgroundColor: desktop.panel }, importSummary: { minHeight: 80, marginVertical: 22, borderTopWidth: 1, borderBottomWidth: 1, borderColor: desktop.border, justifyContent: 'center' }, destinationGrid: { gap: 6 }, destination: { minHeight: 43, paddingHorizontal: 12, borderRadius: 7, borderWidth: 1, borderColor: desktop.border, flexDirection: 'row', alignItems: 'center', gap: 10 }, destinationActive: { backgroundColor: desktop.accentSoft, borderColor: 'rgba(155,123,255,.38)' }, destinationText: { color: desktop.text, fontSize: 12, flex: 1 },
  profileHero: { minHeight: 174, borderRadius: 12, padding: 26, borderWidth: 1, borderColor: desktop.border, backgroundColor: desktop.panel, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 22, marginBottom: 16 },
  profileAvatarWrap: { width: 96, height: 96 }, profileAvatarHover: { transform: [{ scale: 1.025 }] }, profileAvatar: { width: 96, height: 96, borderRadius: 30, alignItems: 'center', justifyContent: 'center', boxShadow: '0 14px 35px rgba(0,0,0,.3)' } as any, profileEmoji: { fontSize: 43 }, profileAvatarEdit: { position: 'absolute', right: -3, bottom: -3, width: 29, height: 29, borderRadius: 9, backgroundColor: desktop.hover, borderWidth: 2, borderColor: desktop.panel, alignItems: 'center', justifyContent: 'center' },
  profileNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 }, profileName: { color: desktop.text, fontSize: 24, fontWeight: '750' as any }, profileEmail: { color: desktop.muted, fontSize: 13, marginTop: 5 }, profileSince: { color: desktop.dim, fontSize: 10, fontWeight: '650' as any, letterSpacing: .45, textTransform: 'uppercase', marginTop: 10 }, profileActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  profileStats: { minHeight: 92, flexDirection: 'row', flexWrap: 'wrap', gap: 1, borderRadius: 11, borderWidth: 1, borderColor: desktop.border, overflow: 'hidden', backgroundColor: desktop.border, marginBottom: 20 }, profileStat: { flex: 1, minWidth: 180, paddingHorizontal: 20, paddingVertical: 17, backgroundColor: desktop.panel, flexDirection: 'row', alignItems: 'center', gap: 13 }, profileStatIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: desktop.accentSoft, alignItems: 'center', justifyContent: 'center' }, profileStatValue: { color: desktop.text, fontSize: 21, fontWeight: '750' as any }, profileStatLabel: { color: desktop.dim, fontSize: 9, fontWeight: '750' as any, letterSpacing: .9, marginTop: 3 },
  profileColumns: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 18 }, profileSection: { flex: 1, minWidth: 330, borderRadius: 11, borderWidth: 1, borderColor: desktop.border, backgroundColor: desktop.panel, overflow: 'hidden' }, profileSectionHead: { minHeight: 70, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: desktop.border }, profileSectionEyebrow: { color: desktop.accent, fontSize: 8, fontWeight: '800', letterSpacing: 1.15, marginBottom: 4 }, profileSectionTitle: { color: desktop.text, fontSize: 15, fontWeight: '700' }, profileSectionMeta: { color: desktop.dim, fontSize: 10, marginLeft: 'auto' }, profileHistory: { backgroundColor: desktop.panel }, profileHistoryRow: { minHeight: 59, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: desktop.border }, profileHistoryHover: { backgroundColor: desktop.hover }, profileRank: { width: 20, textAlign: 'center', color: desktop.dim, fontSize: 11, fontWeight: '700' }, profileTrackTitle: { color: desktop.text, fontSize: 12, fontWeight: '600' }, profileTrackArtist: { color: desktop.dim, fontSize: 10, marginTop: 3 }, profileCount: { minWidth: 38, height: 24, paddingHorizontal: 8, borderRadius: 12, backgroundColor: desktop.raised, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }, profileCountText: { color: desktop.muted, fontSize: 10, fontWeight: '700' }, profileRecentTime: { color: desktop.dim, fontSize: 10, width: 28, textAlign: 'right' }, profileHistoryEmpty: { minHeight: 190, padding: 28, alignItems: 'center', justifyContent: 'center', gap: 10 }, profileHistoryEmptyText: { color: desktop.dim, fontSize: 11, textAlign: 'center', lineHeight: 17, maxWidth: 260 },
  avatarPreview: { width: 88, height: 88, borderRadius: 28, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginBottom: 22 }, avatarPreviewEmoji: { fontSize: 40 }, avatarSwatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, avatarSwatchOuter: { width: 43, height: 43, borderRadius: 14, padding: 3, borderWidth: 2, borderColor: 'transparent' }, avatarSwatchSelected: { borderColor: desktop.text }, avatarSwatch: { flex: 1, borderRadius: 10 }, avatarEmojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, avatarEmojiCell: { width: 46, height: 46, borderRadius: 9, backgroundColor: desktop.raised, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' }, avatarEmojiSelected: { backgroundColor: desktop.accentSoft, borderColor: 'rgba(155,123,255,.55)' }, avatarEmojiText: { fontSize: 23 },
  settingsGrid: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: 18 }, settingsCard: { width: 430, maxWidth: '100%' as any, borderRadius: 10, borderWidth: 1, borderColor: desktop.border, backgroundColor: desktop.panel, overflow: 'hidden' }, settingsCardTitle: { height: 53, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: 1, borderBottomColor: desktop.border }, settingLine: { minHeight: 52, paddingHorizontal: 17, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: desktop.border, flexDirection: 'row', alignItems: 'center', gap: 12 }, settingHover: { backgroundColor: desktop.hover }, settingLabel: { color: desktop.text, fontSize: 12, fontWeight: '550' as any }, settingValue: { color: desktop.muted, fontSize: 12, textAlign: 'right', maxWidth: 230 }, settingDescription: { color: desktop.dim, fontSize: 10, marginTop: 4 }, smallSegment: { padding: 3, backgroundColor: desktop.bg, borderRadius: 7, flexDirection: 'row' }, smallSegmentItem: { minHeight: 30, paddingHorizontal: 10, borderRadius: 5, alignItems: 'center', justifyContent: 'center' }, smallSegmentActive: { backgroundColor: desktop.hover }, smallSegmentText: { color: desktop.dim, fontSize: 10 },
  player: { height: 76, backgroundColor: 'rgba(18,18,24,0.72)', borderRadius: 8, marginLeft: 8, marginRight: 8, marginTop: 4, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, zIndex: 25 }, playerTrack: { width: '30%', minWidth: 210, maxWidth: 390, flexDirection: 'row', alignItems: 'center', gap: 11 }, playerTitle: { color: desktop.text, fontSize: 12, fontWeight: '650' as any }, playerArtist: { color: desktop.muted, fontSize: 10, marginTop: 4 }, playerCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', maxWidth: 760 }, playerControls: { flexDirection: 'row', alignItems: 'center', gap: 6 }, playButton: { width: 35, height: 35, borderRadius: 18, backgroundColor: desktop.text, alignItems: 'center', justifyContent: 'center', marginHorizontal: 5 }, progressRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 3 }, timeText: { width: 35, color: desktop.dim, fontSize: 9, textAlign: 'center' }, progressHit: { flex: 1, height: 14, justifyContent: 'center', cursor: 'pointer' } as any, progressTrack: { height: 3, backgroundColor: '#353540', borderRadius: 2, overflow: 'hidden' }, progressFill: { height: 3, backgroundColor: desktop.text, borderRadius: 2 }, playerRight: { width: '30%', minWidth: 120, maxWidth: 390, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }, playerError: { color: desktop.danger, fontSize: 10, maxWidth: 220 },
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 16 }, volumeHit: { width: 90, height: 14, justifyContent: 'center', cursor: 'pointer' } as any, volumeTrack: { height: 4, backgroundColor: '#353540', borderRadius: 2, overflow: 'hidden' }, volumeFill: { height: 4, backgroundColor: '#A09DA9', borderRadius: 2 },

  socialTabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: desktop.border, marginHorizontal: 38, marginBottom: 12 },
  socialTab: { paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  socialTabText: { color: desktop.muted, fontSize: 13, fontWeight: '600' },
  inboxCard: { backgroundColor: desktop.panel, borderWidth: 1, borderColor: desktop.border, borderRadius: 10, padding: 14, marginHorizontal: 38 },
  inboxCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  inboxSender: { color: desktop.muted, fontSize: 11, fontWeight: '600' },
  inboxTrack: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, backgroundColor: desktop.raised, borderRadius: 8 },
  inboxMessageBubble: { marginTop: 8, padding: 10, backgroundColor: desktop.hover, borderRadius: 8 },
  inboxMessageText: { color: desktop.text, fontSize: 12, lineHeight: 17 },
  friendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 14, backgroundColor: desktop.panel, borderWidth: 1, borderColor: desktop.border, borderRadius: 9, marginHorizontal: 38 },
  nowPlayingContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 40, paddingTop: 20, alignItems: 'flex-start', marginHorizontal: 38 },
  nowPlayingLeft: { flex: 1.2, minWidth: 320, alignItems: 'center' },
  nowPlayingRight: { flex: 1, minWidth: 300, backgroundColor: 'rgba(255,255,255,0.02)', padding: 20, borderRadius: 12, borderWidth: 1, borderColor: desktop.border },
  nowPlayingArtworkWrap: { width: 320, height: 320, borderRadius: 18, overflow: 'hidden', backgroundColor: '#101016', shadowOffset: { width: 0, height: 24 }, shadowOpacity: 0.45, shadowRadius: 40, elevation: 12 },
  nowPlayingArtwork: { width: '100%', height: '100%' },
  nowPlayingArtworkFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#14141d' },
  nowPlayingMeta: { alignItems: 'center', marginTop: 24, textAlign: 'center', width: '100%', paddingHorizontal: 12 },
  nowPlayingTitle: { color: desktop.text, fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  nowPlayingArtist: { color: desktop.muted, fontSize: 16, fontWeight: '500', marginBottom: 12 },
  nowPlayingSourceTag: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: desktop.hover, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  nowPlayingSourceText: { color: desktop.dim, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  nowPlayingQueueTitle: { color: desktop.dim, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 16 },
  nowPlayingQueueList: { gap: 10 },
  nowPlayingQueueRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  nowPlayingQueueTrackTitle: { color: desktop.text, fontSize: 12, fontWeight: '600' },
  nowPlayingQueueTrackArtist: { color: desktop.dim, fontSize: 10, marginTop: 2 },
});
