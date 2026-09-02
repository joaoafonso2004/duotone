import { SocialProfileView } from '../../components/SocialProfileView';
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

export function StatsPage({ back, play, userId }: { userId?:string; back: () => void; play: (t: Track, q?: Track[]) => void }) {
  const theme = useTheme((s) => s.theme);
  const [period, setPeriod] = useState<StatsPeriod>('30d');
  const [result, setResult] = useState<StatsResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchListeningStats(period,Date.now(),userId)
      .then((r) => { if (alive) setResult(r); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [period,userId]);

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

export function ProfilePage({navigate,userId}:{navigate:(r:Route)=>void;notify:(s:string)=>void;userId?:string}) {
  const ownId=useAuth(s=>s.session?.user.id);
  const target=userId || ownId;
  return <Page title={userId?'Perfil':'O teu perfil'} subtitle="A música que faz parte de ti.">{target&&<SocialProfileView key={target} userId={target}
    onMessage={friendId=>navigate({name:'social',friendId})}
    onPlaylist={id=>navigate({name:'playlist',id,title:'Playlist'})}
    onSocial={()=>navigate({name:'social'})} onSettings={()=>navigate({name:'settings'})}
    onArtist={value=>navigate({name:'artist',value})} onStats={()=>navigate({name:'stats',userId:target})}/>}</Page>;
}
