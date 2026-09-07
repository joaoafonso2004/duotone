import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { usePlayer } from '../state/player';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { colors, spacing, type, radii } from '../theme';
import { BottomSheet } from './BottomSheet';
import { TrackRow } from './TrackRow';
import { EstrelaInteligente } from './BrilhoInteligente';
import { trackKey } from '../lib/shuffle';
import { hapticSelection } from '../lib/haptics';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function QueueSheet({ visible, onClose }: Props) {
  const current = usePlayer((s) => s.current);
  const queue = usePlayer((s) => s.queue);
  const queueIndex = usePlayer((s) => s.queueIndex);
  const playTrack = usePlayer((s) => s.playTrack);
  const moveQueueItem = usePlayer((s) => s.moveQueueItem);
  const removeFromQueue = usePlayer((s) => s.removeFromQueue);
  const shuffle = usePlayer((s) => s.shuffle);
  // Re-avaliar quando o percurso do shuffle muda.
  const shuffleOrder = usePlayer((s) => s.shuffleOrder);
  const sugeridas = usePlayer((s) => s.sugeridas);

  // A ordem em que as faixas vão MESMO tocar — com shuffle ligado não é a
  // ordem natural da fila. Antes esta lista mostrava `slice(queueIndex + 1)`
  // e mentia sempre que o shuffle estava ligado.
  // NUMA SESSAO, o que vem a seguir e a fila PARTILHADA.
  //
  // Havia duas listas a responder a mesma pergunta e a dizer coisas diferentes:
  // esta mostrava a fila local, e a folha da sessao mostrava a partilhada. Numa
  // sessao a local nao decide nada -- e a partilhada que e consumida no fim de
  // cada musica -- por isso mostra-la aqui era mentir com confianca.
  const filaDaSessao = useOuvirJuntos((s) => s.fila);
  const emSessao = useOuvirJuntos((s) => !!s.sessao);

  const upNextLocal = React.useMemo(
    () => usePlayer.getState().upcomingQueue(),
    [queue, queueIndex, shuffle, shuffleOrder]
  );
  // A mesma forma que o `upcomingQueue` devolve, para a lista abaixo nao ter
  // de saber de onde vieram as faixas.
  const upNext = emSessao
    ? filaDaSessao.map((i, n) => ({ track: i.track, index: n }))
    : upNextLocal;

  // Reordenar uma lista baralhada não quer dizer nada: as setas movem a fila
  // natural, que não é o que está à frente do utilizador. Só remover é que
  // continua a fazer sentido (mapeia para o índice real).
  // Numa sessao a ordem e de toda a gente: mexer nela daqui, sem as regras de
  // quem pode o que, era dar controlo por uma porta lateral. Tira-se e
  // reordena-se na folha da sessao, que sabe dessas regras.
  const canReorder = !shuffle && !emSessao;
  // Dizer de onde vêm as faixas: se a fila acabou e o rádio a estendeu, o
  // utilizador tem de perceber porque é que continua a tocar.
  const radioActive = usePlayer((s) => s.radioActive);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <Text style={type.title}>Play Queue</Text>
        <Text style={type.caption}>
          {emSessao
            ? `${upNext.length} shared ${upNext.length === 1 ? 'song' : 'songs'}`
            : `${queue.length} ${queue.length === 1 ? 'song' : 'songs'} in queue`}
        </Text>
      </View>

      <Text style={[type.micro, styles.sectionTitle]}>NOW PLAYING</Text>
      {current ? (
        <View style={styles.nowPlayingCard}>
          <TrackRow
            track={current}
            active
            onPress={onClose}
          />
        </View>
      ) : (
        <Text style={styles.emptyText}>Nothing playing</Text>
      )}

      <Text style={[type.micro, styles.sectionTitle, { marginTop: spacing.lg }]}>
        UP NEXT ({upNext.length})
        {emSessao ? ' · SHARED' : radioActive ? ' · RADIO' : ''}
      </Text>

      {upNext.length > 0 ? (
        <FlatList
          data={upNext}
          keyExtractor={(entry, index) => `${entry.track.source}:${entry.track.sourceId}-${index}`}
          style={styles.list}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item: entry, index }) => {
            const item = entry.track;
            const realIndex = entry.index;

            const handleMoveUp = () => {
              hapticSelection();
              if (index > 0) {
                moveQueueItem(realIndex, realIndex - 1);
              }
            };

            const handleMoveDown = () => {
              hapticSelection();
              if (index < upNext.length - 1) {
                moveQueueItem(realIndex, realIndex + 1);
              }
            };

            const handleRemove = () => {
              hapticSelection();
              removeFromQueue(realIndex);
            };

            return (
              <View style={styles.queueItemRow}>
                {/* Marca as que vieram do shuffle inteligente: sem isto nao se
                    distingue o que e teu do que a app meteu, e a lista passa a
                    ter musicas que nao te lembras de ter posto. */}
                {sugeridas.includes(trackKey(item)) && (
                  <View style={{ marginRight: 6, marginLeft: -2 }}>
                    <EstrelaInteligente tamanho={7} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <TrackRow
                    track={item}
                    onPress={() => {
                      playTrack(item, queue);
                    }}
                  />
                </View>
                <View style={styles.actionButtons}>
                  {canReorder && (<>
                  <Pressable
                    onPress={handleMoveUp}
                    disabled={index === 0}
                    style={({ pressed }) => [
                      styles.actionBtn,
                      index === 0 && styles.disabledBtn,
                      pressed && { opacity: 0.6 }
                    ]}
                    hitSlop={6}
                  >
                    <Ionicons
                      name="arrow-up"
                      size={14}
                      color={index === 0 ? colors.textTertiary : colors.textSecondary}
                    />
                  </Pressable>
                  <Pressable
                    onPress={handleMoveDown}
                    disabled={index === upNext.length - 1}
                    style={({ pressed }) => [
                      styles.actionBtn,
                      index === upNext.length - 1 && styles.disabledBtn,
                      pressed && { opacity: 0.6 }
                    ]}
                    hitSlop={6}
                  >
                    <Ionicons
                      name="arrow-down"
                      size={14}
                      color={index === upNext.length - 1 ? colors.textTertiary : colors.textSecondary}
                    />
                  </Pressable>
                  </>)}
                  <Pressable
                    onPress={handleRemove}
                    style={({ pressed }) => [
                      styles.actionBtn,
                      pressed && { opacity: 0.6 }
                    ]}
                    hitSlop={6}
                  >
                    <Ionicons name="trash-outline" size={14} color={colors.danger} />
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      ) : (
        <Text style={styles.emptyText}>Queue is empty</Text>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    letterSpacing: 1,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  nowPlayingCard: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  list: {
    maxHeight: 300,
  },
  emptyText: {
    ...type.caption,
    textAlign: 'center',
    paddingVertical: spacing.md,
    color: colors.textTertiary,
  },
  queueItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingRight: spacing.sm,
  },
  actionBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfacePressed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledBtn: {
    backgroundColor: 'transparent',
    opacity: 0.4,
  },
});
