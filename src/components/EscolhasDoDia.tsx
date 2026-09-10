import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  lerEscolhasDoDia, subscreverEscolhasDoDia, type EscolhaDoDia,
} from '../api/escolhaDoDia';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { ESCALA } from '../lib/movimento';
import { usePlayer } from '../state/player';
import { useTheme } from '../state/theme';
import { colors, radii, spacing, type } from '../theme';
import { FriendAvatar } from './FriendAvatar';
import { Toque } from './Toque';

/**
 * A vista própria das músicas do dia.
 *
 * Escolher deixou de viver aqui: faz-se uma vez, sobre a música que está a
 * tocar, no menu do leitor. Esta página é o destino da escolha — não um cartão
 * vazio misturado com recomendações e com os amigos que estão online.
 */
export function EscolhasDoDia({ bottomPadding = spacing.xxl }: { bottomPadding?: number }) {
  const tema = useTheme((s) => s.theme);
  const playTrack = usePlayer((s) => s.playTrack);
  const [escolhas, setEscolhas] = React.useState<EscolhaDoDia[]>([]);
  const [aCarregar, setACarregar] = React.useState(true);

  const carregar = React.useCallback(() => {
    void lerEscolhasDoDia()
      .then(setEscolhas)
      .finally(() => setACarregar(false));
  }, []);

  React.useEffect(() => {
    carregar();
    return subscreverEscolhasDoDia(carregar);
  }, [carregar]);

  const minha = escolhas.some((e) => e.souEu);
  const fila = React.useMemo(() => escolhas.map((e) => e.track), [escolhas]);

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.conteudo, { paddingBottom: bottomPadding }]}
    >
      <View style={styles.cabecalho}>
        <Text style={styles.titulo}>Songs of the day</Text>
        <Text style={styles.subtitulo}>
          {minha
            ? 'Your pick is set for today. See what your friends chose.'
            : 'Pick one song from the now playing menu. One choice, until tomorrow.'}
        </Text>
      </View>

      {aCarregar ? (
        <ActivityIndicator color={tema.color} style={styles.carregando} />
      ) : escolhas.length === 0 ? (
        <View style={styles.vazio}>
          <View style={[styles.iconeVazio, { backgroundColor: tema.soft }]}>
            <Ionicons name="today-outline" size={28} color={tema.color} />
          </View>
          <Text style={styles.vazioTitulo}>No picks yet today</Text>
          <Text style={styles.vazioTexto}>
            Start a song, open its menu and choose “Make this today’s pick”.
          </Text>
        </View>
      ) : (
        <View style={styles.lista}>
          {escolhas.map((e) => (
            <Toque
              key={e.userId}
              escala={ESCALA.cartao}
              onPress={() => void playTrack(e.track, fila, true)}
              accessibilityRole="button"
              accessibilityLabel={`${e.souEu ? 'Your pick' : `${e.nome || e.username}'s pick`}: ${tituloDaFaixa(e.track)}`}
              style={styles.linha}
            >
              {e.track.artworkUrl ? (
                <Image source={{ uri: e.track.artworkUrl }} style={styles.capa} contentFit="cover" transition={150} />
              ) : (
                <View style={[styles.capa, styles.capaVazia]}>
                  <Ionicons name="musical-note" size={22} color={colors.textTertiary} />
                </View>
              )}
              <View style={styles.texto}>
                <View style={styles.pessoa}>
                  <FriendAvatar avatarUrl={e.avatar} name={e.nome || e.username || '?'} size={20} />
                  <Text numberOfLines={1} style={styles.nome}>
                    {e.souEu ? 'You' : e.nome || e.username}
                  </Text>
                </View>
                <Text numberOfLines={1} style={styles.faixa}>{tituloDaFaixa(e.track)}</Text>
                <Text numberOfLines={1} style={styles.artista}>
                  {e.nota || displayArtist(e.track)}
                </Text>
              </View>
              <Ionicons name="play-circle" size={27} color={tema.color} />
            </Toque>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  conteudo: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  cabecalho: { marginBottom: spacing.xl, gap: spacing.xs },
  titulo: { ...type.title, fontSize: 24 },
  subtitulo: { ...type.caption, lineHeight: 19, maxWidth: 330 },
  carregando: { marginTop: 72 },
  vazio: { alignItems: 'center', paddingTop: 54, paddingHorizontal: spacing.xl },
  iconeVazio: {
    width: 58, height: 58, borderRadius: 29,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
  },
  vazioTitulo: { ...type.headline, marginBottom: spacing.xs },
  vazioTexto: { ...type.caption, textAlign: 'center', lineHeight: 19, maxWidth: 290 },
  lista: { gap: spacing.sm },
  linha: {
    minHeight: 82,
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.sm, paddingRight: spacing.md,
    borderRadius: radii.md, backgroundColor: colors.surface,
  },
  capa: { width: 66, height: 66, borderRadius: radii.sm, backgroundColor: colors.surfaceHigh },
  capaVazia: { alignItems: 'center', justifyContent: 'center' },
  texto: { flex: 1, minWidth: 0, gap: 2 },
  pessoa: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  nome: { ...type.micro, flex: 1, color: colors.textSecondary },
  faixa: { ...type.body, fontWeight: '700' },
  artista: { ...type.caption, fontSize: 12 },
});
