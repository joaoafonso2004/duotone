import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Toque } from './Toque';
import { BarrasDaFaixa } from './BarrasDaFaixa';
import { FriendAvatar } from './FriendAvatar';
import { ESCALA } from '../lib/movimento';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { guardarOrigem } from '../state/origemDaCapa';
import { hapticSelection } from '../lib/haptics';
import { isShowTrackDurationSync } from '../lib/prefs';
import { useDescarregadaDeProposito } from '../lib/descarregarFaixa';
import { aquecerAoTocar, ESPERA_AO_POUSAR_MS } from '../lib/aquecerAoTocar';
import { colors, radii, spacing, type, ESCALA_MAXIMA } from '../theme';
import { useSaved } from '../state/saved';
import { usePlayer } from '../state/player';
import { useTheme } from '../state/theme';
import { contarLinhaMontada } from '../state/folego';
import type { Track } from '../types';
import { useAparencia } from '../state/aparencia';

interface Props {
  track: Track;
  active?: boolean;
  /**
   * Acende a linha quando ESTA faixa é a que toca, lendo-o a própria linha
   * (27/9). As listas calculavam o `active` com o `current` da store, e por
   * isso cada skip redesenhava o ecrã e todas as linhas montadas -- com as abas
   * todas montadas (`lazy: false`), no instante do skip. Assim só mudam as
   * duas linhas que mudam de facto.
   */
  acompanharATocar?: boolean;
  /**
   * Recebem a faixa, para a lista poder passar uma função ESTÁVEL em vez de
   * uma nova por linha e por render -- que desfazia o `React.memo`.
   */
  onPress: (track: Track) => void;
  onAction?: (track: Track) => void;
  actionIcon?: keyof typeof Ionicons.glyphMap;
  selectMode?: boolean;
  selected?: boolean;
  /** Marcar as faixas que já estão na biblioteca. Só faz sentido em listas
   * que MISTURAM guardadas e não guardadas (pesquisa, faixas de um artista no
   * YouTube). Nas listas da própria biblioteca seria um ícone em todas as
   * linhas, ou seja, ruído. */
  showSavedBadge?: boolean;
  /**
   * Sobrepõe-se ao gesto do `onAction` para quem precisa do toque longo para
   * outra coisa -- pegar numa linha da fila para a mudar de sítio.
   */
  onLongPress?: () => void;
  /** Só faz sentido com `onLongPress`. Sem ele, o toque longo fica nos 350 ms. */
  delayLongPress?: number;
  /** O dedo saiu -- levantado, ou roubado por outro gesto. */
  onPressOut?: () => void;
  /**
   * Esconde a duração mesmo com a definição ligada.
   *
   * Numa lista de descoberta a duração não ajuda a escolher -- ninguém decide
   * ouvir uma música por ela ter 2:31 -- e ocupa o sítio onde a próxima capa
   * devia estar a assomar. Na biblioteca é outra conversa, e por isso isto é
   * uma excepção pedida e não o novo normal.
   */
  mostrarDuracao?: boolean;
  /** Explicação curta para uma faixa recomendada. */
  contextLabel?: string;
  /**
   * Quem pôs a música, numa playlist colaborativa (7/10): uma cara pequena
   * antes do artista. Tem de ser um objeto estável (o da lista das pessoas),
   * senão desfaz o memo.
   */
  quemPos?: { avatarUrl: string | null; nome: string } | null;
}

/** 52 px de capa + 8 px de padding em cima e em baixo (compacta: 40 + 8 + 8, `alturaDaLinha`). */
export const TRACK_ROW_HEIGHT = 68;
export const getTrackRowLayout = (_: ArrayLike<Track> | null | undefined, index: number) => ({
  length: TRACK_ROW_HEIGHT,
  offset: TRACK_ROW_HEIGHT * index,
  index,
});

function formatDuration(s: number | null): string {
  if (!s) return '';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function TrackRowComponent({
  track,
  active,
  acompanharATocar = false,
  onPress,
  onAction,
  actionIcon = 'ellipsis-horizontal',
  selectMode = false,
  selected = false,
  showSavedBadge = false,
  onLongPress,
  delayLongPress,
  onPressOut,
  mostrarDuracao = true,
  contextLabel,
  quemPos,
}: Props) {
  const theme = useTheme((s) => s.theme);
  const aTocar = usePlayer((s) =>
    acompanharATocar && !!s.current && s.current.source === track.source && s.current.sourceId === track.sourceId,
  );
  const ativo = !!active || aTocar;
  // Quantas linhas estão montadas, para o relatório (state/folego.ts): se o
  // botão de pausa fica lento com o tempo, é uma das coisas que pode crescer.
  useEffect(() => contarLinhaMontada(), []);
  /** A moldura da capa desta linha, para o player saber de onde a fazer voar. */
  const capa = useRef<View>(null);
  // Listas compactas (10/10, personalização): capa de 40 em vez de 52.
  const compacta = useAparencia((s) => s.listas === 'compact');
  // Sem as barras pretas do 4:3 -- ver capaDoEcraBloqueado.ts. É também o que
  // faz a capa aterrar no mini player sem mudar de enquadramento.
  const capaUri = capaParaLista(track.artworkUrl);
  // Subscrito sempre (as regras dos hooks não deixam condicionar), mas o
  // seletor devolve `false` quando a badge está desligada, por isso as listas
  // da biblioteca não voltam a renderizar quando a biblioteca muda.
  const saved = useSaved((s) =>
    showSavedBadge ? s.keys.has(`${track.source}:${track.sourceId}`) : false
  );
  // Só o que foi descarregado DE PROPÓSITO: uma música que tocou também está
  // em disco, e não é por isso que foi descarregada (lib/downloadsExplicitos.ts).
  const descarregada = useDescarregadaDeProposito(track);
  // O dedo pousou e ficou: começa já a resolver a música (lib/aquecerAoTocar.ts).
  // Um scroll larga o toque antes de `ESPERA_AO_POUSAR_MS`, e não aquece nada.
  const aquecer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const largarAquecer = () => { if (aquecer.current) clearTimeout(aquecer.current); aquecer.current = null; };
  useEffect(() => largarAquecer, []);

  // Sem gesto lateral na linha (6/10): o deslizar para a direita que punha na
  // fila (29/9) roubava o arrastar entre secções, que é o gesto que o João usa,
  // e nem chegava a pôr na fila. "Add to queue" está no "…" (lib/menuDaFaixa.ts).
  return (
    /* `acende` e nao escala: uma linha de lista inteira a encolher le-se
        como a lista a saltar, nao como uma resposta ao dedo. O que uma linha
        faz e iluminar-se, sem deslocar nada. */
    <Toque
      acende
      onPress={() => {
        // Sem vibrar (3/10): tocar numa música é navegar, e vibrar a cada
        // toque gastava a vibração das confirmações (gostar, pôr na fila).
        // Onde é que a capa está NESTE instante, em coordenadas de ecrã. É
        // daqui que ela voa para o player. A medição é assíncrona e pode
        // chegar tarde ou nunca -- se não chegar, o player entra como sempre
        // entrou. Por isso o onPress não espera por ela.
        capa.current?.measureInWindow((x, y, largura, altura) => {
          guardarOrigem({ x, y, largura, altura, uri: capaUri });
        });
        onPress(track);
      }}
      onLongPress={
        onLongPress ??
        (!selectMode && onAction
          ? () => {
              hapticSelection();
              onAction(track);
            }
          : undefined)
      }
      delayLongPress={delayLongPress ?? 350}
      onPressIn={selectMode ? undefined : () => {
        largarAquecer();
        aquecer.current = setTimeout(() => { aquecer.current = null; aquecerAoTocar(track); }, ESPERA_AO_POUSAR_MS);
      }}
      onPressOut={() => { largarAquecer(); onPressOut?.(); }}
      // Sem o fundo tingido (3/10): a que toca diz-se pelas barrinhas na capa
      // e pelo título na cor do tema.
      style={styles.row}
    >
      {selectMode && (
        <View style={styles.checkboxContainer}>
          <Ionicons
            name={selected ? 'checkbox' : 'square-outline'}
            size={22}
            color={selected ? colors.text : colors.textSecondary}
          />
        </View>
      )}
      <View ref={capa} collapsable={false} style={styles.artworkWrap}>
        {capaUri ? (
          <Image
            source={{ uri: capaUri }}
            style={[styles.artwork, compacta && styles.artworkCompacta]}
            contentFit="cover"
            // Em listas longas, animar cada imagem que entra na janela de
            // virtualização mantém a GPU ocupada durante todo o scroll.
            transition={0}
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.artwork, compacta && styles.artworkCompacta, styles.artworkFallback]}>
            <Ionicons
              name="musical-notes"
              size={18}
              color={colors.textTertiary}
            />
          </View>
        )}
        {/* Três barras a mexer; em pausa, reticências (3/10). */}
        {ativo ? <BarrasDaFaixa /> : null}
      </View>

      <View style={styles.meta}>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={ESCALA_MAXIMA.lista}
          style={[type.body, { fontWeight: '600' }, ativo && { color: theme.color }]}
        >
          {tituloDaFaixa(track)}
        </Text>
        <View style={styles.metaRow}>
          {quemPos ? (
            <View accessibilityLabel={`Added by ${quemPos.nome}`}>
              <FriendAvatar avatarUrl={quemPos.avatarUrl} name={quemPos.nome} size={15} />
            </View>
          ) : null}
          {descarregada ? (
            // Descarregada de propósito (e já em disco)
            <Ionicons name="arrow-down-circle" size={12} color={colors.textSecondary} />
          ) : null}
          {saved ? (
            // Já está na biblioteca — evita guardar duas vezes a mesma faixa.
            <Ionicons name="heart" size={11} color={theme.color} />
          ) : null}
          {track.artist ? (
            <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={[type.caption, { flexShrink: 1 }]}>
              {displayArtist(track)}
            </Text>
          ) : null}
          {contextLabel ? <Text style={styles.contextDot}>·</Text> : null}
          {contextLabel ? <Text numberOfLines={1} style={styles.contextLabel}>{contextLabel}</Text> : null}
        </View>
      </View>

      {mostrarDuracao && isShowTrackDurationSync() ? (
        <Text maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.duration}>{formatDuration(track.durationSeconds)}</Text>
      ) : null}

      {!selectMode && onAction ? (
        <Toque
          escala={ESCALA.icone}
          onPress={() => onAction(track)}
          hitSlop={10}
          style={styles.actionBtn}
          accessibilityRole="button"
          accessibilityLabel="More options"
        >
          <Ionicons name={actionIcon} size={18} color={colors.textSecondary} />
        </Toque>
      ) : null}
    </Toque>
  );
}

export const TrackRow = React.memo(TrackRowComponent);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  checkboxContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 2,
  },
  artworkWrap: {
    borderRadius: radii.sm,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  artwork: {
    width: 52,
    height: 52,
    borderRadius: radii.sm,
    borderCurve: 'continuous',
    backgroundColor: colors.surfaceHigh,
  },
  artworkCompacta: { width: 40, height: 40 },
  artworkFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    flex: 1,
    gap: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  duration: {
    ...type.caption,
    fontVariant: ['tabular-nums'],
  },
  contextDot: { ...type.caption, color: colors.textTertiary },
  contextLabel: { ...type.caption, fontSize: 11, color: colors.textTertiary, flex: 1 },
  actionBtn: {
    padding: 4,
  },
});
