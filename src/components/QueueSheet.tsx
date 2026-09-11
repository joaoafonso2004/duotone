import React from 'react';
import { Alert, Animated, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinhaArrastavel } from './LinhaArrastavel';
import { chavesEstaveis, destinoDoArrasto, offsetDoDeslize, velocidadeDoDeslize } from '../lib/arrastarFila';
import { TRACK_ROW_HEIGHT } from './TrackRow';
import Ionicons from '@expo/vector-icons/Ionicons';
import { usePlayer } from '../state/player';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { colors, spacing, type, radii } from '../theme';
import { BottomSheet, BottomSheetFlatList } from './BottomSheet';
import { TrackRow } from './TrackRow';
import { EstrelaInteligente } from './BrilhoInteligente';
import { trackKey } from '../lib/shuffle';
import { hapticSelection } from '../lib/haptics';
import { tituloDaFaixa } from '../lib/artistName';
import { useOfflineMode } from '../hooks/useOfflineMode';
import type { Track } from '../types';
import { PlayerActionsContent, type PlayerAction } from './PlayerActionsSheet';
import { AddToPlaylistSheet } from './AddToPlaylistSheet';
import { ShareFriendSheet } from './ShareFriendSheet';

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
  const offline = useOfflineMode();
  const [selection, setSelection] = React.useState<{ track: Track; index: number | null; queue: Track[] } | null>(null);
  const [panel, setPanel] = React.useState<'actions' | 'playlist' | 'share'>('actions');
  React.useEffect(() => { if (!visible) { setSelection(null); setPanel('actions'); } }, [visible]);
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
  // O mesmo que o `arrastar`, mas escrito no gesto e nao no render: e por ele
  // que a linha reclama o dedo e que a folha sabe que nao pode fechar. Ver
  // `LinhaArrastavel` -- um render de atraso era um movimento perdido.
  const pegadaRef = React.useRef<number | null>(null);
  // A chave da faixa pegada. A fila pode andar por baixo do dedo (a musica
  // acaba e o `queueIndex` avanca): largar pelo indice movia outra faixa.
  const chaveDaPegada = React.useRef<string | null>(null);
  const bloqueioDaFolha = React.useRef(false);
  // O toque longo PEGA na linha, mas o arrasto só arranca quando o dedo se
  // mexe. Levantá-lo sem mexer deixava a linha pegada para sempre e a lista
  // sem deslizar -- daí o `onPressOut` a desfazer, e esta marca a distinguir
  // o dedo levantado do gesto que foi mesmo por diante.
  const pegou = React.useRef(false);
  // Tudo o que o deslize nas bordas precisa de saber, e nada disto pode ser
  // estado: muda a cada frame do dedo e um `setState` por frame punha a lista
  // inteira a redesenhar durante o gesto.
  const listaRef = React.useRef<FlatList<any> | null>(null);
  const molduraRef = React.useRef<View | null>(null);
  /**
   * Onde a lista começa e acaba NO ECRÃ. O dedo vem em coordenadas de ecrã.
   *
   * **Medido ao pegar, e não no `onLayout`.** Era no `onLayout`, e essa medição
   * chega enquanto a folha ainda está a subir -- deslocada quase meio ecrã
   * para baixo. Nada voltava a medir quando ela assentava, por isso a lista
   * julgava o dedo sempre acima do topo: subia sozinha e nunca descia. Era o
   * "não dá para fazer scroll enquanto se arrasta". `NaN` = ainda por medir.
   */
  const limites = React.useRef({ topo: Number.NaN, fundo: Number.NaN });
  const alturaVisivel = React.useRef(0);
  const alturaDoConteudo = React.useRef(0);
  const offset = React.useRef(0);
  const offsetAoPegar = React.useRef(0);
  // `NaN` quer dizer que a linha foi escolhida pelo toque longo, mas ainda
  // não começou a ser arrastada. Antes começava em zero, que é sempre acima
  // da lista, e o auto-scroll puxava-a imediatamente para cima sozinho.
  const gesto = React.useRef({ dy: 0, dedoY: Number.NaN });

  /** Quanto a lista correu por baixo do dedo desde que ele pegou na linha. */
  const deslizou = () => offset.current - offsetAoPegar.current;
  /**
   * A linha segue o dedo E o que a lista correu, senão fica para trás.
   *
   * Estável de propósito: só lê referências, e recriá-la a cada render fazia
   * o intervalo do deslize ser desmontado e montado outra vez a cada frame.
   */
  const escreverDy = React.useCallback(
    () => dy.setValue(gesto.current.dy + offset.current - offsetAoPegar.current),
    [dy]
  );

  // Enquanto uma linha está pegada e o dedo está encostado a uma borda, a
  // lista corre sozinha. Sem isto o arrasto só alcança o que já está visível:
  // numa fila de cinquenta músicas dá para mover três lugares e mais nada.
  React.useEffect(() => {
    if (arrastar == null) return;
    const passo = setInterval(() => {
      const v = velocidadeDoDeslize(gesto.current.dedoY, limites.current.topo, limites.current.fundo);
      if (v === 0) return;
      const maximo = Math.max(0, alturaDoConteudo.current - alturaVisivel.current);
      const novo = offsetDoDeslize(offset.current, v, maximo, offsetAoPegar.current, alturaVisivel.current);
      if (novo === offset.current) return;
      offset.current = novo;
      listaRef.current?.scrollToOffset({ offset: novo, animated: false });
      escreverDy();
    }, 16);
    return () => clearInterval(passo);
  }, [arrastar, escreverDy]);
  // Medida em vez de assumida: a linha da fila e um `TrackRow` mais a linha
  // do separador, e meio pixel de erro por linha desalinha o gesto todo ao fim
  // de dez. O `TRACK_ROW_HEIGHT` serve so ate a primeira medicao chegar.
  const [altura, setAltura] = React.useState(TRACK_ROW_HEIGHT);

  // A faixa, e nao o indice, e o que da nome a cada linha. Ver `chavesEstaveis`.
  const chaves = React.useMemo(
    () => chavesEstaveis(upNext.map((entry) => trackKey(entry.track))),
    [upNext]
  );

  /** A lista para de deslizar ao dedo, ja -- sem esperar pelo render. */
  const travarLista = (travada: boolean) => {
    // O `scrollEnabled` da prop chega um render depois, e um arrasto rapido
    // pela pega podia ser apanhado antes pelo deslize nativo da lista. Os dois
    // lados chamam isto, para o nativo nunca ficar preso num estado que o
    // React nao conhece.
    try { (listaRef.current as any)?.setNativeProps?.({ scrollEnabled: !travada }); } catch { /* sem isto vale a prop */ }
  };

  const medirLimites = () => {
    limites.current = { topo: Number.NaN, fundo: Number.NaN };
    molduraRef.current?.measureInWindow((_x, y, _l, h) => {
      if (pegadaRef.current == null) return; // o arrasto ja acabou
      alturaVisivel.current = h;
      limites.current = { topo: y, fundo: y + h };
    });
  };

  const comecarArrasto = (index: number) => {
    hapticSelection();
    pegadaRef.current = index;
    chaveDaPegada.current = chaves[index] ?? null;
    bloqueioDaFolha.current = true;
    pegou.current = false;
    gesto.current = { dy: 0, dedoY: Number.NaN };
    offsetAoPegar.current = offset.current;
    dy.setValue(0);
    travarLista(true);
    medirLimites();
    setArrastar(index);
  };

  const terminarArrasto = () => {
    pegadaRef.current = null;
    chaveDaPegada.current = null;
    bloqueioDaFolha.current = false;
    pegou.current = false;
    gesto.current = { dy: 0, dedoY: Number.NaN };
    limites.current = { topo: Number.NaN, fundo: Number.NaN };
    travarLista(false);
    // O `dy` NAO volta a zero aqui. Voltava, e antes de a lista se reordenar:
    // durante um frame a musica regressava ao sitio de onde veio e depois
    // saltava para o novo. Com o `arrastar` a null nenhuma linha le o `dy`, e
    // o proximo arrasto poe-no a zero ao comecar.
    setArrastar(null);
  };

  // A fila pode mudar por baixo do dedo -- a musica acaba e o `queueIndex`
  // avanca, e as linhas sobem uma posicao. Continuar a arrastar pelo indice
  // era pegar noutra musica; larga-se sem mexer em nada.
  React.useEffect(() => {
    if (arrastar != null && chaves[arrastar] !== chaveDaPegada.current) terminarArrasto();
  });

  const largar = (dyFinal: number) => {
    // O que a lista correu conta tanto como o que o dedo andou: sem isto a
    // música aterra onde o dedo está no ecrã, e não onde ela parece estar.
    const percorrido = dyFinal + deslizou();
    const chave = chaveDaPegada.current;
    terminarArrasto();
    // Pela chave, e nao pelo indice com que se pegou.
    const de = chave ? chaves.indexOf(chave) : -1;
    if (de < 0) return;
    const para = destinoDoArrasto(de, percorrido, altura, upNext.length);
    if (para === de || !upNext[de] || !upNext[para]) return;
    hapticSelection();
    reordenarProximas(de, para);
  };

  const openActions = (track: Track, index: number | null) => {
    hapticSelection();
    setSelection({ track, index, queue });
    setPanel('actions');
  };
  // O menu pode ficar aberto enquanto a música termina ou a fila muda.
  // Um índice antigo nunca deve remover outra música ou uma entrada do Jam.
  const canRemove = !!selection && selection.index !== null && !emSessao &&
    selection.queue === queue && selection.index !== queueIndex && queue[selection.index] === selection.track;
  const actions: PlayerAction[] = selection ? [
    { label: 'Add to playlist', icon: 'add', onPress: () => {
      if (offline) { Alert.alert('Offline', 'Connect to the internet to edit playlists.'); return; }
      setPanel('playlist');
    } },
    { label: 'Partilhar com um amigo', icon: 'paper-plane-outline', onPress: () => {
      if (offline) { Alert.alert('Offline', 'Connect to the internet to share.'); return; }
      setPanel('share');
    } },
    ...(emSessao && onOpenSession ? [{ label: 'Manage Jam queue', icon: 'people-outline' as const, onPress: onOpenSession }] : []),
    ...(!emSessao && selection.index !== null ? [{
      label: 'Remove from queue', icon: 'trash-outline' as const, destructive: true, disabled: !canRemove,
      onPress: () => {
        const latest = usePlayer.getState();
        if (selection.index === null || useOuvirJuntos.getState().sessao ||
          latest.queue !== selection.queue || latest.queueIndex === selection.index ||
          latest.queue[selection.index] !== selection.track) return;
        removeFromQueue(selection.index);
        setSelection(null);
      },
    }] : []),
    { label: 'Back to queue', icon: 'arrow-back', onPress: () => setSelection(null) },
  ] : [];

  return (
    <>
    <BottomSheet gestureBlocked={arrastar !== null} bloqueioRef={bloqueioDaFolha} visible={visible && panel === 'actions'} onClose={onClose}>
      {selection && <PlayerActionsContent title={tituloDaFaixa(selection.track)} actions={actions} />}
      <View style={selection ? styles.hidden : undefined}>
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
        <View style={[styles.nowPlayingCard, styles.queueItemRow]}>
          <View style={{ flex: 1 }}>
          <TrackRow
            track={current}
            active
            onPress={onClose}
          />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Options for ${tituloDaFaixa(current)}`}
            onPress={() => openActions(current, null)}
            style={styles.actionBtn}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
          </Pressable>
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
        <View
          ref={molduraRef}
          // Os limites medem-se NO ECRÃ, porque é em coordenadas de ecrã que o
          // `PanResponder` diz onde o dedo está -- e medem-se ao pegar numa
          // linha, com a folha já assente. Ver `limites`.
          collapsable={false}
        >
        <BottomSheetFlatList dismissScrollEnabled={!selection}
          ref={listaRef}
          data={upNext}
          keyExtractor={(_entry, index) => chaves[index]}
          style={styles.list}
          // A lista não desliza ao dedo enquanto uma linha está pegada -- quem
          // a faz correr nessa altura é o deslize das bordas, e os dois a
          // disputar o mesmo dedo davam um empurra-empurra.
          scrollEnabled={arrastar === null}
          scrollEventThrottle={16}
          onScroll={(e) => { offset.current = e.nativeEvent.contentOffset.y; }}
          onContentSizeChange={(_w, h) => { alturaDoConteudo.current = h; }}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item: entry, index }) => {
            const item = entry.track;
            const realIndex = entry.index;

            return (
              <LinhaArrastavel
                index={index}
                arrastarIndex={arrastar}
                pegadaRef={pegadaRef}
                podeArrastar={canReorder}
                altura={altura}
                dy={dy}
                aoComecar={comecarArrasto}
                aoPegar={(dedoY) => {
                  pegou.current = true;
                  offsetAoPegar.current = offset.current;
                  gesto.current = { dy: 0, dedoY };
                }}
                aoMover={(d, dedoY) => {
                  gesto.current = { dy: d, dedoY };
                  escreverDy();
                }}
                aoLargar={largar}
                aoCancelar={terminarArrasto}
              >
              {(pega) => (
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
                    onLongPress={canReorder ? () => comecarArrasto(index) : undefined}
                    delayLongPress={canReorder ? 500 : undefined}
                    onPressOut={canReorder ? () => {
                      // O `onPressOut` chega TAMBEM quando o arrasto rouba o
                      // dedo. O adiamento de um tick deixa o `aoPegar` chegar
                      // primeiro e dizer que nao foi um dedo levantado.
                      setTimeout(() => {
                        if (pegou.current || pegadaRef.current !== index) return;
                        terminarArrasto();
                      }, 0);
                    } : undefined}
                  />
                </View>
                <View style={styles.actionButtons}>
                  {canReorder && (
                    // A pega pega LOGO, sem o toque longo -- e o que ela
                    // promete. Ver `LinhaArrastavel`.
                    <View
                      {...(pega ?? {})}
                      accessibilityLabel={`Reorder ${tituloDaFaixa(item)}`}
                      style={styles.pega}
                    >
                      <Ionicons
                        name="reorder-three-outline"
                        size={18}
                        color={arrastar === index ? colors.text : colors.textTertiary}
                      />
                    </View>
                  )}
                  <Pressable
                    onPress={() => openActions(item, emSessao ? null : realIndex)}
                    accessibilityRole="button"
                    accessibilityLabel={`Options for ${tituloDaFaixa(item)}`}
                    style={({ pressed }) => [
                      styles.actionBtn,
                      pressed && { opacity: 0.6 }
                    ]}
                  >
                    <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
                  </Pressable>
                </View>
              </View>
              )}
              </LinhaArrastavel>
            );
          }}
        />
        </View>
      ) : (
        <Text style={styles.emptyText}>Queue is empty</Text>
      )}
      </View>
    </BottomSheet>
    <AddToPlaylistSheet visible={visible && panel === 'playlist'} track={selection?.track} onClose={() => setPanel('actions')} />
    <ShareFriendSheet visible={visible && panel === 'share'} itemType="track" item={selection?.track ?? null} onClose={() => setPanel('actions')} />
    </>
  );
}

const styles = StyleSheet.create({
  hidden: { display: 'none' },
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
  // Um alvo de dedo e nao so um desenho: era 28 x 28 e so decorativo. A altura
  // e a da linha quase toda, para a pega se apanhar sem pontaria.
  pega: {
    width: 36,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledBtn: {
    backgroundColor: 'transparent',
    opacity: 0.4,
  },
});
