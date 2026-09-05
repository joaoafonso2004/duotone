import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLibrary, removeFromLibrary, saveToLibrary } from '../api/library';
import { searchYouTube, searchYouTubePlaylists } from '../api/youtube';
import { abaDoTracker, faixasDoArtista, trackerDoArtista } from '../api/trackers';
import {
  capasPorEra, iniciaisDaEra, porOuvir, procuraNoYouTube, type FaixaDoTracker,
} from '../lib/tracker';
import { AddToPlaylistSheet } from '../components/AddToPlaylistSheet';
import { EmptyState } from '../components/EmptyState';
import { PillButton } from '../components/PillButton';
import { Screen } from '../components/Screen';
import { TrackActionsSheet, SheetAction } from '../components/TrackActionsSheet';
import { getTrackRowLayout, TrackRow } from '../components/TrackRow';
import { YtPlaylistRecommendationSheet } from '../components/YtPlaylistRecommendationSheet';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useSaved } from '../state/saved';
import { usePlayer } from '../state/player';
import { colors, MINI_PLAYER_HEIGHT, spacing, radii, type as typography } from '../theme';
import { useTheme } from '../state/theme';
import { hapticNotification } from '../lib/haptics';
import { agruparPorArtista, chaveDeArtista } from '../lib/artistName';
import { useAuth } from '../state/auth';
import type { Track } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'LibraryGroup'>;

/** Detalhe de um álbum ou artista (vista sobre as faixas guardadas). */
export function LibraryGroupScreen({ route, navigation }: Props) {
  const { type, name } = route.params;
  const insets = useSafeAreaInsets();
  const playTrack = usePlayer((s) => s.playTrack);
  const playNext = usePlayer((s) => s.playNext);
  const addToQueue = usePlayer((s) => s.addToQueue);
  const current = usePlayer((s) => s.current);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const theme = useTheme((s) => s.theme);
  const [actionTrack, setActionTrack] = useState<Track | null>(null);
  const [playlistTrack, setPlaylistTrack] = useState<Track | null>(null);

  // Artist additional content states
  const [activeTab, setActiveTab] = useState<'library' | 'por_ouvir' | 'youtube_tracks' | 'youtube_albums'>('library');
  // O segundo catálogo: o que este artista nunca lançou. Ver lib/tracker.ts.
  const [folhaDoTracker, setFolhaDoTracker] = useState<string | null>(null);
  const [doTracker, setDoTracker] = useState<FaixaDoTracker[] | null>(null);
  const [aCarregarTracker, setACarregarTracker] = useState(false);
  const [aProcurar, setAProcurar] = useState<string | null>(null);
  const [ytTracks, setYtTracks] = useState<Track[]>([]);
  const [ytAlbums, setYtAlbums] = useState<any[]>([]);
  const [loadingYtTracks, setLoadingYtTracks] = useState(false);
  const [loadingYtAlbums, setLoadingYtAlbums] = useState(false);

  // Recommendations sheet states
  const [selectedYtPlaylistId, setSelectedYtPlaylistId] = useState<string | null>(null);
  const [selectedYtPlaylistTitle, setSelectedYtPlaylistTitle] = useState<string | null>(null);
  const [selectedYtPlaylistArtwork, setSelectedYtPlaylistArtwork] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // Marca as faixas do YouTube deste artista que já estão na biblioteca.
      useSaved.getState().refresh();
      const all = await getLibrary();
      if (type === 'album') {
        setTracks(all.filter((t) => t.album === name));
      } else {
        // Pela CHAVE canónica e não pelo nome mostrado — tem de ser o mesmo
        // agrupamento da página de Artistas, senão o cartão dizia cinco
        // faixas e esta página abria com duas.
        const alvo = chaveDeArtista(name);
        setTracks(agruparPorArtista(all).find((g) => g.chave === alvo)?.faixas ?? []);
      }
    } catch {
      // ignorar
    } finally {
      setLoading(false);
    }
  }, [type, name]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  /**
   * O que existe deste artista e não está na biblioteca.
   *
   * Só corre num ecrã que a pessoa abriu, nunca no caminho da reprodução, e
   * falha em silêncio: sem tracker, sem rede ou com a folha em baixo, o
   * separador simplesmente não aparece.
   */
  useEffect(() => {
    if (type !== 'artist' || !name) return;
    let cancelado = false;
    setFolhaDoTracker(null);
    setDoTracker(null);
    (async () => {
      const artista = await trackerDoArtista(name);
      if (cancelado || !artista) return;
      // Só o `meta`, que custa umas centenas de bytes: chega para saber se
      // há separador para mostrar. As faixas podem ser centenas de KB e só
      // descem quando alguém o abrir.
      const aba = await abaDoTracker(artista.folha);
      if (!cancelado && aba && aba.total > 0) setFolhaDoTracker(artista.folha);
    })().catch(() => {});
    return () => { cancelado = true; };
  }, [type, name]);

  /** As faixas só se descarregam ao abrir o separador. */
  useEffect(() => {
    if (activeTab !== 'por_ouvir' || !folhaDoTracker || doTracker) return;
    let cancelado = false;
    setACarregarTracker(true);
    faixasDoArtista(folhaDoTracker)
      .then((f) => { if (!cancelado) setDoTracker(f); })
      .catch(() => { if (!cancelado) setDoTracker([]); })
      .finally(() => { if (!cancelado) setACarregarTracker(false); });
    return () => { cancelado = true; };
  }, [activeTab, folhaDoTracker, doTracker]);

  // Fetch YouTube tracks & albums when artist name is ready
  useEffect(() => {
    if (type === 'artist' && name) {
      setLoadingYtTracks(true);
      searchYouTube(name)
        .then((res) => {
          // Filter out tracks that are already in our library tracks to avoid duplication
          const libraryIds = new Set(tracks.map((t) => t.sourceId));
          const filtered = res.filter((t) => !libraryIds.has(t.sourceId));
          setYtTracks(filtered);
        })
        .catch(() => {})
        .finally(() => setLoadingYtTracks(false));

      setLoadingYtAlbums(true);
      searchYouTubePlaylists(name + ' album')
        .then((res) => {
          setYtAlbums(res);
        })
        .catch(() => {})
        .finally(() => setLoadingYtAlbums(false));
    }
  }, [type, name, tracks.length]);

  /** A biblioteca deste artista, na forma que o `lib/tracker` compara. */
  const paraComparar = useMemo(
    () => tracks.map((t) => ({
      titulo: t.title, duracaoSegundos: t.durationSeconds, capa: t.artworkUrl,
    })),
    [tracks],
  );
  const listaPorOuvir = useMemo(
    () => (doTracker ? porOuvir(doTracker, paraComparar) : []),
    [doTracker, paraComparar],
  );
  /**
   * A capa de cada era, tirada das faixas que já tens dela. As eras que
   * saíram ficam com a capa a sério; as que nunca saíram ficam com a cor que
   * a comunidade lhes deu. Ver `capasPorEra`.
   */
  const capasDasEras = useMemo(
    () => (doTracker ? capasPorEra(doTracker, paraComparar) : new Map<string, string>()),
    [doTracker, paraComparar],
  );

  /**
   * Ouvir uma destas: procura-se no YouTube, como para tudo o resto.
   *
   * A folha traz ligações para alojadores de terceiros e elas são ignoradas
   * de propósito -- daqui só se importam metadados.
   */
  const ouvirDoTracker = useCallback(async (f: FaixaDoTracker) => {
    if (aProcurar) return;
    setAProcurar(f.titulo);
    try {
      const res = await searchYouTube(procuraNoYouTube(name, f));
      if (res.length > 0) playTrack(res[0], res, true);
      else Alert.alert('Não encontrei', `"${f.titulo}" não aparece no YouTube.`);
    } catch {
      Alert.alert('Não encontrei', 'A procura falhou. Tenta outra vez.');
    } finally {
      setAProcurar(null);
    }
  }, [aProcurar, name, playTrack]);

  const isSaved = useMemo(() => {
    if (!actionTrack) return false;
    return tracks.some((t) => t.source === actionTrack.source && t.sourceId === actionTrack.sourceId);
  }, [actionTrack, tracks]);

  const sheetActions = useMemo(() => {
    if (!actionTrack) return [];
    
    const base: SheetAction[] = [
      {
        icon: 'play-outline' as const,
        label: 'Tocar a seguir',
        onPress: () => {
          playNext(actionTrack);
          setActionTrack(null);
        },
      },
      {
        icon: 'add-circle-outline' as const,
        label: 'Add to queue',
        onPress: () => {
          addToQueue(actionTrack);
          setActionTrack(null);
        },
      },
      {
        icon: 'list-outline' as const,
        label: 'Add to playlist…',
        onPress: () => {
          setPlaylistTrack(actionTrack);
          setActionTrack(null);
        },
      },
    ];

    if (isSaved) {
      const savedTrackObject = tracks.find(
        (t) => t.source === actionTrack.source && t.sourceId === actionTrack.sourceId
      );
      base.push({
        icon: 'trash-outline' as const,
        label: 'Remove from Library',
        destructive: true,
        onPress: async () => {
          setActionTrack(null);
          if (!savedTrackObject?.id) return;
          try {
            await removeFromLibrary(savedTrackObject.id);
            load();
          } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Could not remove the track.');
          }
        },
      });
    } else {
      base.push({
        icon: 'heart-outline' as const,
        label: 'Save to Library',
        onPress: async () => {
          setActionTrack(null);
          try {
            useSaved.getState().markSaved(actionTrack, true);
            await saveToLibrary(actionTrack);
            hapticNotification();
            load();
          } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Could not save the track.');
          }
        },
      });
    }

    return base;
  }, [actionTrack, isSaved, tracks, playNext, addToQueue, load]);

  const bottomPad = 49 + insets.bottom + MINI_PLAYER_HEIGHT + 32;

  return (
    <Screen
      title={name}
      subtitle={`${type === 'album' ? 'Album' : 'Artist'} · ${tracks.length} ${
        tracks.length === 1 ? 'song' : 'songs'
      }`}
      onBack={() => navigation.goBack()}
    >
      {type === 'artist' && (
        // Escritos UMA vez e repetidos, como no PC (BibliotecaPages.web).
        // Estavam quatro blocos iguais copiados, e um separador novo era um
        // quinto bloco onde qualquer diferença passava despercebida.
        <View style={styles.tabsContainer}>
          {([
            ['library', 'Na Biblioteca', 'heart-outline'],
            ...(folhaDoTracker
              ? [['por_ouvir', `Por Ouvir${doTracker ? ` · ${listaPorOuvir.length}` : ''}`, 'sparkles-outline'] as const]
              : []),
            ['youtube_tracks', 'Outras Músicas', 'musical-notes-outline'],
            ['youtube_albums', 'Álbuns', 'albums-outline'],
          ] as const).map(([id, rotulo, icone]) => {
            const activo = activeTab === id;
            return (
              <Pressable
                key={id}
                onPress={() => setActiveTab(id)}
                style={({ pressed }) => [
                  styles.tabChip,
                  // O aceso leva a cor da CAPA, como o resto da app -- o
                  // cinzento um tom acima quase não se distinguia do apagado.
                  activo && [styles.tabChipActive, { backgroundColor: theme.soft }],
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Ionicons
                  name={icone}
                  size={13}
                  color={activo ? theme.color : colors.textTertiary}
                />
                <Text style={[styles.tabLabel, activo && { color: theme.color }]}>
                  {rotulo}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={theme.color} style={{ marginTop: 48 }} />
      ) : (
        <>
          {activeTab === 'library' && (
            <>
              {tracks.length > 0 ? (
                <View style={{ flexDirection: 'row', paddingHorizontal: spacing.xl, marginBottom: spacing.md }}>
                  <PillButton
                    label="Play all"
                    small
                    onPress={() => playTrack(tracks[0], tracks, true)}
                  />
                </View>
              ) : null}

              {tracks.length === 0 ? (
                <EmptyState
                  icon="musical-notes-outline"
                  title="Nothing here"
                  subtitle="These songs may have been removed from your library."
                />
              ) : (
                <FlatList
                  data={tracks}
                  keyExtractor={(t) => t.id ?? `${t.source}:${t.sourceId}`}
                  initialNumToRender={12}
                  maxToRenderPerBatch={10}
                  updateCellsBatchingPeriod={50}
                  windowSize={7}
                  removeClippedSubviews
                  getItemLayout={getTrackRowLayout}
                  contentContainerStyle={{ paddingBottom: bottomPad }}
                  renderItem={({ item }) => (
                    <TrackRow
                      track={item}
                      active={
                        current?.source === item.source &&
                        current?.sourceId === item.sourceId
                      }
                      onPress={() => playTrack(item, tracks, true)}
                      onAction={() => setActionTrack(item)}
                    />
                  )}
                />
              )}
            </>
          )}

          {activeTab === 'por_ouvir' && (
            <>
              {aCarregarTracker ? (
                <ActivityIndicator color={theme.color} style={{ marginTop: 48 }} />
              ) : listaPorOuvir.length === 0 ? (
                <EmptyState
                  icon="checkmark-done-outline"
                  title="Tens tudo"
                  subtitle="Não há nada no tracker deste artista que não esteja já na tua biblioteca."
                />
              ) : (
                <FlatList
                  data={listaPorOuvir}
                  keyExtractor={(f, i) => `${f.era}:${f.titulo}:${i}`}
                  initialNumToRender={14}
                  maxToRenderPerBatch={12}
                  windowSize={7}
                  removeClippedSubviews
                  contentContainerStyle={{ paddingBottom: bottomPad }}
                  ListHeaderComponent={
                    <Text style={styles.notaDoTracker}>
                      Do tracker da comunidade — o que este artista nunca lançou e não
                      tens guardado. Toca para procurar no YouTube.
                    </Text>
                  }
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => void ouvirDoTracker(item)}
                      style={({ pressed }) => [
                        styles.linhaDoTracker,
                        pressed && { backgroundColor: colors.surface },
                      ]}
                    >
                      {capasDasEras.get(item.era) ? (
                        <Image
                          source={{ uri: capasDasEras.get(item.era)! }}
                          style={styles.capaDaEra}
                          contentFit="cover"
                        />
                      ) : (
                        <View
                          style={[
                            styles.capaDaEra,
                            styles.mosaicoDaEra,
                            { backgroundColor: item.cor || colors.surfaceHigh },
                          ]}
                        >
                          <Text
                            style={[
                              styles.mosaicoTexto,
                              { color: item.corDoTexto || colors.textSecondary },
                            ]}
                          >
                            {iniciaisDaEra(item.era)}
                          </Text>
                        </View>
                      )}
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Text numberOfLines={1} style={typography.body}>{item.titulo}</Text>
                        <Text numberOfLines={1} style={typography.caption}>
                          {[item.era, item.creditos[0], item.dataDoLeak]
                            .filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      {item.disponibilidade ? (
                        <View style={[styles.selo, { borderColor: theme.soft }]}>
                          <Text style={[styles.seloTexto, { color: theme.color }]}>
                            {item.disponibilidade}
                          </Text>
                        </View>
                      ) : null}
                      {aProcurar === item.titulo ? (
                        <ActivityIndicator size="small" color={theme.color} />
                      ) : (
                        <Ionicons name="search" size={16} color={colors.textTertiary} />
                      )}
                    </Pressable>
                  )}
                />
              )}
            </>
          )}

          {activeTab === 'youtube_tracks' && (
            <>
              {loadingYtTracks ? (
                <ActivityIndicator color={theme.color} style={{ marginTop: 48 }} />
              ) : ytTracks.length === 0 ? (
                <EmptyState
                  icon="search"
                  title="No tracks found"
                  subtitle="We couldn't find other songs by this artist on YouTube."
                />
              ) : (
                <FlatList
                  data={ytTracks}
                  keyExtractor={(t) => t.sourceId}
                  initialNumToRender={12}
                  maxToRenderPerBatch={10}
                  updateCellsBatchingPeriod={50}
                  windowSize={7}
                  removeClippedSubviews
                  getItemLayout={getTrackRowLayout}
                  contentContainerStyle={{ paddingBottom: bottomPad }}
                  renderItem={({ item }) => (
                    <TrackRow
                      track={item}
                      showSavedBadge
                      active={
                        current?.source === item.source &&
                        current?.sourceId === item.sourceId
                      }
                      onPress={() => playTrack(item, ytTracks, true)}
                      onAction={() => setActionTrack(item)}
                    />
                  )}
                />
              )}
            </>
          )}

          {activeTab === 'youtube_albums' && (
            <>
              {loadingYtAlbums ? (
                <ActivityIndicator color={theme.color} style={{ marginTop: 48 }} />
              ) : ytAlbums.length === 0 ? (
                <EmptyState
                  icon="albums-outline"
                  title="No albums found"
                  subtitle="We couldn't find albums by this artist on YouTube."
                />
              ) : (
                <FlatList
                  data={ytAlbums}
                  keyExtractor={(t) => t.id}
                  initialNumToRender={10}
                  maxToRenderPerBatch={8}
                  updateCellsBatchingPeriod={50}
                  windowSize={7}
                  removeClippedSubviews
                  contentContainerStyle={{ paddingBottom: bottomPad }}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => {
                        setSelectedYtPlaylistId(item.id);
                        setSelectedYtPlaylistTitle(item.title);
                        setSelectedYtPlaylistArtwork(item.artworkUrl);
                      }}
                      style={({ pressed }) => [
                        styles.albumRow,
                        pressed && { backgroundColor: colors.surfacePressed },
                      ]}
                    >
                      {item.artworkUrl ? (
                        <Image source={{ uri: item.artworkUrl }} style={styles.albumArt} />
                      ) : (
                        <View style={[styles.albumArt, styles.albumArtFallback]}>
                          <Ionicons name="albums-outline" size={20} color={colors.textTertiary} />
                        </View>
                      )}
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text numberOfLines={1} style={[typography.body, { fontWeight: '600' }]}>
                          {item.title}
                        </Text>
                        <Text numberOfLines={1} style={typography.caption}>
                          {item.channelTitle || 'YouTube'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                    </Pressable>
                  )}
                />
              )}
            </>
          )}
        </>
      )}

      <TrackActionsSheet
        visible={!!actionTrack}
        track={actionTrack}
        onClose={() => setActionTrack(null)}
        actions={sheetActions}
      />

      <AddToPlaylistSheet
        visible={!!playlistTrack}
        track={playlistTrack}
        onClose={() => setPlaylistTrack(null)}
      />

      <YtPlaylistRecommendationSheet
        visible={!!selectedYtPlaylistId}
        playlistId={selectedYtPlaylistId}
        playlistTitle={selectedYtPlaylistTitle}
        playlistArtwork={selectedYtPlaylistArtwork}
        onClose={() => {
          setSelectedYtPlaylistId(null);
          setSelectedYtPlaylistTitle(null);
          setSelectedYtPlaylistArtwork(null);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabsContainer: {
    flexDirection: 'row',
    // Com quatro separadores já não cabem numa linha num telemóvel estreito.
    // A mudar de linha ficam todos à vista; a rolar na horizontal, o último
    // ficava cortado na margem e ninguém sabia que existia.
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  notaDoTracker: {
    ...typography.caption,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  linhaDoTracker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: 8,
  },
  // O mesmo tamanho e o mesmo raio da capa de uma faixa normal (TrackRow):
  // as duas listas passam a alinhar, em vez de parecerem dois ecrãs.
  capaDaEra: {
    width: 52,
    height: 52,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceHigh,
  },
  mosaicoDaEra: { alignItems: 'center', justifyContent: 'center' },
  mosaicoTexto: { fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
  selo: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  seloTexto: { fontSize: 10, fontWeight: '700' },
  tabChip: {
    // Ícone + texto, os mesmos do PC: o mesmo componente visto nas duas
    // plataformas, e não dois que se parecem.
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  tabChipActive: {
    backgroundColor: colors.surfacePressed,
    borderColor: colors.borderStrong,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  albumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  albumArt: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceHigh,
  },
  albumArtFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
