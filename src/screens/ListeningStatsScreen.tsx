import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchListeningStats, type StatsResult } from '../api/listeningStats';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { SegmentedControl } from '../components/SegmentedControl';
import {
  formatListeningTime,
  type StatsPeriod,
  type TimelineBucket,
} from '../lib/listeningStats';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { usePlayer } from '../state/player';
import { useTheme } from '../state/theme';
import { colors, MINI_PLAYER_HEIGHT, radii, spacing, type } from '../theme';
import type { Track } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ListeningStats'>;

const PERIODS: StatsPeriod[] = ['30d', '6m', 'all'];
const PERIOD_LABELS = ['30 dias', '6 meses', 'Sempre'];

export function ListeningStatsScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const theme = useTheme((s) => s.theme);
  const playTrack = usePlayer((s) => s.playTrack);

  const [periodIndex, setPeriodIndex] = useState(0);
  const [result, setResult] = useState<StatsResult | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (period: StatsPeriod) => {
    setLoading(true);
    try {
      setResult(await fetchListeningStats(period,Date.now(),route.params?.userId));
    } finally {
      setLoading(false);
    }
  }, [route.params?.userId]);

  useEffect(() => {
    load(PERIODS[periodIndex]);
  }, [periodIndex, load]);

  const stats = result?.stats;

  const playTopTrack = (t: {
    source: string;
    sourceId: string;
    title: string;
    artist: string | null;
    artworkUrl: string | null;
  }) => {
    const track: Track = {
      source: t.source as Track['source'],
      sourceId: t.sourceId,
      title: t.title,
      artist: t.artist,
      album: null,
      artworkUrl: t.artworkUrl,
      durationSeconds: null,
    };
    playTrack(track, [track], true);
  };

  return (
    <Screen title={route.params?.userId ? "Listening stats" : "Your listening"} onBack={() => navigation.goBack()}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + MINI_PLAYER_HEIGHT + spacing.xxl,
        }}
      >
        <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.lg }}>
          <SegmentedControl
            options={PERIOD_LABELS}
            value={periodIndex}
            onChange={setPeriodIndex}
          />
        </View>

        {loading ? (
          <ActivityIndicator color={colors.text} style={{ marginTop: 64 }} />
        ) : result?.unavailable ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="No listening history yet"
            subtitle="A base de dados não devolveu o histórico. Corre supabase/listening-stats.sql no SQL Editor."
          />
        ) : !stats || stats.totalPlays === 0 ? (
          <EmptyState
            icon="stats-chart-outline"
            title="Ainda sem dados"
            subtitle="Play a few tracks and your stats will show up here."
          />
        ) : (
          <>
            {/* Herói: tempo ouvido */}
            <LinearGradient
              colors={theme.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <Text style={[styles.heroLabel, { color: theme.textColorOnGradient }]}>
                TEMPO OUVIDO
              </Text>
              <Text style={[styles.heroValue, { color: theme.textColorOnGradient }]}>
                ≈ {formatListeningTime(stats.estimatedMinutes)}
              </Text>
              <Text style={[styles.heroNote, { color: theme.textColorOnGradient }]}>
                {/* Honestidade: o histórico regista o arranque de cada faixa,
                    não o fim. Quem salta a meio conta o tema inteiro. */}
                estimativa a partir de {stats.totalPlays} reproduções
              </Text>
            </LinearGradient>

            <View style={styles.grid}>
              <Cell label="Faixas" value={String(stats.uniqueTracks)} />
              <Cell label="Artistas" value={String(stats.uniqueArtists)} />
              <Cell
                label="Dias seguidos"
                value={stats.streakDays > 0 ? String(stats.streakDays) : '—'}
              />
              <Cell
                label="Melhor dia"
                value={stats.busiestDay ? `${stats.busiestDay.plays}` : '—'}
                hint={stats.busiestDay ? formatDay(stats.busiestDay.key) : undefined}
              />
            </View>

            {stats.timeline.length > 1 && (
              <Section title="ATIVIDADE">
                <Timeline buckets={stats.timeline} color={theme.color} />
              </Section>
            )}

            {stats.topTracks.length > 0 && (
              <Section title="MAIS OUVIDAS">
                {stats.topTracks.map((t, i) => (
                  <Pressable
                    key={t.key}
                    onPress={() => playTopTrack(t)}
                    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                  >
                    <Text style={[styles.rank, { color: theme.color }]}>{i + 1}</Text>
                    {t.artworkUrl ? (
                      <Image source={{ uri: t.artworkUrl }} style={styles.art} contentFit="cover" />
                    ) : (
                      <View style={[styles.art, styles.artFallback]}>
                        <Ionicons name="musical-notes" size={16} color={colors.textTertiary} />
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={[type.body, { fontWeight: '600' }]}>
                        {t.title}
                      </Text>
                      <Text numberOfLines={1} style={type.caption}>
                        {t.artist ?? 'Artista desconhecido'}
                      </Text>
                    </View>
                    <Text style={styles.count}>{t.plays}×</Text>
                  </Pressable>
                ))}
              </Section>
            )}

            {stats.topArtists.length > 0 && (
              <Section title="OS TEUS ARTISTAS">
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: spacing.md, gap: 12 }}
                >
                  {stats.topArtists.map((a) => (
                    <View key={a.name} style={{ alignItems: 'center', width: 84 }}>
                      {a.artworkUrl ? (
                        <Image source={{ uri: a.artworkUrl }} style={styles.artistArt} />
                      ) : (
                        <View style={[styles.artistArt, styles.artFallback]}>
                          <Ionicons name="person" size={22} color={colors.textTertiary} />
                        </View>
                      )}
                      <Text numberOfLines={1} style={styles.artistName}>
                        {a.name}
                      </Text>
                      <Text style={type.micro}>{a.plays}×</Text>
                    </View>
                  ))}
                </ScrollView>
              </Section>
            )}

            {result?.truncated && (
              <Text style={styles.footnote}>
                Histórico muito longo — os números cobrem as reproduções mais
                recentes, não a totalidade.
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text style={[type.micro, { marginHorizontal: spacing.md, marginBottom: spacing.sm }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Cell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.cell}>
      <Text numberOfLines={1} style={styles.cellValue}>
        {value}
      </Text>
      <Text style={type.micro}>{label}</Text>
      {hint ? (
        <Text numberOfLines={1} style={[type.micro, { color: colors.textTertiary }]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Barras simples. Sem biblioteca de gráficos: são Views com altura. */
function Timeline({ buckets, color }: { buckets: TimelineBucket[]; color: string }) {
  const max = Math.max(...buckets.map((b) => b.plays), 1);
  // Muitas barras num ecrã estreito ficam com menos de um pixel — mostrar só
  // as últimas cabe melhor e é o que interessa.
  const shown = buckets.slice(-30);
  return (
    <View style={styles.chart}>
      {shown.map((b, i) => (
        <View key={b.key} style={styles.barSlot}>
          <View
            style={[
              styles.bar,
              { height: Math.max(3, (b.plays / max) * 92), backgroundColor: color },
            ]}
          />
          {/* Só algumas etiquetas, senão sobrepõem-se. */}
          <Text style={styles.barLabel}>
            {shown.length <= 8 || i % Math.ceil(shown.length / 6) === 0 ? b.label : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

function formatDay(key: string): string {
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

const styles = StyleSheet.create({
  hero: {
    marginHorizontal: spacing.md,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  heroLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4, opacity: 0.85 },
  heroValue: { fontSize: 34, fontWeight: '800', marginTop: 6, letterSpacing: -0.5 },
  heroNote: { fontSize: 11, marginTop: 4, opacity: 0.8 },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  cell: {
    flexGrow: 1,
    flexBasis: '46%',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  cellValue: { fontSize: 22, fontWeight: '800', color: colors.text },

  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 118,
    paddingHorizontal: spacing.md,
  },
  barSlot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 2, minWidth: 3 },
  barLabel: { ...type.micro, fontSize: 8, marginTop: 4, color: colors.textTertiary },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
  },
  rowPressed: { backgroundColor: colors.surface },
  rank: { width: 18, textAlign: 'center', fontWeight: '800', fontSize: 13 },
  art: { width: 44, height: 44, borderRadius: radii.sm, backgroundColor: colors.surfaceHigh },
  artFallback: { alignItems: 'center', justifyContent: 'center' },
  count: { ...type.caption, fontWeight: '700', color: colors.textSecondary },

  artistArt: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceHigh,
  },
  artistName: {
    ...type.caption,
    color: colors.text,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center',
  },

  footnote: {
    ...type.micro,
    color: colors.textTertiary,
    marginTop: spacing.xl,
    marginHorizontal: spacing.md,
    textAlign: 'center',
  },
});
