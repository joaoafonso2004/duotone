import { displayArtist } from '../../lib/artistName';
/**
 * Perfil e "A tua escuta".
 *
 * As estatísticas são uma ESTIMATIVA e a UI tem de o dizer (o "≈"): a tabela
 * `plays` regista o ARRANQUE de cada faixa e não o fim, por isso quem salta a
 * meio conta o tema inteiro. Ver `lib/listeningStats.ts`.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { fetchListeningStats, type StatsResult } from '../../api/listeningStats';
import { formatListeningTime, type StatsPeriod, type TimelineBucket } from '../../lib/listeningStats';
import {
  getProfilePlayStats, getProfileMostPlayed, getProfileRecentlyPlayed, type ProfilePlayEntry, type DbPlayStats,
} from '../../api/plays';
import { getFriendCount } from '../../api/social';
import {
  AVATAR_EMOJIS, AVATAR_GRADIENTS, getAvatarChoice, setAvatarChoice, type AvatarChoice,
} from '../../lib/avatarPrefs';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../state/auth';
import { usePlayer } from '../../state/player';
import { useTheme } from '../../state/theme';
import type { Track } from '../../types';
import type { Route } from '../rotas';
import { styles } from '../estilos.web';
import {
  Artwork, Button, ContentScroll, desktop, Dialog, Empty, Field, IconButton, Loading, Page,
} from '../ui.web';
import { memberSince, playEntryToTrack, relativeTime } from './comum.web';

const P = Pressable as any;
const V = View as any;

export const STATS_PERIODS: [StatsPeriod, string][] = [['30d', 'Last 30 days'], ['6m', 'Last 6 months'], ['all', 'All time']];

export function StatsPage({ back, play }: { back: () => void; play: (t: Track, q?: Track[]) => void }) {
  const theme = useTheme((s) => s.theme);
  const [period, setPeriod] = useState<StatsPeriod>('30d');
  const [result, setResult] = useState<StatsResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchListeningStats(period)
      .then((r) => { if (alive) setResult(r); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [period]);

  const stats = result?.stats;
  const playTop = (t: { source: string; sourceId: string; title: string; artist: string | null; artworkUrl: string | null }) => {
    const track: Track = { source: t.source as Track['source'], sourceId: t.sourceId, title: t.title, artist: t.artist, album: null, artworkUrl: t.artworkUrl, durationSeconds: null };
    play(track, [track]);
  };

  const periodPicker = <View style={styles.smallSegment}>{STATS_PERIODS.map(([value, label]) => (
    <P key={value} onPress={() => setPeriod(value)} style={({ hovered }: any) => [styles.smallSegmentItem, period === value && styles.smallSegmentActive, hovered && styles.settingHover]}>
      <Text style={[styles.smallSegmentText, period === value && { color: desktop.text }]}>{label}</Text>
    </P>))}</View>;

  return <Page title="Your listening" subtitle="How much you played, and what." action={<View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>{periodPicker}<Button secondary icon="arrow-back" onPress={back}>Profile</Button></View>}>
    <ContentScroll>
      {loading ? <View style={{ height: 320 }}><Loading /></View>
        : result?.unavailable ? <Empty icon="cloud-offline-outline" title="History unavailable" body="The database returned no history. Run supabase/listening-stats.sql in the SQL Editor." />
        : !stats || stats.totalPlays === 0 ? <Empty icon="stats-chart-outline" title="Nothing to show yet" body="Play some music and your statistics will appear here." />
        : <>
          <V style={[styles.statsHero, { backgroundImage: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})` } as any]}>
            <Text style={styles.statsHeroLabel}>TIME LISTENED</Text>
            <Text style={styles.statsHeroValue}>{'\u2248'} {formatListeningTime(stats.estimatedMinutes)}</Text>
            {/* O historico regista o ARRANQUE de cada faixa, nao o fim - dai o simbolo de aproximacao. */}
            <Text style={styles.statsHeroNote}>estimated from {stats.totalPlays} plays</Text>
          </V>

          <View style={styles.statsGrid}>
            <StatCell label="Tracks" value={String(stats.uniqueTracks)} />
            <StatCell label="Artists" value={String(stats.uniqueArtists)} />
            <StatCell label="Day streak" value={stats.streakDays > 0 ? String(stats.streakDays) : '-'} />
            <StatCell label="Best day" value={stats.busiestDay ? `${stats.busiestDay.plays} plays` : '-'} hint={stats.busiestDay?.key} />
          </View>

          {stats.timeline.length > 1 && <><Text style={styles.formLabel}>ACTIVITY</Text><StatsChart buckets={stats.timeline} color={theme.color} /></>}

          <View style={{ flexDirection: 'row', gap: 18, flexWrap: 'wrap', marginTop: 26 }}>
            {stats.topTracks.length > 0 && <View style={{ flex: 1, minWidth: 340 }}>
              <Text style={styles.formLabel}>MOST PLAYED</Text>
              {stats.topTracks.map((t, i) => (
                <P key={t.key} onPress={() => playTop(t)} style={({ hovered }: any) => [styles.statsRow, hovered && styles.settingHover]}>
                  <Text style={[styles.statsRank, { color: theme.color }]}>{i + 1}</Text>
                  {t.artworkUrl ? <Image source={{ uri: t.artworkUrl }} style={{ width: 38, height: 38, borderRadius: 5 }} /> : <View style={{ width: 38, height: 38, borderRadius: 5, backgroundColor: desktop.raised }} />}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: desktop.text, fontSize: 12, fontWeight: '600' }}>{t.title}</Text>
                    <Text numberOfLines={1} style={{ color: desktop.muted, fontSize: 10, marginTop: 2 }}>{t.artist ?? 'Unknown artist'}</Text>
                  </View>
                  <Text style={{ color: desktop.muted, fontSize: 11, fontWeight: '700' }}>{t.plays}x</Text>
                </P>))}
            </View>}

            {stats.topArtists.length > 0 && <View style={{ flex: 1, minWidth: 300 }}>
              <Text style={styles.formLabel}>TOP ARTISTS</Text>
              {stats.topArtists.map((a, i) => (
                <View key={a.name} style={styles.statsRow}>
                  <Text style={[styles.statsRank, { color: theme.color }]}>{i + 1}</Text>
                  {a.artworkUrl ? <Image source={{ uri: a.artworkUrl }} style={{ width: 34, height: 34, borderRadius: 17 }} /> : <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: desktop.raised }} />}
                  <Text numberOfLines={1} style={{ flex: 1, color: desktop.text, fontSize: 12, fontWeight: '600' }}>{a.name}</Text>
                  <Text style={{ color: desktop.muted, fontSize: 11, fontWeight: '700' }}>{a.plays}x</Text>
                </View>))}
            </View>}
          </View>

          {result?.truncated && <Text style={{ color: desktop.dim, fontSize: 11, marginTop: 24, textAlign: 'center' }}>History is long - these numbers cover the most recent plays, not everything.</Text>}
        </>}
    </ContentScroll>
  </Page>;
}

export function StatCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <View style={styles.statsCell}><Text numberOfLines={1} style={styles.statsCellValue}>{value}</Text><Text style={{ color: desktop.muted, fontSize: 11, marginTop: 3 }}>{label}</Text>{hint ? <Text style={{ color: desktop.dim, fontSize: 10, marginTop: 2 }}>{hint}</Text> : null}</View>;
}

/** Barras simples - Views com altura, sem biblioteca de graficos. */
export function StatsChart({ buckets, color }: { buckets: TimelineBucket[]; color: string }) {
  const shown = buckets.slice(-40);
  const max = Math.max(...shown.map((b) => b.plays), 1);
  return <View style={styles.statsChart}>{shown.map((b, i) => (
    <View key={b.key} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
      <View style={{ width: '100%', minWidth: 3, borderRadius: 2, backgroundColor: color, height: Math.max(3, (b.plays / max) * 110) }} />
      <Text style={{ color: desktop.dim, fontSize: 8, marginTop: 4 }}>{shown.length <= 10 || i % Math.ceil(shown.length / 8) === 0 ? b.label : ''}</Text>
    </View>))}</View>;
}

export function ProfilePage({ navigate, notify }: { navigate: (r: Route) => void; notify: (s: string) => void }) {
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

  return <Page title="Profile" subtitle="Your account and listening history." action={<View style={{ flexDirection: 'row', gap: 8 }}><Button secondary icon="stats-chart-outline" onPress={() => navigate({ name: 'stats' })}>Your listening</Button><IconButton name="settings-outline" label="Settings" onPress={() => navigate({ name: 'settings' })} /></View>}><ContentScroll>{loading ? <View style={{ height: 350 }}><Loading /></View> : <><View style={styles.profileHero}><Pressable onPress={() => setAvatarOpen(true)} style={({ hovered }) => [styles.profileAvatarWrap, hovered && styles.profileAvatarHover]}>{profileAvatarDisplay}<View style={styles.profileAvatarEdit}><Ionicons name="pencil" size={12} color={desktop.text} /></View></Pressable><View style={{ flex: 1 }}><View style={styles.profileNameRow}><Text style={styles.profileName}>{dbName}</Text><IconButton name="pencil-outline" label="Edit username" onPress={() => setEditing(true)} /></View><Text style={styles.profileEmail}>{session?.user.email}</Text><Text style={styles.profileSince}>{memberSince(session?.user.created_at)}</Text></View><View style={styles.profileActions}><Button secondary icon="key-outline" onPress={async () => { const e = await resetPassword(); notify(e || 'Password reset email sent.'); }}>Reset password</Button><IconButton name="log-out-outline" label="Sign out" onPress={() => signOut()} /></View></View>
    <View style={styles.profileStats}><ProfileStat icon="play" label="TOTAL PLAYS" value={String(stats?.totalPlays || 0)} /><ProfileStat icon="musical-notes" label="UNIQUE TRACKS" value={String(stats?.uniqueTracks || 0)} /><ProfileStat icon="people" label="FRIENDS" value={String(friendCount)} /><ProfileStat icon="person" label="TOP ARTIST" value={stats?.topArtist?.name || '—'} wide /></View>
    <View style={styles.profileColumns}><View style={styles.profileSection}><View style={styles.profileSectionHead}><View><Text style={styles.profileSectionEyebrow}>LISTENING INSIGHTS</Text><Text style={styles.profileSectionTitle}>Most played</Text></View><Text style={styles.profileSectionMeta}>{mostPlayed.length} tracks</Text></View><ProfileHistory entries={mostPlayed} ranked onPlay={playHistory} empty="Play some music and your favourites will appear here." /></View><View style={styles.profileSection}><View style={styles.profileSectionHead}><View><Text style={styles.profileSectionEyebrow}>HISTORY</Text><Text style={styles.profileSectionTitle}>Recently played</Text></View></View><ProfileHistory entries={recent} onPlay={playHistory} empty="Your recent listening history will appear here." /></View></View></>}</ContentScroll>
    <Dialog open={editing} title="Edit profile" onClose={() => setEditing(false)}><Text style={styles.formLabel}>USERNAME</Text><Field autoFocus maxLength={24} value={name} onChangeText={setName} onSubmitEditing={save} /><View style={styles.dialogActions}><Button secondary onPress={() => setEditing(false)}>Cancel</Button><Button onPress={save}>Save changes</Button></View></Dialog>
    <AvatarDialog open={avatarOpen} value={avatar} onChange={saveAvatar} onClose={() => setAvatarOpen(false)} />
  </Page>;
}

export function ProfileStat({ icon, label, value, wide = false }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; wide?: boolean }) { return <View style={[styles.profileStat, wide && { flex: 1.5 }]}><Ionicons name={icon} size={16} color={desktop.dim} /><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={[styles.profileStatValue, wide && { fontSize: 17 }]}>{value}</Text><Text style={styles.profileStatLabel}>{label}</Text></View></View>; }

export function ProfileHistory({ entries, ranked = false, onPlay, empty }: { entries: ProfilePlayEntry[]; ranked?: boolean; onPlay: (entry: ProfilePlayEntry) => void; empty: string }) {
  if (!entries.length) return <View style={styles.profileHistoryEmpty}><Ionicons name="musical-notes-outline" size={24} color={desktop.dim} /><Text style={styles.profileHistoryEmptyText}>{empty}</Text></View>;
  return <View style={styles.profileHistory}>{entries.map((entry, index) => <Pressable key={`${ranked ? 'm' : 'r'}:${entry.source}:${entry.sourceId}`} onPress={() => onPlay(entry)} style={({ hovered, focused }) => [styles.profileHistoryRow, (hovered || focused) && styles.profileHistoryHover]}>{ranked && <Text style={styles.profileRank}>{index + 1}</Text>}<Artwork track={playEntryToTrack(entry)} size={42} /><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={styles.profileTrackTitle}>{entry.title}</Text><Text numberOfLines={1} style={styles.profileTrackArtist}>{displayArtist(entry)}</Text></View>{ranked ? <View style={styles.profileCount}><Ionicons name="play" size={9} color={desktop.muted} /><Text style={styles.profileCountText}>{entry.count}</Text></View> : entry.lastPlayed ? <Text style={styles.profileRecentTime}>{relativeTime(entry.lastPlayed)}</Text> : null}</Pressable>)}</View>;
}

export function AvatarDialog({ open, value, onChange, onClose }: { open: boolean; value: AvatarChoice; onChange: (value: AvatarChoice) => void; onClose: () => void }) {
  const gradient = AVATAR_GRADIENTS[value.gradientIndex ?? 0];
  return <Dialog open={open} title="Your avatar" onClose={onClose} width={510}><View style={[styles.avatarPreview, { backgroundImage: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` } as any]}><Text style={styles.avatarPreviewEmoji}>{value.emoji}</Text></View><Text style={styles.formLabel}>COLOUR</Text><View style={styles.avatarSwatches}>{AVATAR_GRADIENTS.map((pair, index) => <Pressable key={pair.join('-')} accessibilityLabel={`Colour ${index + 1}`} onPress={() => onChange({ ...value, gradientIndex: index })} style={[styles.avatarSwatchOuter, (value.gradientIndex ?? 0) === index && styles.avatarSwatchSelected]}><View style={[styles.avatarSwatch, { backgroundImage: `linear-gradient(135deg, ${pair[0]}, ${pair[1]})` } as any]} /></Pressable>)}</View><Text style={[styles.formLabel, { marginTop: 20 }]}>EMOJI</Text><View style={styles.avatarEmojiGrid}>{AVATAR_EMOJIS.map((emoji) => <Pressable key={emoji} onPress={() => onChange({ ...value, emoji })} style={({ hovered }) => [styles.avatarEmojiCell, hovered && styles.settingHover, value.emoji === emoji && styles.avatarEmojiSelected]}><Text style={styles.avatarEmojiText}>{emoji}</Text></Pressable>)}</View><View style={styles.dialogActions}><Button onPress={onClose}>Done</Button></View></Dialog>;
}
