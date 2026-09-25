import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLibrary } from '../api/library';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { useOfflineMode } from '../hooks/useOfflineMode';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { limparTodosOsDownloads, pedirDownload, tirarDownload } from '../lib/descarregarFaixa';
import {
  faixaDoPedido, pedidosPorOrdem, situacaoDoDownload, type SituacaoDoDownload,
} from '../lib/downloadsExplicitos';
import { useDownloadsFixados } from '../lib/downloadsFixados';
import { hapticNotification, hapticSelection } from '../lib/haptics';
import { readLikedSongsCache } from '../lib/likedSongsCache';
import { formatCacheSize, listarDescarregados, MAX_CACHE_BYTES, useAudioCache } from '../lib/youtubeCache';
import { useAuth } from '../state/auth';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { usePlayer } from '../state/player';
import { useTheme } from '../state/theme';
import { colors, MINI_PLAYER_HEIGHT, radii, spacing, type } from '../theme';
import type { Track } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Downloads'>;

interface Linha {
  id: string;
  faixa: Track;
  situacao: SituacaoDoDownload;
  bytes: number;
}

/**
 * Os downloads pedidos neste telemóvel, e à parte a cache.
 *
 * Mostrava os FICHEIROS em disco -- incluindo cada música que só tinha tocado
 * -- e para um download não ser apagado era preciso fixá-lo com o cadeado. Agora
 * a lista são os downloads que alguém pediu (lib/downloadsExplicitos.ts): todos
 * ficam protegidos da limpeza, sem segundo passo. O que tocou e ficou em disco
 * é a cache, numa linha só, e sai sozinho acima do limite.
 *
 * Os títulos vêm da cópia guardada com o pedido, por isso a lista mostra-se sem
 * rede e mostra faixas que já saíram da biblioteca. Só os pedidos que vieram
 * dos fixados antigos (que guardavam só o id) vão buscar o título à biblioteca.
 */
export function DownloadsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const tema = useTheme((s) => s.theme);
  const offline = useOfflineMode();
  const playTrack = usePlayer((s) => s.playTrack);
  const playShuffled = usePlayer((s) => s.playShuffled);
  const userId = useAuth((s) => s.session?.user.id ?? s.offlineUserId);
  const registo = useDownloadsFixados((s) => s.registo);
  const aDescarregar = useDownloadsFixados((s) => s.aDescarregar);
  // Muda sempre que o disco muda (download novo, remoção, limpeza).
  const revisao = useAudioCache((s) => s.revision);

  const ficheiros = useMemo(() => {
    const porId = new Map<string, number>();
    for (const f of listarDescarregados()) porId.set(f.id, f.bytes);
    return porId;
    // `revisao` é a razão de reler o disco.
  }, [revisao]); // eslint-disable-line react-hooks/exhaustive-deps

  // Os títulos dos pedidos sem cópia (fixados antigos) vêm da biblioteca.
  const semCopia = useMemo(
    () => Object.keys(registo.pedidos).filter((id) => !registo.pedidos[id].faixa).join(','),
    [registo],
  );
  const [daBiblioteca, setDaBiblioteca] = useState<Map<string, Track> | null>(null);
  useEffect(() => {
    if (!semCopia) return;
    let vivo = true;
    getLibrary()
      .then((todas) => {
        const porId = new Map<string, Track>();
        for (const t of todas) if (t.source === 'youtube') porId.set(t.sourceId, t);
        if (vivo) setDaBiblioteca(porId);
      })
      .catch(() => { /* sem rede fica o id, que continua a tocar */ });
    return () => { vivo = false; };
  }, [semCopia]);

  // As gostadas que estão no telemóvel sem terem sido pedidas (tocaram e
  // ficaram na cache). A lista das gostadas vem da cópia em disco, por isso
  // também aparece sem rede -- que é quando esta secção serve.
  const [gostadas, setGostadas] = useState<Track[]>([]);
  useEffect(() => {
    if (!userId) return;
    let vivo = true;
    readLikedSongsCache(userId).then((t) => { if (vivo) setGostadas(t); }).catch(() => {});
    return () => { vivo = false; };
  }, [userId]);
  const tambemAqui = useMemo(
    () => gostadas.filter((t) => t.source === 'youtube' && ficheiros.has(t.sourceId) && !(t.sourceId in registo.pedidos)),
    [gostadas, ficheiros, registo],
  );

  const { linhas, bytesDosDownloads, emFalta, cache, protegidasAte, protegidas } = useMemo(() => {
    const linhas: Linha[] = pedidosPorOrdem(registo).map((id) => {
      const p = registo.pedidos[id];
      return {
        id,
        faixa: p.faixa ? faixaDoPedido(id, p) : (daBiblioteca?.get(id) ?? faixaDoPedido(id, p)),
        situacao: situacaoDoDownload({ pedido: true, emDisco: ficheiros.has(id), aDescarregar: aDescarregar.has(id) }),
        bytes: ficheiros.get(id) ?? 0,
      };
    });
    let bytesDosDownloads = 0;
    for (const l of linhas) bytesDosDownloads += l.bytes;
    let cacheBytes = 0;
    let cacheFaixas = 0;
    for (const [id, bytes] of ficheiros) {
      if (id in registo.pedidos) continue;
      cacheBytes += bytes;
      cacheFaixas++;
    }
    const m = registo.migracao;
    const agora = Date.now();
    const protegidas = m && agora < m.ate ? m.ids.filter((id) => ficheiros.has(id) && !(id in registo.pedidos)).length : 0;
    return {
      linhas,
      bytesDosDownloads,
      emFalta: linhas.filter((l) => l.situacao === 'em-falta'),
      cache: { bytes: cacheBytes, faixas: cacheFaixas },
      protegidasAte: m?.ate ?? 0,
      protegidas,
    };
  }, [registo, aDescarregar, ficheiros, daBiblioteca]);

  const nada = linhas.length === 0 && cache.faixas === 0;
  const linhaDaGostada = (t: Track) => (
    <View key={t.sourceId} style={styles.linha}>
      <Pressable onPress={() => tocar(t)} style={styles.parteTocavel}>
        <Image source={{ uri: capaParaLista(t.artworkUrl) ?? `https://i.ytimg.com/vi/${t.sourceId}/mqdefault.jpg` }} style={styles.capa} contentFit="cover" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[type.body, { fontWeight: '600' }]}>{tituloDaFaixa(t)}</Text>
          <Text numberOfLines={1} style={type.caption}>{displayArtist(t)} · In cache</Text>
        </View>
      </Pressable>
    </View>
  );

  const remover = (l: Linha) => {
    Alert.alert(
      'Remove download',
      `"${tituloDaFaixa(l.faixa)}" will no longer play offline.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void tirarDownload(l.id);
            hapticNotification();
          },
        },
      ],
    );
  };

  const limparTudo = () => {
    Alert.alert(
      'Remove all',
      'All downloads and the whole cache on this phone will be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove all',
          style: 'destructive',
          onPress: () => {
            void limparTodosOsDownloads();
            hapticNotification();
          },
        },
      ],
    );
  };

  // Um de cada vez: cada um resolve o stream antes de pedir vaga na fila, e
  // cinquenta resoluções ao mesmo tempo seriam cinquenta pedidos ao YouTube.
  const descarregarEmFalta = async () => {
    hapticSelection();
    for (const l of emFalta) {
      if (useDownloadsFixados.getState().registo.pedidos[l.id] === undefined) continue;
      await pedirDownload(l.faixa);
    }
  };

  // Tudo o que toca sem rede: os downloads que estão no disco e, a seguir, as
  // gostadas que ficaram na cache. É a fila de "Tocar" e "Aleatório", e a de
  // quem toca numa linha -- sem rede, a fila já só pára no que está aqui
  // (lib/filaSemRede.ts), mas assim nem entra o resto.
  const tocaveis = useMemo(
    () => [...linhas.filter((l) => l.situacao === 'descarregada').map((l) => l.faixa), ...tambemAqui],
    [linhas, tambemAqui],
  );
  const tocar = (faixa: Track) => {
    const dentro = tocaveis.some((t) => t.sourceId === faixa.sourceId);
    if (!dentro && offline) return;
    void playTrack(faixa, dentro ? tocaveis : [faixa], true);
  };
  const tocarTudo = (baralhar: boolean) => {
    if (!tocaveis.length) return;
    hapticSelection();
    if (baralhar) void playShuffled(tocaveis);
    else void playTrack(tocaveis[0], tocaveis, true);
  };

  return (
    <Screen title="Downloads" onBack={() => navigation.goBack()}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + MINI_PLAYER_HEIGHT + spacing.xxl }}>
        {nada ? (
          <EmptyState
            icon="arrow-down-circle-outline"
            title="Nothing saved yet"
            subtitle="Tap Download in a track's menu. It stays on this phone and plays without internet."
          />
        ) : (
          <>
            {/* Uma linha: quantos e quanto ocupam. Era um cartão com um "—"
                enorme por cima de "0 downloads", uma barra que misturava os
                downloads (que nunca saem) com a cache, e um parágrafo em
                maiúsculas. A explicação da cache passou para o fundo. */}
            <Text style={styles.resumo}>
              {linhas.length} {linhas.length === 1 ? 'download' : 'downloads'}
              {bytesDosDownloads > 0 ? ` · ${formatCacheSize(bytesDosDownloads)}` : ''}
              {emFalta.length > 0 ? ` · ${emFalta.length} not downloaded` : ''}
            </Text>

            {tocaveis.length > 0 ? (
              <View style={styles.tocarTudo}>
                {/* O texto leva a cor que o tema diz para ir em cima da cor
                    dele. Era branco fixo, e com o tema claro o "Play" ficava
                    branco sobre branco -- parecia desligado. */}
                <Pressable onPress={() => tocarTudo(false)} style={({ pressed }) => [styles.botaoGrande, { backgroundColor: tema.color }, pressed && { opacity: 0.8 }]}
                  accessibilityRole="button" accessibilityLabel="Play everything on this phone">
                  <Ionicons name="play" size={18} color={tema.textColorOnGradient} />
                  <Text style={[type.body, { color: tema.textColorOnGradient, fontWeight: '700' }]}>Play</Text>
                </Pressable>
                <Pressable onPress={() => tocarTudo(true)} style={({ pressed }) => [styles.botaoGrande, styles.botaoSecundario, pressed && { opacity: 0.8 }]}
                  accessibilityRole="button" accessibilityLabel="Shuffle everything on this phone">
                  <Ionicons name="shuffle" size={18} color={colors.text} />
                  <Text style={[type.body, { fontWeight: '700' }]}>Shuffle</Text>
                </Pressable>
              </View>
            ) : null}

            {emFalta.length > 0 && !offline ? (
              <Pressable onPress={() => void descarregarEmFalta()} style={({ pressed }) => [styles.acao, pressed && { opacity: 0.7 }]}>
                <Ionicons name="refresh" size={16} color={tema.color} />
                <Text style={[type.body, { color: tema.color, fontWeight: '600' }]}>
                  {emFalta.length === 1 ? 'Download the missing one' : `Download the ${emFalta.length} missing`}
                </Text>
              </Pressable>
            ) : null}

            {linhas.length === 0 ? (
              <Text style={[type.caption, styles.semDownloads]}>
                No downloads yet. Tap Download in a track's menu.
              </Text>
            ) : null}

            {linhas.map((l) => {
              const capa = capaParaLista(l.faixa.artworkUrl)
                ?? `https://i.ytimg.com/vi/${l.id}/mqdefault.jpg`;
              const detalhe = l.situacao === 'descarregada'
                ? formatCacheSize(l.bytes)
                : l.situacao === 'a-descarregar' ? 'Downloading…' : 'Not downloaded';
              return (
                <View key={l.id} style={styles.linha}>
                  <Pressable onPress={() => tocar(l.faixa)} style={styles.parteTocavel}>
                    <Image source={{ uri: capa }} style={styles.capa} contentFit="cover" />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={[type.body, { fontWeight: '600' }]}>
                        {tituloDaFaixa(l.faixa)}
                      </Text>
                      <Text numberOfLines={1} style={type.caption}>
                        {displayArtist(l.faixa)} · {detalhe}
                      </Text>
                    </View>
                  </Pressable>

                  {l.situacao === 'a-descarregar' ? (
                    <ActivityIndicator size="small" color={colors.textTertiary} style={styles.botao} />
                  ) : l.situacao === 'em-falta' ? (
                    <Pressable
                      onPress={() => { hapticSelection(); void pedirDownload(l.faixa); }}
                      disabled={offline}
                      hitSlop={8}
                      accessibilityLabel="Download again"
                      style={[styles.botao, offline && { opacity: 0.4 }]}
                    >
                      <Ionicons name="refresh" size={18} color={colors.textTertiary} />
                    </Pressable>
                  ) : null}

                  <Pressable onPress={() => remover(l)} hitSlop={8} accessibilityLabel="Remove download" style={styles.botao}>
                    <Ionicons name="trash-outline" size={18} color={colors.textTertiary} />
                  </Pressable>
                </View>
              );
            })}

            {tambemAqui.length > 0 ? (
              <>
                <Text style={[type.caption, styles.seccao]}>
                  ALSO ON THIS PHONE · {tambemAqui.length} liked {tambemAqui.length === 1 ? 'song' : 'songs'} in the cache
                </Text>
                {tambemAqui.map(linhaDaGostada)}
              </>
            ) : null}

            <View style={styles.rodape}>
              {/* Dizer o limite é o que torna a limpeza automática previsível
                  em vez de misteriosa. */}
              <Text style={styles.notaDoFundo}>
                Cache: {formatCacheSize(cache.bytes)} from {cache.faixas} played {cache.faixas === 1 ? 'song' : 'songs'}.
                {' '}Above {formatCacheSize(MAX_CACHE_BYTES)} in total, the oldest cached songs are removed
                automatically. Downloads are never removed.
              </Text>
              {protegidas > 0 ? (
                <Text style={styles.notaDoFundo}>
                  {protegidas} {protegidas === 1 ? 'song you already had stays protected' : 'songs you already had stay protected'}
                  {' '}until {new Date(protegidasAte).toLocaleDateString()}. To keep one, tap Download in its
                  menu — it uses no data.
                </Text>
              ) : null}
            </View>

            <Pressable onPress={limparTudo} style={({ pressed }) => [styles.limpar, pressed && { opacity: 0.7 }]}>
              <Text style={[type.body, { color: colors.danger, fontWeight: '600' }]}>
                Remove all
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
    ...type.body,
    fontWeight: '600',
    color: colors.text,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },

  acao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  semDownloads: { marginHorizontal: spacing.md, marginBottom: spacing.md },
  tocarTudo: { flexDirection: 'row', gap: spacing.sm, marginHorizontal: spacing.md, marginBottom: spacing.lg },
  botaoGrande: {
    flex: 1, height: 44, borderRadius: radii.pill ?? 22, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
  },
  botaoSecundario: { backgroundColor: colors.surface },
  seccao: { marginHorizontal: spacing.md, marginTop: spacing.lg, marginBottom: spacing.sm, letterSpacing: 0.5 },

  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    gap: spacing.sm,
  },
  parteTocavel: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minWidth: 0 },
  capa: { width: 44, height: 44, borderRadius: radii.sm, backgroundColor: colors.surfaceHigh },
  botao: { padding: 6 },

  rodape: { marginHorizontal: spacing.md, marginTop: spacing.xl, gap: spacing.sm },
  notaDoFundo: { ...type.caption, color: colors.textTertiary },

  limpar: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.md,
    padding: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
  },
});
