import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurView } from 'expo-blur';
import React, { useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, ViewStyle, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FUNDO_APARECE_EM, geometriaDoTitulo } from '../lib/tituloQueEncolhe';
import { colors, spacing, type } from '../theme';
import { fonteDosTitulos } from '../lib/aparencia';
import { useAparencia } from '../state/aparencia';

/**
 * O título que encolhe ao rolar (3/10, variante B). O ecrã cria-o com
 * `useCabecalhoQueEncolhe()`, passa-o ao `Screen` (`encolhe`) e liga a sua
 * lista principal (`Animated.FlatList`/`Animated.ScrollView`):
 * `onScroll={cab.onScroll} scrollEventThrottle={16}` e um espaço no topo de
 * `cab.espaco` (o cabeçalho flutua por cima da lista). Ver lib/tituloQueEncolhe.ts.
 */
export type CabecalhoQueEncolhe = {
  rolagem: Animated.Value;
  onScroll: (...args: any[]) => void;
  scrollEventThrottle: number;
  /** A altura do cabeçalho aberto: o espaço no topo da lista. */
  espaco: number;
  definirEspaco: (altura: number) => void;
  /** Volta ao cabeçalho aberto (uma lista trocada por outra que começa no topo). */
  repor: () => void;
};

export function useCabecalhoQueEncolhe(): CabecalhoQueEncolhe {
  const insets = useSafeAreaInsets();
  const rolagem = useRef(new Animated.Value(0)).current;
  // Uma estimativa até o cabeçalho se medir: a lista não salta no arranque.
  const [espaco, setEspaco] = useState(insets.top + 96);
  const onScroll = useMemo(
    () => Animated.event([{ nativeEvent: { contentOffset: { y: rolagem } } }], { useNativeDriver: true }),
    [rolagem],
  );
  return useMemo(() => ({
    rolagem,
    onScroll,
    scrollEventThrottle: 16,
    espaco,
    definirEspaco: (a: number) => setEspaco((antes) => (Math.abs(antes - a) > 0.5 ? a : antes)),
    repor: () => rolagem.setValue(0),
  }), [rolagem, onScroll, espaco]);
}

interface Props {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  /** Fila pequena acima do título (ex.: botão de Definições) — canto superior esquerdo. */
  topLeft?: React.ReactNode;
  onBack?: () => void;
  children: React.ReactNode;
  style?: ViewStyle;
  /** O título encolhe ao rolar a lista (ver `useCabecalhoQueEncolhe`). */
  encolhe?: CabecalhoQueEncolhe;
  /** O que fica por baixo do título e sobe com ele (a pesquisa, os botões). Só com `encolhe`. */
  fixo?: React.ReactNode;
  /**
   * Páginas com a capa grande e o nome DENTRO da lista (playlist, artista):
   * sem `title`, com `encolhe`, a barra de cima (o `topLeft`) fica presa e
   * transparente sobre a capa; quando o nome grande passa por baixo dela
   * (`aparecerEm`, em pontos de scroll), ganha o desfoque e o nome pequeno ao
   * centro (3/10).
   */
  tituloCompacto?: { texto: string; aparecerEm: number };
  /** Modo herói: a barra fica sempre com fundo (a editar, por cima da lista). */
  fundoSempre?: boolean;
}

/** Wrapper de ecrã: fundo, safe area e cabeçalho com título grande. */
export function Screen(props: Props) {
  if (props.encolhe && props.title) return <ScreenQueEncolhe {...props} cab={props.encolhe} />;
  if (props.encolhe) return <ScreenHeroi {...props} cab={props.encolhe} />;
  return <ScreenFixo {...props} />;
}

/**
 * A página com a capa grande (ver `tituloCompacto`): a barra de cima flutua
 * por cima da lista, transparente; o fundo e o nome pequeno chegam quando o
 * nome grande sai por baixo dela.
 */
function ScreenHeroi({ topLeft, children, style, fixo, cab, tituloCompacto, fundoSempre }: Props & { cab: CabecalhoQueEncolhe }) {
  const insets = useSafeAreaInsets();
  const [linha, setLinha] = useState<Caixa | null>(null);
  const anim = useMemo(() => {
    const r = cab.rolagem;
    const em = Math.max(FUNDO_APARECE_EM, tituloCompacto?.aparecerEm ?? FUNDO_APARECE_EM);
    return {
      fundo: fundoSempre ? 1 : r.interpolate({ inputRange: [em - 24, em], outputRange: [0, 1], extrapolate: 'clamp' }),
      titulo: r.interpolate({ inputRange: [em - 6, em + 10], outputRange: [0, 1], extrapolate: 'clamp' }),
      subir: r.interpolate({ inputRange: [em - 6, em + 10], outputRange: [6, 0], extrapolate: 'clamp' }),
    };
  }, [cab.rolagem, tituloCompacto?.aparecerEm, fundoSempre]);
  return (
    <View style={styles.root}>
      <View style={[{ flex: 1 }, style]}>{children}</View>
      <View pointerEvents="box-none" style={styles.sobre} onLayout={(e) => cab.definirEspaco(e.nativeEvent.layout.height)}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: anim.fundo }]}>
          <BlurView tint="dark" intensity={50} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, styles.tinta]} />
          <View style={styles.fio} />
        </Animated.View>
        <View pointerEvents="box-none" style={{ paddingTop: insets.top + spacing.sm }}>
          {topLeft ? (
            <View pointerEvents="box-none" style={styles.topLeftRow} onLayout={caixaDe(setLinha)}>{topLeft}</View>
          ) : null}
          {tituloCompacto && linha ? (
            <Animated.Text
              numberOfLines={1}
              pointerEvents="none"
              accessibilityRole="header"
              style={[styles.tituloCompacto, {
                top: linha.y + linha.height / 2 - 11,
                opacity: anim.titulo,
                transform: [{ translateY: anim.subir }],
              }]}
            >
              {tituloCompacto.texto}
            </Animated.Text>
          ) : null}
          {fixo}
        </View>
      </View>
    </View>
  );
}

const caixaDe = (definir: (c: Caixa) => void) => (e: { nativeEvent: { layout: Caixa } }) => {
  const { x, y, width: w, height: h } = e.nativeEvent.layout;
  definir({ x, y, width: w, height: h });
};

/** O de sempre: o título fica no topo e a lista começa por baixo dele. */
function ScreenFixo({ title, subtitle, right, topLeft, onBack, children, style, fixo }: Props) {
  const insets = useSafeAreaInsets();
  // A letra dos títulos (10/10, personalização): a de sempre, serifada ou mono.
  const fonte = fonteDosTitulos(useAparencia((s) => s.titulos));
  return (
    <View style={styles.root}>
      {/* Conteúdo do ecrã com margem segura notch */}
      <View style={{ flex: 1, paddingTop: insets.top + spacing.sm }}>
        {topLeft ? <View style={styles.topLeftRow}>{topLeft}</View> : null}
        {title ? (
          <View style={styles.header}>
            {onBack ? (
              <Pressable hitSlop={10} onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
                <Ionicons name="chevron-back" size={26} color={colors.text} />
              </Pressable>
            ) : null}
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={[onBack ? type.title : type.largeTitle, fonte]}>
                {title}
              </Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            {right}
          </View>
        ) : null}
        {fixo}
        <View style={[{ flex: 1 }, style]}>{children}</View>
      </View>
    </View>
  );
}

type Caixa = { x: number; y: number; width: number; height: number };

/**
 * O cabeçalho flutua por cima da lista (que começa com um espaço da altura
 * dele) e encolhe com o scroll, todo no lado nativo: o título encolhe e vai
 * para o centro, o subtítulo desvanece, os botões e o `fixo` sobem, e o fundo
 * desfocado aparece mal haja conteúdo por baixo.
 */
function ScreenQueEncolhe({ title, subtitle, right, topLeft, onBack, children, style, fixo, cab }: Props & { cab: CabecalhoQueEncolhe }) {
  const insets = useSafeAreaInsets();
  const fonte = fonteDosTitulos(useAparencia((s) => s.titulos));
  const { width } = useWindowDimensions();
  const [linha, setLinha] = useState<Caixa | null>(null);
  const [coluna, setColuna] = useState<Caixa | null>(null);
  const [titulo, setTitulo] = useState<Caixa | null>(null);
  const [direita, setDireita] = useState<Caixa | null>(null);
  const [voltar, setVoltar] = useState<Caixa | null>(null);
  const tamanho = onBack ? (type.title.fontSize as number) : (type.largeTitle.fontSize as number);
  const caixa = (definir: (c: Caixa) => void) => (e: { nativeEvent: { layout: Caixa } }) => {
    const { x, y, width: w, height: h } = e.nativeEvent.layout;
    definir({ x, y, width: w, height: h });
  };

  const g = useMemo(() => {
    if (!linha || !coluna || !titulo) return null;
    return geometriaDoTitulo({
      larguraDoEcra: width,
      topoSeguro: insets.top,
      fundoDaLinha: linha.y + linha.height,
      titulo: {
        x: linha.x + coluna.x + titulo.x,
        y: linha.y + coluna.y + titulo.y,
        largura: titulo.width,
        altura: titulo.height,
        tamanho,
      },
      centroDaDireita: direita ? linha.y + direita.y + direita.height / 2 : undefined,
      centroDoVoltar: voltar ? linha.y + voltar.y + voltar.height / 2 : undefined,
    });
  }, [linha, coluna, titulo, direita, voltar, width, insets.top, tamanho]);

  const anim = useMemo(() => {
    const r = cab.rolagem;
    // Antes de medir não se mexe nada: o cabeçalho fica aberto, como sempre.
    const d = Math.max(1, g?.distancia ?? 1);
    const p = r.interpolate({ inputRange: [0, d], outputRange: [0, g ? 1 : 0], extrapolate: 'clamp' });
    const escala = g
      ? r.interpolate({ inputRange: [-120, 0, d], outputRange: [1.06, 1, g.escala], extrapolate: 'clamp' })
      : 1;
    return {
      sobe: p.interpolate({ inputRange: [0, 1], outputRange: [0, -(g?.distancia ?? 0)] }),
      dx: p.interpolate({ inputRange: [0, 1], outputRange: [0, g?.dx ?? 0] }),
      dy: p.interpolate({ inputRange: [0, 1], outputRange: [0, g?.dy ?? 0] }),
      escala,
      direita: p.interpolate({ inputRange: [0, 1], outputRange: [0, g?.dyDaDireita ?? 0] }),
      voltar: p.interpolate({ inputRange: [0, 1], outputRange: [0, g?.dyDoVoltar ?? 0] }),
      subtitulo: r.interpolate({ inputRange: [0, d * 0.5], outputRange: [1, 0], extrapolate: 'clamp' }),
      fundo: r.interpolate({ inputRange: [0, FUNDO_APARECE_EM], outputRange: [0, 1], extrapolate: 'clamp' }),
      fio: p.interpolate({ inputRange: [0.85, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
    };
  }, [cab.rolagem, g]);

  return (
    <View style={styles.root}>
      <View style={[{ flex: 1 }, style]}>{children}</View>

      <View pointerEvents="box-none" style={styles.sobre} onLayout={(e) => cab.definirEspaco(e.nativeEvent.layout.height)}>
        {/* O fundo da barra: transparente parado no topo (como hoje), e desfocado
            mal haja conteúdo por baixo. Sobe com o resto. */}
        <Animated.View pointerEvents="none"
          style={[StyleSheet.absoluteFill, { opacity: anim.fundo, transform: [{ translateY: anim.sobe }] }]}>
          <BlurView tint="dark" intensity={50} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, styles.tinta]} />
          <Animated.View style={[styles.fio, { opacity: anim.fio }]} />
        </Animated.View>

        <View pointerEvents="box-none" style={{ paddingTop: insets.top + spacing.sm }}>
          {topLeft ? (
            <Animated.View style={[styles.topLeftRow, { opacity: anim.subtitulo }]}>{topLeft}</Animated.View>
          ) : null}
          <View pointerEvents="box-none" style={styles.header} onLayout={caixa(setLinha)}>
            {onBack ? (
              <Animated.View onLayout={caixa(setVoltar)} style={{ transform: [{ translateY: anim.voltar }] }}>
                <Pressable hitSlop={10} onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
                  <Ionicons name="chevron-back" size={26} color={colors.text} />
                </Pressable>
              </Animated.View>
            ) : null}
            <View pointerEvents="none" style={{ flex: 1 }} onLayout={caixa(setColuna)}>
              <Animated.Text
                numberOfLines={1}
                accessibilityRole="header"
                onLayout={caixa(setTitulo)}
                style={[
                  onBack ? type.title : type.largeTitle,
                  fonte,
                  styles.tituloQueEncolhe,
                  { transform: [{ translateX: anim.dx }, { translateY: anim.dy }, { scale: anim.escala }] },
                ]}
              >
                {title}
              </Animated.Text>
              {subtitle ? (
                <Animated.Text style={[styles.subtitle, { opacity: anim.subtitulo, transform: [{ translateY: anim.dy }] }]}>
                  {subtitle}
                </Animated.Text>
              ) : null}
            </View>
            {right ? (
              <Animated.View onLayout={caixa(setDireita)} style={{ transform: [{ translateY: anim.direita }] }}>
                {right}
              </Animated.View>
            ) : null}
          </View>
          {fixo ? (
            <Animated.View pointerEvents="box-none" style={{ transform: [{ translateY: anim.sobe }] }}>{fixo}</Animated.View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  topLeftRow: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  back: {
    marginRight: spacing.sm,
    marginBottom: 2,
    marginLeft: -8,
  },
  subtitle: {
    ...type.caption,
    marginTop: 2,
  },
  sobre: { position: 'absolute', top: 0, left: 0, right: 0 },
  tinta: { backgroundColor: 'rgba(10,10,15,0.72)' },
  fio: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    height: StyleSheet.hairlineWidth, backgroundColor: colors.border,
  },
  // No meio da barra, entre os botões dela.
  // Margens iguais dos dois lados (fica centrado) e largas que cheguem para
  // dois botões à direita (a lupa e o ⋯ da playlist): um nome comprido corta
  // com reticências em vez de passar por baixo deles.
  tituloCompacto: {
    position: 'absolute', left: 104, right: 104, height: 22, lineHeight: 22,
    textAlign: 'center', fontSize: 17, fontWeight: '600', color: colors.text,
  },
  // A largura do próprio texto (e não a da coluna): é ela que se centra.
  tituloQueEncolhe: { alignSelf: 'flex-start', maxWidth: '100%', transformOrigin: 'left center' },
});
