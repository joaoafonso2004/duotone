import { useOfflineMode } from '../hooks/useOfflineMode';
import { RecommendationPreferences } from './RecommendationPreferences';
import { displayArtist } from '../lib/artistName';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { hapticImpact, hapticNotification } from '../lib/haptics';
import { colors, radii, spacing, type } from '../theme';
import type { Track } from '../types';
import { contextoParaAnalytics, type DiscoveryContext } from '../lib/contextoDaDescoberta';
import { registar } from '../lib/eventos';
import { menuDaFaixa, type AcaoDoMenu, type IdDaAcao } from '../lib/menuDaFaixa';
import { alternarDownload, estaDescarregada, podeDescarregar } from '../lib/descarregarFaixa';
import { alternarGuardada, garantirGuardadas } from '../lib/guardarFaixa';
import { savedKey, useSaved } from '../state/saved';
import { usePlayer } from '../state/player';
import { navigationRef } from '../navigation/RootNavigator';
import { BottomSheet, BottomSheetScrollView } from './BottomSheet';
import { ShareFriendSheet } from './ShareFriendSheet';
import { AddToPlaylistSheet } from './AddToPlaylistSheet';

/** Uma linha de um menu que NÃO é de uma faixa -- as opções de uma playlist. */
export interface SheetAction {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

interface Props {
  visible: boolean;
  track: Track | null;
  onClose: () => void;
  /**
   * Só com `track` nulo: um menu que não é de uma faixa (as opções de uma
   * playlist). Os de uma faixa não recebem linhas -- saem todos do
   * `menuDaFaixa`, iguais aos do leitor, da fila e do PC.
   */
  actions?: SheetAction[];
  discoveryContext?: DiscoveryContext | null;
  /** Aberto dentro de uma playlist: acrescenta "Remove from this playlist". */
  playlist?: { podeEditar: boolean; aoTirar: (track: Track) => void } | null;
  /** Depois de guardar ou tirar da biblioteca, para a lista que o abriu reler. */
  aoMudarBiblioteca?: () => void;
}

/**
 * O menu de uma faixa nas listas do iPhone (toque longo e "…").
 *
 * As linhas, a ordem e os nomes vêm de lib/menuDaFaixa.ts. Cada ecrã tinha a
 * sua lista -- a Pesquisa sem "Remove", as Songs sem "Save", a playlist sem
 * "Add to playlist" e com um "Remover da playlist" em português -- e agora
 * todos pedem este e passam só o que é deles: a playlist onde está, e o que
 * reler depois de guardar.
 */
export function TrackActionsSheet({ visible, track, onClose, actions = [], discoveryContext, playlist, aoMudarBiblioteca }: Props) {
  const offline = useOfflineMode();
  const { height } = useWindowDimensions();
  const [recommendationTrack, setRecommendationTrack] = React.useState<Track | null>(null);
  const [paraPartilhar, setParaPartilhar] = React.useState<Track | null>(null);
  const [paraPlaylist, setParaPlaylist] = React.useState<Track | null>(null);
  const lida = useSaved((s) => s.loaded);
  const naLoja = useSaved((s) => (track ? s.keys.has(savedKey(track)) : false));

  React.useEffect(() => { if (visible && track) garantirGuardadas(); }, [visible, track]);

  const nomeDoArtista = track ? displayArtist(track) : '';
  const menu: AcaoDoMenu[] = track ? menuDaFaixa({
    plataforma: 'ios',
    onde: 'lista',
    semRede: offline,
    tocaSemRede: estaDescarregada(track),
    guardada: lida ? naLoja : null,
    podeDescarregar: podeDescarregar(track),
    descarregada: estaDescarregada(track),
    temArtista: !!nomeDoArtista && nomeDoArtista !== 'Unknown artist',
    playlist: playlist ? { podeEditar: playlist.podeEditar } : null,
  }) : [];

  const fazer = (id: IdDaAcao) => {
    const t = track;
    if (!t) return;
    onClose();
    const player = usePlayer.getState();
    switch (id) {
      case 'tocar-agora': void player.playTrack(t, [t], true, false, discoveryContext ?? undefined); return;
      case 'tocar-a-seguir': player.playNext(t); return;
      case 'por-na-fila': player.addToQueue(t); return;
      case 'guardar':
        void alternarGuardada(t).then((ficou) => {
          hapticNotification();
          if (ficou && discoveryContext) registar('recomendacao_guardada', contextoParaAnalytics(discoveryContext));
          aoMudarBiblioteca?.();
        }).catch((e: any) => Alert.alert('Error', e?.message ?? 'Could not update your library.'));
        return;
      case 'por-em-playlist': setParaPlaylist(t); return;
      case 'ver-artista':
        if (navigationRef.isReady()) navigationRef.navigate('LibraryGroup', { type: 'artist', name: nomeDoArtista });
        return;
      case 'partilhar': setParaPartilhar(t); return;
      case 'descarregar': void alternarDownload(t); return;
      case 'recomendacoes': setRecommendationTrack(t); return;
      case 'tirar-da-playlist': playlist?.aoTirar(t); return;
      case 'tirar-da-fila': return;
    }
  };

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose}>
        <BottomSheetScrollView style={{maxHeight:height*0.75}} keyboardShouldPersistTaps="handled">
        {track ? (
          <View style={styles.header}>
            {track.artworkUrl ? (
              <Image
                source={{ uri: track.artworkUrl }}
                style={styles.art}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.art, styles.artFallback]}>
                <Ionicons
                  name="musical-notes"
                  size={16}
                  color={colors.textTertiary}
                />
              </View>
            )}
            <View style={{ flex: 1, gap: 3 }}>
              <Text numberOfLines={1} style={[type.headline]}>
                {track.title}
              </Text>
              {track.artist ? (
                <Text numberOfLines={1} style={type.caption}>
                  {nomeDoArtista}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {track
          ? menu.map((a) => (
              <Linha
                key={a.id}
                icone={a.icone}
                rotulo={a.rotulo}
                motivo={a.indisponivel}
                destrutiva={a.destrutiva}
                onPress={() => fazer(a.id)}
              />
            ))
          : actions.map((a) => (
              <Linha
                key={a.label}
                icone={a.icon}
                rotulo={a.label}
                motivo={null}
                destrutiva={!!a.destructive}
                onPress={a.onPress}
              />
            ))}
        </BottomSheetScrollView>
      </BottomSheet>

      <RecommendationPreferences visible={!!recommendationTrack} track={recommendationTrack} reason={discoveryContext?.reason} onClose={()=>setRecommendationTrack(null)}/>
      <AddToPlaylistSheet visible={!!paraPlaylist} track={paraPlaylist} onClose={() => setParaPlaylist(null)} />
      <ShareFriendSheet
        visible={!!paraPartilhar}
        itemType="track"
        item={paraPartilhar}
        onClose={() => setParaPartilhar(null)}
      />
    </>
  );
}

/** Uma linha: indisponível fica à vista, apagada, e diz porquê por baixo. */
function Linha({ icone, rotulo, motivo, destrutiva, onPress }: {
  icone: string;
  rotulo: string;
  motivo: string | null;
  destrutiva: boolean;
  onPress: () => void;
}) {
  const apagada = !!motivo;
  const cor = destrutiva ? colors.danger : colors.text;
  return (
    <Pressable
      disabled={apagada}
      accessibilityRole="button"
      accessibilityLabel={motivo ? `${rotulo}. ${motivo}` : rotulo}
      accessibilityState={{ disabled: apagada }}
      onPress={() => { hapticImpact(); onPress(); }}
      style={({ pressed }) => [styles.action, pressed && !apagada && { backgroundColor: colors.surfacePressed }]}
    >
      <Ionicons name={icone as keyof typeof Ionicons.glyphMap} size={20} color={cor} style={apagada && styles.apagada} />
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { fontWeight: '600', color: cor }, apagada && styles.apagada]}>{rotulo}</Text>
        {motivo ? <Text style={[type.caption, styles.motivo]}>{motivo}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    marginBottom: spacing.sm,
  },
  art: {
    width: 44,
    height: 44,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
  },
  artFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
  },
  apagada: { opacity: 0.4 },
  motivo: { marginTop: 2, color: colors.textSecondary },
});
