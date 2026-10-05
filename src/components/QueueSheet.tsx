import React from 'react';
import { ICONES } from '../lib/icones';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinhaArrastavel } from './LinhaArrastavel';
import { DeslizarParaTirar } from './DeslizarParaTirar';
import { chavesEstaveis } from '../lib/arrastarFila';
import { useArrastarLista } from '../hooks/useArrastarLista';
import Ionicons from '@expo/vector-icons/Ionicons';
import { usePlayer } from '../state/player';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { useSeguirAmigo } from '../state/seguirAmigo';
import { colors, spacing, type, radii } from '../theme';
import { BottomSheet, BottomSheetFlatList } from './BottomSheet';
import { TrackRow } from './TrackRow';
import { EstrelaInteligente } from './BrilhoInteligente';
import { trackKey } from '../lib/shuffle';
import { hapticNotification, hapticSelection } from '../lib/haptics';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { useOfflineMode } from '../hooks/useOfflineMode';
import type { Track } from '../types';
import { accoesDoMenu, PlayerActionsContent, type PlayerAction } from './PlayerActionsSheet';
import { AddToPlaylistSheet } from './AddToPlaylistSheet';
import { ShareFriendSheet } from './ShareFriendSheet';
import { RecommendationPreferences } from './RecommendationPreferences';
import { menuDaFaixa, type IdDaAcao } from '../lib/menuDaFaixa';
import { alternarDownload, downloadNoMenuDe, podeDescarregar, tocaSemRede } from '../lib/descarregarFaixa';
import { alternarGuardada, garantirGuardadas } from '../lib/guardarFaixa';
import { avisarRemocao, contarMusicas, avisarErro } from '../lib/avisoDeRemocao';
import { savedKey, useSaved } from '../state/saved';
import { mensagemDeErro } from '../lib/mensagemDeErro';
import { ErroDoRadio, RadioQueueControl } from './RadioQueueControl';

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
  /**
   * O "View artist" do menu. Quem sabe fechar o leitor e navegar é o
   * PlayerRoot: a fila vive dentro do overlay, e navegar sem o baixar abria a
   * página do artista por trás dele.
   */
  onVerArtista?: (nome: string) => void;
  /**
   * Dentro da folha NATIVA do iOS (3/10, `screens/FilaScreen.tsx`): sem a
   * folha feita à mão à volta, e a lista a encher a altura da folha (que
   * muda entre meia e inteira).
   */
  nativa?: boolean;
}

export function QueueSheet({ visible, onClose, onOpenSession, onVerArtista, nativa = false }: Props) {
  const offline = useOfflineMode();
  /**
   * A linha escolhida. `atual` separa a que está a TOCAR das outras: numa sessão
   * todas vêm sem índice, e o menu da que toca é o do leitor (sem "Play now"
   * nem "Remove from queue").
   */
  const [selection, setSelection] = React.useState<{ track: Track; index: number | null; queue: Track[]; atual: boolean } | null>(null);
  const [panel, setPanel] = React.useState<'actions' | 'playlist' | 'share' | 'recomendacoes'>('actions');
  React.useEffect(() => { if (!visible) { setSelection(null); setPanel('actions'); } }, [visible]);
  const current = usePlayer((s) => s.current);
  const queue = usePlayer((s) => s.queue);
  const queueIndex = usePlayer((s) => s.queueIndex);
  const playTrack = usePlayer((s) => s.playTrack);
  const reordenarProximas = usePlayer((s) => s.reordenarProximas);
  const removeFromQueue = usePlayer((s) => s.removeFromQueue);
  // Tirar da fila mostra o aviso com "Undo" (3/10): a fila volta como estava.
  const tirarComAviso = (indice: number, faixa: Track) => {
    const foto = usePlayer.getState().fotografiaDaFila();
    removeFromQueue(indice);
    avisarRemocao({
      texto: 'Removed from queue',
      detalhe: tituloDaFaixa(faixa),
      desfazer: () => { usePlayer.getState().reporFila(foto); },
    });
  };
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
  // A seguir um amigo ("Listen along"): as próximas DELE, só para ler -- quem
  // manda na fila é ele, e tocar numa delas daqui não faz nada.
  const seguido = useSeguirAmigo((s) => s.seguindo);
  const proximasDele = useSeguirAmigo((s) => s.aSeguir);
  const upNext = seguido
    ? proximasDele.map((t, n) => ({ track: t, index: n }))
    : emSessao
    ? filaDaSessao.map((i, n) => ({ track: i.track, index: n }))
    : upNextLocal;

  // Com o shuffle ligado a ordem visível vive no percurso e não na fila, e o
  // `reordenarProximas` sabe disso -- por isso arrastar funciona nos dois
  // modos. Com as setas não funcionava, e daí terem estado desligadas aqui.
  //
  // Numa sessao a ordem e de toda a gente: mexer nela daqui, sem as regras de
  // quem pode o que, era dar controlo por uma porta lateral. Tira-se e
  // reordena-se na folha da sessao, que sabe dessas regras.
  const canReorder = !emSessao && !seguido;
  // Dizer de onde vêm as faixas: se a fila acabou e o rádio a estendeu, o
  // utilizador tem de perceber porque é que continua a tocar.
  const radioActive = usePlayer((s) => s.radioActive);

  // A faixa, e nao o indice, e o que da nome a cada linha. Ver `chavesEstaveis`.
  const chaves = React.useMemo(
    () => chavesEstaveis(upNext.map((entry) => trackKey(entry.track))),
    [upNext]
  );
  // O arrasto (a pega, o toque longo, o deslize nas bordas e onde a linha
  // aterra) vive em `useArrastarLista`, partilhado com a edição de uma playlist.
  const arrasto = useArrastarLista({ chaves, aoReordenar: reordenarProximas });
  const arrastar = arrasto.arrastar;

  const openActions = (track: Track, index: number | null, atual = false) => {
    hapticSelection();
    garantirGuardadas();
    setSelection({ track, index, queue, atual });
    setPanel('actions');
  };
  // O menu pode ficar aberto enquanto a música termina ou a fila muda.
  // Um índice antigo nunca deve remover outra música ou uma entrada do Jam.
  const canRemove = !!selection && selection.index !== null && !emSessao &&
    selection.queue === queue && selection.index !== queueIndex && queue[selection.index] === selection.track;
  const lida = useSaved((s) => s.loaded);
  const naLoja = useSaved((s) => (selection ? s.keys.has(savedKey(selection.track)) : false));

  /**
   * As ações da faixa são as de todos os menus (lib/menuDaFaixa.ts). Esta era
   * a que dizia "Partilhar com um amigo" em português, e escondia o "Remove
   * from queue" dentro de um Jam em vez de dizer porque é que não dava.
   */
  const nomeDoArtista = selection ? displayArtist(selection.track) : '';
  const menu = selection ? menuDaFaixa({
    plataforma: 'ios',
    onde: selection.atual ? 'leitor' : 'fila',
    semRede: offline,
    tocaSemRede: tocaSemRede(selection.track),
    guardada: lida ? naLoja : null,
    podeDescarregar: podeDescarregar(selection.track),
    download: downloadNoMenuDe(selection.track),
    temArtista: !!nomeDoArtista && nomeDoArtista !== 'Unknown artist',
    fila: { emJam: emSessao, mudou: !emSessao && !canRemove },
  }) : [];
  const fazer = (id: IdDaAcao) => {
    if (!selection) return;
    const t = selection.track;
    switch (id) {
      case 'tocar-agora': setSelection(null); void playTrack(t, queue); return;
      case 'guardar':
        setSelection(null);
        void alternarGuardada(t).then((ficou) => { if (ficou) hapticNotification(); })
          .catch((e: any) => avisarErro(mensagemDeErro(e, 'Could not update your library.')));
        return;
      case 'por-em-playlist': setPanel('playlist'); return;
      case 'ver-artista': setSelection(null); onVerArtista?.(nomeDoArtista); return;
      case 'partilhar': setPanel('share'); return;
      case 'descarregar': setSelection(null); void alternarDownload(t); return;
      case 'recomendacoes': setPanel('recomendacoes'); return;
      case 'tirar-da-fila': {
        const latest = usePlayer.getState();
        if (selection.index === null || useOuvirJuntos.getState().sessao ||
          latest.queue !== selection.queue || latest.queueIndex === selection.index ||
          latest.queue[selection.index] !== selection.track) return;
        tirarComAviso(selection.index, selection.track);
        setSelection(null);
        return;
      }
      default: return;
    }
  };
  const actions: PlayerAction[] = selection ? [
    ...accoesDoMenu(menu, fazer),
    // O que é da FILA e não da faixa, num grupo à parte.
    ...(emSessao && onOpenSession
      ? [{ label: 'Manage Jam queue', icon: `${ICONES.jam}-outline` as const, inicioDeGrupo: true, onPress: onOpenSession }]
      : []),
    { label: 'Back to queue', icon: 'arrow-back', inicioDeGrupo: !(emSessao && onOpenSession), onPress: () => setSelection(null) },
  ] : [];

  const conteudo = (
    <>
      {selection && <PlayerActionsContent title={tituloDaFaixa(selection.track)} actions={actions} />}
      <View style={selection ? styles.hidden : nativa ? styles.encher : undefined}>
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
            onPress={() => openActions(current, null, true)}
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
        {/* O Radio ao lado do Clear (5/10): os dois mexem no que vem a seguir.
            Num Jam a fila é de todos, e não aparece; a seguir um amigo, ligar
            deixa de o seguir. */}
        {!emSessao && current ? <RadioQueueControl/> : null}
        {/* Tirar tudo o que vem a seguir. Num Jam a fila é de todos, e não se
            limpa daqui. Sem pergunta (3/10): o aviso deixa desfazer. */}
        {!emSessao && upNext.length > 0 && (
          <Pressable
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Clear the queue"
            onPress={() => {
              const st = usePlayer.getState();
              const foto = st.fotografiaDaFila();
              const n = st.limparProximas();
              if (n > 0) avisarRemocao({
                texto: `Cleared ${contarMusicas(n)}`,
                detalhe: 'from Up next',
                desfazer: () => { usePlayer.getState().reporFila(foto); },
              });
            }}
          >
            <Text style={styles.irParaSessao}>Clear</Text>
          </Pressable>
        )}
      </View>
      {!emSessao ? <ErroDoRadio/> : null}

      {upNext.length > 0 ? (
        <View
          ref={arrasto.molduraRef}
          // Os limites medem-se NO ECRÃ, porque é em coordenadas de ecrã que o
          // gesto diz onde o dedo está -- e medem-se ao pegar numa linha, com a
          // folha já assente. Ver `limites`.
          collapsable={false}
          style={nativa ? styles.encher : undefined}
        >
        <BottomSheetFlatList dismissScrollEnabled={!selection}
          ref={arrasto.listaRef}
          data={upNext}
          keyExtractor={(_entry, index) => chaves[index]}
          style={nativa ? styles.encher : styles.list}
          // A lista não desliza ao dedo enquanto uma linha está pegada -- quem
          // a faz correr nessa altura é o deslize das bordas, e os dois a
          // disputar o mesmo dedo davam um empurra-empurra.
          scrollEnabled={arrastar === null}
          scrollEventThrottle={16}
          onScroll={arrasto.aoRolar}
          onContentSizeChange={arrasto.aoMudarTamanho}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item: entry, index }) => {
            const item = entry.track;
            const realIndex = entry.index;
            // Sem rede, a fila passa por cima do que não está no telemóvel
            // (lib/filaSemRede.ts): a linha fica, apagada, para se ver porquê.
            const foraDoTelemovel = offline && !tocaSemRede(item);

            return (
              <LinhaArrastavel
                {...arrasto.propsDaLinha(index)}
                podeArrastar={canReorder}
              >
              {(envolverPega) => (
              // Deslizar para a esquerda tira a música da fila (26/9). Num Jam
              // a fila é de todos, e com uma linha pegada o dedo é do arrasto.
              <DeslizarParaTirar
                ativo={!emSessao && arrastar === null}
                aoTirar={() => {
                  const agora = usePlayer.getState();
                  if (useOuvirJuntos.getState().sessao || agora.queueIndex === realIndex
                    || agora.queue[realIndex] !== item) return;
                  tirarComAviso(realIndex, item);
                }}
              >
              <View
                style={styles.queueItemRow}
                onLayout={index === 0 ? (e) => arrasto.medirLinha(e.nativeEvent.layout.height) : undefined}
              >
                {/* Marca as que vieram do shuffle inteligente: sem isto nao se
                    distingue o que e teu do que a app meteu, e a lista passa a
                    ter musicas que nao te lembras de ter posto. */}
                {sugeridas.includes(trackKey(item)) && (
                  <View style={{ marginRight: 6, marginLeft: -2 }}>
                    <EstrelaInteligente tamanho={7} />
                  </View>
                )}
                <View style={{ flex: 1, opacity: foraDoTelemovel ? 0.4 : 1 }}
                  accessibilityHint={foraDoTelemovel ? 'Not on this phone' : undefined}>
                  <TrackRow
                    track={item}
                    // Por extenso, e não só a estrela de 7 pt (26/9).
                    contextLabel={sugeridas.includes(trackKey(item)) ? 'Smart shuffle pick' : undefined}
                    onPress={() => {
                      if (foraDoTelemovel || seguido) return;
                      playTrack(item, queue);
                    }}
                    // O toque longo que pega na linha é da própria
                    // LinhaArrastavel (Gesture Handler, 3/10); e deslizar para
                    // a direita aqui não põe na fila (já lá está).
                    deslizarParaAFila={false}
                  />
                </View>
                <View style={styles.actionButtons}>
                  {canReorder && (() => {
                    // A pega pega LOGO, sem o toque longo -- e o que ela
                    // promete. Ver `LinhaArrastavel`.
                    const pega = (
                      <View
                        accessibilityLabel={`Reorder ${tituloDaFaixa(item)}`}
                        style={styles.pega}
                      >
                        <Ionicons
                          name="reorder-three-outline"
                          size={18}
                          color={arrastar === index ? colors.text : colors.textTertiary}
                        />
                      </View>
                    );
                    return envolverPega ? envolverPega(pega) : pega;
                  })()}
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
              </DeslizarParaTirar>
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
    </>
  );

  return (
    <>
    {nativa ? (
      // A folha é do iOS: a pega, as alturas e o fechar a arrastar são dela.
      <View style={[styles.folhaNativa, selection && { paddingTop: 0 }]}>{conteudo}</View>
    ) : (
      <BottomSheet gestureBlocked={arrastar !== null} bloqueioRef={arrasto.bloqueioRef} visible={visible && panel === 'actions'} onClose={onClose}>
        {conteudo}
      </BottomSheet>
    )}
    <AddToPlaylistSheet visible={visible && panel === 'playlist'} track={selection?.track} onClose={() => setPanel('actions')} />
    <ShareFriendSheet visible={visible && panel === 'share'} itemType="track" item={selection?.track ?? null} onClose={() => setPanel('actions')} />
    <RecommendationPreferences visible={visible && panel === 'recomendacoes'} track={selection?.track ?? null} onClose={() => setPanel('actions')} />
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
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  list: {
    maxHeight: 300,
  },
  encher: { flex: 1 },
  // Por baixo da pega do iOS (que fica por cima do conteúdo).
  folhaNativa: { flex: 1, paddingTop: 22, paddingHorizontal: spacing.lg },
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
