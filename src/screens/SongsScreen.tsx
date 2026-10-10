import { useOfflineMode } from '../hooks/useOfflineMode';
import { OfflineNotice } from '../components/OfflineNotice';
import { useAuth } from '../state/auth';
import { isAudioCached,useAudioCache } from '../lib/youtubeCache';
import { readLikedSongsCache } from '../lib/likedSongsCache';
import { faixasEmCache, lerFaixas, ouvirFaixas } from '../lib/cacheDaBiblioteca';
import { displayArtist } from '../lib/artistName';
import { useFocusEffect, useNavigation, useScrollToTop } from '@react-navigation/native';
import { useDestinos } from '../navigation/destinos';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLikedSongs, reporGuardadas, tirarDasGuardadas } from '../api/library';
import { avisarRemocao, contarMusicas, avisarErro } from '../lib/avisoDeRemocao';
import { AddToPlaylistSheet } from '../components/AddToPlaylistSheet';
import { EmptyState } from '../components/EmptyState';
import { PrimeiroPasso } from '../components/PrimeiroPasso';
import { ordenarFaixas } from '../lib/ordenacao';
import { getOrdemDasGostadas, setOrdemDasGostadas } from '../lib/prefs';
import { Screen, useCabecalhoQueEncolhe } from '../components/Screen';
import { SkeletonDeFaixas } from '../components/Skeleton';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { TRACK_ROW_HEIGHT, TrackRow } from '../components/TrackRow';
import { Input } from '../components/Input';
import { useSaved } from '../state/saved';
import { hapticSelection } from '../lib/haptics';
import { usePlayer } from '../state/player';
import { BrilhoDoEcra } from '../components/BrilhoDoEcra';
import { useTheme } from '../state/theme';
import { colors, MINI_PLAYER_HEIGHT, radii, spacing, type } from '../theme';
import type { Track } from '../types';
import { useAlturaDosSeparadores } from '../state/doca';
import { mensagemDeErro } from '../lib/mensagemDeErro';

const chaveDaLinha = (t: Track) => t.id ?? `${t.source}:${t.sourceId}`;

/** De onde vem a lista (o "Jump back in" da Home, lib/recentes.ts). */
const ORIGEM_GUARDADAS = { tipo: 'guardadas', nome: 'Liked Songs' } as const;

export function SongsScreen() {
  // Tocar no separador onde ja se esta volta ao topo (3/10, como no iOS).
  const topo = useRef<any>(null);
  useScrollToTop(topo);
  const insets = useSafeAreaInsets();
  // A barra dos separadores MEDIDA (auditoria 1.3), não um 49 à mão.
  const separadores = useAlturaDosSeparadores();
  const navigation = useNavigation<any>();
  const { irPara } = useDestinos();
  
  // Tocar numa música: com "Start Radio from a song" é o Radio (ver `tocarMusica`).
  const tocarMusica = usePlayer((s) => s.tocarMusica);
  const tocarLista = usePlayer((s) => s.tocarLista);
  const inteligente = usePlayer((s) => s.shuffleInteligente);
  const ligado = usePlayer((s) => s.shuffle);
  const alternarShuffle = usePlayer((s) => s.toggleShuffle);

  const offline=useOfflineMode();
  const userId=useAuth(s=>s.session?.user.id??s.offlineUserId);
  const cacheVersion=useAudioCache(s=>s.revision);
  const [loadError,setLoadError]=useState('');
  const generation=useRef(0);
  const [allTracks, setTracks] = useState<Track[]>([]);
  const tracks=useMemo(()=>offline?allTracks.filter(t=>t.source==='youtube'&&isAudioCached(t.sourceId)):allTracks,[allTracks,offline,cacheVersion]);
  const [loading, setLoading] = useState(true);
  const [actionTrack, setActionTrack] = useState<Track | null>(null);
  
  // Selection states
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [playlistMultipleOpen, setPlaylistMultipleOpen] = useState(false);

  // Search & Theme states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const theme = useTheme((s) => s.theme);

  // Sorting state -- fica guardada (9/10): voltava sempre a "Recent". A
  // preferência é a mesma do PC, que tem mais ordens; aqui só "A–Z" é outra.
  const [sortBy, setSortByLocal] = useState<'recent' | 'az'>('recent');
  useEffect(() => {
    let vivo = true;
    void getOrdemDasGostadas().then((v) => { if (vivo) setSortByLocal(v === 'title' ? 'az' : 'recent'); });
    return () => { vivo = false; };
  }, []);
  const setSortBy = (v: 'recent' | 'az') => { setSortByLocal(v); void setOrdemDasGostadas(v === 'az' ? 'title' : 'recent'); };

  const load = useCallback(async () => {
    const run=++generation.current;
    setLoadError('');
    if(!userId){setTracks([]);setLoading(false);return;}
    // O que o arranque aqueceu, se estiver quente: pinta SEM esperar sequer
    // pelo disco. Ver `hooks/useAquecerSeccoes.ts`.
    const aquecidas=faixasEmCache(getLikedSongs);
    if(aquecidas){setTracks(aquecidas);setLoading(false);}
    else {
      // Senão o ficheiro: é local, sobrevive a fechar a app e serve offline,
      // que a memória não faz.
      const cached=await readLikedSongsCache(userId);
      if(run!==generation.current)return;
      setTracks(cached);setLoading(false);
    }
    if(offline)return;
    try {
      // Pela cache partilhada: duas visitas seguidas ao separador deixam de ser
      // duas consultas. Gostar de uma música limpa-a (ver `markSaved`), por
      // isso isto nunca mostra uma lista velha.
      const result=await lerFaixas(getLikedSongs);
      if(run===generation.current)setTracks(result);
    }catch{
      if(run===generation.current)setLoadError('Could not refresh your liked songs. Your last saved list is shown.');
    }
  },[offline,userId]);
  useFocusEffect(useCallback(()=>{void load();return()=>{generation.current++;};},[load]));
  // O que o aquecimento traz com o separador já montado: pinta-se logo.
  useEffect(()=>ouvirFaixas((leitor,items)=>{
    if(leitor!==getLikedSongs||!userId)return;
    setTracks(items);setLoading(false);
  }),[userId]);
  useEffect(()=>{if(offline){setSelectMode(false);setSelectedIds(new Set());setPlaylistMultipleOpen(false);}},[offline]);

  const toggleSelection = useCallback((trackId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      return next;
    });
  }, []);

  // Sem "Tens a certeza?" (3/10): tira logo, e o aviso deixa desfazer. As
  // músicas voltam com a data de antes, ao mesmo sítio da lista.
  const doRemoveMultiple = async () => {
    if (selectedIds.size === 0) return;
    try {
      const escolhidas = tracks
        .filter((t) => t.id && (selectedIds.has(t.id) || (t.source && selectedIds.has(`${t.source}:${t.sourceId}`))));
      const dbIds = escolhidas.map((t) => t.id).filter(Boolean) as string[];

      const tiradas = await tirarDasGuardadas(dbIds);
      setSelectMode(false);
      setSelectedIds(new Set());
      // O conjunto de "já guardadas" alimenta a marca nos resultados de
      // pesquisa; sem isto o coração ficava lá até reiniciar a app (os
      // separadores ficam montados).
      useSaved.getState().refresh();
      load();
      avisarRemocao({
        texto: `Removed ${contarMusicas(tiradas.length)}`,
        detalhe: 'from Liked Songs',
        desfazer: async () => {
          await reporGuardadas(tiradas, escolhidas);
          useSaved.getState().refresh();
          load();
        },
      });
    } catch (e: any) {
      avisarErro(mensagemDeErro(e, 'Could not remove tracks.'));
    }
  };

  const getSelectedTracksObjects = (): Track[] => {
    return tracks.filter((t) => {
      const id = t.id ?? `${t.source}:${t.sourceId}`;
      return selectedIds.has(id);
    });
  };

  const filteredTracks = useMemo(() => {
    if (!searchQuery.trim()) return tracks;
    const query = searchQuery.toLowerCase();
    return tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(query) ||
        displayArtist(t).toLowerCase().includes(query)
    );
  }, [tracks, searchQuery]);

  const sortedTracks = useMemo(() => {
    const list = [...filteredTracks];
    if (sortBy === 'az') {
      // A MESMA regra do PC: sem isto, `Ángel` e `angel` ordenavam em
      // sítios diferentes conforme a plataforma.
      return ordenarFaixas(list, 'title');
    }
    return list; // default order from database (added_at desc)
  }, [filteredTracks, sortBy]);

  const bottomPad = separadores + insets.bottom + MINI_PLAYER_HEIGHT + (selectMode ? 80 : 32);
  const cab = useCabecalhoQueEncolhe();
  const conteudoDaLista = useMemo(() => ({ paddingBottom: bottomPad, paddingTop: cab.espaco }), [bottomPad, cab.espaco]);
  // As posições das linhas contam com o espaço do cabeçalho e com o Play/Shuffle
  // por cima delas: a virtualização mede a partir do topo do conteúdo.
  const [alturaDoTopoDaLista, setAlturaDoTopoDaLista] = useState(0);
  const posicaoDaLinha = useCallback((_: ArrayLike<Track> | null | undefined, index: number) => ({
    length: TRACK_ROW_HEIGHT,
    offset: cab.espaco + alturaDoTopoDaLista + TRACK_ROW_HEIGHT * index,
    index,
  }), [cab.espaco, alturaDoTopoDaLista]);

  // Estáveis (27/9): com o `React.memo` do TrackRow, uma linha só se redesenha
  // quando muda o que ela mostra. O `current` já não passa por aqui -- cada
  // linha sabe se é a que toca (`acompanharATocar`), e um skip deixou de
  // redesenhar a lista inteira.
  const aoTocarNaLinha = useCallback((item: Track) => {
    if (selectMode) toggleSelection(item.id ?? `${item.source}:${item.sourceId}`);
    else tocarMusica(item, sortedTracks, true, undefined, ORIGEM_GUARDADAS);
  }, [selectMode, toggleSelection, tocarMusica, sortedTracks]);
  const desenharLinha = useCallback(({ item }: { item: Track }) => (
    <TrackRow
      track={item}
      acompanharATocar={!selectMode}
      selectMode={selectMode}
      selected={selectedIds.has(item.id ?? `${item.source}:${item.sourceId}`)}
      onPress={aoTocarNaLinha}
      onAction={setActionTrack}
    />
  ), [selectMode, selectedIds, aoTocarNaLinha]);

  // O título encolhe ao rolar (3/10, variante B): o cabeçalho flutua por cima
  // da lista. A pesquisa fica presa por baixo da barra compacta; o Play/Shuffle
  // e os filtros rolam com as músicas, como no resto do iOS.
  const avisosDoTopo = (
    <>
      {offline&&<OfflineNotice compact/>}
      {!!loadError&&<Text accessibilityRole="alert" style={{color:colors.textSecondary,paddingHorizontal:spacing.xl,paddingBottom:12}}>{loadError}</Text>}
    </>
  );
  const cabecalhoDaLista = (
    <View onLayout={(e) => setAlturaDoTopoDaLista(e.nativeEvent.layout.height)}>
      {avisosDoTopo}
          {!selectMode && sortedTracks.length > 0 && (
            <View style={styles.actionRow}>
              <Pressable
                style={styles.playButton}
                onPress={() => void tocarLista(sortedTracks, ligado, inteligente, ORIGEM_GUARDADAS)}
              >
                <LinearGradient
                  colors={theme.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.buttonGradient}
                >
                  <Ionicons name="play" size={18} color={theme.textColorOnGradient} />
                  <Text style={[styles.buttonTextPlay, { color: theme.textColorOnGradient }]}>Play</Text>
                </LinearGradient>
              </Pressable>

              <Pressable
                style={[
                  styles.shuffleButton,
                  // **O shuffle normal tambem tem de se ver ligado.** So o
                  // modo inteligente e que se notava, pelo brilho; ligado e
                  // desligado eram o mesmo botao, e nao havia como saber.
                  ligado && !inteligente && {
                    borderColor: theme.color,
                    backgroundColor: theme.soft,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: ligado }}
                accessibilityLabel={
                  inteligente ? 'Smart shuffle on'
                    : ligado ? 'Shuffle on' : 'Shuffle off'
                }
                onPress={() => { hapticSelection(); alternarShuffle(); }}
              >
                {/* O MODO vem do leitor: um so sitio decide se o shuffle e
                    inteligente, e este botao mostra-o e respeita-o. O brilho
                    nao leva tamanho -- estica-se por este botao. */}
                {inteligente && <BrilhoDoEcra />}
                <Ionicons
                  name="shuffle"
                  size={20}
                  color={ligado && !inteligente ? theme.color : colors.text}
                />
                <Text style={[
                  styles.buttonTextShuffle,
                  ligado && !inteligente && { color: theme.color },
                ]}>{inteligente ? 'Smart' : 'Shuffle'}</Text>
              </Pressable>
            </View>
          )}
          {/* Sorting & Edit Mode Filters */}
          <View style={styles.filtersRow}>
            <View style={styles.filters}>
              <Pressable
                style={[styles.chip, sortBy === 'recent' && styles.chipActive]}
                onPress={() => setSortBy('recent')}
              >
                <Text style={[styles.chipLabel, sortBy === 'recent' && { color: colors.text }]}>Recent</Text>
              </Pressable>
              <Pressable
                style={[styles.chip, sortBy === 'az' && styles.chipActive]}
                onPress={() => setSortBy('az')}
              >
                <Text style={[styles.chipLabel, sortBy === 'az' && { color: colors.text }]}>A–Z</Text>
              </Pressable>
            </View>

            <Pressable
              style={[styles.selectButton,offline&&{opacity:0.4}]}
              disabled={offline}
              onPress={() => {
                if (selectMode) {
                  setSelectMode(false);
                  setSelectedIds(new Set());
                } else {
                  setSelectMode(true);
                }
              }}
            >
              <Text style={[styles.selectButtonText, selectMode && { color: colors.text }]}>
                {selectMode ? 'Cancel' : 'Select'}
              </Text>
            </Pressable>
          </View>

    </View>
  );

  return (
    <Screen
      encolhe={cab}
      fixo={searchOpen ? (
            <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.md }}>
              <Input
                icon="search"
                placeholder="Search your Liked Songs"
                value={searchQuery}
                onChangeText={setSearchQuery}
                onClear={() => setSearchQuery('')}
                // Abrir a pesquisa É querer escrever. Sem isto eram dois
                // toques -- um na lupa e outro na caixa -- para uma coisa só.
                autoFocus
              />
            </View>
      ) : undefined}
      title="Liked Songs"
      subtitle={`${tracks.length} ${offline?'downloaded':'saved'} ${tracks.length === 1 ? 'song' : 'songs'}`}
      right={
        tracks.length > 0 ? (
          <Pressable
            hitSlop={10}
            onPress={() => {
              setSearchOpen(!searchOpen);
              if (searchOpen) setSearchQuery('');
            }}
            style={{ padding: 4 }}
          >
            <Ionicons name={searchOpen ? "close" : "search-outline"} size={24} color={colors.text} />
          </Pressable>
        ) : undefined
      }
    >
      {loading ? (
        <View style={{ paddingTop: cab.espaco }}>
          {avisosDoTopo}
          <SkeletonDeFaixas />
        </View>
      ) : tracks.length === 0 ? (
        <View style={{ flex: 1, paddingTop: cab.espaco }}>
        {avisosDoTopo}
        <EmptyState
          icon="heart-outline"
          title={offline ? "No downloaded liked songs" : "Nothing here yet"}
          subtitle={offline
            ? "Download your liked songs while online to listen here without internet."
            : "Bring in a playlist you already have, or find something new."}
        >
          {/* Um ecrã vazio que não diz o que fazer a seguir é um beco. A
              importação já existia, escondida numa página que só se
              encontrava por acaso. */}
          {!offline && (
            <View style={{ gap: spacing.sm, marginTop: spacing.xl, alignSelf: "stretch", paddingHorizontal: spacing.xl }}>
              <PrimeiroPasso
                icon="logo-youtube"
                label="Import a YouTube playlist"
                onPress={() => navigation.navigate("ImportYouTube")}
              />
              <PrimeiroPasso
                icon="search-outline"
                label="Search for music"
                onPress={() => irPara({ tipo: 'inicio' })}
              />
            </View>
          )}
        </EmptyState>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <Animated.FlatList
            ref={topo}
            data={sortedTracks}
            keyExtractor={chaveDaLinha}
            initialNumToRender={12}
            maxToRenderPerBatch={10}
            updateCellsBatchingPeriod={50}
            windowSize={7}
            removeClippedSubviews
            getItemLayout={posicaoDaLinha}
            ListHeaderComponent={cabecalhoDaLista}
            contentContainerStyle={conteudoDaLista}
            onScroll={cab.onScroll}
            scrollEventThrottle={cab.scrollEventThrottle}
            scrollIndicatorInsets={{ top: cab.espaco }}
            renderItem={desenharLinha}
          />
        </View>
      )}

      {/* Floating Multi-select Action Bar */}
      {selectMode && (
        <View style={[styles.actionBar, { bottom: separadores + insets.bottom + MINI_PLAYER_HEIGHT + 8 }]}>
          <Pressable
            style={styles.actionButton}
            onPress={() => setPlaylistMultipleOpen(true)}
            disabled={selectedIds.size === 0}
          >
            <Ionicons
              name="list-outline"
              size={20}
              color={selectedIds.size === 0 ? colors.textTertiary : colors.text}
            />
            <Text style={[styles.actionLabel, selectedIds.size === 0 && { color: colors.textTertiary }]}>
              Add to playlist
            </Text>
          </Pressable>
          <Pressable
            style={styles.actionButton}
            onPress={() => { void doRemoveMultiple(); }}
            disabled={selectedIds.size === 0}
          >
            <Ionicons
              name="trash-outline"
              size={20}
              color={selectedIds.size === 0 ? colors.textTertiary : colors.danger}
            />
            <Text
              style={[
                styles.actionLabel,
                { color: selectedIds.size === 0 ? colors.textTertiary : colors.danger },
              ]}
            >
              Remove
            </Text>
          </Pressable>
        </View>
      )}

      {/* O menu é o de todas as listas (lib/menuDaFaixa.ts); daqui só se diz
          que, depois de tirar da biblioteca, esta lista tem de reler. */}
      <TrackActionsSheet
        visible={!!actionTrack}
        track={actionTrack}
        onClose={() => setActionTrack(null)}
        aoMudarBiblioteca={load}
      />

      <AddToPlaylistSheet
        visible={playlistMultipleOpen}
        tracks={getSelectedTracksObjects()}
        onClose={() => {
          setPlaylistMultipleOpen(false);
          setSelectMode(false);
          setSelectedIds(new Set());
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  filters: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.surfacePressed,
    borderColor: colors.borderStrong,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  selectButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  selectButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  actionBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 60,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceHigh,
    borderColor: colors.borderStrong,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  playButton: {
    flex: 1,
    height: 48,
    borderRadius: radii.xl,
    overflow: 'hidden',
  },
  buttonGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonTextPlay: {
    fontSize: 16,
    fontWeight: '700',
  },
  shuffleButton: {
    flex: 1,
    height: 48,
    borderRadius: radii.xl,
    // O brilho do modo inteligente estica-se por este botao; e o raio daqui
    // que lhe da a forma.
    overflow: 'hidden',
    backgroundColor: colors.surfaceHigh,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonTextShuffle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
});
