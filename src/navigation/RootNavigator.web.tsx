import { Ionicons } from '@expo/vector-icons';
import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { addTracksToPlaylist, createPlaylist, deletePlaylist, getPlaylistTracks, listPlaylists } from '../api/playlists';
import { addSearchHistoryEntry, clearSearchHistory, getSearchHistory } from '../api/searchHistory';
import { getLibrary, removeFromLibrary, saveToLibrary } from '../api/library';
import { fetchYouTubePlaylist, searchYouTube } from '../api/youtube';
import { YouTubePlayerView } from '../components/YouTubePlayerView';
import { Artwork, Button, ContentScroll, desktop, Dialog, Empty, Field, formatTime, IconButton, Loading, Page, Toast, TrackTable, ui } from '../desktop/ui.web';
import {
  getAudioQuality, getDefaultYtViewMode, getShowRewindButton, getShowTrackDuration,
  setAudioQuality, setDefaultYtViewMode, setShowRewindButton, setShowTrackDuration,
} from '../lib/prefs';
import {
  AVATAR_EMOJIS, AVATAR_GRADIENTS, getAvatarChoice, setAvatarChoice,
  type AvatarChoice,
} from '../lib/avatarPrefs';
import {
  getMostPlayed, getPlayStats, getRecentlyPlayed,
  type PlayCountEntry, type PlayStats,
} from '../lib/playCounts';
import { useAuth } from '../state/auth';
import { usePlayer } from '../state/player';
import type { Playlist, Track } from '../types';

type PrimaryRoute = 'search' | 'songs' | 'artists' | 'playlists' | 'profile' | 'settings';
type Route =
  | { name: PrimaryRoute }
  | { name: 'artist'; value: string }
  | { name: 'playlist'; id: string; title: string }
  | { name: 'import' };

const PRIMARY: { id: PrimaryRoute; label: string; icon: keyof typeof Ionicons.glyphMap; shortcut?: string }[] = [
  { id: 'search', label: 'Search', icon: 'search-outline', shortcut: 'Ctrl+K' },
  { id: 'songs', label: 'Songs', icon: 'musical-notes-outline' },
  { id: 'artists', label: 'Artists', icon: 'people-outline' },
  { id: 'playlists', label: 'Playlists', icon: 'albums-outline' },
];

function injectDesktopDocumentStyles() {
  if (document.getElementById('duotone-desktop-css')) return;
  const style = document.createElement('style');
  style.id = 'duotone-desktop-css';
  style.textContent = `
    html,body,#root{width:100%;height:100%;margin:0;overflow:hidden;background:#09090d}
    *{box-sizing:border-box} body{font-family:Inter,"Segoe UI Variable Text","Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
    ::selection{background:rgba(155,123,255,.32)} ::-webkit-scrollbar{width:11px;height:11px}
    ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:#30303b;border:3px solid transparent;border-radius:8px;background-clip:padding-box}
    ::-webkit-scrollbar-thumb:hover{background:#494857;border:3px solid transparent;background-clip:padding-box}
    [data-focusable="true"]:focus-visible{outline:2px solid rgba(155,123,255,.85)!important;outline-offset:-2px}
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
    <View style={styles.titleBrand}><View style={styles.brandDots}><View style={[styles.brandDot, { backgroundColor: '#FF544D' }]} /><View style={[styles.brandDot, { backgroundColor: desktop.accent }]} /></View><Text style={styles.titleText}>Duotone</Text></View>
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
  const name = (session?.user.user_metadata?.name as string | undefined) || session?.user.email?.split('@')[0] || 'Profile';
  const active = route.name === 'artist' ? 'artists' : route.name === 'playlist' || route.name === 'import' ? 'playlists' : route.name;
  return <View style={styles.sidebar}>
    <ScrollView contentContainerStyle={styles.sidebarContent}>
      <Text style={styles.navLabel}>DISCOVER</Text>
      {PRIMARY.map((item) => <NavItem key={item.id} active={active === item.id} {...item} onPress={() => navigate({ name: item.id })} />)}
      <View style={styles.navDivider} /><Text style={styles.navLabel}>ACCOUNT</Text>
      <NavItem label="Profile" icon="person-circle-outline" active={active === 'profile'} onPress={() => navigate({ name: 'profile' })} />
      <NavItem label="Settings" icon="settings-outline" active={active === 'settings'} onPress={() => navigate({ name: 'settings' })} />
    </ScrollView>
    <Pressable onPress={() => navigate({ name: 'profile' })} style={({ hovered }) => [styles.account, hovered && styles.navHover]}><View style={styles.avatar}><Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.accountName}>{name}</Text><Text numberOfLines={1} style={styles.accountEmail}>{session?.user.email}</Text></View><Ionicons name="chevron-forward" size={14} color={desktop.dim} /></Pressable>
  </View>;
}

function NavItem({ label, icon, active, shortcut, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; active: boolean; shortcut?: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ hovered, focused, pressed }) => [styles.navItem, (hovered || focused) && styles.navHover, active && styles.navActive, pressed && ui.pressed]}><Ionicons name={icon} size={19} color={active ? desktop.text : desktop.muted} /><Text style={[styles.navText, active && styles.navTextActive]}>{label}</Text>{shortcut && <Text style={styles.shortcut}>{shortcut}</Text>}</Pressable>;
}

function AuthDesktop() {
  const signIn = useAuth((s) => s.signIn); const signUp = useAuth((s) => s.signUp);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin'); const [identifier, setIdentifier] = useState(''); const [email, setEmail] = useState(''); const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const submit = async () => { setBusy(true); setError(null); const message = mode === 'signin' ? await signIn(identifier, password) : await signUp(email, password, username); setError(message); setBusy(false); };
  return <View style={styles.auth}><View style={styles.authGlow} /><View style={styles.authCard}><View style={styles.authLogo}><View style={[styles.brandDot, { backgroundColor: '#FF544D' }]} /><View style={[styles.brandDot, { backgroundColor: desktop.accent }]} /></View><Text style={styles.authTitle}>Your music, in one place.</Text><Text style={styles.authBody}>Sign in to your Duotone library and continue listening across devices.</Text><View style={styles.segment}><Pressable onPress={() => setMode('signin')} style={[styles.segmentItem, mode === 'signin' && styles.segmentActive]}><Text style={styles.segmentText}>Sign in</Text></Pressable><Pressable onPress={() => setMode('signup')} style={[styles.segmentItem, mode === 'signup' && styles.segmentActive]}><Text style={styles.segmentText}>Create account</Text></Pressable></View>
    <View style={{ gap: 12 }}>{mode === 'signin' ? <Field icon="person-outline" placeholder="Email or username" value={identifier} onChangeText={setIdentifier} onSubmitEditing={submit} /> : <><Field icon="person-outline" placeholder="Username" value={username} onChangeText={setUsername} /><Field icon="mail-outline" placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" /></>}<Field icon="lock-closed-outline" placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry onSubmitEditing={submit} />{error && <Text style={styles.error}>{error}</Text>}<Button onPress={submit} disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</Button></View></View><Text style={styles.authFoot}>Duotone for Windows</Text></View>;
}

function useLibraryData() {
  const [tracks, setTracks] = useState<Track[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => { setLoading(true); try { setTracks(await getLibrary()); setError(null); } catch (e: any) { setError(e?.message || 'Could not load your library.'); } finally { setLoading(false); } }, []);
  useEffect(() => { refresh(); }, [refresh]);
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
  return <Page title="Songs" subtitle={`${data.tracks.length} saved ${data.tracks.length === 1 ? 'song' : 'songs'}`} action={<Button secondary icon="refresh" onPress={data.refresh}>Refresh</Button>}><ContentScroll>{data.loading ? <View style={{ height: 350 }}><Loading /></View> : <TrackTable tracks={data.tracks} onPlay={(t) => props.play(t, data.tracks)} onMore={props.more} empty={<Empty icon="musical-notes-outline" title="Your library is quiet" body="Save tracks from Search and they will be organised here." />} />}</ContentScroll></Page>;
}

function ArtistsPage({ navigate }: { navigate: (route: Route) => void }) {
  const data = useLibraryData();
  const artists = useMemo(() => { const map = new Map<string, Track[]>(); data.tracks.forEach((t) => { const key = t.artist || 'Unknown artist'; map.set(key, [...(map.get(key) || []), t]); }); return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])); }, [data.tracks]);
  return <Page title="Artists" subtitle={`${artists.length} artists in your library`}><ContentScroll>{data.loading ? <View style={{ height: 350 }}><Loading /></View> : artists.length ? <View style={styles.cardGrid}>{artists.map(([name, tracks]) => <Pressable key={name} onPress={() => navigate({ name: 'artist', value: name })} style={({ hovered, focused }) => [styles.mediaCard, (hovered || focused) && styles.cardHover]}><Artwork track={tracks[0]} size={138} /><Text numberOfLines={1} style={styles.cardTitle}>{name}</Text><Text style={styles.cardMeta}>{tracks.length} {tracks.length === 1 ? 'song' : 'songs'}</Text></Pressable>)}</View> : <Empty icon="people-outline" title="No artists yet" body="Artists are collected automatically from the tracks in your library." />}</ContentScroll></Page>;
}

function ArtistPage({ name, back, ...props }: { name: string; back: () => void } & CommonPageProps) {
  const data = useLibraryData(); const tracks = data.tracks.filter((t) => (t.artist || 'Unknown artist') === name);
  return <Page title={name} subtitle={`${tracks.length} saved ${tracks.length === 1 ? 'song' : 'songs'}`} action={<Button secondary icon="arrow-back" onPress={back}>Back to artists</Button>}><ContentScroll>{data.loading ? <View style={{ height: 350 }}><Loading /></View> : <TrackTable tracks={tracks} onPlay={(t) => props.play(t, tracks)} onMore={props.more} />}</ContentScroll></Page>;
}

function PlaylistsPage({ navigate, notify }: { navigate: (route: Route) => void; notify: (s: string) => void }) {
  const [items, setItems] = useState<Playlist[]>([]); const [loading, setLoading] = useState(true); const [createOpen, setCreateOpen] = useState(false); const [name, setName] = useState('');
  const refresh = useCallback(async () => { setLoading(true); try { setItems(await listPlaylists()); } catch (e: any) { notify(e?.message || 'Could not load playlists.'); } finally { setLoading(false); } }, [notify]);
  useEffect(() => { refresh(); }, [refresh]);
  const create = async () => { if (!name.trim()) return; try { const item = await createPlaylist(name.trim()); setCreateOpen(false); setName(''); navigate({ name: 'playlist', id: item.id, title: item.name }); } catch (e: any) { notify(e?.message || 'Could not create playlist.'); } };
  return <><Page title="Playlists" subtitle="Build collections for any moment." action={<View style={{ flexDirection: 'row', gap: 10 }}><Button secondary icon="logo-youtube" onPress={() => navigate({ name: 'import' })}>Import</Button><Button icon="add" onPress={() => setCreateOpen(true)}>New playlist</Button></View>}><ContentScroll>{loading ? <View style={{ height: 350 }}><Loading /></View> : items.length ? <View style={styles.playlistGrid}>{items.map((item) => <Pressable key={item.id} onPress={() => navigate({ name: 'playlist', id: item.id, title: item.name })} style={({ hovered, focused }) => [styles.playlistCard, (hovered || focused) && styles.cardHover]}><View style={styles.playlistArt}>{item.artworks[0] ? <Image source={{ uri: item.artworks[0] }} style={StyleSheet.absoluteFill} /> : <Ionicons name="musical-notes" size={36} color={desktop.dim} />}</View><Text numberOfLines={1} style={styles.cardTitle}>{item.name}</Text><Text style={styles.cardMeta}>{item.trackCount} {item.trackCount === 1 ? 'track' : 'tracks'}</Text></Pressable>)}</View> : <Empty icon="albums-outline" title="Create your first playlist" body="Group tracks into focused collections, or import an existing YouTube playlist." action={<Button onPress={() => setCreateOpen(true)}>New playlist</Button>} />}</ContentScroll></Page><Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="New playlist"><Field autoFocus placeholder="Playlist name" value={name} onChangeText={setName} onSubmitEditing={create} /><View style={styles.dialogActions}><Button secondary onPress={() => setCreateOpen(false)}>Cancel</Button><Button onPress={create}>Create</Button></View></Dialog></>;
}

function PlaylistPage({ id, title, back, ...props }: { id: string; title: string; back: () => void } & CommonPageProps) {
  const [tracks, setTracks] = useState<Track[]>([]); const [loading, setLoading] = useState(true); const [confirm, setConfirm] = useState(false);
  const refresh = useCallback(async () => { setLoading(true); try { setTracks(await getPlaylistTracks(id)); } catch (e: any) { props.notify(e?.message || 'Could not load playlist.'); } finally { setLoading(false); } }, [id, props.notify]);
  useEffect(() => { refresh(); }, [refresh]);
  const remove = async () => { try { await deletePlaylist(id); back(); } catch (e: any) { props.notify(e?.message || 'Could not delete playlist.'); } };
  return <><Page title={title} subtitle={`${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'}`} action={<View style={{ flexDirection: 'row', gap: 8 }}><Button secondary icon="arrow-back" onPress={back}>Playlists</Button><IconButton name="trash-outline" label="Delete playlist" onPress={() => setConfirm(true)} /></View>}><ContentScroll>{loading ? <View style={{ height: 350 }}><Loading /></View> : <TrackTable tracks={tracks} onPlay={(t) => props.play(t, tracks)} onMore={props.more} empty={<Empty icon="add-circle-outline" title="This playlist is empty" body="Use track actions from Search or Songs to add music here." />} />}</ContentScroll></Page><Dialog open={confirm} title="Delete playlist?" onClose={() => setConfirm(false)}><Text style={styles.dialogBody}>“{title}” will be deleted. Tracks in your library will not be affected.</Text><View style={styles.dialogActions}><Button secondary onPress={() => setConfirm(false)}>Cancel</Button><Button danger onPress={remove}>Delete</Button></View></Dialog></>;
}

function ImportPage({ back, notify }: { back: () => void; notify: (s: string) => void }) {
  const [url, setUrl] = useState(''); const [loading, setLoading] = useState(false); const [preview, setPreview] = useState<Awaited<ReturnType<typeof fetchYouTubePlaylist>> | null>(null); const [playlists, setPlaylists] = useState<Playlist[]>([]); const [target, setTarget] = useState<string>('');
  useEffect(() => { listPlaylists().then((p) => { setPlaylists(p); setTarget(p[0]?.id || ''); }); }, []);
  const inspect = async () => { setLoading(true); try { setPreview(await fetchYouTubePlaylist(url)); } catch (e: any) { notify(e?.message || 'Could not read playlist.'); } finally { setLoading(false); } };
  const runImport = async () => { if (!preview || !target) return; setLoading(true); try { await addTracksToPlaylist(target, preview.items.map((x) => ({ source: 'youtube', sourceId: x.videoId, title: x.title, artist: x.channel || null, album: null, artworkUrl: x.thumbnail, durationSeconds: null }))); notify(`Imported ${preview.items.length} tracks.`); back(); } catch (e: any) { notify(e?.message || 'Import failed.'); } finally { setLoading(false); } };
  return <Page title="Import from YouTube" subtitle="Bring an existing playlist into your Duotone collection." action={<Button secondary icon="arrow-back" onPress={back}>Playlists</Button>}><ContentScroll><View style={styles.importPanel}><Text style={styles.formLabel}>YOUTUBE PLAYLIST URL</Text><View style={styles.searchBar}><Field icon="logo-youtube" placeholder="https://youtube.com/playlist?list=…" value={url} onChangeText={setUrl} onSubmitEditing={inspect} /><Button onPress={inspect} disabled={loading}>Preview</Button></View>{preview && <><View style={styles.importSummary}><View><Text style={styles.sectionTitle}>{preview.title}</Text><Text style={styles.cardMeta}>{preview.items.length} available tracks</Text></View></View><Text style={styles.formLabel}>DESTINATION</Text><View style={styles.destinationGrid}>{playlists.map((p) => <Pressable key={p.id} onPress={() => setTarget(p.id)} style={[styles.destination, target === p.id && styles.destinationActive]}><Ionicons name={target === p.id ? 'radio-button-on' : 'radio-button-off'} color={target === p.id ? desktop.accent : desktop.dim} size={18} /><Text style={styles.destinationText}>{p.name}</Text></Pressable>)}</View>{!playlists.length && <Text style={styles.dialogBody}>Create a playlist first, then return to import.</Text>}<View style={styles.dialogActions}><Button onPress={runImport} disabled={!target || loading}>Import {preview.items.length} tracks</Button></View></>}</View></ContentScroll></Page>;
}

function playEntryToTrack(entry: PlayCountEntry): Track {
  return { source: entry.source, sourceId: entry.sourceId, title: entry.title, artist: entry.artist, album: null, artworkUrl: entry.artworkUrl, durationSeconds: entry.durationSeconds };
}

function memberSince(iso?: string): string {
  if (!iso) return 'Member';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'Member' : `Member since ${date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
}

function ProfilePage({ navigate, notify }: { navigate: (r: Route) => void; notify: (s: string) => void }) {
  const session = useAuth((s) => s.session); const updateName = useAuth((s) => s.updateName); const signOut = useAuth((s) => s.signOut); const resetPassword = useAuth((s) => s.resetPassword);
  const currentName = (session?.user.user_metadata?.username as string | undefined) || (session?.user.user_metadata?.name as string | undefined) || session?.user.email?.split('@')[0] || 'Listener'; const [name, setName] = useState(currentName); const [editing, setEditing] = useState(false);
  const [avatar, setAvatar] = useState<AvatarChoice>({ emoji: AVATAR_EMOJIS[0], gradientIndex: 0 }); const [avatarOpen, setAvatarOpen] = useState(false); const [stats, setStats] = useState<PlayStats | null>(null); const [mostPlayed, setMostPlayed] = useState<PlayCountEntry[]>([]); const [recent, setRecent] = useState<PlayCountEntry[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(true); Promise.all([getAvatarChoice(), getPlayStats(), getMostPlayed(20), getRecentlyPlayed(12)]).then(([a, s, m, r]) => { setAvatar(a); setStats(s); setMostPlayed(m); setRecent(r); }).finally(() => setLoading(false)); }, []);
  const save = async () => { const e = await updateName(name); if (e) notify(e); else { setEditing(false); notify('Profile updated.'); } };
  const saveAvatar = async (choice: AvatarChoice) => { setAvatar(choice); await setAvatarChoice(choice); };
  const playHistory = (entry: PlayCountEntry) => usePlayer.getState().playTrack(playEntryToTrack(entry), mostPlayed.map(playEntryToTrack));
  return <Page title="Profile" subtitle="Your account and listening history." action={<Button secondary icon="settings-outline" onPress={() => navigate({ name: 'settings' })}>Settings</Button>}><ContentScroll>{loading ? <View style={{ height: 350 }}><Loading /></View> : <><View style={styles.profileHero}><Pressable onPress={() => setAvatarOpen(true)} style={({ hovered }) => [styles.profileAvatarWrap, hovered && styles.profileAvatarHover]}><View style={[styles.profileAvatar, { backgroundImage: `linear-gradient(135deg, ${AVATAR_GRADIENTS[avatar.gradientIndex][0]}, ${AVATAR_GRADIENTS[avatar.gradientIndex][1]})` } as any]}><Text style={styles.profileEmoji}>{avatar.emoji}</Text></View><View style={styles.profileAvatarEdit}><Ionicons name="pencil" size={12} color={desktop.text} /></View></Pressable><View style={{ flex: 1 }}><View style={styles.profileNameRow}><Text style={styles.profileName}>{currentName}</Text><IconButton name="pencil-outline" label="Edit username" onPress={() => setEditing(true)} /></View><Text style={styles.profileEmail}>{session?.user.email}</Text><Text style={styles.profileSince}>{memberSince(session?.user.created_at)}</Text></View><View style={styles.profileActions}><Button secondary icon="key-outline" onPress={async () => { const e = await resetPassword(); notify(e || 'Password reset email sent.'); }}>Reset password</Button><Button secondary icon="log-out-outline" onPress={() => signOut()}>Sign out</Button></View></View>
    <View style={styles.profileStats}><ProfileStat icon="play" label="TOTAL PLAYS" value={String(stats?.totalPlays || 0)} /><ProfileStat icon="musical-notes" label="UNIQUE TRACKS" value={String(stats?.uniqueTracks || 0)} /><ProfileStat icon="person" label="TOP ARTIST" value={stats?.topArtist?.name || '—'} wide /></View>
    <View style={styles.profileColumns}><View style={styles.profileSection}><View style={styles.profileSectionHead}><View><Text style={styles.profileSectionEyebrow}>LISTENING INSIGHTS</Text><Text style={styles.profileSectionTitle}>Most played</Text></View><Text style={styles.profileSectionMeta}>{mostPlayed.length} tracks</Text></View><ProfileHistory entries={mostPlayed} ranked onPlay={playHistory} empty="Play some music and your favourites will appear here." /></View><View style={styles.profileSection}><View style={styles.profileSectionHead}><View><Text style={styles.profileSectionEyebrow}>HISTORY</Text><Text style={styles.profileSectionTitle}>Recently played</Text></View></View><ProfileHistory entries={recent} onPlay={playHistory} empty="Your recent listening history will appear here." /></View></View></>}</ContentScroll>
    <Dialog open={editing} title="Edit profile" onClose={() => setEditing(false)}><Text style={styles.formLabel}>USERNAME</Text><Field autoFocus maxLength={24} value={name} onChangeText={setName} onSubmitEditing={save} /><View style={styles.dialogActions}><Button secondary onPress={() => setEditing(false)}>Cancel</Button><Button onPress={save}>Save changes</Button></View></Dialog>
    <AvatarDialog open={avatarOpen} value={avatar} onChange={saveAvatar} onClose={() => setAvatarOpen(false)} />
  </Page>;
}

function ProfileStat({ icon, label, value, wide = false }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; wide?: boolean }) { return <View style={[styles.profileStat, wide && { flex: 1.5 }]}><View style={styles.profileStatIcon}><Ionicons name={icon} size={17} color={desktop.accent} /></View><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={[styles.profileStatValue, wide && { fontSize: 17 }]}>{value}</Text><Text style={styles.profileStatLabel}>{label}</Text></View></View>; }

function ProfileHistory({ entries, ranked = false, onPlay, empty }: { entries: PlayCountEntry[]; ranked?: boolean; onPlay: (entry: PlayCountEntry) => void; empty: string }) {
  if (!entries.length) return <View style={styles.profileHistoryEmpty}><Ionicons name="musical-notes-outline" size={24} color={desktop.dim} /><Text style={styles.profileHistoryEmptyText}>{empty}</Text></View>;
  return <View style={styles.profileHistory}>{entries.map((entry, index) => <Pressable key={`${ranked ? 'm' : 'r'}:${entry.source}:${entry.sourceId}`} onPress={() => onPlay(entry)} style={({ hovered, focused }) => [styles.profileHistoryRow, (hovered || focused) && styles.profileHistoryHover]}>{ranked && <Text style={styles.profileRank}>{index + 1}</Text>}<Artwork track={playEntryToTrack(entry)} size={42} /><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={styles.profileTrackTitle}>{entry.title}</Text><Text numberOfLines={1} style={styles.profileTrackArtist}>{entry.artist || 'YouTube'}</Text></View>{ranked ? <View style={styles.profileCount}><Ionicons name="play" size={9} color={desktop.muted} /><Text style={styles.profileCountText}>{entry.count}</Text></View> : <Text style={styles.profileRecentTime}>{relativeTime(entry.lastPlayed)}</Text>}</Pressable>)}</View>;
}

function relativeTime(timestamp: number): string { const delta = Date.now() - timestamp; const mins = Math.floor(delta / 60000); if (mins < 1) return 'Now'; if (mins < 60) return `${mins}m`; const hours = Math.floor(mins / 60); if (hours < 24) return `${hours}h`; return `${Math.floor(hours / 24)}d`; }

function AvatarDialog({ open, value, onChange, onClose }: { open: boolean; value: AvatarChoice; onChange: (value: AvatarChoice) => void; onClose: () => void }) {
  const gradient = AVATAR_GRADIENTS[value.gradientIndex];
  return <Dialog open={open} title="Your avatar" onClose={onClose} width={510}><View style={[styles.avatarPreview, { backgroundImage: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` } as any]}><Text style={styles.avatarPreviewEmoji}>{value.emoji}</Text></View><Text style={styles.formLabel}>COLOUR</Text><View style={styles.avatarSwatches}>{AVATAR_GRADIENTS.map((pair, index) => <Pressable key={pair.join('-')} accessibilityLabel={`Colour ${index + 1}`} onPress={() => onChange({ ...value, gradientIndex: index })} style={[styles.avatarSwatchOuter, value.gradientIndex === index && styles.avatarSwatchSelected]}><View style={[styles.avatarSwatch, { backgroundImage: `linear-gradient(135deg, ${pair[0]}, ${pair[1]})` } as any]} /></Pressable>)}</View><Text style={[styles.formLabel, { marginTop: 20 }]}>EMOJI</Text><View style={styles.avatarEmojiGrid}>{AVATAR_EMOJIS.map((emoji) => <Pressable key={emoji} onPress={() => onChange({ ...value, emoji })} style={({ hovered }) => [styles.avatarEmojiCell, hovered && styles.settingHover, value.emoji === emoji && styles.avatarEmojiSelected]}><Text style={styles.avatarEmojiText}>{emoji}</Text></Pressable>)}</View><View style={styles.dialogActions}><Button onPress={onClose}>Done</Button></View></Dialog>;
}

function SettingsPage({ notify }: { notify: (s: string) => void }) {
  const [duration, setDurationState] = useState(true); const [rewind, setRewindState] = useState(false); const [quality, setQualityState] = useState<'high' | 'saver'>('high'); const [view, setViewState] = useState<'video' | 'photo'>('video');
  useEffect(() => { Promise.all([getShowTrackDuration(), getShowRewindButton(), getAudioQuality(), getDefaultYtViewMode()]).then(([a, b, c, d]) => { setDurationState(a); setRewindState(b); setQualityState(c); setViewState(d); }); }, []);
  return <Page title="Settings" subtitle="Desktop playback, appearance, and account preferences."><ContentScroll><View style={styles.settingsGrid}><SettingsCard icon="play-circle-outline" title="Playback"><ToggleLine label="Show track duration" description="Display a time column in track lists." value={duration} onChange={(v) => { setDurationState(v); setShowTrackDuration(v); }} /><ToggleLine label="15-second rewind" description="Show a rewind control in the desktop player." value={rewind} onChange={(v) => { setRewindState(v); setShowRewindButton(v); usePlayer.getState().setShowRewindButton(v); }} /><ChoiceLine label="Audio quality" value={quality} choices={[['high', 'High'], ['saver', 'Data saver']]} onChange={(v) => { const next = v as 'high' | 'saver'; setQualityState(next); setAudioQuality(next); }} /></SettingsCard><SettingsCard icon="desktop-outline" title="Desktop"><ChoiceLine label="Now playing artwork" value={view} choices={[['video', 'Video'], ['photo', 'Artwork']]} onChange={(v) => { const next = v as 'video' | 'photo'; setViewState(next); setDefaultYtViewMode(next); }} /><SettingLine label="Keyboard shortcuts" value="Enabled" /><SettingLine label="Window layout" value="Responsive" /></SettingsCard><SettingsCard icon="information-circle-outline" title="About"><SettingLine label="Application" value="Duotone for Windows" /><SettingLine label="Version" value="1.0.0" /><SettingAction label="Preferences saved automatically" onPress={() => notify('All preferences are up to date.')} /></SettingsCard></View></ContentScroll></Page>;
}

function SettingsCard({ icon, title, children }: { icon: keyof typeof Ionicons.glyphMap; title: string; children: ReactNode }) { return <View style={styles.settingsCard}><View style={styles.settingsCardTitle}><Ionicons name={icon} size={19} color={desktop.accent} /><Text style={styles.sectionTitle}>{title}</Text></View>{children}</View>; }
function SettingLine({ label, value }: { label: string; value: string }) { return <View style={styles.settingLine}><Text style={styles.settingLabel}>{label}</Text><Text numberOfLines={1} style={styles.settingValue}>{value}</Text></View>; }
function SettingAction({ label, onPress, danger = false }: { label: string; onPress: () => void; danger?: boolean }) { return <Pressable onPress={onPress} style={({ hovered }) => [styles.settingLine, hovered && styles.settingHover]}><Text style={[styles.settingLabel, danger && { color: desktop.danger }]}>{label}</Text><Ionicons name="chevron-forward" size={15} color={desktop.dim} /></Pressable>; }
function ToggleLine({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: (v: boolean) => void }) { return <View style={styles.settingLine}><View style={{ flex: 1 }}><Text style={styles.settingLabel}>{label}</Text><Text style={styles.settingDescription}>{description}</Text></View><Switch value={value} onValueChange={onChange} trackColor={{ false: '#33333D', true: '#7659D4' }} thumbColor="#F4F3F7" /></View>; }
function ChoiceLine({ label, value, choices, onChange }: { label: string; value: string; choices: [string, string][]; onChange: (v: string) => void }) { return <View style={[styles.settingLine, { alignItems: 'flex-start' }]}><Text style={[styles.settingLabel, { flex: 1, marginTop: 8 }]}>{label}</Text><View style={styles.smallSegment}>{choices.map(([id, text]) => <Pressable key={id} onPress={() => onChange(id)} style={[styles.smallSegmentItem, value === id && styles.smallSegmentActive]}><Text style={[styles.smallSegmentText, value === id && { color: desktop.text }]}>{text}</Text></Pressable>)}</View></View>; }

function PlayerBar() {
  const p = usePlayer(); const ratio = p.durationMs ? Math.min(1, p.positionMs / p.durationMs) : 0;
  if (!p.current) return null;
  const seek = (e: any) => { const rect = e.currentTarget.getBoundingClientRect(); p.seekTo(((e.clientX - rect.left) / rect.width) * p.durationMs); };
  return <View style={styles.player}><YouTubePlayerView track={p.current} /><Pressable style={styles.playerTrack} onPress={() => p.setExpanded(!p.expanded)}><Artwork track={p.current} size={52} /><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={styles.playerTitle}>{p.current.title}</Text><Text numberOfLines={1} style={styles.playerArtist}>{p.current.artist || 'Unknown artist'}</Text></View></Pressable><View style={styles.playerCenter}><View style={styles.playerControls}><IconButton name="shuffle" label="Shuffle" active={p.shuffle} onPress={p.toggleShuffle} /><IconButton name="play-skip-back" label="Previous" onPress={p.prev} /><Pressable accessibilityLabel={p.isPlaying ? 'Pause' : 'Play'} onPress={p.togglePlay} style={({ hovered, pressed }) => [styles.playButton, hovered && { transform: [{ scale: 1.05 }] }, pressed && { transform: [{ scale: .97 }] }]}><Ionicons name={p.buffering ? 'hourglass-outline' : p.isPlaying ? 'pause' : 'play'} size={19} color="#111117" /></Pressable><IconButton name="play-skip-forward" label="Next" onPress={p.next} /><IconButton name={p.repeatMode === 'one' ? 'repeat' : 'repeat-outline'} label="Repeat" active={p.repeatMode !== 'off'} onPress={p.cycleRepeat} /></View><View style={styles.progressRow}><Text style={styles.timeText}>{formatTime(p.positionMs / 1000)}</Text><Pressable onPress={seek} style={styles.progressHit}><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${ratio * 100}%` }]} /></View></Pressable><Text style={styles.timeText}>{formatTime(p.durationMs / 1000)}</Text></View></View><View style={styles.playerRight}>{p.error && <Text numberOfLines={1} style={styles.playerError}>{p.error}</Text>}<IconButton name="close" label="Close player" onPress={p.close} /></View></View>;
}

function DesktopShell() {
  const [route, setRoute] = useState<Route>({ name: 'search' }); const history = useRef<Route[]>([]); const [toast, setToast] = useState(''); const [trackMenu, setTrackMenu] = useState<Track | null>(null); const [playlists, setPlaylists] = useState<Playlist[]>([]); const [playlistDialog, setPlaylistDialog] = useState(false);
  const navigate = useCallback((next: Route) => { setRoute((current) => { history.current.push(current); return next; }); }, []);
  const back = useCallback(() => setRoute(history.current.pop() || { name: 'playlists' }), []);
  const notify = useCallback((s: string) => setToast(s), []);
  const play = useCallback((track: Track, queue?: Track[]) => { usePlayer.getState().playTrack(track, queue); }, []);
  const more = useCallback((track: Track) => {
    setTrackMenu(track);
    if (window.duotoneDesktop) window.duotoneDesktop.showContextMenu([{ id: 'play', label: 'Play now' }, { id: 'save', label: 'Save to library' }, { id: 'playlist', label: 'Add to playlist…' }]);
    else setPlaylistDialog(true);
  }, []);
  useEffect(() => window.duotoneDesktop?.onContextMenuSelection(async (id) => {
    const track = trackMenu; if (!track) return;
    if (id === 'play') play(track); if (id === 'save') { try { await saveToLibrary(track); notify('Saved to your library.'); } catch (e: any) { notify(e?.message || 'Could not save track.'); } }
    if (id === 'playlist') { setPlaylists(await listPlaylists()); setPlaylistDialog(true); }
  }), [trackMenu, play, notify]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { const mod = e.ctrlKey || e.metaKey; if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setRoute({ name: 'search' }); setTimeout(() => window.dispatchEvent(new Event('duotone:focus-search')), 0); } if (mod && e.key === ',') { e.preventDefault(); setRoute({ name: 'settings' }); } if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); usePlayer.getState().togglePlay(); } if (e.altKey && e.key === 'ArrowLeft') back(); };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [back]);
  const addTo = async (id: string) => { if (!trackMenu) return; const { addTrackToPlaylist } = await import('../api/playlists'); try { await addTrackToPlaylist(id, trackMenu); setPlaylistDialog(false); notify('Added to playlist.'); } catch (e: any) { notify(e?.message || 'Could not add track.'); } };
  const common = { play, notify, more };
  let page: ReactNode;
  switch (route.name) {
    case 'search': page = <SearchPage {...common} />; break; case 'songs': page = <SongsPage {...common} />; break; case 'artists': page = <ArtistsPage navigate={navigate} />; break;
    case 'artist': page = <ArtistPage name={route.value} back={back} {...common} />; break; case 'playlists': page = <PlaylistsPage navigate={navigate} notify={notify} />; break; case 'playlist': page = <PlaylistPage id={route.id} title={route.title} back={back} {...common} />; break;
    case 'import': page = <ImportPage back={back} notify={notify} />; break; case 'profile': page = <ProfilePage navigate={navigate} notify={notify} />; break; case 'settings': page = <SettingsPage notify={notify} />; break;
  }
  return <View style={styles.root}><TitleBar /><View style={styles.main}><Sidebar route={route} navigate={navigate} /><View style={styles.content}>{page}</View></View><PlayerBar />{toast && <Toast message={toast} onDone={() => setToast('')} />}<Dialog open={playlistDialog} title="Add to playlist" onClose={() => setPlaylistDialog(false)}>{playlists.length ? <View style={{ gap: 6 }}>{playlists.map((p) => <Pressable key={p.id} onPress={() => addTo(p.id)} style={({ hovered }) => [styles.destination, hovered && styles.settingHover]}><Ionicons name="albums-outline" size={18} color={desktop.accent} /><Text style={styles.destinationText}>{p.name}</Text></Pressable>)}</View> : <Empty icon="albums-outline" title="No playlists" body="Create a playlist first, then add this track." />}</Dialog></View>;
}

export function RootNavigator() {
  const initialized = useAuth((s) => s.initialized); const session = useAuth((s) => s.session);
  useEffect(injectDesktopDocumentStyles, []);
  if (!initialized) return <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}><Loading /></View>;
  return session ? <DesktopShell /> : <><TitleBar /><AuthDesktop /></>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: desktop.bg, color: desktop.text } as any,
  titleBar: { height: 38, backgroundColor: '#0C0C11', borderBottomWidth: 1, borderBottomColor: desktop.border, flexDirection: 'row', alignItems: 'stretch', zIndex: 20, WebkitAppRegion: 'drag' } as any,
  titleBrand: { width: 224, flexDirection: 'row', alignItems: 'center', paddingLeft: 15, gap: 9 }, brandDots: { flexDirection: 'row', gap: 3 }, brandDot: { width: 8, height: 8, borderRadius: 4 }, titleText: { color: desktop.muted, fontSize: 12, fontWeight: '600' }, dragRegion: { flex: 1 }, windowButtons: { flexDirection: 'row', WebkitAppRegion: 'no-drag' } as any, windowButton: { width: 46, height: 37, alignItems: 'center', justifyContent: 'center' }, windowButtonHover: { backgroundColor: desktop.hover }, closeHover: { backgroundColor: '#C42B3B' },
  main: { flex: 1, flexDirection: 'row', minHeight: 0 }, sidebar: { width: 224, backgroundColor: '#0D0D12', borderRightWidth: 1, borderRightColor: desktop.border }, sidebarContent: { padding: 12, paddingTop: 22 }, navLabel: { color: desktop.dim, fontSize: 9, fontWeight: '800', letterSpacing: 1.35, marginHorizontal: 10, marginBottom: 8, marginTop: 5 }, navItem: { height: 38, paddingHorizontal: 10, borderRadius: 7, flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 3 }, navHover: { backgroundColor: desktop.hover }, navActive: { backgroundColor: desktop.accentSoft }, navText: { color: desktop.muted, fontSize: 13, fontWeight: '550' as any, flex: 1 }, navTextActive: { color: desktop.text, fontWeight: '650' as any }, shortcut: { color: desktop.dim, fontSize: 9 }, navDivider: { height: 1, backgroundColor: desktop.border, marginVertical: 14, marginHorizontal: 8 },
  account: { minHeight: 67, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: desktop.border, flexDirection: 'row', alignItems: 'center', gap: 10 }, avatar: { width: 31, height: 31, borderRadius: 9, backgroundColor: '#3D315E', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: desktop.text, fontSize: 12, fontWeight: '800' }, accountName: { color: desktop.text, fontSize: 12, fontWeight: '650' as any }, accountEmail: { color: desktop.dim, fontSize: 10, marginTop: 2 }, content: { flex: 1, minWidth: 0, backgroundColor: desktop.bg },
  auth: { flex: 1, backgroundColor: desktop.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, authGlow: { position: 'absolute', width: 720, height: 720, borderRadius: 360, backgroundColor: 'rgba(111,72,210,.12)', top: -360 }, authCard: { width: 440, maxWidth: 'calc(100vw - 48px)' as any, padding: 36, borderRadius: 14, backgroundColor: desktop.panel, borderWidth: 1, borderColor: desktop.border, boxShadow: '0 30px 100px rgba(0,0,0,.55)' } as any, authLogo: { flexDirection: 'row', gap: 5, marginBottom: 25 }, authTitle: { color: desktop.text, fontSize: 27, fontWeight: '750' as any, letterSpacing: -.4 }, authBody: { color: desktop.muted, fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: 24 }, segment: { height: 38, padding: 3, borderRadius: 8, backgroundColor: desktop.bg, flexDirection: 'row', marginBottom: 18 }, segmentItem: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 6 }, segmentActive: { backgroundColor: desktop.raised }, segmentText: { color: desktop.text, fontSize: 12, fontWeight: '600' }, error: { color: '#FF858A', fontSize: 12, lineHeight: 17 }, authFoot: { color: desktop.dim, fontSize: 10, marginTop: 20 },
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
  player: { height: 82, borderTopWidth: 1, borderTopColor: desktop.border, backgroundColor: '#0E0E14', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, zIndex: 25 }, playerTrack: { width: '30%', minWidth: 210, maxWidth: 390, flexDirection: 'row', alignItems: 'center', gap: 11 }, playerTitle: { color: desktop.text, fontSize: 12, fontWeight: '650' as any }, playerArtist: { color: desktop.muted, fontSize: 10, marginTop: 4 }, playerCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', maxWidth: 620 }, playerControls: { flexDirection: 'row', alignItems: 'center', gap: 6 }, playButton: { width: 35, height: 35, borderRadius: 18, backgroundColor: desktop.text, alignItems: 'center', justifyContent: 'center', marginHorizontal: 5 }, progressRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 3 }, timeText: { width: 35, color: desktop.dim, fontSize: 9, textAlign: 'center' }, progressHit: { flex: 1, height: 14, justifyContent: 'center' }, progressTrack: { height: 3, backgroundColor: '#353540', borderRadius: 2, overflow: 'hidden' }, progressFill: { height: 3, backgroundColor: desktop.text, borderRadius: 2 }, playerRight: { width: '30%', minWidth: 120, maxWidth: 390, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }, playerError: { color: desktop.danger, fontSize: 10, maxWidth: 220 },
});
