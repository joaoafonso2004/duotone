import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation, useScrollToTop } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createPlaylist,
  deletePlaylist,
  getPlaylistTracks,
  importSharedPlaylist,
} from '../api/playlists';
import { ArtworkCollage } from '../components/ArtworkCollage';
import { BottomSheet } from '../components/BottomSheet';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { EmptyState } from '../components/EmptyState';
import { PrimeiroPasso } from '../components/PrimeiroPasso';
import { PromptSheet } from '../components/PromptSheet';
import { Screen } from '../components/Screen';
import { SkeletonDePlaylists } from '../components/Skeleton';
import { SocialButton } from '../components/socialUI';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { ShareFriendSheet } from '../components/ShareFriendSheet';
import { YtPlaylistShareSheet } from '../components/YtPlaylistShareSheet';
import { usePlayer } from '../state/player';
import { hapticImpact, hapticNotification, ImpactFeedbackStyle } from '../lib/haptics';
import { avisarRemocao } from '../lib/avisoDeRemocao';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { colors, MINI_PLAYER_HEIGHT, radii, spacing, type } from '../theme';
import { usePlaylists } from '../state/playlists';
import { useTheme } from '../state/theme';
import type { Playlist } from '../types';

export function PlaylistsScreen() {
  // Tocar no separador onde ja se esta volta ao topo (3/10, como no iOS).
  const topo = useRef<any>(null);
  useScrollToTop(topo);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();

  // A lista vive na store e não neste ecrã. Era um `useState` local com um
  // `useFocusEffect` a recarregá-lo a cada foco -- e a pôr `loading` a true,
  // que trocava a grelha inteira pelo esqueleto. Ver `state/playlists.ts`.
  const playlists = usePlaylists((s) => s.items);
  const estado = usePlaylists((s) => s.estado);
  const loadError = usePlaylists((s) => s.erro);
  const carregar = usePlaylists((s) => s.carregar);
  /** Esqueleto só para quem ainda não tem nada. Com lista no ecrã, a
   *  revalidação não se anuncia -- era esse anúncio o pisca. */
  const loading = estado !== 'pronto' && playlists.length === 0;
  const [busy, setBusy] = useState(false);
  const theme = useTheme((s) => s.theme);

  const [createOpen, setCreateOpen] = useState(false);
  const [optionsFor, setOptionsFor] = useState<Playlist | null>(null);
  // As duas partilhas do toque longo (28/9): estavam só no More de dentro.
  const [partilharCom, setPartilharCom] = useState<Playlist | null>(null);
  const [qrDe, setQrDe] = useState<Playlist | null>(null);
  const [deleteFor, setDeleteFor] = useState<Playlist | null>(null);
  const [importSharedOpen, setImportSharedOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const doImportShared = async (input: string) => {
    let id = input.trim();
    if (id.includes('id=')) {
      const parts = id.split('id=');
      id = parts[parts.length - 1];
    }
    if (!id) {
      Alert.alert('Error', 'Please enter a valid playlist ID or shared link.');
      return;
    }
    setBusy(true);
    try {
      const newPlId = await importSharedPlaylist(id);
      hapticNotification();
      setImportSharedOpen(false);
      load();
      navigation.navigate('PlaylistDetail', { id: newPlId, name: 'Shared Playlist' });
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not import the shared playlist.');
    } finally {
      setBusy(false);
    }
  };

  /** Depois de mexer na lista, a versão do servidor é a que manda. */
  const load = useCallback(() => { void carregar(true); }, [carregar]);

  // No foco, revalida-se em silêncio -- e nem isso, se a lista for recente.
  // A cancelar já não há nada: quem trata de respostas fora de tempo é o
  // contador de geração da store.
  useFocusEffect(
    useCallback(() => { void carregar(); }, [carregar])
  );

  const doCreate = async (name: string) => {
    setBusy(true);
    try {
      const pl = await createPlaylist(name);
      hapticNotification();
      setCreateOpen(false);
      load();
      navigation.navigate('PlaylistDetail', { id: pl.id, name: pl.name });
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not create the playlist.');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Tocar, baralhar ou pôr na fila sem abrir a playlist (o toque longo, 28/9).
   * As faixas vêm pela ordem da playlist; o modo de shuffle é o do leitor.
   */
  const usarPlaylist = async (p: Playlist, modo: 'tocar' | 'baralhar' | 'fila') => {
    try {
      const faixas = await getPlaylistTracks(p.id);
      if (faixas.length === 0) return;
      const leitor = usePlayer.getState();
      if (modo === 'fila') { leitor.addManyToQueue(faixas); hapticNotification(); return; }
      if (modo === 'baralhar') await leitor.playShuffled(faixas, leitor.shuffleInteligente);
      else await leitor.tocarLista(faixas, leitor.shuffle, leitor.shuffleInteligente);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not load the playlist.');
    }
  };

  const doDelete = async () => {
    if (!deleteFor) return;
    setBusy(true);
    try {
      await deletePlaylist(deleteFor.id);
      // Apagar não tem volta: já se confirmou, e o aviso só informa (3/10).
      avisarRemocao({ texto: 'Playlist deleted', detalhe: deleteFor.name });
      setDeleteFor(null);
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not delete the playlist.');
    } finally {
      setBusy(false);
    }
  };

  const cardSize = (W - spacing.xl * 2 - spacing.lg) / 2;
  const bottomPad = 49 + insets.bottom + MINI_PLAYER_HEIGHT + 32;
  // A Daily mix abre no ecrã das prateleiras, que é uma vista sobre a store --
  // ver `state/misturaDoDia.ts`.

  return (
    <Screen
      title="Playlists"
      subtitle={loading?'Loading…':loadError?undefined:`${playlists.length} ${playlists.length === 1 ? 'playlist' : 'playlists'}`}
      right={
        <Pressable
          hitSlop={10}
          onPress={() => setAddMenuOpen(true)}
          style={{ marginBottom: 4 }}
        >
          <Ionicons name="add-circle" size={30} color={theme.color} />
        </Pressable>
      }
    >

      {!!loadError&&<View style={{paddingHorizontal:spacing.xl,paddingVertical:spacing.lg,gap:12}}><Text accessibilityRole="alert" style={type.caption}>{loadError}</Text><SocialButton onPress={()=>void load()}>Try again</SocialButton></View>}
      {loading ? (
        <SkeletonDePlaylists lado={cardSize} />
      ) : playlists.length === 0 && loadError ? null : playlists.length === 0 ? (
        <>
        <EmptyState
          icon="albums-outline"
          title="No playlists yet"
          subtitle="Bring one over from YouTube, or start an empty one and fill it as you go."
        >
          <View style={{ gap: spacing.sm, marginTop: spacing.xl, alignSelf: "stretch", paddingHorizontal: spacing.xl }}>
            <PrimeiroPasso
              icon="logo-youtube"
              label="Import a YouTube playlist"
              nota="Tracks from both sources live side by side"
              onPress={() => navigation.navigate("ImportYouTube")}
            />
            <PrimeiroPasso
              icon="add-circle-outline"
              label="Create an empty playlist"
              onPress={() => setCreateOpen(true)}
            />
          </View>
        </EmptyState>
        </>
      ) : (
        <FlatList
          ref={topo}
          data={playlists}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.lg, paddingHorizontal: spacing.xl }}
          contentContainerStyle={{
            gap: spacing.lg,
            paddingBottom: bottomPad,
            paddingTop: spacing.sm,
          }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                navigation.navigate('PlaylistDetail', {
                  id: item.id,
                  name: item.name,
                })
              }
              onLongPress={() => {
                hapticImpact(ImpactFeedbackStyle.Medium);
                setOptionsFor(item);
              }}
              style={({ pressed }) => [
                { width: cardSize },
                pressed && { opacity: 0.8 },
              ]}
            >
              <ArtworkCollage artworks={item.artworks} size={cardSize} />
              <View style={styles.cardTitleRow}>
                <Text numberOfLines={1} style={[type.headline, { flex: 1 }]}>
                  {item.name}
                </Text>
                <Pressable
                  hitSlop={8}
                  onPress={() => setOptionsFor(item)}
                  style={{ padding: 2 }}
                >
                  <Ionicons
                    name="ellipsis-horizontal"
                    size={16}
                    color={colors.textTertiary}
                  />
                </Pressable>
              </View>
              <Text style={type.caption}>
                {item.trackCount} {item.trackCount === 1 ? 'track' : 'tracks'}
              </Text>
            </Pressable>
          )}
        />
      )}

      {/* O toque longo (e o •••), 28/9: tocar sem abrir, partilhar, editar o
          nome e a ordem juntos (o Rename passou a ser o Edit) e apagar. Com o
          nome e as capas em cima -- com doze cartões iguais tocava-se no errado. */}
      <TrackActionsSheet
        visible={!!optionsFor}
        track={null}
        onClose={() => setOptionsFor(null)}
        cabecalho={optionsFor ? {
          titulo: optionsFor.name,
          subtitulo: `${optionsFor.trackCount} ${optionsFor.trackCount === 1 ? 'song' : 'songs'}`,
          capas: optionsFor.artworks,
        } : null}
        actions={[
          ...(optionsFor && optionsFor.trackCount > 0 ? [
            { icon: 'play-outline' as const, label: 'Play', onPress: () => { const p = optionsFor; setOptionsFor(null); if (p) void usarPlaylist(p, 'tocar'); } },
            { icon: 'shuffle' as const, label: 'Shuffle', onPress: () => { const p = optionsFor; setOptionsFor(null); if (p) void usarPlaylist(p, 'baralhar'); } },
            { icon: 'list-outline' as const, label: 'Add to queue', onPress: () => { const p = optionsFor; setOptionsFor(null); if (p) void usarPlaylist(p, 'fila'); } },
          ] : []),
          { icon: 'people-outline', label: 'Share with a friend…', onPress: () => { const p = optionsFor; setOptionsFor(null); setPartilharCom(p); } },
          { icon: 'share-social-outline', label: 'QR code / Copy link', onPress: () => { const p = optionsFor; setOptionsFor(null); setQrDe(p); } },
          {
            icon: 'pencil-outline',
            label: 'Edit playlist',
            onPress: () => {
              const p = optionsFor;
              setOptionsFor(null);
              if (p) navigation.navigate('PlaylistDetail', { id: p.id, name: p.name, editar: true });
            },
          },
          {
            icon: 'trash-outline',
            label: 'Delete playlist',
            destructive: true,
            onPress: () => {
              const p = optionsFor;
              setOptionsFor(null);
              setDeleteFor(p);
            },
          },
        ]}
      />

      <ShareFriendSheet
        visible={!!partilharCom}
        itemType="playlist"
        item={partilharCom ? { id: partilharCom.id } : null}
        onClose={() => setPartilharCom(null)}
      />

      <YtPlaylistShareSheet
        visible={!!qrDe}
        onClose={() => setQrDe(null)}
        playlistId={qrDe?.id ?? ''}
        playlistName={qrDe?.name ?? ''}
      />

      <PromptSheet
        visible={createOpen}
        title="New playlist"
        placeholder="Playlist name"
        submitLabel="Create"
        loading={busy}
        onClose={() => setCreateOpen(false)}
        onSubmit={doCreate}
      />

      <PromptSheet
        visible={importSharedOpen}
        title="Import Shared Playlist"
        placeholder="Paste link or playlist ID"
        submitLabel="Import"
        loading={busy}
        onClose={() => setImportSharedOpen(false)}
        onSubmit={doImportShared}
      />


      <ConfirmSheet
        visible={!!deleteFor}
        title="Delete playlist"
        message={`"${deleteFor?.name ?? ''}" will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete playlist"
        destructive
        loading={busy}
        onClose={() => setDeleteFor(null)}
        onConfirm={doDelete}
      />

      <BottomSheet visible={addMenuOpen} onClose={() => setAddMenuOpen(false)}>
        <Text style={[type.title, { marginBottom: spacing.md }]}>
          Playlists
        </Text>
        
        <Pressable
          onPress={() => {
            setAddMenuOpen(false);
            setCreateOpen(true);
          }}
          style={({ pressed }) => [
            styles.menuOption,
            pressed && { backgroundColor: colors.surfacePressed }
          ]}
        >
          <Ionicons name="add-circle-outline" size={20} color={colors.text} />
          <Text style={[type.body, { fontWeight: '600', marginLeft: 8 }]}>Create new playlist</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            setAddMenuOpen(false);
            navigation.navigate('ImportYouTube');
          }}
          style={({ pressed }) => [
            styles.menuOption,
            pressed && { backgroundColor: colors.surfacePressed }
          ]}
        >
          <Ionicons name="logo-youtube" size={20} color={colors.youtube} />
          <Text style={[type.body, { fontWeight: '600', marginLeft: 8 }]}>Import from YouTube</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            setAddMenuOpen(false);
            setImportSharedOpen(true);
          }}
          style={({ pressed }) => [
            styles.menuOption,
            pressed && { backgroundColor: colors.surfacePressed }
          ]}
        >
          <Ionicons name="share-social-outline" size={20} color={theme.color} />
          <Text style={[type.body, { fontWeight: '600', marginLeft: 8 }]}>Import shared playlist</Text>
        </Pressable>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  importRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  importIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.youtubeSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderCurve: 'continuous',
    marginVertical: 2,
  },
});
