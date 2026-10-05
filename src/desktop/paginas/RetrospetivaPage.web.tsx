import React, { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { fetchRetrospetiva, type ResultadoRetrospetiva } from '../../api/retrospetiva';
import { formatListeningTime } from '../../lib/listeningStats';
import { fraseDoAno } from '../../lib/retrospetiva';
import { displayArtist, tituloDaFaixa } from '../../lib/artistName';
import { useTheme } from '../../state/theme';
import type { Track } from '../../types';
import { styles } from '../estilos.web';
import { BotaoVoltar, ContentScroll, desktop, Empty, Loading, Page } from '../ui.web';
import { StatCell, StatsChart } from './ProfilePage.web';

const P = Pressable as any;
const V = View as any;

/**
 * O ano em revista no PC (5/10, auditoria de consistência A2): só existia no
 * iPhone (`RetrospetivaScreen`). Os mesmos dados (`fetchRetrospetiva`) e a
 * mesma frase do ano; o desenho é o das estatísticas do PC.
 */
export function RetrospetivaPage({ back, play, userId, ano: anoInicial }: {
  back: () => void; play: (t: Track, q?: Track[]) => void; userId?: string; ano?: number;
}) {
  const theme = useTheme((s) => s.theme);
  const [ano, setAno] = useState<number | undefined>(anoInicial);
  const [resultado, setResultado] = useState<ResultadoRetrospetiva | null>(null);
  const [aCarregar, setACarregar] = useState(true);

  useEffect(() => {
    let vivo = true;
    setACarregar(true);
    fetchRetrospetiva(ano, userId)
      .then((r) => { if (vivo) setResultado(r); })
      .finally(() => { if (vivo) setACarregar(false); });
    return () => { vivo = false; };
  }, [ano, userId]);

  const r = resultado?.retrospetiva;
  const tocar = (t: { source: string; sourceId: string; title: string; artist: string | null; artworkUrl: string | null }) => {
    const faixa: Track = { source: t.source as Track['source'], sourceId: t.sourceId, title: t.title, artist: t.artist, album: null, artworkUrl: t.artworkUrl, durationSeconds: null };
    play(faixa, [faixa]);
  };
  const faixaDoAno = r?.base.topTracks[0] ?? null;
  const artistaDoAno = r?.base.topArtists[0] ?? null;

  const anos = (resultado?.anos.length ?? 0) > 1 ? <View style={styles.smallSegment}>{resultado!.anos.map((a) => (
    <P key={a} onPress={() => setAno(a)} style={({ hovered }: any) => [styles.smallSegmentItem, a === r?.ano && styles.smallSegmentActive, hovered && styles.settingHover]}>
      <Text style={[styles.smallSegmentText, a === r?.ano && { color: desktop.text }]}>{a}</Text>
    </P>))}</View> : null;

  return <Page title="Year in review" action={<View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>{anos}<BotaoVoltar onPress={back} /></View>}>
    <ContentScroll>
      {aCarregar ? <View style={{ height: 320 }}><Loading /></View>
        : resultado?.unavailable ? <Empty icon="cloud-offline-outline" title="Stats unavailable" body="Your listening history couldn't be loaded. Try again later." />
        : !r || !r.temDados ? <Empty icon="sparkles-outline" title="No year to tell yet" body="Listen for a few days and your year in review shows up here." />
        : <>
          <V style={[styles.statsHero, { backgroundImage: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})` } as any]}>
            <Text style={styles.statsHeroLabel}>{r.ano}</Text>
            <Text style={styles.statsHeroValue}>{'≈'} {formatListeningTime(r.base.estimatedMinutes)} of music</Text>
            <Text style={styles.statsHeroNote}>estimated from {r.base.totalPlays} plays</Text>
          </V>

          {(r.mesMaior || r.horaPreferida) && <Text style={{ color: desktop.text, fontSize: 18, fontWeight: '600', lineHeight: 26, marginTop: 22 }}>
            {fraseDoAno(r.mesMaior?.nome ?? null, r.horaPreferida?.hora ?? null)}
          </Text>}

          <View style={styles.statsGrid}>
            <StatCell label="Plays" value={String(r.base.totalPlays)} />
            <StatCell label="Tracks" value={String(r.base.uniqueTracks)} />
            <StatCell label="Artists" value={String(r.base.uniqueArtists)} />
            <StatCell label="Discovered" value={String(r.artistasDescobertos)} hint={r.artistasDescobertos === 1 ? 'new artist' : 'new artists'} />
          </View>

          <View style={{ flexDirection: 'row', gap: 18, flexWrap: 'wrap', marginTop: 26 }}>
            {faixaDoAno && <P onPress={() => tocar(faixaDoAno)} style={({ hovered }: any) => [styles.statsRow, { flex: 1, minWidth: 300, padding: 12 }, hovered && styles.settingHover]}>
              {faixaDoAno.artworkUrl ? <Image source={{ uri: faixaDoAno.artworkUrl }} style={{ width: 72, height: 72, borderRadius: 8 }} /> : <View style={{ width: 72, height: 72, borderRadius: 8, backgroundColor: desktop.raised }} />}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.formLabel}>TRACK OF THE YEAR</Text>
                <Text numberOfLines={1} style={{ color: desktop.text, fontSize: 16, fontWeight: '700' }}>{tituloDaFaixa(faixaDoAno)}</Text>
                <Text numberOfLines={1} style={{ color: desktop.muted, fontSize: 12, marginTop: 2 }}>{displayArtist(faixaDoAno)} · {faixaDoAno.plays} {faixaDoAno.plays === 1 ? 'play' : 'plays'}</Text>
              </View>
            </P>}
            {artistaDoAno && <View style={[styles.statsRow, { flex: 1, minWidth: 300, padding: 12 }]}>
              {artistaDoAno.artworkUrl ? <Image source={{ uri: artistaDoAno.artworkUrl }} style={{ width: 72, height: 72, borderRadius: 36 }} /> : <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: desktop.raised }} />}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.formLabel}>ARTIST OF THE YEAR</Text>
                <Text numberOfLines={1} style={{ color: desktop.text, fontSize: 16, fontWeight: '700' }}>{artistaDoAno.name}</Text>
                <Text style={{ color: desktop.muted, fontSize: 12, marginTop: 2 }}>{artistaDoAno.plays} {artistaDoAno.plays === 1 ? 'play' : 'plays'}</Text>
              </View>
            </View>}
          </View>

          {r.base.timeline.length > 1 && <><Text style={[styles.formLabel, { marginTop: 26 }]}>MONTH BY MONTH</Text><StatsChart buckets={r.base.timeline} color={theme.color} /></>}

          {r.base.topTracks.length > 1 && <View style={{ marginTop: 26 }}>
            <Text style={styles.formLabel}>MOST PLAYED</Text>
            {r.base.topTracks.slice(0, 5).map((t, i) => (
              <P key={t.key} onPress={() => tocar(t)} style={({ hovered }: any) => [styles.statsRow, hovered && styles.settingHover]}>
                <Text style={[styles.statsRank, { color: theme.color }]}>{i + 1}</Text>
                {t.artworkUrl ? <Image source={{ uri: t.artworkUrl }} style={{ width: 38, height: 38, borderRadius: 5 }} /> : <View style={{ width: 38, height: 38, borderRadius: 5, backgroundColor: desktop.raised }} />}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: desktop.text, fontSize: 12, fontWeight: '600' }}>{tituloDaFaixa(t)}</Text>
                  <Text numberOfLines={1} style={{ color: desktop.muted, fontSize: 10, marginTop: 2 }}>{displayArtist(t)}</Text>
                </View>
                <Text style={{ color: desktop.muted, fontSize: 11, fontWeight: '700' }}>{t.plays}x</Text>
              </P>))}
          </View>}

          {resultado?.truncated && <Text style={{ color: desktop.dim, fontSize: 11, marginTop: 24, textAlign: 'center' }}>Your history is too long to read in full — these numbers are a minimum.</Text>}
        </>}
    </ContentScroll>
  </Page>;
}
