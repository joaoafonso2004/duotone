import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLibrary } from '../api/library';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { hapticNotification, hapticSelection } from '../lib/haptics';
import {
  alternarFixado, esquecerFixado, useDownloadsFixados,
} from '../lib/downloadsFixados';
import type { FicheiroEmCache } from '../lib/limpezaDoCache';
import {
  clearDownloadedAudioCache, formatCacheSize, listarDescarregados,
  removeDownloadedAudio, useAudioCache,
} from '../lib/youtubeCache';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { usePlayer } from '../state/player';
import { useTheme } from '../state/theme';
import { colors, MINI_PLAYER_HEIGHT, radii, spacing, type } from '../theme';
import type { Track } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Downloads'>;

/** O mesmo teto que a limpeza automática usa (youtubeCache.ts). */
const LIMITE_BYTES = 500 * 1024 * 1024;

interface Descarregado extends FicheiroEmCache {
  faixa: Track | null;
}

/**
 * O que está guardado neste telemóvel.
 *
 * Antes disto o offline era invisível: dava para descarregar uma faixa e para
 * limpar tudo de uma vez, mas não para ver o que lá estava, quanto ocupava, ou
 * impedir que a limpeza automática o levasse. Descarregar um álbum para uma
 * viagem e encontrá-lo apagado à chegada era possível — e silencioso.
 */
export function DownloadsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const tema = useTheme((s) => s.theme);
  const playTrack = usePlayer((s) => s.playTrack);
  const fixados = useDownloadsFixados((s) => s.ids);
  // Muda sempre que o cache muda (download novo, remoção, limpeza).
  const revisao = useAudioCache((s) => s.revision);

  const [itens, setItens] = useState<Descarregado[] | null>(null);

  const carregar = useCallback(async () => {
    const ficheiros = listarDescarregados();
    // Os metadados vêm da biblioteca; um ficheiro de uma faixa que já saiu de
    // lá continua a ocupar espaço e tem de aparecer na mesma, com o id à vista
    // em vez de um título que não temos.
    const porId = new Map<string, Track>();
    try {
      for (const t of await getLibrary()) {
        if (t.source === 'youtube') porId.set(t.sourceId, t);
      }
    } catch {
      // Sem rede fica a lista sem títulos, que continua a ser útil.
    }
    setItens(ficheiros.map((f) => ({ ...f, faixa: porId.get(f.id) ?? null })));
  }, []);

  useEffect(() => { void carregar(); }, [carregar, revisao]);

  const { total, ordenados } = useMemo(() => {
    const lista = itens ?? [];
    let bytes = 0;
    for (const i of lista) bytes += i.bytes;
    // Os fixados primeiro, e dentro de cada grupo os mais recentes à frente.
    const ordenados = [...lista].sort((a, b) => {
      const fa = fixados.has(a.id) ? 0 : 1;
      const fb = fixados.has(b.id) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return b.modificadoEm - a.modificadoEm;
    });
    return { total: bytes, ordenados };
  }, [itens, fixados]);

  const percentagem = Math.min(100, Math.round((total / LIMITE_BYTES) * 100));
  const bytesFixados = ordenados.reduce((s, i) => (fixados.has(i.id) ? s + i.bytes : s), 0);

  const remover = (item: Descarregado) => {
    Alert.alert(
      'Remover download',
      item.faixa ? `"${item.faixa.title}" deixa de estar disponível offline.` : 'Este ficheiro é apagado do telemóvel.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: () => {
            removeDownloadedAudio(item.id);
            void esquecerFixado(item.id);
            hapticNotification();
          },
        },
      ],
    );
  };

  const limparTudo = () => {
    Alert.alert(
      'Remover todos os downloads',
      'Todas as faixas guardadas neste telemóvel são apagadas, incluindo as fixadas.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover tudo',
          style: 'destructive',
          onPress: () => {
            clearDownloadedAudioCache();
            for (const id of [...fixados]) void esquecerFixado(id);
            hapticNotification();
          },
        },
      ],
    );
  };

  return (
    <Screen title="Downloads" onBack={() => navigation.goBack()}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + MINI_PLAYER_HEIGHT + spacing.xxl }}>
        {itens === null ? (
          <ActivityIndicator color={colors.text} style={{ marginTop: 64 }} />
        ) : itens.length === 0 ? (
          <EmptyState
            icon="arrow-down-circle-outline"
            title="Nada guardado ainda"
            subtitle="As faixas que descarregares aparecem aqui e ficam a tocar sem rede."
          />
        ) : (
          <>
            <View style={styles.resumo}>
              <Text style={styles.resumoValor}>{formatCacheSize(total)}</Text>
              <Text style={type.caption}>
                {itens.length} {itens.length === 1 ? 'faixa guardada' : 'faixas guardadas'}
                {bytesFixados > 0 ? ` · ${formatCacheSize(bytesFixados)} fixados` : ''}
              </Text>
              <View style={styles.barra}>
                <View style={[styles.barraCheia, { width: `${percentagem}%`, backgroundColor: tema.color }]} />
              </View>
              <Text style={[type.micro, { color: colors.textTertiary }]}>
                {/* Dizer o limite é o que torna a limpeza automática previsível
                    em vez de misteriosa. */}
                {percentagem}% de {formatCacheSize(LIMITE_BYTES)} — acima disto, as mais antigas
                saem sozinhas. As fixadas nunca saem.
              </Text>
            </View>

            {ordenados.map((item) => {
              const fixado = fixados.has(item.id);
              return (
                <View key={item.id} style={styles.linha}>
                  <Pressable
                    onPress={() => item.faixa && playTrack(item.faixa, [item.faixa], true)}
                    style={styles.parteTocavel}
                  >
                    {item.faixa?.artworkUrl ? (
                      <Image source={{ uri: item.faixa.artworkUrl }} style={styles.capa} contentFit="cover" />
                    ) : (
                      <View style={[styles.capa, styles.semCapa]}>
                        <Ionicons name="musical-notes" size={16} color={colors.textTertiary} />
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={[type.body, { fontWeight: '600' }]}>
                        {item.faixa?.title ?? 'Faixa fora da biblioteca'}
                      </Text>
                      <Text numberOfLines={1} style={type.caption}>
                        {item.faixa?.artist ?? item.id} · {formatCacheSize(item.bytes)}
                      </Text>
                    </View>
                  </Pressable>

                  <Pressable
                    onPress={() => { void alternarFixado(item.id); hapticSelection(); }}
                    hitSlop={8}
                    accessibilityLabel={fixado ? 'Desafixar' : 'Fixar para nunca ser apagada'}
                    style={styles.botao}
                  >
                    <Ionicons
                      name={fixado ? 'lock-closed' : 'lock-open-outline'}
                      size={18}
                      color={fixado ? tema.color : colors.textTertiary}
                    />
                  </Pressable>

                  <Pressable onPress={() => remover(item)} hitSlop={8} accessibilityLabel="Remover download" style={styles.botao}>
                    <Ionicons name="trash-outline" size={18} color={colors.textTertiary} />
                  </Pressable>
                </View>
              );
            })}

            <Pressable onPress={limparTudo} style={({ pressed }) => [styles.limpar, pressed && { opacity: 0.7 }]}>
              <Text style={[type.body, { color: colors.danger, fontWeight: '600' }]}>
                Remover todos os downloads
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  resumo: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    gap: 6,
  },
  resumoValor: { fontSize: 26, fontWeight: '800', color: colors.text },
  barra: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceHigh,
    overflow: 'hidden',
    marginTop: 4,
  },
  barraCheia: { height: '100%', borderRadius: 2 },

  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    gap: spacing.sm,
  },
  parteTocavel: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minWidth: 0 },
  capa: { width: 44, height: 44, borderRadius: radii.sm, backgroundColor: colors.surfaceHigh },
  semCapa: { alignItems: 'center', justifyContent: 'center' },
  botao: { padding: 6 },

  limpar: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.md,
    padding: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
  },
});
