import React from 'react';
import { Animated, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinhaArrastavel } from './LinhaArrastavel';
import { destinoDoArrasto } from '../lib/arrastarFila';
import { TRACK_ROW_HEIGHT } from './TrackRow';
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
  /**
   * A saída para a folha da sessão.
   *
   * Numa sessão esta fila é só de leitura: a ordem é de toda a gente e mexer
   * nela daqui, sem as regras de quem pode o quê, era dar controlo por uma
   * porta lateral. Sem esta saída, quem abrisse a fila dentro de um jam via
   * uma lista que não pode tocar e nenhuma pista de onde é que pode.
   */
  onOpenSession?: () => void;
}

export function QueueSheet({ visible, onClose, onOpenSession }: Props) {
  const current = usePlayer((s) => s.current);
  const queue = usePlayer((s) => s.queue);
  const queueIndex = usePlayer((s) => s.queueIndex);
  const playTrack = usePlayer((s) => s.playTrack);
  const reordenarProximas = usePlayer((s) => s.reordenarProximas);
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

  // Com o shuffle ligado a ordem visível vive no percurso e não na fila, e o
  // `reordenarProximas` sabe disso -- por isso arrastar funciona nos dois
  // modos. Com as setas não funcionava, e daí terem estado desligadas aqui.
  //
  // Numa sessao a ordem e de toda a gente: mexer nela daqui, sem as regras de
  // quem pode o que, era dar controlo por uma porta lateral. Tira-se e
  // reordena-se na folha da sessao, que sabe dessas regras.
  const canReorder = !emSessao;
  // Dizer de onde vêm as faixas: se a fila acabou e o rádio a estendeu, o
  // utilizador tem de perceber porque é que continua a tocar.
  const radioActive = usePlayer((s) => s.radioActive);

  // O arrasto vive aqui e nao em cada linha: a linha pegada precisa de saber
  // que e ela, e as outras precisam de saber para onde se afastar.
  const [arrastar, setArrastar] = React.useState<number | null>(null);
  const dy = React.useRef(new Animated.Value(0)).current;
  // O toque longo PEGA na linha, mas o arrasto só arranca quando o dedo se
  // mexe. Levantá-lo sem mexer deixava a linha pegada para sempre e a lista
  // sem deslizar -- daí o `onPressOut` a desfazer, e esta marca a distinguir
  // o dedo levantado do gesto que foi mesmo por diante.
  const pegou = React.useRef(false);
  // Medida em vez de assumida: a linha da fila e um `TrackRow` mais a linha
  // do separador, e meio pixel de erro por linha desalinha o gesto todo ao fim
  // de dez. O `TRACK_ROW_HEIGHT` serve so ate a primeira medicao chegar.
  const [altura, setAltura] = React.useState(TRACK_ROW_HEIGHT);

  // A fila pode mudar por baixo do dedo -- a musica acaba e o `queueIndex`
  // avanca. Largar uma linha que ja nao existe move a errada.
  React.useEffect(() => {
    if (arrastar != null && arrastar >= upNext.length) {
      setArrastar(null);
      dy.setValue(0);
    }
  }, [arrastar, upNext.length, dy]);

  const largar = (de: number) => (dyFinal: number) => {
    setArrastar(null);
    dy.setValue(0);
    const para = destinoDoArrasto(de, dyFinal, altura, upNext.length);
    if (para === de || !upNext[de] || !upNext[para]) return;
    hapticSelection();
    reordenarProximas(de, para);
  };

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

      <View style={styles.tituloDaFila}>
        <Text style={[type.micro, styles.sectionTitle, { flex: 1, marginBottom: 0 }]}>
          UP NEXT ({upNext.length})
          {emSessao ? ' · SHARED' : radioActive ? ' · RADIO' : ''}
        </Text>
        {emSessao && onOpenSession && (
          <Pressable hitSlop={10} onPress={onOpenSession}>
            <Text style={styles.irParaSessao}>Manage</Text>
          </Pressable>
        )}
      </View>

      {upNext.length > 0 ? (
        <FlatList
          data={upNext}
          keyExtractor={(entry, index) => `${entry.track.source}:${entry.track.sourceId}-${index}`}
          style={styles.list}
          scrollEnabled={arrastar === null}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item: entry, index }) => {
            const item = entry.track;
            const realIndex = entry.index;

            const handleRemove = () => {
              hapticSelection();
              removeFromQueue(realIndex);
            };

            return (
              <LinhaArrastavel
                index={index}
                arrastarIndex={arrastar}
                altura={altura}
                dy={dy}
                aoPegar={() => { pegou.current = true; }}
                aoLargar={largar(index)}
              >
              <View
                style={styles.queueItemRow}
                onLayout={index === 0 ? (e) => {
                  const h = e.nativeEvent.layout.height;
                  if (h > 0 && Math.abs(h - altura) > 0.5) setAltura(h);
                } : undefined}
              >
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
                    onLongPress={canReorder ? () => {
                      hapticSelection();
                      dy.setValue(0);
                      pegou.current = false;
                      setArrastar(index);
                    } : undefined}
                    delayLongPress={canReorder ? 1000 : undefined}
                    onPressOut={canReorder ? () => {
                      // O `onPressOut` chega TAMBEM quando o arrasto rouba o
                      // dedo. O adiamento de um tick deixa o `aoPegar` chegar
                      // primeiro e dizer que nao foi um dedo levantado.
                      setTimeout(() => {
                        if (pegou.current) return;
                        setArrastar((actual) => (actual === index ? null : actual));
                        dy.setValue(0);
                      }, 0);
                    } : undefined}
                  />
                </View>
                <View style={styles.actionButtons}>
                  {canReorder && (
                    <View style={styles.pega} pointerEvents="none">
                      <Ionicons
                        name="reorder-three-outline"
                        size={16}
                        color={arrastar === index ? colors.text : colors.textTertiary}
                      />
                    </View>
                  )}
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
              </LinhaArrastavel>
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
  tituloDaFila: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  irParaSessao: {
    ...type.caption,
    color: colors.textSecondary,
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
  pega: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
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
