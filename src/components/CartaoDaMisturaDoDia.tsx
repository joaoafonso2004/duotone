import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { contextoDaPrateleira } from '../lib/contextoDaDescoberta';
import { useMisturaDoDia } from '../state/misturaDoDia';
import { usePlayer } from '../state/player';
import { useTheme } from '../state/theme';
import { colors, radii, spacing, type } from '../theme';
import type { Track } from '../types';
import { ArtworkCollage } from './ArtworkCollage';

const LADO = 76;

/** A capa de uma faixa, ou a miniatura do YouTube quando a faixa não traz nenhuma. */
function capaDe(t: Track): string {
  if (t.artworkUrl) return t.artworkUrl;
  return t.source === 'youtube' ? `https://i.ytimg.com/vi/${t.sourceId}/mqdefault.jpg` : '';
}

/**
 * A Daily mix no topo das Playlists: tocar no cartão abre a lista, o botão toca-a.
 *
 * Existe para quem ouve "uma playlist que se atualiza sozinha" e não quer
 * escolher nada: um toque e está a tocar. Some quando não há mix para mostrar,
 * em vez de ocupar o topo com um vazio. Ver `lib/misturaDoDia.ts`.
 */
export function CartaoDaMisturaDoDia({ aoAbrir }: { aoAbrir: () => void }) {
  const faixas = useMisturaDoDia((s) => s.faixas);
  const estado = useMisturaDoDia((s) => s.estado);
  const playTrack = usePlayer((s) => s.playTrack);
  const theme = useTheme((s) => s.theme);
  const capas = useMemo(() => faixas.map(capaDe).filter(Boolean).slice(0, 4), [faixas]);

  if (estado === 'vazio' || (estado === 'pronto' && faixas.length === 0)) return null;
  const aFazer = faixas.length === 0;

  const tocar = () => {
    if (!faixas.length) return;
    playTrack(faixas[0], faixas, true, false, contextoDaPrateleira('flow'));
  };

  return (
    <Pressable
      onPress={aFazer ? undefined : aoAbrir}
      accessibilityRole="button"
      accessibilityLabel="Daily mix"
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: spacing.md,
        padding: spacing.sm, borderRadius: radii.lg,
        backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1,
      })}
    >
      {capas.length > 0 ? (
        <ArtworkCollage artworks={capas} size={LADO} />
      ) : (
        <View style={{ width: LADO, height: LADO, borderRadius: radii.md, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="sparkles" size={24} color={theme.color} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={type.headline}>Daily mix</Text>
        <Text numberOfLines={2} style={type.caption}>
          {aFazer ? 'Making today’s mix…' : `${faixas.length} songs · new every day, from what you listen to`}
        </Text>
      </View>
      {!aFazer && (
        <Pressable
          onPress={tocar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Play Daily mix"
          style={({ pressed }) => ({
            width: 44, height: 44, borderRadius: 22, backgroundColor: theme.color,
            alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1,
          })}
        >
          <Ionicons name="play" size={20} color={colors.bg} style={{ marginLeft: 2 }} />
        </Pressable>
      )}
    </Pressable>
  );
}
