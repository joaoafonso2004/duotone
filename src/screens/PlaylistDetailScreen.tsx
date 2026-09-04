import { displayArtist } from '../lib/artistName';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLibrary } from '../api/library';
import {
  addTracksToPlaylist,
  deletePlaylist,
  getPlaylistTracks,
  getPlaylistDetails,
  listPlaylists,
  mergePlaylists,
  removeTrackFromPlaylist,
  renamePlaylist,
  setPlaylistOrder,
} from '../api/playlists';
import { BottomSheet } from '../components/BottomSheet';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { EmptyState } from '../components/EmptyState';
import { Input } from '../components/Input';
import { PromptSheet } from '../components/PromptSheet';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../components/Screen';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { getTrackRowLayout, TrackRow } from '../components/TrackRow';
import { YtPlaylistShareSheet } from '../components/YtPlaylistShareSheet';
import { ShareFriendSheet } from '../components/ShareFriendSheet';
import { hapticNotification, hapticSelection } from '../lib/haptics';
import { correspondeAPesquisa } from '../lib/searchText';
import { useTheme } from '../state/theme';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { usePlayer } from '../state/player';
import { useAuth } from '../state/auth';
import { BrilhoInteligente } from '../components/BrilhoInteligente';
import { colors, MINI_PLAYER_HEIGHT, spacing, type, gradients, radii } from '../theme';
import type { Playlist, PlaylistTrack, Track } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'PlaylistDetail'>;

export function PlaylistDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const userId=useAuth(s=>s.session?.user.id);
  const [details,setDetails]=useState<{id:string;name:string;ownerId:string}|null>(null);
  const canEdit=details?.id===id&&details.ownerId===userId;
  const [loadError,setLoadError]=useState('');
  const detailRequest=useRef(0);
  const insets = useSafeAreaInsets();
  const playTrack = usePlayer((s) => s.playTrack);
  const playShuffled = usePlayer((s) => s.playShuffled);
  const inteligente = usePlayer((s) => s.shuffleInteligente);
  const ligado = usePlayer((s) => s.shuffle);
  const alternarShuffle = usePlayer((s) => s.toggleShuffle);
  const playNext = usePlayer((s) => s.playNext);
  const addToQueue = usePlayer((s) => s.addToQueue);
  const current = usePlayer((s) => s.current);

  const [name, setName] = useState(route.params.name);
  const [tracks, setTracks] = useState<PlaylistTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  const [optionsOpen, setOptionsOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [removeFor, setRemoveFor] = useState<PlaylistTrack | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareFriendOpen, setShareFriendOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeItems, setMergeItems] = useState<Playlist[]>([]);
  const theme = useTheme((s) => s.theme);

  // States for Add Tracks Modal
  const [addTracksOpen, setAddTracksOpen] = useState(false);
  const [libraryTracks, setLibraryTracks] = useState<Track[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addSearchQuery, setAddSearchQuery] = useState('');
  const [playlistSearchQuery, setPlaylistSearchQuery] = useState('');

  // States for Sorting
  const [sortOpen, setSortOpen] = useState(false);
  const [sortMode, setSortMode] = useState<'default' | 'title' | 'recent' | 'played_recent' | 'played_most' | 'duration'>('default');
  const [playCounts, setPlayCounts] = useState<Record<string, { count: number; lastPlayed: number }>>({});

  // State for specific track actions (...)
  const [actionTrack, setActionTrack] = useState<Track | null>(null);

  // Load play counts on mount for sorting
  useEffect(() => {
    AsyncStorage.getItem('playCounts:v1').then((raw: string | null) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            setPlayCounts(parsed);
          }
        } catch {
          // ignore
        }
      }
    });
  }, []);

  // Load library tracks when add modal opens
  useEffect(() => {
    if (addTracksOpen) {
      setLoadingLibrary(true);
      getLibrary()
        .then((res) => {
          setLibraryTracks(res);
          const currentIds = new Set(tracks.map((t) => t.sourceId));
          setSelectedIds(currentIds);
        })
        .catch(() => {})
        .finally(() => setLoadingLibrary(false));
    }
  }, [addTracksOpen, tracks]);

  const toggleSelectTrack = (sourceId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) {
        next.delete(sourceId);
      } else {
        next.add(sourceId);
      }
      return next;
    });
    hapticSelection();
  };

  const saveSelectedTracks = async () => {
    setBusy(true);
    try {
      const toAdd = libraryTracks.filter(
        (t) => selectedIds.has(t.sourceId) && !tracks.some((pt) => pt.sourceId === t.sourceId)
      );
      const toRemove = tracks.filter((pt) => !selectedIds.has(pt.sourceId));

      if (toAdd.length > 0) {
        await addTracksToPlaylist(id, toAdd);
      }
      for (const pt of toRemove) {
        await removeTrackFromPlaylist(id, pt.id);
      }

      hapticNotification();
      load();
      setAddTracksOpen(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not update playlist tracks.');
    } finally {
      setBusy(false);
    }
  };

  const filteredLibrary = useMemo(() => {
    return libraryTracks.filter((t) => correspondeAPesquisa(addSearchQuery, t.title, displayArtist(t)));
  }, [libraryTracks, addSearchQuery]);

  const sortedTracks = useMemo(() => {
    const getPlayKey = (t: Track) => `${t.source}:${t.sourceId}`;
    switch (sortMode) {
      case 'title':
        return [...tracks].sort((a, b) => a.title.localeCompare(b.title));
      case 'recent':
        return [...tracks].sort((a, b) => b.position - a.position);
      case 'played_recent':
        return [...tracks].sort((a, b) => {
          const aTime = playCounts[getPlayKey(a)]?.lastPlayed ?? 0;
          const bTime = playCounts[getPlayKey(b)]?.lastPlayed ?? 0;
          return bTime - aTime;
        });
      case 'played_most':
        return [...tracks].sort((a, b) => {
          const aCount = playCounts[getPlayKey(a)]?.count ?? 0;
          const bCount = playCounts[getPlayKey(b)]?.count ?? 0;
          return bCount - aCount;
        });
      case 'duration':
        return [...tracks].sort((a, b) => (a.durationSeconds ?? 0) - (b.durationSeconds ?? 0));
      default:
        return [...tracks].sort((a, b) => a.position - b.position);
    }
  }, [tracks, sortMode, playCounts]);

  const visibleTracks = useMemo(
    () => sortedTracks.filter((t) => correspondeAPesquisa(playlistSearchQuery, t.title, displayArtist(t))),
    [sortedTracks, playlistSearchQuery],
  );

  const trackActions = useMemo(() => {
    if (!actionTrack) return [];
    return [
      {
        icon: 'play-outline' as const,
        label: 'Tocar a seguir',
        onPress: () => {
          playNext(actionTrack);
          setActionTrack(null);
        },
      },
      {
        icon: 'list-outline' as const,
        label: 'Add to queue',
        onPress: () => {
          addToQueue(actionTrack);
          setActionTrack(null);
        },
      },
      {
        icon: 'trash-outline' as const,
        label: 'Remover da playlist',
        destructive: true,
        onPress: () => {
          setActionTrack(null);
          const playlistTrack = tracks.find((t) => t.source === actionTrack.source && t.sourceId === actionTrack.sourceId);
          if (playlistTrack) {
            setRemoveFor(playlistTrack);
          }
        },
      },
    ].filter(action=>canEdit||!action.destructive);
  }, [actionTrack, playNext, addToQueue, tracks,canEdit]);

  const load = useCallback(async () => {
    const token=++detailRequest.current;
    setLoading(true);setLoadError('');
    try {
      const [info,rows]=await Promise.all([getPlaylistDetails(id),getPlaylistTracks(id)]);
      if(token!==detailRequest.current)return;
      setDetails(info);setName(info.name);setTracks(rows);
    } catch(e:any) {
      if(token!==detailRequest.current)return;
      setDetails(null);setTracks([]);setLoadError(e?.message || 'Could not load playlist.');
    } finally {
      if(token===detailRequest.current)setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      if (!editMode) load();
      return()=>{detailRequest.current++;};
    }, [load, editMode])
  );

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= tracks.length) return;
    const next = [...tracks];
    [next[index], next[j]] = [next[j], next[index]];
    setTracks(next);
    setDirty(true);
    hapticSelection();
  };

  const finishEdit = async () => {
    setEditMode(false);
    if (!dirty) return;
    try {
      await setPlaylistOrder(
        id,
        tracks.map((t) => t.id)
      );
      setDirty(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not save the new order.');
      load();
    }
  };

  const doRename = async (newName: string) => {
    setBusy(true);
    try {
      await renamePlaylist(id, newName);
      hapticNotification();
      setName(newName);
      setRenameOpen(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not rename.');
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await deletePlaylist(id);
      setDeleteOpen(false);
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not delete.');
    } finally {
      setBusy(false);
    }
  };

  const doRemoveTrack = async () => {
    if (!removeFor) return;
    setBusy(true);
    try {
      await removeTrackFromPlaylist(id, removeFor.id);
      setTracks(tracks.filter((t) => t.id !== removeFor.id));
      setRemoveFor(null);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not remove the track.');
    } finally {
      setBusy(false);
    }
  };

  const abrirMerge = async () => {
    setOptionsOpen(false);
    setMergeOpen(true);
    try { setMergeItems((await listPlaylists()).filter((playlist) => playlist.id !== id)); }
    catch (e: any) { setMergeOpen(false); Alert.alert('Error', e?.message ?? 'Could not load your playlists.'); }
  };

  const fazerMerge = async (source: Playlist) => {
    setBusy(true);
    try {
      const resultado = await mergePlaylists(id, source.id);
      setMergeOpen(false);
      await load();
      hapticNotification();
      Alert.alert('Playlists merged', `${resultado.adicionadas} added · ${resultado.repetidas} already existed.\n\n“${source.name}” was not changed.`);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not merge the playlists.');
    } finally { setBusy(false); }
  };

  const bottomPad = 49 + insets.bottom + MINI_PLAYER_HEIGHT + 32;

  return (
    <Screen
      title={name}
      subtitle={`${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'}`}
      onBack={() => navigation.goBack()}
      right={
        editMode ? (
          <Pressable
            hitSlop={10}
            onPress={finishEdit}
            style={{ padding: 4 }}
          >
            <Text style={[type.body, { fontWeight: '600', color: theme.color }]}>
              Done
            </Text>
          </Pressable>
        ) : undefined
      }
    >
      {tracks.length > 0 && !editMode ? (
        <>
          <View style={styles.actionRow}>
            <Pressable
              style={styles.playButton}
              onPress={() => (ligado
                  ? playShuffled(visibleTracks, inteligente)
                  : visibleTracks[0] && playTrack(visibleTracks[0], visibleTracks, true))}
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
                // Ligado tem de se ver: so o modo inteligente e que se notava.
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
              {/* O MODO vem do leitor — ver o comentario gemeo no PC. */}
              {inteligente && <BrilhoInteligente />}
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

          <View style={styles.playlistToolbar}>
            {canEdit&&<Pressable
              style={styles.toolbarItem}
              onPress={() => {
                hapticSelection();
                setAddTracksOpen(true);
              }}
            >
              <Ionicons name="add" size={22} color={theme.color} />
              <Text style={[styles.toolbarLabel, { color: theme.color }]}>Add tracks</Text>
            </Pressable>}

            <Pressable
              style={styles.toolbarItem}
              onPress={() => {
                hapticSelection();
                setSortOpen(true);
              }}
            >
              <Ionicons name="swap-vertical" size={18} color={colors.text} />
              <Text style={styles.toolbarLabel}>Sort</Text>
            </Pressable>

            {canEdit&&<Pressable
              style={styles.toolbarItem}
              onPress={() => {
                hapticSelection();
                setSortMode('default');
                setEditMode(true);
              }}
            >
              <Ionicons name="pencil" size={16} color={colors.text} />
              <Text style={styles.toolbarLabel}>Edit</Text>
            </Pressable>}

            <Pressable
              style={styles.toolbarItem}
              onPress={() => {
                hapticSelection();
                setOptionsOpen(true);
              }}
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={colors.text} />
              <Text style={styles.toolbarLabel}>More</Text>
            </Pressable>
          </View>
        </>
      ) : null}

      {tracks.length > 0 && !editMode ? (
        <View style={styles.playlistSearchBox}>
          <Input
            icon="search"
            placeholder="Search this playlist"
            value={playlistSearchQuery}
            onChangeText={setPlaylistSearchQuery}
            onClear={() => setPlaylistSearchQuery('')}
          />
        </View>
      ) : null}

      {loadError ? <View style={{padding:24,gap:12}}><Text style={{color:colors.danger}}>{loadError}</Text><Pressable onPress={()=>void load()}><Text style={{color:theme.color}}>Try again</Text></Pressable></View> : loading ? (
        <ActivityIndicator color={theme.color} style={{ marginTop: 48 }} />
      ) : tracks.length === 0 ? (
        <EmptyState
          icon="musical-notes-outline"
          title="This playlist is empty"
          subtitle={canEdit?"Add tracks from Search or your Library using the ••• menu on any track.":"The owner has not added any tracks yet."}
        />
      ) : playlistSearchQuery.trim() && visibleTracks.length === 0 ? (
        <EmptyState icon="search-outline" title="No songs found" subtitle={`No track matches "${playlistSearchQuery}".`} />
      ) : (
        <FlatList
          data={editMode ? tracks : visibleTracks}
          keyExtractor={(t) => t.id}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          windowSize={7}
          removeClippedSubviews
          getItemLayout={editMode ? undefined : getTrackRowLayout}
          contentContainerStyle={{ paddingBottom: bottomPad }}
          renderItem={({ item, index }) =>
            editMode ? (
              <View style={styles.editRow}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={[type.body, { fontWeight: '600' }]}>
                    {item.title}
                  </Text>
                  <Text numberOfLines={1} style={type.caption}>
                    {displayArtist(item)}
                  </Text>
                </View>
                <Pressable
                  hitSlop={8}
                  onPress={() => move(index, -1)}
                  disabled={index === 0}
                  style={index === 0 && { opacity: 0.25 }}
                >
                  <Ionicons name="chevron-up" size={22} color={colors.text} />
                </Pressable>
                <Pressable
                  hitSlop={8}
                  onPress={() => move(index, 1)}
                  disabled={index === tracks.length - 1}
                  style={index === tracks.length - 1 && { opacity: 0.25 }}
                >
                  <Ionicons name="chevron-down" size={22} color={colors.text} />
                </Pressable>
                <Pressable hitSlop={8} onPress={() => setRemoveFor(item)}>
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </Pressable>
              </View>
            ) : (
              <TrackRow
                track={item}
                active={
                  current?.source === item.source &&
                  current?.sourceId === item.sourceId
                }
                onPress={() => playTrack(item, visibleTracks, true)}
                onAction={() => setActionTrack(item)}
              />
            )
          }
        />
      )}

      {/* opções da playlist */}
      <TrackActionsSheet
        visible={optionsOpen}
        track={null}
        onClose={() => setOptionsOpen(false)}
        actions={[
          {
            icon: 'people-outline' as const,
            label: 'Partilhar com amigo…',
            onPress: () => {
              setOptionsOpen(false);
              setShareFriendOpen(true);
            },
          },
          {
            icon: 'share-social-outline' as const,
            label: 'QR Code / Copy link',
            onPress: () => {
              setOptionsOpen(false);
              setShareOpen(true);
            },
          },
          {
            icon: 'git-merge-outline' as const,
            label: 'Merge another playlist…',
            onPress: () => { void abrirMerge(); },
          },
          {
            icon: 'pencil-outline' as const,
            label: 'Rename playlist',
            onPress: () => {
              setOptionsOpen(false);
              setRenameOpen(true);
            },
          },
          {
            icon: 'trash-outline' as const,
            label: 'Delete playlist',
            destructive: true,
            onPress: () => {
              setOptionsOpen(false);
              setDeleteOpen(true);
            },
          },
        ].filter(action=>canEdit||(action.icon!=='git-merge-outline'&&action.icon!=='pencil-outline'&&action.icon!=='trash-outline'))}
      />

      <BottomSheet visible={mergeOpen} onClose={() => !busy && setMergeOpen(false)}>
        <Text style={[type.title, { marginBottom: spacing.sm }]}>Merge into {name}</Text>
        <Text style={[type.caption, { marginBottom: spacing.md }]}>Only missing tracks are copied. The other playlist stays unchanged.</Text>
        {!mergeItems.length ? <Text style={type.caption}>You need another playlist to merge.</Text> : mergeItems.map((playlist) => (
          <Pressable key={playlist.id} disabled={busy} onPress={() => void fazerMerge(playlist)}
            style={({ pressed }) => [styles.menuOption, pressed && { backgroundColor: colors.surfacePressed }]}>
            <Ionicons name="albums-outline" size={20} color={theme.color} />
            <View style={{ flex: 1, marginLeft: 8 }}><Text numberOfLines={1} style={[type.body, { fontWeight: '600' }]}>{playlist.name}</Text><Text style={type.caption}>{playlist.trackCount} tracks</Text></View>
            {busy ? <ActivityIndicator size="small" color={theme.color} /> : <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />}
          </Pressable>
        ))}
      </BottomSheet>

      <ShareFriendSheet
        visible={shareFriendOpen}
        itemType="playlist"
        item={{ id }}
        onClose={() => setShareFriendOpen(false)}
      />

      <YtPlaylistShareSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        playlistId={id}
        playlistName={name}
      />

      <PromptSheet
        visible={renameOpen}
        title="Rename playlist"
        placeholder="Playlist name"
        initialValue={name}
        submitLabel="Rename"
        loading={busy}
        onClose={() => setRenameOpen(false)}
        onSubmit={doRename}
      />

      <ConfirmSheet
        visible={deleteOpen}
        title="Delete playlist"
        message={`"${name}" will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete playlist"
        destructive
        loading={busy}
        onClose={() => setDeleteOpen(false)}
        onConfirm={doDelete}
      />

      <ConfirmSheet
        visible={!!removeFor}
        title="Remove track"
        message={`Remove "${removeFor?.title ?? ''}" from this playlist?`}
        confirmLabel="Remove"
        destructive
        loading={busy}
        onClose={() => setRemoveFor(null)}
        onConfirm={doRemoveTrack}
      />

      {/* Sort options bottom sheet */}
      <BottomSheet visible={sortOpen} onClose={() => setSortOpen(false)}>
        <Text style={[type.title, { marginBottom: spacing.md }]}>
          Sort tracks
        </Text>
        {(
          [
            { label: 'Default order', value: 'default', icon: 'list-outline' },
            { label: 'Title', value: 'title', icon: 'text-outline' },
            { label: 'Recently added', value: 'recent', icon: 'time-outline' },
            { label: 'Recently played', value: 'played_recent', icon: 'play-outline' },
            { label: 'Most played', value: 'played_most', icon: 'stats-chart-outline' },
            { label: 'Duration', value: 'duration', icon: 'hourglass-outline' },
          ] as const
        ).map((opt) => {
          const isActive = sortMode === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => {
                hapticSelection();
                setSortMode(opt.value);
                setSortOpen(false);
              }}
              style={({ pressed }) => [
                styles.menuOption,
                pressed && { backgroundColor: colors.surfacePressed },
                isActive && { backgroundColor: theme.soft },
              ]}
            >
              <Ionicons
                name={opt.icon}
                size={20}
                color={isActive ? theme.color : colors.text}
              />
              <Text
                style={[
                  type.body,
                  { fontWeight: '600', marginLeft: 8, flex: 1 },
                  isActive && { color: theme.color },
                ]}
              >
                {opt.label}
              </Text>
              {isActive && (
                <Ionicons name="checkmark" size={18} color={theme.color} />
              )}
            </Pressable>
          );
        })}
      </BottomSheet>

      {/* Track Actions sheet (...) */}
      <TrackActionsSheet
        visible={!!actionTrack}
        track={actionTrack}
        onClose={() => setActionTrack(null)}
        actions={trackActions}
      />

      {/* Add Tracks modal */}
      <Modal visible={addTracksOpen} animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, backgroundColor: colors.bg }}
        >
          <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
            <View style={styles.modalHeader}>
              <Pressable onPress={() => setAddTracksOpen(false)} hitSlop={12}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Text style={styles.modalTitle} numberOfLines={1}>
                Add to {name}
              </Text>
              <Pressable onPress={saveSelectedTracks} disabled={busy} hitSlop={12}>
                {busy ? (
                  <ActivityIndicator size="small" color={theme.color} />
                ) : (
                  <Text style={[styles.modalDoneText, { color: theme.color }]}>Done</Text>
                )}
              </Pressable>
            </View>

            <View style={styles.modalSearchBox}>
              <Input
                icon="search"
                placeholder="Search library songs"
                value={addSearchQuery}
                onChangeText={setAddSearchQuery}
                onClear={() => setAddSearchQuery('')}
              />
            </View>

            {loadingLibrary ? (
              <ActivityIndicator color={theme.color} style={{ marginTop: 48 }} />
            ) : filteredLibrary.length === 0 ? (
              <EmptyState
                icon="musical-notes-outline"
                title="No songs found"
                subtitle="Add songs to your Library first to add them here."
              />
            ) : (
              <FlatList
                data={filteredLibrary}
                keyExtractor={(item) => item.sourceId}
                initialNumToRender={12}
                maxToRenderPerBatch={10}
                updateCellsBatchingPeriod={50}
                windowSize={7}
                removeClippedSubviews
                contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
                renderItem={({ item }) => {
                  const isSelected = selectedIds.has(item.sourceId);
                  return (
                    <Pressable
                      onPress={() => toggleSelectTrack(item.sourceId)}
                      style={({ pressed }) => [
                        styles.modalItemRow,
                        pressed && { backgroundColor: colors.surfacePressed },
                      ]}
                    >
                      <Ionicons
                        name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={isSelected ? theme.color : colors.textTertiary}
                      />
                      {item.artworkUrl ? (
                        <Image
                          source={{ uri: item.artworkUrl }}
                          style={styles.modalItemArt}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={[styles.modalItemArt, { alignItems: 'center', justifyContent: 'center' }]}>
                          <Ionicons name="musical-notes" size={18} color={colors.textTertiary} />
                        </View>
                      )}
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text numberOfLines={1} style={[type.body, { fontWeight: '600' }]}>
                          {item.title}
                        </Text>
                        <Text numberOfLines={1} style={type.caption}>
                          {displayArtist(item)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  playlistToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    marginHorizontal: spacing.xl,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  playlistSearchBox: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  toolbarItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flex: 1,
  },
  toolbarLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.3,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    marginVertical: 2,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    height: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalCancelText: {
    ...type.body,
    color: colors.textSecondary,
  },
  modalTitle: {
    ...type.headline,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: spacing.md,
  },
  modalDoneText: {
    ...type.body,
    fontWeight: '700',
  },
  modalSearchBox: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  modalItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  modalItemArt: {
    width: 44,
    height: 44,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceHigh,
  },
  playButton: {
    flex: 1,
    height: 48,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  buttonGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  shuffleButton: {
    flex: 1,
    height: 48,
    borderRadius: radii.md,
    // O brilho estica-se por este botao; e o raio daqui que lhe da a forma.
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonTextPlay: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.bg,
  },
  buttonTextShuffle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: 10,
  },
});
