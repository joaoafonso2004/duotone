import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { pesquisarFaixas } from '../api/search';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { usePlayer } from '../state/player';
import { usePlaylists } from '../state/playlists';
import { colors, spacing, type } from '../theme';
import type { Playlist, Track } from '../types';
import { BottomSheet, BottomSheetScrollView } from './BottomSheet';

/**
 * Mandar música a partir da conversa (9/10, docs/PLANO-SOCIAL-IOS.md, fase 2):
 * o que estás a ouvir, as próximas da tua fila, a pesquisa e as tuas
 * playlists. Antes só se escrevia texto; mandar uma música obrigava a sair.
 *
 * Não pede nada à rede por si: a pesquisa só corre com texto, e as playlists
 * vêm da lista que a app já tem.
 */
export function EnviarMusica({ visible, onClose, onEnviar }: {
  visible: boolean;
  onClose: () => void;
  onEnviar: (tipo: 'track' | 'playlist', item: Track | Pick<Playlist, 'id' | 'name'>) => void;
}) {
  const atual = usePlayer((s) => s.current);
  const proximas = visible ? usePlayer.getState().upcomingQueue().slice(0, 4).map((p) => p.track) : [];
  const playlists = usePlaylists((s) => s.items);
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<Track[]>([]);
  const [aProcurar, setAProcurar] = useState(false);

  useEffect(() => { if (!visible) { setTexto(''); setResultados([]); } }, [visible]);
  useEffect(() => {
    const q = texto.trim();
    if (q.length < 2) { setResultados([]); setAProcurar(false); return; }
    const controlo = new AbortController();
    setAProcurar(true);
    const t = setTimeout(() => {
      pesquisarFaixas(q, controlo.signal)
        .then((r) => setResultados(r.slice(0, 8)))
        .catch(() => setResultados([]))
        .finally(() => setAProcurar(false));
    }, 400);
    return () => { clearTimeout(t); controlo.abort(); };
  }, [texto]);

  const faixa = (t: Track, rotulo?: string) => {
    const capa = capaParaLista(t.artworkUrl);
    return (
      <Pressable key={`${rotulo ?? ''}${t.source}:${t.sourceId}`} accessibilityRole="button"
        accessibilityLabel={`Send ${tituloDaFaixa(t)}`} onPress={() => onEnviar('track', t)}
        style={({ pressed }) => [styles.linha, pressed && styles.premida]}>
        {capa ? <Image source={{ uri: capa }} style={styles.capa} contentFit="cover" /> : <View style={[styles.capa, styles.semCapa]}><Ionicons name="musical-notes" size={16} color={colors.textTertiary} /></View>}
        <View style={{ flex: 1, minWidth: 0 }}>
          {rotulo ? <Text style={styles.rotulo}>{rotulo}</Text> : null}
          <Text numberOfLines={1} style={styles.titulo}>{tituloDaFaixa(t)}</Text>
          <Text numberOfLines={1} style={type.caption}>{displayArtist(t)}</Text>
        </View>
        <Ionicons name="paper-plane-outline" size={18} color={colors.textSecondary} />
      </Pressable>
    );
  };

  const q = texto.trim();
  return (
    <BottomSheet visible={visible} onClose={onClose} titulo="Send music">
      <TextInput value={texto} onChangeText={setTexto} placeholder="Search songs" placeholderTextColor={colors.textSecondary}
        autoCorrect={false} autoCapitalize="none" accessibilityLabel="Search songs to send" style={styles.pesquisa} />
      <BottomSheetScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
        {q.length >= 2 ? (
          aProcurar && !resultados.length ? <ActivityIndicator color={colors.text} style={{ marginVertical: spacing.xl }} />
            : resultados.length ? resultados.map((t) => faixa(t))
              : <Text style={styles.vazio}>No songs found.</Text>
        ) : (
          <>
            {atual ? faixa(atual, 'Now playing') : null}
            {proximas.length ? <Text style={styles.seccao}>Up next</Text> : null}
            {proximas.map((t) => faixa(t))}
            {playlists.length ? <Text style={styles.seccao}>Your playlists</Text> : null}
            {playlists.slice(0, 12).map((p) => (
              <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Send playlist ${p.name}`}
                onPress={() => onEnviar('playlist', { id: p.id, name: p.name })}
                style={({ pressed }) => [styles.linha, pressed && styles.premida]}>
                {p.artworks?.[0] ? <Image source={{ uri: capaParaLista(p.artworks[0]) ?? p.artworks[0] }} style={styles.capa} contentFit="cover" />
                  : <View style={[styles.capa, styles.semCapa]}><Ionicons name="albums-outline" size={16} color={colors.textTertiary} /></View>}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={styles.titulo}>{p.name}</Text>
                  <Text numberOfLines={1} style={type.caption}>{p.trackCount} {p.trackCount === 1 ? 'song' : 'songs'}</Text>
                </View>
                <Ionicons name="paper-plane-outline" size={18} color={colors.textSecondary} />
              </Pressable>
            ))}
          </>
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  pesquisa: {
    minHeight: 40, borderRadius: 12, borderCurve: 'continuous', backgroundColor: colors.surface,
    color: colors.text, paddingHorizontal: 14, fontSize: 15, marginBottom: spacing.sm,
  },
  linha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 7, borderRadius: 10 },
  premida: { backgroundColor: 'rgba(255,255,255,0.05)' },
  capa: { width: 44, height: 44, borderRadius: 7, backgroundColor: colors.surfaceHigh },
  semCapa: { alignItems: 'center', justifyContent: 'center' },
  rotulo: { fontSize: 11, fontWeight: '700', color: colors.textTertiary, marginBottom: 1 },
  titulo: { fontSize: 15, fontWeight: '600', color: colors.text },
  seccao: { fontSize: 13, fontWeight: '600', color: colors.textTertiary, marginTop: spacing.md, marginBottom: 2 },
  vazio: { ...type.caption, textAlign: 'center', paddingVertical: spacing.xl },
});
