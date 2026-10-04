import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View } from 'react-native';
import { displayArtist } from '../lib/artistName';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
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
 * A Daily mix no topo da Pesquisa: tocar no cartão abre a lista, o botão toca-a.
 *
 * Existe para quem ouve "uma playlist que se atualiza sozinha" e não quer
 * escolher nada: um toque e está a tocar. Some quando não há mix para mostrar,
 * em vez de ocupar o topo com um vazio. Ver `lib/misturaDoDia.ts`.
 */
export function CartaoDaMisturaDoDia({ aoAbrir, destaque = false }: {
  aoAbrir: () => void;
  /**
   * Na Home (3/10, variante A): a capa grande a encher o cartão, com o nome e
   * os artistas da mistura por cima. Sem isto, a linha compacta de sempre.
   */
  destaque?: boolean;
}) {
  const faixas = useMisturaDoDia((s) => s.faixas);
  const estado = useMisturaDoDia((s) => s.estado);
  const playTrack = usePlayer((s) => s.playTrack);
  const theme = useTheme((s) => s.theme);
  const capas = useMemo(() => faixas.map(capaDe).filter(Boolean).slice(0, 4), [faixas]);
  // "Isak, Dillaz, Morad and more": os primeiros artistas, sem repetir.
  const artistas = useMemo(() => {
    const nomes: string[] = [];
    for (const f of faixas) {
      const n = displayArtist(f);
      if (n && n !== 'Unknown artist' && !nomes.includes(n)) nomes.push(n);
      if (nomes.length >= 3) break;
    }
    return nomes;
  }, [faixas]);

  if (estado === 'vazio' || (estado === 'pronto' && faixas.length === 0)) return null;
  const aFazer = faixas.length === 0;

  const tocar = () => {
    if (!faixas.length) return;
    // A origem leva o "Jump back in" da Home de volta à Daily mix (lib/recentes.ts).
    playTrack(faixas[0], faixas, true, false, contextoDaPrateleira('flow'), { tipo: 'prateleira', nome: 'Daily mix', id: 'doDia' });
  };

  if (destaque) {
    const capa = capas[0] ? capaParaLista(capas[0]) : null;
    const legenda = aFazer
      ? 'Making today’s mix…'
      : `${artistas.length ? `${artistas.join(', ')} and more · ` : ''}${faixas.length} songs`;
    return (
      <Pressable
        onPress={aFazer ? undefined : aoAbrir}
        accessibilityRole="button"
        accessibilityLabel="Daily mix"
        style={({ pressed }) => ({
          height: 180, borderRadius: radii.lg, borderCurve: 'continuous', overflow: 'hidden',
          backgroundColor: colors.surfaceHigh, opacity: pressed ? 0.9 : 1,
        })}
      >
        {/* A miniatura do YouTube de uma música traz muitas vezes a capa
            quadrada ao centro com faixas de cor dos lados: esticada pelo cartão
            parecia uma fotografia emoldurada (screenshots de 4/10). O fundo é
            ela desfocada, e a capa vai num quadrado à esquerda, recortada ao
            centro -- que é onde a capa está. */}
        {capa ? <Image source={{ uri: capa }} blurRadius={28} style={{ position: 'absolute', top: -20, left: -20, right: -20, bottom: -20 }} contentFit="cover" transition={250} /> : null}
        <LinearGradient
          colors={['rgba(0,0,0,0.25)', 'rgba(0,0,0,0.62)']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        {capa ? (
          <Image
            source={{ uri: capa }}
            style={{ position: 'absolute', left: spacing.lg, top: spacing.lg, width: 148, height: 148, borderRadius: radii.md }}
            contentFit="cover"
            transition={250}
          />
        ) : null}
        <View style={{ position: 'absolute', left: capa ? spacing.lg + 148 + spacing.md : spacing.lg, right: spacing.lg, top: spacing.lg, bottom: 76, gap: 4 }}>
          <Text numberOfLines={2} style={{ fontSize: 22, fontWeight: '800', color: '#fff' }}>Your Daily mix</Text>
          <Text numberOfLines={3} style={[type.caption, { color: 'rgba(255,255,255,0.78)' }]}>{legenda}</Text>
        </View>
        {!aFazer && (
          <Pressable
            onPress={tocar}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Play Daily mix"
            style={({ pressed }) => ({
              position: 'absolute', right: spacing.lg, bottom: spacing.lg,
              width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff',
              alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1,
            })}
          >
            <Ionicons name="play" size={22} color="#000" style={{ marginLeft: 2 }} />
          </Pressable>
        )}
      </Pressable>
    );
  }

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
