import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React, { useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Toque } from './Toque';
import { ESCALA } from '../lib/movimento';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { guardarOrigem } from '../state/origemDaCapa';
import { hapticImpact, hapticSelection } from '../lib/haptics';
import { isShowTrackDurationSync } from '../lib/prefs';
import { isAudioCached } from '../lib/youtubeCache';
import { colors, radii, spacing, type } from '../theme';
import { useSaved } from '../state/saved';
import { useTheme } from '../state/theme';
import type { Track } from '../types';

interface Props {
  track: Track;
  active?: boolean;
  onPress: () => void;
  onAction?: () => void;
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
}

/** 52 px de capa + 8 px de padding em cima e em baixo. */
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
}: Props) {
  const theme = useTheme((s) => s.theme);
  /** A moldura da capa desta linha, para o player saber de onde a fazer voar. */
  const capa = useRef<View>(null);
  // Sem as barras pretas do 4:3 -- ver capaDoEcraBloqueado.ts. É também o que
  // faz a capa aterrar no mini player sem mudar de enquadramento.
  const capaUri = capaParaLista(track.artworkUrl);
  // Subscrito sempre (as regras dos hooks não deixam condicionar), mas o
  // seletor devolve `false` quando a badge está desligada, por isso as listas
  // da biblioteca não voltam a renderizar quando a biblioteca muda.
  const saved = useSaved((s) =>
    showSavedBadge ? s.keys.has(`${track.source}:${track.sourceId}`) : false
  );

  return (
    // `acende` e nao escala: uma linha de lista inteira a encolher le-se
    // como a lista a saltar, nao como uma resposta ao dedo. O que uma linha
    // faz e iluminar-se, sem deslocar nada.
    <Toque
      acende
      onPress={() => {
        hapticImpact();
        // Onde é que a capa está NESTE instante, em coordenadas de ecrã. É
        // daqui que ela voa para o player. A medição é assíncrona e pode
        // chegar tarde ou nunca -- se não chegar, o player entra como sempre
        // entrou. Por isso o onPress não espera por ela.
        capa.current?.measureInWindow((x, y, largura, altura) => {
          guardarOrigem({ x, y, largura, altura, uri: capaUri });
        });
        onPress();
      }}
      onLongPress={
        onLongPress ??
        (!selectMode && onAction
          ? () => {
              hapticSelection();
              onAction();
            }
          : undefined)
      }
      delayLongPress={delayLongPress ?? 350}
      onPressOut={onPressOut}
      style={[styles.row, active && { backgroundColor: theme.soft }]}
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
            style={styles.artwork}
            contentFit="cover"
            // Em listas longas, animar cada imagem que entra na janela de
            // virtualização mantém a GPU ocupada durante todo o scroll.
            transition={0}
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.artwork, styles.artworkFallback]}>
            <Ionicons
              name="musical-notes"
              size={18}
              color={colors.textTertiary}
            />
          </View>
        )}
      </View>

      <View style={styles.meta}>
        <Text
          numberOfLines={1}
          style={[type.body, { fontWeight: '600' }, active && { color: theme.color }]}
        >
          {tituloDaFaixa(track)}
        </Text>
        <View style={styles.metaRow}>
          {track.source === 'youtube' && isAudioCached(track.sourceId) ? (
            // Disponível offline (áudio já descarregado no cache local)
            <Ionicons name="arrow-down-circle" size={12} color={colors.textSecondary} />
          ) : null}
          {saved ? (
            // Já está na biblioteca — evita guardar duas vezes a mesma faixa.
            <Ionicons name="heart" size={11} color={theme.color} />
          ) : null}
          {track.artist ? (
            <Text numberOfLines={1} style={[type.caption, { flexShrink: 1 }]}>
              {displayArtist(track)}
            </Text>
          ) : null}
          {contextLabel ? <Text style={styles.contextDot}>·</Text> : null}
          {contextLabel ? <Text numberOfLines={1} style={styles.contextLabel}>{contextLabel}</Text> : null}
        </View>
      </View>

      {mostrarDuracao && isShowTrackDurationSync() ? (
        <Text style={styles.duration}>{formatDuration(track.durationSeconds)}</Text>
      ) : null}

      {!selectMode && onAction ? (
        <Toque
          escala={ESCALA.icone}
          onPress={() => {
            hapticImpact();
            onAction();
          }}
          hitSlop={10}
          style={styles.actionBtn}
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
  active: {
    backgroundColor: colors.accentSoft,
  },
  checkboxContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 2,
  },
  artworkWrap: {
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
  artwork: {
    width: 52,
    height: 52,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceHigh,
  },
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
  contextLabel: { ...type.caption, fontSize: 10, color: colors.textTertiary, flex: 1 },
  actionBtn: {
    padding: 4,
  },
});
