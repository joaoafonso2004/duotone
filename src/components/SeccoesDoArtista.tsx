import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { DissolverEmBaixo } from './DissolverEmBaixo';
import { useFotoDoArtista } from '../hooks/useVizinhancaDoArtista';
import { legendaDoDisco } from '../lib/musicasDoArtista';
import { fotoNoTamanho } from '../lib/catalogo';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { useCorDoAmbiente } from '../hooks/useCorDoAmbiente';
import { degradeDaCorDaCapa, EXTENSAO_DO_AMBIENTE } from '../lib/profileImageCrop';
import { colors, ESCALA_MAXIMA, radii, spacing } from '../theme';
import type { Track } from '../types';

/**
 * As peças da página de um artista no iPhone (23/10, `docs/artista-ios-maquete.html`,
 * escolhida pelo João). A página (`LibraryGroupScreen`) junta-as num scroll só:
 * a foto a toda a largura com o nome e as ações por cima, a cor da foto a
 * descer pela página, as Top Songs numa grelha que se folheia de lado, o
 * último lançamento em destaque, a discografia, os parecidos e o About.
 */

/** A altura do cabeçalho: alto o bastante para ser a cara da página, e nunca a página toda. */
export function alturaDaCapaDoArtista(largura: number): number {
  return Math.round(Math.min(540, largura * 1.38));
}

/**
 * A cor da foto, a descer pela página (como no perfil, `ProfileHero`): a
 * característica da imagem puxada para o fundo da app até o branco se ler por
 * cima (`corDoAmbiente`), cheia por trás da foto e a apagar-se mais abaixo.
 * Lê-se uma vez por imagem (em cache, `lerCelulasDaCapa`); sem ela fica o fundo.
 */
export function FundoDaCorDoArtista({ foto, altura }: { foto: string | null; altura: number }) {
  const cor = useCorDoAmbiente(foto);
  if (!cor || !(altura > 0)) return null;
  const d = degradeDaCorDaCapa(altura, cor);
  return (
    <LinearGradient pointerEvents="none" colors={d.cores as any} locations={d.paragens as any}
      style={{ position: 'absolute', left: 0, right: 0, top: 0, height: altura + EXTENSAO_DO_AMBIENTE }} />
  );
}

/**
 * A foto a toda a largura, a dissolver-se na cor da página, com o nome grande,
 * os números e as ações por cima. A barra de cima flutua sobre ela (`Screen`
 * em modo herói).
 */
export function CapaDoArtista({ nome, foto, fas, tuas, accoes, aoMedirNome }: {
  nome: string;
  foto: string | null;
  /** "839K fans", ou nada. */
  fas: string | null;
  /** "29 in your library", ou nada (nunca "0"). */
  tuas: string | null;
  accoes?: React.ReactNode;
  /** Onde acaba o nome, desde o topo da página: a barra mostra o nome pequeno a partir daí. */
  aoMedirNome?: (fundo: number) => void;
}) {
  const { width } = useWindowDimensions();
  const altura = alturaDaCapaDoArtista(width);
  // Onde acaba o nome = onde começa o bloco de baixo + onde acaba o nome nele.
  // As duas medidas chegam por ordem incerta: o nome chegava primeiro, com o
  // bloco ainda a 0, e a barra mostrava o nome pequeno a uns 110 pt em vez de
  // ~420 (23/10, João: "o nome de cima só devia aparecer quando o scroll
  // passasse o nome que está na página"). Avisa-se quando há as duas.
  const baixoY = React.useRef<number | null>(null);
  const fimNoBloco = React.useRef<number | null>(null);
  const avisar = () => {
    if (aoMedirNome && baixoY.current != null && fimNoBloco.current != null) aoMedirNome(baixoY.current + fimNoBloco.current);
  };
  return (
    <View style={{ height: altura }}>
      <DissolverEmBaixo desde={0.5}>
        {foto ? (
          // Uma troca de imagem é um fundido lento (23/10): a página abre com a
          // capa que se tocou e passa para a foto quando ela se souber. A foto
          // pequena da grelha (já em cache) segura o lugar enquanto a grande chega.
          <Image source={{ uri: foto }} placeholder={{ uri: fotoNoTamanho(foto, 250) }} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top"
            transition={{ duration: 450, effect: 'cross-dissolve', timing: 'ease-in-out' }} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.semFoto]}>
            <Ionicons name="person" size={96} color={colors.textTertiary} />
          </View>
        )}
      </DissolverEmBaixo>
      {/* A barra de estado e os botões de cima leem-se em qualquer foto. */}
      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.38)', 'rgba(0,0,0,0)']} style={styles.sombraDeCima} />
      <View style={styles.baixo} onLayout={(e) => { baixoY.current = e.nativeEvent.layout.y; avisar(); }}>
        <Text
          accessibilityRole="header"
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          maxFontSizeMultiplier={ESCALA_MAXIMA.fixa}
          style={styles.nome}
          onLayout={(e) => { fimNoBloco.current = e.nativeEvent.layout.y + e.nativeEvent.layout.height; avisar(); }}
        >
          {nome}
        </Text>
        {fas || tuas ? (
          <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.meta}>
            {fas ? <Text style={styles.metaForte}>{fas}</Text> : null}
            {fas && tuas ? '  ·  ' : null}
            {tuas}
          </Text>
        ) : null}
        {accoes ? <View style={styles.accoes}>{accoes}</View> : null}
      </View>
    </View>
  );
}

/** Um botão redondo de vidro (voltar, coração, shuffle), como os do perfil. */
export function BolaDeVidro({ icone, label, onPress, ativo = false, lado = 44, desligado = false }: {
  icone: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  ativo?: boolean;
  lado?: number;
  desligado?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: ativo, disabled: desligado }}
      disabled={desligado} onPress={onPress} hitSlop={6}
      style={({ pressed }) => [styles.vidro, { width: lado, height: lado, borderRadius: lado / 2 },
        ativo && styles.vidroAtivo, pressed && styles.vidroCarregado, desligado && { opacity: 0.5 }]}>
      <Ionicons name={icone} size={Math.round(lado * 0.44)} color={colors.text} />
    </Pressable>
  );
}

/** Uma pílula de vidro com texto (o Mix). */
export function PilulaDeVidro({ icone, texto, label, onPress, ocupado = false }: {
  icone: keyof typeof Ionicons.glyphMap;
  texto: string;
  label: string;
  onPress: () => void;
  ocupado?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ busy: ocupado }}
      disabled={ocupado} onPress={onPress} hitSlop={4}
      style={({ pressed }) => [styles.vidro, styles.pilula, pressed && styles.vidroCarregado]}>
      {ocupado ? <ActivityIndicator size="small" color={colors.text} /> : <Ionicons name={icone} size={18} color={colors.text} />}
      <Text maxFontSizeMultiplier={ESCALA_MAXIMA.fixa} style={styles.pilulaTexto}>{texto}</Text>
    </Pressable>
  );
}

/** O Play: o único botão branco da página. */
export function BotaoDeTocar({ label, onPress, lado = 64, desligado = false }: {
  label: string; onPress: () => void; lado?: number; desligado?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: desligado }}
      disabled={desligado} onPress={onPress}
      style={({ pressed }) => [styles.tocar, { width: lado, height: lado, borderRadius: lado / 2 },
        pressed && { transform: [{ scale: 0.96 }] }, desligado && { opacity: 0.5 }]}>
      {/* O `marginLeft` acerta o centro ótico do triângulo. */}
      <Ionicons name="play" size={Math.round(lado * 0.4)} color="#0B0B0E" style={{ marginLeft: Math.round(lado * 0.06) }} />
    </Pressable>
  );
}

/** O título de uma secção; com `aoCarregar`, leva um "›" e abre o resto. */
export function CabecalhoDaSeccao({ titulo, direita, aoCarregar }: { titulo: string; direita?: React.ReactNode; aoCarregar?: () => void }) {
  const texto = <Text accessibilityRole="header" maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.tituloDaSeccao}>{titulo}</Text>;
  return (
    <View style={styles.seccao}>
      {aoCarregar ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${titulo}, see all`} onPress={aoCarregar} hitSlop={8}
          style={({ pressed }) => [styles.seccaoToque, pressed && { opacity: 0.6 }]}>
          {texto}
          <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} style={{ marginTop: 2 }} />
        </Pressable>
      ) : texto}
      {direita}
    </View>
  );
}

/** Quantas músicas há em cada coluna das Top Songs. */
export const MUSICAS_POR_COLUNA = 4;

/**
 * As Top Songs: colunas de quatro que se folheiam de lado, como na Apple Music.
 * A seguinte espreita à direita, e os pontos dizem em que página se está. São
 * as primeiras da lista sem botão nenhum e sem empurrar o resto da página.
 */
export function GrelhaDeMusicas({ musicas, renderLinha }: { musicas: readonly Track[]; renderLinha: (t: Track) => React.ReactNode }) {
  const { width } = useWindowDimensions();
  // A coluna seguinte espreita: a largura menos o que se vê dela.
  const largura = Math.max(240, width - 36);
  const colunas = React.useMemo(() => {
    const fora: Track[][] = [];
    for (let i = 0; i < musicas.length; i += MUSICAS_POR_COLUNA) fora.push(musicas.slice(i, i + MUSICAS_POR_COLUNA) as Track[]);
    return fora;
  }, [musicas]);
  const [pagina, setPagina] = React.useState(0);
  React.useEffect(() => { setPagina(0); }, [colunas.length]);
  if (!colunas.length) return null;
  return (
    <View>
      <FlatList
        horizontal
        data={colunas}
        keyExtractor={(c, i) => `${i}:${c[0]?.sourceId}`}
        renderItem={({ item }) => <View style={{ width: largura }}>{item.map((t) => <React.Fragment key={`${t.source}:${t.sourceId}`}>{renderLinha(t)}</React.Fragment>)}</View>}
        showsHorizontalScrollIndicator={false}
        snapToInterval={largura}
        decelerationRate="fast"
        disableIntervalMomentum
        onMomentumScrollEnd={(e) => setPagina(Math.round(e.nativeEvent.contentOffset.x / largura))}
        getItemLayout={(_d, i) => ({ length: largura, offset: largura * i, index: i })}
        initialNumToRender={2}
        windowSize={3}
      />
      {colunas.length > 1 ? (
        <View style={styles.pontos} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {colunas.map((_c, i) => <View key={i} style={[styles.ponto, i === pagina && styles.pontoAtivo]} />)}
        </View>
      ) : null}
    </View>
  );
}

type Disco = { id: string; title: string; artworkUrl: string | null; tipo: string; ano: string | null };

/** O último lançamento em destaque: a capa grande, o ano e o tipo. Abre o disco. */
export function LancamentoEmDestaque({ album, aoAbrir }: { album: Disco; aoAbrir: (d: Disco) => void }) {
  return (
    <View>
      <CabecalhoDaSeccao titulo="Latest Release" />
      <Pressable accessibilityRole="button" accessibilityLabel={`Latest release, ${album.title}, ${legendaDoDisco(album)}`}
        onPress={() => aoAbrir(album)} style={({ pressed }) => [styles.lancamento, pressed && { opacity: 0.8 }]}>
        {album.artworkUrl ? (
          <Image source={{ uri: capaParaLista(album.artworkUrl)! }} style={styles.lancamentoCapa} contentFit="cover" transition={200} />
        ) : (
          <View style={[styles.lancamentoCapa, styles.semCapa]}><Ionicons name="disc-outline" size={40} color={colors.textTertiary} /></View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          {album.ano ? <Text maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.lancamentoAno}>{album.ano}</Text> : null}
          <Text numberOfLines={2} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.lancamentoTitulo}>{album.title}</Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.legenda}>{album.tipo.trim() || 'Album'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
      </Pressable>
    </View>
  );
}

/** Um carrossel de discos (os álbuns maiores, os singles e EPs mais pequenos). Sem nenhum, não aparece. */
export function DiscosDoArtista({ titulo, discos, aoAbrir, lado = 168 }: {
  titulo: string; discos: readonly Disco[]; aoAbrir: (d: Disco) => void; lado?: number;
}) {
  if (!discos.length) return null;
  return (
    <View>
      <CabecalhoDaSeccao titulo={titulo} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fila}>
        {discos.map((d) => (
          <Pressable key={d.id} onPress={() => aoAbrir(d)} accessibilityRole="button"
            accessibilityLabel={`${d.title}, ${legendaDoDisco(d)}`}
            style={({ pressed }) => [{ width: lado }, pressed && { opacity: 0.8 }]}>
            {d.artworkUrl ? (
              <Image source={{ uri: capaParaLista(d.artworkUrl)! }} style={[styles.capa, { width: lado, height: lado }]} contentFit="cover" transition={200} />
            ) : (
              <View style={[styles.capa, styles.semCapa, { width: lado, height: lado }]}><Ionicons name="disc-outline" size={36} color={colors.textTertiary} /></View>
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
 * "Fans Also Like": os parecidos do catálogo, redondos, e cada um abre a página
 * dele, com a foto que se tocou (a página abre com ela, sem trocar de imagem).
 */
export function ParecidosDoArtista({ nomes, aoAbrir }: { nomes: readonly string[]; aoAbrir: (nome: string, foto: string | null) => void }) {
  if (!nomes.length) return null;
  return (
    <View>
      <CabecalhoDaSeccao titulo="Fans Also Like" />
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
        : <View style={[styles.fotoRedonda, styles.semCapa]}><Ionicons name="person" size={36} color={colors.textTertiary} /></View>}
      <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.nomeDoParecido}>{nome}</Text>
    </Pressable>
  );
}

/**
 * O fecho da página: um cartão com a foto, os fãs e os teus números (os que a
 * página já tem; nenhum pedido a mais). Sem os fãs do catálogo não aparece.
 */
export function SobreOArtista({ foto, fas, numeros }: { foto: string | null; fas: string; numeros: { valor: number; rotulo: string }[] }) {
  const [valor, ...resto] = fas.split(' ');
  return (
    <View>
      <CabecalhoDaSeccao titulo="About" />
      <View style={styles.sobre} accessible accessibilityLabel={[fas, ...numeros.map((n) => `${n.valor} ${n.rotulo}`)].join(', ')}>
        {foto ? <Image source={{ uri: foto }} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" transition={200} /> : null}
        <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.82)']} locations={[0.3, 1]} style={StyleSheet.absoluteFill} />
        <View style={styles.sobreDentro}>
          <Text maxFontSizeMultiplier={ESCALA_MAXIMA.fixa} style={styles.sobreValor}>{valor}</Text>
          <Text maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.sobreRotulo}>{resto.join(' ')}</Text>
          {numeros.length ? (
            <View style={styles.sobreLinha}>
              {numeros.map((n) => (
                <View key={n.rotulo}>
                  <Text maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.sobreNumero}>{n.valor}</Text>
                  <Text maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.sobreRotulo}>{n.rotulo}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const LADO_DO_PARECIDO = 116;

const styles = StyleSheet.create({
  semFoto: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  sombraDeCima: { position: 'absolute', left: 0, right: 0, top: 0, height: 140 },
  baixo: { position: 'absolute', left: spacing.xl, right: spacing.xl, bottom: 0 },
  nome: { fontSize: 58, lineHeight: 56, fontWeight: '800', letterSpacing: -2, color: colors.text },
  meta: { fontSize: 15, color: 'rgba(245,245,247,0.78)', marginTop: 10 },
  metaForte: { color: colors.text, fontWeight: '600' },
  accoes: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 },
  vidro: {
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,10,15,0.42)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.2)',
  },
  vidroAtivo: { backgroundColor: 'rgba(245,245,247,0.22)', borderColor: 'rgba(255,255,255,0.45)' },
  vidroCarregado: { backgroundColor: colors.surfacePressed },
  pilula: { flexDirection: 'row', gap: 8, height: 42, borderRadius: 21, paddingLeft: 12, paddingRight: 16 },
  pilulaTexto: { fontSize: 15, fontWeight: '600', color: colors.text },
  tocar: {
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F5F7',
    shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 15, shadowOffset: { width: 0, height: 10 },
  },
  seccao: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md,
    paddingHorizontal: spacing.xl, paddingTop: 34, paddingBottom: 12,
  },
  seccaoToque: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tituloDaSeccao: { fontSize: 23, fontWeight: '700', letterSpacing: -0.4, color: colors.text },
  pontos: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 },
  ponto: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.22)' },
  pontoAtivo: { backgroundColor: 'rgba(255,255,255,0.8)' },
  lancamento: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: spacing.xl },
  lancamentoCapa: {
    width: 148, height: 148, borderRadius: radii.md, borderCurve: 'continuous', backgroundColor: colors.surface,
  },
  lancamentoAno: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, color: colors.textSecondary },
  lancamentoTitulo: { fontSize: 20, lineHeight: 23, fontWeight: '700', letterSpacing: -0.3, color: colors.text, marginTop: 6 },
  fila: { paddingHorizontal: spacing.xl, gap: 14 },
  capa: { borderRadius: radii.md, borderCurve: 'continuous', backgroundColor: colors.surface },
  semCapa: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  nomeDoDisco: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2, color: colors.text, marginTop: 10 },
  legenda: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  parecido: { width: LADO_DO_PARECIDO, alignItems: 'center', gap: 10 },
  fotoRedonda: { width: LADO_DO_PARECIDO, height: LADO_DO_PARECIDO, borderRadius: LADO_DO_PARECIDO / 2, backgroundColor: colors.surface },
  nomeDoParecido: { fontSize: 14, fontWeight: '500', color: colors.text, textAlign: 'center', alignSelf: 'stretch' },
  sobre: {
    marginHorizontal: spacing.xl, height: 300, borderRadius: 22, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: colors.surface,
  },
  sobreDentro: { position: 'absolute', left: 18, right: 18, bottom: 18 },
  sobreValor: { fontSize: 40, lineHeight: 42, fontWeight: '800', letterSpacing: -1, color: colors.text },
  sobreRotulo: { fontSize: 13, color: 'rgba(245,245,247,0.75)', marginTop: 2 },
  sobreLinha: {
    flexDirection: 'row', gap: 22, marginTop: 16, paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.22)',
  },
  sobreNumero: { fontSize: 18, fontWeight: '700', color: colors.text },
});
