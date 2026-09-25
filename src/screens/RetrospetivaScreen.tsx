import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchRetrospetiva, type ResultadoRetrospetiva } from '../api/retrospetiva';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { formatListeningTime } from '../lib/listeningStats';
import { fraseDoAno } from '../lib/retrospetiva';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { usePlayer } from '../state/player';
import { useTheme } from '../state/theme';
import { colors, MINI_PLAYER_HEIGHT, radii, spacing, type } from '../theme';
import type { Track } from '../types';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { tituloDaFaixa, displayArtist } from '../lib/artistName';

type Props = NativeStackScreenProps<RootStackParamList, 'Retrospetiva'>;

/**
 * O ano em revista.
 *
 * Não é o ecrã de estatísticas com outro filtro: aquele responde a "quanto
 * ouvi?", este responde a "como foi o meu ano?". Por isso lidera com uma frase
 * e não com uma grelha, e mostra coisas que só existem a esta escala -- o mês
 * que foi teu, a hora a que costumas ouvir, quem conheceste este ano.
 */
export function RetrospetivaScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const tema = useTheme((s) => s.theme);
  const playTrack = usePlayer((s) => s.playTrack);

  const [ano, setAno] = useState<number | undefined>(route.params?.ano);
  const [resultado, setResultado] = useState<ResultadoRetrospetiva | null>(null);
  const [aCarregar, setACarregar] = useState(true);

  const carregar = useCallback(async (qual?: number) => {
    setACarregar(true);
    try {
      setResultado(await fetchRetrospetiva(qual, route.params?.userId));
    } finally {
      setACarregar(false);
    }
  }, [route.params?.userId]);

  useEffect(() => { void carregar(ano); }, [ano, carregar]);

  const r = resultado?.retrospetiva;
  const tocar = (t: {
    source: string; sourceId: string; title: string;
    artist: string | null; artworkUrl: string | null;
  }) => {
    const faixa: Track = {
      source: t.source as Track['source'],
      sourceId: t.sourceId,
      title: t.title,
      artist: t.artist,
      album: null,
      artworkUrl: t.artworkUrl,
      durationSeconds: null,
    };
    playTrack(faixa, [faixa], true);
  };

  const faixaDoAno = r?.base.topTracks[0] ?? null;
  const artistaDoAno = r?.base.topArtists[0] ?? null;
  const maiorMes = Math.max(1, ...(r?.base.timeline ?? []).map((b) => b.plays));

  return (
    <Screen title="Year in review" onBack={() => navigation.goBack()}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + MINI_PLAYER_HEIGHT + spacing.xxl }}>
        {(resultado?.anos.length ?? 0) > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.anos}
          >
            {resultado!.anos.map((a) => {
              const activo = a === r?.ano;
              return (
                <Pressable
                  key={a}
                  onPress={() => setAno(a)}
                  style={[styles.pilulaAno, activo && { backgroundColor: tema.color }]}
                >
                  <Text style={[styles.pilulaTexto, activo && { color: tema.textColorOnGradient }]}>{a}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {aCarregar ? (
          <ActivityIndicator color={colors.text} style={{ marginTop: 64 }} />
        ) : resultado?.unavailable ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="Stats unavailable"
            subtitle="Your listening history couldn't be loaded. Try again later."
          />
        ) : !r || !r.temDados ? (
          <EmptyState
            icon="sparkles-outline"
            title="No year to tell yet"
            subtitle="Listen for a few days and your year in review shows up here."
          />
        ) : (
          <>
            <LinearGradient
              colors={tema.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <Text style={[styles.heroAno, { color: tema.textColorOnGradient }]}>{r.ano}</Text>
              <Text style={[styles.heroTempo, { color: tema.textColorOnGradient }]}>
                ≈ {formatListeningTime(r.base.estimatedMinutes)} of music
              </Text>
              {/* A mesma honestidade do ecrã de estatísticas: o histórico regista
                  o arranque de cada faixa, não o fim. */}
              <Text style={[styles.heroNota, { color: tema.textColorOnGradient }]}>
                estimated from {r.base.totalPlays} plays
              </Text>
            </LinearGradient>

            {(r.mesMaior || r.horaPreferida) && (
              <View style={styles.frase}>
                <Text style={styles.fraseTexto}>
                  {fraseDoAno(r.mesMaior?.nome ?? null, r.horaPreferida?.hora ?? null)}
                </Text>
              </View>
            )}

            <View style={styles.grelha}>
              <Celula rotulo="Plays" valor={String(r.base.totalPlays)} />
              <Celula rotulo="Tracks" valor={String(r.base.uniqueTracks)} />
              <Celula rotulo="Artists" valor={String(r.base.uniqueArtists)} />
              <Celula
                rotulo="Discovered"
                valor={String(r.artistasDescobertos)}
                dica={r.artistasDescobertos === 1 ? 'new artist' : 'new artists'}
              />
            </View>

            {faixaDoAno && (
              <Seccao titulo="TRACK OF THE YEAR">
                <Pressable onPress={() => tocar(faixaDoAno)} style={styles.destaque}>
                  {faixaDoAno.artworkUrl ? (
                    <Image source={{ uri: faixaDoAno.artworkUrl }} style={styles.capaGrande} contentFit="cover" />
                  ) : (
                    <View style={[styles.capaGrande, styles.semCapa]}>
                      <Ionicons name="musical-notes" size={28} color={colors.textTertiary} />
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={2} style={[type.title, { fontWeight: '800' }]}>{tituloDaFaixa(faixaDoAno)}</Text>
                    <Text numberOfLines={1} style={type.caption}>{displayArtist(faixaDoAno)}</Text>
                    <Text style={[styles.contagem, { color: tema.color }]}>
                      {faixaDoAno.plays} {faixaDoAno.plays === 1 ? 'play' : 'plays'}
                    </Text>
                  </View>
                </Pressable>
              </Seccao>
            )}

            {artistaDoAno && (
              <Seccao titulo="ARTIST OF THE YEAR">
                <View style={styles.destaque}>
                  {artistaDoAno.artworkUrl ? (
                    <Image source={{ uri: artistaDoAno.artworkUrl }} style={styles.capaRedonda} contentFit="cover" />
                  ) : (
                    <View style={[styles.capaRedonda, styles.semCapa]}>
                      <Ionicons name="person" size={26} color={colors.textTertiary} />
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={2} style={[type.title, { fontWeight: '800' }]}>{artistaDoAno.name}</Text>
                    <Text style={[styles.contagem, { color: tema.color }]}>
                      {artistaDoAno.plays} {artistaDoAno.plays === 1 ? 'play' : 'plays'}
                    </Text>
                  </View>
                </View>
              </Seccao>
            )}

            {r.base.timeline.length > 1 && (
              <Seccao titulo="MONTH BY MONTH">
                <View style={styles.grafico}>
                  {r.base.timeline.map((b) => (
                    <View key={b.key} style={styles.coluna}>
                      <View
                        style={[
                          styles.barra,
                          { height: `${Math.max(4, (b.plays / maiorMes) * 100)}%`, backgroundColor: tema.color },
                        ]}
                      />
                      <Text style={styles.etiqueta}>{b.label}</Text>
                    </View>
                  ))}
                </View>
              </Seccao>
            )}

            {r.base.topTracks.length > 1 && (
              <Seccao titulo="MOST PLAYED">
                {r.base.topTracks.slice(0, 5).map((t, i) => (
                  <Pressable
                    key={t.key}
                    onPress={() => tocar(t)}
                    style={({ pressed }) => [styles.linha, pressed && styles.linhaPremida]}
                  >
                    <Text style={[styles.posicao, { color: tema.color }]}>{i + 1}</Text>
                    {t.artworkUrl ? (
                      <Image source={{ uri: capaParaLista(t.artworkUrl)! }} style={styles.capa} contentFit="cover" />
                    ) : (
                      <View style={[styles.capa, styles.semCapa]}>
                        <Ionicons name="musical-notes" size={16} color={colors.textTertiary} />
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={[type.body, { fontWeight: '600' }]}>{tituloDaFaixa(t)}</Text>
                      <Text numberOfLines={1} style={type.caption}>{displayArtist(t)}</Text>
                    </View>
                    <Text style={styles.vezes}>{t.plays}×</Text>
                  </Pressable>
                ))}
              </Seccao>
            )}

            {resultado?.truncated && (
              <Text style={styles.aviso}>
                Your history is too long to read in full — these numbers are a minimum.
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}


function Celula({ rotulo, valor, dica }: { rotulo: string; valor: string; dica?: string }) {
  return (
    <View style={styles.celula}>
      <Text style={styles.celulaValor}>{valor}</Text>
      <Text style={type.caption}>{rotulo}</Text>
      {dica ? <Text style={[type.micro, { color: colors.textTertiary }]}>{dica}</Text> : null}
    </View>
  );
}

function Seccao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: spacing.lg }}>
      <Text style={styles.tituloSeccao}>{titulo}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  anos: { paddingHorizontal: spacing.md, gap: spacing.sm, paddingBottom: spacing.md },
  pilulaAno: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  pilulaTexto: { ...type.caption, fontWeight: '700', color: colors.text },

  hero: { marginHorizontal: spacing.md, borderRadius: radii.lg, padding: spacing.lg },
  heroAno: { fontSize: 48, fontWeight: '800', letterSpacing: -1 },
  heroTempo: { fontSize: 18, fontWeight: '700', marginTop: 2 },
  heroNota: { fontSize: 11, marginTop: 6, opacity: 0.8 },

  frase: { paddingHorizontal: spacing.md, marginTop: spacing.md },
  fraseTexto: { ...type.body, color: colors.textSecondary, lineHeight: 22 },

  grelha: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  celula: {
    flexGrow: 1,
    flexBasis: '46%',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  celulaValor: { fontSize: 22, fontWeight: '800', color: colors.text },

  tituloSeccao: {
    ...type.micro,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: colors.textSecondary,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },

  destaque: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
  },
  capaGrande: { width: 88, height: 88, borderRadius: radii.sm, backgroundColor: colors.surfaceHigh },
  capaRedonda: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surfaceHigh },
  contagem: { ...type.caption, fontWeight: '800', marginTop: 4 },

  grafico: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 120,
    paddingHorizontal: spacing.md,
  },
  coluna: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barra: { width: '100%', borderRadius: 2, minWidth: 3 },
  etiqueta: { ...type.micro, fontSize: 8, marginTop: 4, color: colors.textTertiary },

  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
  },
  linhaPremida: { backgroundColor: colors.surface },
  posicao: { width: 18, textAlign: 'center', fontWeight: '800', fontSize: 13 },
  capa: { width: 44, height: 44, borderRadius: radii.sm, backgroundColor: colors.surfaceHigh },
  semCapa: { alignItems: 'center', justifyContent: 'center' },
  vezes: { ...type.caption, fontWeight: '700', color: colors.textSecondary },

  aviso: {
    ...type.caption,
    color: colors.textTertiary,
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
  },
});
