import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addTracksToPlaylist, createPlaylist } from '../api/playlists';
import { fetchYouTubePlaylistById } from '../api/youtube';
import { AlvoDoVoo, LinhaEmCascata, useVoltarDaPagina } from '../components/PaginaDoQuadrado';
import { PlayDeMetal } from '../components/PlayDeMetal';
import { SkeletonDeFaixas } from '../components/Skeleton';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { TrackRow } from '../components/TrackRow';
import { useCorDoAmbiente } from '../hooks/useCorDoAmbiente';
import { displayArtist, extractArtist } from '../lib/artistName';
import { avisarErro, avisarFeito } from '../lib/avisoDeRemocao';
import { FRASES_DOS_ALBUNS } from '../lib/albunsGuardados';
import { mensagemDeErro } from '../lib/mensagemDeErro';
import type { OrigemDaFila } from '../lib/origemDaFila';
import { hapticNotification, hapticSelection } from '../lib/haptics';
import { alternarAlbumGuardado, useAlbumGuardado } from '../state/albunsGuardados';
import { usePlayer } from '../state/player';
import { useTheme } from '../state/theme';
import { colors, radii, spacing, type } from '../theme';
import type { Track } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Album'>;
export type ParametrosDoAlbum = {
  id: string;
  titulo: string;
  capa?: string | null;
  artista?: string | null;
  ano?: string | null;
  tipo?: string | null;
  voo?: string;
};

const LADO_DO_PLAY = 60;

/** "Album · Lua Vale · 2026 · 11 songs": o que se sabe, pela ordem do disco. */
export function linhaDoAlbum(p: { tipo?: string | null; artista?: string | null; ano?: string | null }, musicas: number | null): string {
  return [p.tipo || 'Album', p.artista, p.ano, musicas === null ? null : `${musicas} ${musicas === 1 ? 'song' : 'songs'}`].filter(Boolean).join(' · ');
}

/**
 * Um álbum numa página (26/11, item 15 do plano de melhorias,
 * `docs/maquetes-da-lista-2026-11-25.html#m15`). Era uma folha por cima da Home
 * (a `YtPlaylistRecommendationSheet`, que fica para as playlists partilhadas e as
 * recomendações). Abre pelo quadrado como uma playlist: a capa voa para o topo
 * (`AlvoDoVoo`), as músicas entram em cascata (`LinhaEmCascata`), e o voltar
 * encolhe-a até ao cartão. A cor da capa lava o topo.
 */
export function AlbumScreen({ route }: Props) {
  const p = route.params;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const voltar = useVoltarDaPagina();
  const theme = useTheme((s) => s.theme);
  const tocarMusica = usePlayer((s) => s.tocarMusica);
  const [faixas, setFaixas] = useState<Track[] | null>(null);
  const [titulo, setTitulo] = useState(p.titulo);
  const [acao, setAcao] = useState<Track | null>(null);
  const [aGuardar, setAGuardar] = useState(false);
  const [aGuardarLista, setAGuardarLista] = useState(false);
  const guardado = useAlbumGuardado(p.id);
  const cor = useCorDoAmbiente(p.capa ?? null);
  // O mesmo lado que a camada do voo prevê para o centro (\`alvoPrevisto\`).
  const lado = Math.min(240, Math.round(width * 0.52));

  useEffect(() => {
    let vivo = true;
    fetchYouTubePlaylistById(p.id).then((res) => {
      if (!vivo) return;
      if (res.title) setTitulo(res.title);
      setFaixas(res.items.map((i) => ({
        source: 'youtube' as const, sourceId: i.videoId, title: i.title,
        artist: extractArtist(i.title, i.channel || null), album: null, artworkUrl: i.thumbnail, durationSeconds: null,
      })));
    }).catch((e) => {
      if (!vivo) return;
      avisarErro(mensagemDeErro(e, "Couldn't load this album."));
      setFaixas([]);
    });
    return () => { vivo = false; };
  }, [p.id]);

  const origem: OrigemDaFila = useMemo(() => ({ tipo: 'album', nome: titulo }), [titulo]);
  const artista = p.artista ?? (faixas?.[0] ? displayArtist(faixas[0]) : null);

  const tocar = (aleatorio: boolean) => {
    if (!faixas?.length) return;
    hapticSelection();
    void usePlayer.getState().tocarLista(faixas, aleatorio, false, origem);
  };
  const alternarGuardado = async () => {
    if (aGuardar) return;
    setAGuardar(true);
    try {
      const feito = await alternarAlbumGuardado(
        { id: p.id, title: titulo, artworkUrl: p.capa ?? null, tipo: p.tipo ?? 'Album', ano: p.ano ?? null }, artista);
      hapticNotification();
      avisarFeito(feito === 'guardado' ? FRASES_DOS_ALBUNS.feitoGuardar : FRASES_DOS_ALBUNS.feitoTirar, titulo);
    } catch (e) {
      avisarErro(mensagemDeErro(e, "Couldn't update your library."));
    } finally {
      setAGuardar(false);
    }
  };
  const guardarComoPlaylist = async () => {
    if (!faixas?.length || aGuardarLista) return;
    setAGuardarLista(true);
    try {
      const pl = await createPlaylist(titulo);
      await addTracksToPlaylist(pl.id, faixas);
      hapticNotification();
      avisarFeito(`Saved "${titulo}"`, `${faixas.length} ${faixas.length === 1 ? 'song' : 'songs'}`);
    } catch (e) {
      avisarErro(mensagemDeErro(e, "Couldn't save playlist."));
    } finally {
      setAGuardarLista(false);
    }
  };

  const cabecalho = (
    <View style={[styles.topo, { paddingTop: insets.top + 60 }]}>
      <AlvoDoVoo style={[styles.capa, { width: lado, height: lado }]}>
        {p.capa ? <Image source={{ uri: p.capa }} style={StyleSheet.absoluteFill} contentFit="cover" /> : (
          <View style={[StyleSheet.absoluteFill, styles.semCapa]}><Ionicons name="disc-outline" size={lado / 3} color={colors.textTertiary} /></View>
        )}
      </AlvoDoVoo>
      <Text numberOfLines={2} style={styles.titulo}>{titulo}</Text>
      <Text numberOfLines={1} style={[type.caption, styles.meta]}>{linhaDoAlbum({ ...p, artista }, faixas ? faixas.length : null)}</Text>
      <View style={styles.accoes}>
        <Pressable onPress={() => void alternarGuardado()} disabled={aGuardar} hitSlop={10} accessibilityRole="button"
          accessibilityLabel={guardado ? FRASES_DOS_ALBUNS.guardado : FRASES_DOS_ALBUNS.guardar} style={styles.redondo}>
          <Ionicons name={guardado ? 'heart' : 'heart-outline'} size={22} color={guardado ? theme.color : colors.text} />
        </Pressable>
        <PlayDeMetal lado={LADO_DO_PLAY} label={`Play ${titulo}`} onPress={() => tocar(false)} desligado={!faixas?.length} ocupado={!faixas} />
        <Pressable onPress={() => tocar(true)} disabled={!faixas?.length} hitSlop={10} accessibilityRole="button" accessibilityLabel="Shuffle" style={styles.redondo}>
          <Ionicons name="shuffle" size={22} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.pagina}>
      {cor ? <LinearGradient colors={[cor, colors.bg]} locations={[0, 0.55]} style={[StyleSheet.absoluteFill, { opacity: 0.55 }]} pointerEvents="none" /> : null}
      <Animated.FlatList
        data={faixas ?? []}
        keyExtractor={(t, i) => `${t.sourceId}:${i}`}
        ListHeaderComponent={cabecalho}
        ListEmptyComponent={faixas === null ? <SkeletonDeFaixas linhas={6} /> : null}
        contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
        renderItem={({ item, index }) => (
          <LinhaEmCascata indice={index}>
            <TrackRow track={item} acompanharATocar onPress={() => tocarMusica(item, faixas ?? [], true, undefined, origem)} onAction={setAcao} />
          </LinhaEmCascata>
        )}
      />
      <Pressable onPress={voltar} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back"
        style={[styles.voltar, { top: insets.top + 8 }]}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      {/* "Save as playlist" (26/11, o João: "tira este texto e põe um ícone bem
          posicionado"): em espelho com o voltar, como as ações de página do iOS. */}
      <Pressable onPress={() => void guardarComoPlaylist()} disabled={!faixas?.length || aGuardarLista} hitSlop={12}
        accessibilityRole="button" accessibilityLabel="Save as playlist"
        style={({ pressed }) => [styles.guardarComo, { top: insets.top + 8 }, (pressed || aGuardarLista) && { opacity: 0.6 }, !faixas?.length && { opacity: 0.4 }]}>
        <Ionicons name="add" size={24} color={colors.text} />
      </Pressable>
      <TrackActionsSheet visible={!!acao} track={acao} origem={origem} onClose={() => setAcao(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: colors.bg },
  topo: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, gap: spacing.sm },
  capa: { borderRadius: radii.md, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: colors.surface,
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 12 } },
  semCapa: { alignItems: 'center', justifyContent: 'center' },
  titulo: { ...type.title, textAlign: 'center', marginTop: spacing.md },
  meta: { textAlign: 'center' },
  accoes: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl, marginTop: spacing.sm },
  redondo: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  // O par do voltar, no canto da direita.
  guardarComo: { position: 'absolute', right: spacing.lg, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  voltar: { position: 'absolute', left: spacing.lg, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
});
