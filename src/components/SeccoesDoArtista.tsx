import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { DissolverEmBaixo } from './DissolverEmBaixo';
import { useFotoDoArtista } from '../hooks/useVizinhancaDoArtista';
import { legendaDoDisco } from '../lib/musicasDoArtista';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { colors, ESCALA_MAXIMA, radii, spacing } from '../theme';

/**
 * As peças da página de um artista no iPhone (20/10, variante A de
 * `docs/artista-maquete.html`): a foto a toda a largura com o nome por cima,
 * os cabeçalhos das secções, os carrosséis da discografia e os "Fans also
 * like". A página (`LibraryGroupScreen`) junta-as numa lista só.
 */

/**
 * A foto a toda a largura, a dissolver-se no fundo da app (`DissolverEmBaixo`:
 * uma máscara, não um degradê para uma cor -- o fundo pode ser a imagem
 * escurecida, e uma cor fixa deixava uma emenda), com o nome grande e a linha
 * de meta por cima. A barra de cima flutua sobre ela (`Screen` em modo herói).
 */
export function CapaDoArtista({ nome, foto, meta, aoMedirNome }: {
  nome: string;
  foto: string | null;
  meta: string | null;
  /** Onde acaba o nome, desde o topo da página: a barra mostra o nome pequeno a partir daí. */
  aoMedirNome?: (fundo: number) => void;
}) {
  const { width } = useWindowDimensions();
  // Alta o bastante para ser a cara da página, e nunca tanto que esconda as ações.
  const altura = Math.round(Math.min(460, width * 1.12));
  const [baixoY, setBaixoY] = React.useState(0);
  return (
    <View style={{ height: altura }}>
      <DissolverEmBaixo desde={0.55}>
        {foto ? (
          // Uma troca de imagem é um fundido lento (23/10): a página abre com a
          // capa que se tocou e passa para a foto quando ela se souber.
          <Image source={{ uri: foto }} style={StyleSheet.absoluteFill} contentFit="cover"
            transition={{ duration: 450, effect: 'cross-dissolve', timing: 'ease-in-out' }} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.semFoto]}>
            <Ionicons name="person" size={96} color={colors.textTertiary} />
          </View>
        )}
      </DissolverEmBaixo>
      {/* Uma sombra só por baixo do texto: numa foto clara o nome continuava a ler-se. */}
      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)']} style={styles.sombra} />
      <View style={styles.baixo} onLayout={(e) => setBaixoY(e.nativeEvent.layout.y)}>
        <Text
          accessibilityRole="header"
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          maxFontSizeMultiplier={ESCALA_MAXIMA.fixa}
          style={styles.nome}
          onLayout={aoMedirNome ? (e) => aoMedirNome(baixoY + e.nativeEvent.layout.y + e.nativeEvent.layout.height) : undefined}
        >
          {nome}
        </Text>
        {meta ? <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.meta}>{meta}</Text> : null}
      </View>
    </View>
  );
}

/** O título de uma secção ("Songs", "Albums"...), com o que for preciso à direita. */
export function CabecalhoDaSeccao({ titulo, direita }: { titulo: string; direita?: React.ReactNode }) {
  return (
    <View style={styles.seccao}>
      <Text accessibilityRole="header" maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.tituloDaSeccao}>{titulo}</Text>
      {direita}
    </View>
  );
}

type Disco = { id: string; title: string; artworkUrl: string | null; tipo: string; ano: string | null };

/** Um carrossel de discos (os álbuns, ou os singles e EPs). Sem nenhum, não aparece. */
export function DiscosDoArtista({ titulo, discos, aoAbrir }: { titulo: string; discos: readonly Disco[]; aoAbrir: (d: Disco) => void }) {
  if (!discos.length) return null;
  return (
    <View>
      <CabecalhoDaSeccao titulo={titulo} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fila}>
        {discos.map((d) => (
          <Pressable key={d.id} onPress={() => aoAbrir(d)} accessibilityRole="button"
            accessibilityLabel={`${d.title}, ${legendaDoDisco(d)}`}
            style={({ pressed }) => [styles.disco, pressed && { opacity: 0.8 }]}>
            {d.artworkUrl ? (
              <Image source={{ uri: capaParaLista(d.artworkUrl)! }} style={styles.capa} contentFit="cover" transition={200} />
            ) : (
              <View style={[styles.capa, styles.semCapa]}><Ionicons name="disc-outline" size={36} color={colors.textTertiary} /></View>
            )}
            <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.nomeDoDisco}>{d.title}</Text>
            <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.legenda}>{legendaDoDisco(d)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * "Fans also like": os parecidos do catálogo, redondos, e cada um abre a página
 * dele, com a foto que se tocou (a página abre com ela, sem trocar de imagem).
 */
export function ParecidosDoArtista({ nomes, aoAbrir }: { nomes: readonly string[]; aoAbrir: (nome: string, foto: string | null) => void }) {
  if (!nomes.length) return null;
  return (
    <View>
      <CabecalhoDaSeccao titulo="Fans also like" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fila}>
        {nomes.map((n) => <Parecido key={n} nome={n} aoAbrir={aoAbrir} />)}
      </ScrollView>
    </View>
  );
}

function Parecido({ nome, aoAbrir }: { nome: string; aoAbrir: (nome: string, foto: string | null) => void }) {
  const foto = useFotoDoArtista(nome);
  return (
    <Pressable onPress={() => aoAbrir(nome, foto)} accessibilityRole="button" accessibilityLabel={nome}
      style={({ pressed }) => [styles.parecido, pressed && { opacity: 0.8 }]}>
      {foto ? <Image source={{ uri: foto }} style={styles.fotoRedonda} contentFit="cover" transition={200} />
        : <View style={[styles.fotoRedonda, styles.semCapa]}><Ionicons name="person" size={34} color={colors.textTertiary} /></View>}
      <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.nomeDoParecido}>{nome}</Text>
    </Pressable>
  );
}

const LADO_DO_DISCO = 140;
const LADO_DO_PARECIDO = 96;

const styles = StyleSheet.create({
  semFoto: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  sombra: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 150 },
  baixo: { position: 'absolute', left: spacing.xl, right: spacing.xl, bottom: spacing.sm },
  nome: { fontSize: 44, lineHeight: 48, fontWeight: '800', letterSpacing: -0.8, color: colors.text },
  meta: { fontSize: 14, fontWeight: '500', color: colors.textSecondary, marginTop: 4 },
  seccao: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md,
    paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.sm,
  },
  tituloDaSeccao: { fontSize: 22, fontWeight: '700', letterSpacing: -0.2, color: colors.text },
  fila: { paddingHorizontal: spacing.xl, gap: spacing.md },
  disco: { width: LADO_DO_DISCO, gap: 4 },
  capa: { width: LADO_DO_DISCO, height: LADO_DO_DISCO, borderRadius: radii.md, borderCurve: 'continuous', backgroundColor: colors.surface },
  semCapa: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  nomeDoDisco: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 4 },
  legenda: { fontSize: 12, color: colors.textSecondary },
  parecido: { width: LADO_DO_PARECIDO, alignItems: 'center', gap: 6 },
  fotoRedonda: { width: LADO_DO_PARECIDO, height: LADO_DO_PARECIDO, borderRadius: LADO_DO_PARECIDO / 2, backgroundColor: colors.surface },
  nomeDoParecido: { fontSize: 13, fontWeight: '600', color: colors.text, textAlign: 'center', alignSelf: 'stretch' },
});
