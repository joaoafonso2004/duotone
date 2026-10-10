import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { legendaDoLancamento, type Lancamento } from '../lib/novosLancamentos';
import { useNovosLancamentos } from '../state/novosLancamentos';
import { useTheme } from '../state/theme';
import { textoSobre } from '../lib/corDaCapa';
import { colors, ESCALA_MAXIMA, radii, spacing } from '../theme';

const LADO = 140;

/**
 * "New releases" na Home do iPhone (10/10, `state/novosLancamentos.ts`): os
 * álbuns, EPs e singles dos teus artistas. Os novos levam "New" na cor do
 * tema; tocar abre a mesma folha dos álbuns da página do artista. Sem nada
 * para mostrar, não aparece.
 */
export function NovosLancamentos({ aoAbrir }: { aoAbrir: (l: Lancamento) => void }) {
  const itens = useNovosLancamentos((s) => s.itens);
  const cor = useTheme((s) => s.theme.color);
  if (!itens.length) return null;
  return (
    <View style={styles.seccao}>
      <View style={styles.cabecalho}>
        <Text accessibilityRole="header" style={styles.titulo}>New releases</Text>
        <Text numberOfLines={1} style={styles.nota}>From the artists you listen to</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fila}>
        {itens.map(({ lancamento: l, novo }) => (
          <Pressable
            key={l.id}
            onPress={() => aoAbrir(l)}
            accessibilityRole="button"
            accessibilityLabel={`${novo ? 'New. ' : ''}${l.titulo}, ${legendaDoLancamento(l)}`}
            style={({ pressed }) => [styles.cartao, pressed && { opacity: 0.8 }]}
          >
            <View>
              {l.capa ? (
                <Image source={{ uri: l.capa }} style={styles.capa} contentFit="cover" transition={200} />
              ) : (
                <View style={[styles.capa, styles.semCapa]}>
                  <Ionicons name="disc-outline" size={36} color={colors.textTertiary} />
                </View>
              )}
              {novo ? (
                <View style={[styles.selo, { backgroundColor: cor }]} pointerEvents="none">
                  <Text style={[styles.seloTexto, { color: textoSobre(cor) }]}>New</Text>
                </View>
              ) : null}
            </View>
            <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.nome}>{l.titulo}</Text>
            <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.legenda}>{legendaDoLancamento(l)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  seccao: { marginTop: spacing.lg, gap: spacing.sm },
  cabecalho: { paddingHorizontal: spacing.xl },
  titulo: { fontSize: 22, fontWeight: '700', letterSpacing: -0.2, color: colors.text },
  nota: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  fila: { paddingHorizontal: spacing.xl, gap: spacing.md },
  cartao: { width: LADO, gap: 4 },
  capa: { width: LADO, height: LADO, borderRadius: radii.md, borderCurve: 'continuous', backgroundColor: colors.surface },
  semCapa: { alignItems: 'center', justifyContent: 'center' },
  selo: { position: 'absolute', top: 6, left: 6, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radii.pill },
  seloTexto: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  nome: { fontSize: 13, fontWeight: '600', color: colors.text, marginTop: 4 },
  legenda: { fontSize: 11, color: colors.textSecondary },
});
