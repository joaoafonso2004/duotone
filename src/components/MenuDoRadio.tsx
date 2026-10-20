import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FundoDaFolha } from './FundoDaFolha';
import { Toque } from './Toque';
import { DentroDeUmModal } from './dentroDeUmModal';
import { hapticSelection } from '../lib/haptics';
import { ESTADO } from '../lib/movimento';
import { MENU_DO_RADIO } from '../lib/menuDoRadio';
import { pedirFluidez } from '../state/fluidez';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { colors, radii, spacing, type } from '../theme';
import type { TipoDeRadio } from '../state/player';

export type AncoraDoMenuDoRadio = { x: number; y: number; width: number; height: number };

const LARGURA = 236;
const ALTURA_DO_TITULO = 34;
const ALTURA_DA_LINHA = 58;
const PADDING = spacing.xs + 2;
const ALTURA = PADDING * 2 + ALTURA_DO_TITULO + ALTURA_DA_LINHA * MENU_DO_RADIO.opcoes.length;
const MARGEM = 12;
const AFASTAMENTO = 8;

/**
 * O menu do Radio no iPhone (18/10, variante A de `docs/radio-menu-animacao.html`):
 * a própria pastilha estica-se e transforma-se no menu, e só depois aparecem
 * as linhas, uma a seguir à outra. Ao escolher, as linhas apagam-se e o menu
 * encolhe de volta para dentro da pastilha (que então acende).
 *
 * Tudo no thread da interface (`useNativeDriver`, com `pedirFluidez` para os
 * 120 Hz): só transformações e opacidade. A forma é o menu já do tamanho
 * final, encolhida e posta em cima da pastilha; a "pele" da pastilha
 * (o vidro dela) por cima desvanece-se enquanto cresce, e é isso que faz ler
 * uma peça a mudar de forma. Com "Reduzir movimento", aparece e desaparece.
 *
 * Como o `MenuFlutuante`: o Modal só desmonta quando a saída acaba, e a
 * escolha corre no `onDismiss` do Modal (o iOS recusa apresentar outra coisa
 * enquanto ele está a sair).
 */
export function MenuDoRadio({ ancora, visivel, capa, capasDoMix, aoEscolher, aoFechar }: {
  ancora: AncoraDoMenuDoRadio | null;
  visivel: boolean;
  /** A capa da música que toca (a linha "Songs like this one"). */
  capa: string | null;
  /** Até quatro capas dos teus artistas (o quadrado do "Mix"). */
  capasDoMix: readonly string[];
  /** Corre depois de o menu fechar de vez. */
  aoEscolher: (tipo: TipoDeRadio) => void;
  /** Pedir para fechar (tocar fora, ou escolher). */
  aoFechar: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduzido = useReducedMotion();
  const forma = React.useRef(new Animated.Value(0)).current;
  const linhas = React.useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const mostrar = visivel && !!ancora;
  const mostrarRef = React.useRef(mostrar);
  mostrarRef.current = mostrar;
  const [montado, setMontado] = React.useState(mostrar);
  const aberto = React.useRef(false);
  const ultimaAncora = React.useRef(ancora);
  if (ancora) ultimaAncora.current = ancora;
  const escolha = React.useRef<TipoDeRadio | null>(null);
  const escolherRef = React.useRef(aoEscolher);
  escolherRef.current = aoEscolher;
  const fechoPendente = React.useRef(false);

  const avisarFechado = React.useCallback(() => {
    if (!fechoPendente.current || mostrarRef.current) return;
    fechoPendente.current = false;
    const tipo = escolha.current;
    escolha.current = null;
    if (tipo) escolherRef.current(tipo);
  }, []);

  React.useEffect(() => {
    if (mostrar) {
      aberto.current = true;
      fechoPendente.current = false;
      escolha.current = null;
      setMontado(true);
      if (reduzido) { forma.setValue(1); linhas.forEach((v) => v.setValue(1)); return; }
      pedirFluidez(900);
      forma.setValue(0);
      linhas.forEach((v) => v.setValue(0));
      const mola = Animated.spring(forma, { toValue: 1, ...ESTADO, useNativeDriver: true });
      mola.start();
      // As linhas, uma a seguir à outra, quando a forma já está quase lá.
      const entradas = linhas.map((v, i) => Animated.timing(v, {
        toValue: 1, duration: 260, delay: 140 + i * 55, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }));
      entradas.forEach((a) => a.start());
      return () => { mola.stop(); entradas.forEach((a) => a.stop()); };
    }
    if (!aberto.current) return;
    let ativo = true;
    // Desmontar SEMPRE, acabe a animação ou não (ver o MenuFlutuante).
    const desmontar = () => {
      if (!ativo || mostrarRef.current) return;
      aberto.current = false;
      fechoPendente.current = true;
      setMontado(false);
    };
    if (reduzido) { forma.setValue(0); linhas.forEach((v) => v.setValue(0)); desmontar(); return; }
    pedirFluidez(700);
    const escolheu = !!escolha.current;
    const saidas = linhas.map((v) => Animated.timing(v, { toValue: 0, duration: 90, useNativeDriver: true }));
    saidas.forEach((a) => a.start());
    // Escolheu: o menu volta para dentro da pastilha. Tocou fora: sai depressa.
    const recolher = Animated.timing(forma, {
      toValue: 0, duration: escolheu ? 300 : 170, delay: escolheu ? 60 : 0,
      easing: Easing.inOut(Easing.cubic), useNativeDriver: true,
    });
    recolher.start(desmontar);
    return () => { ativo = false; recolher.stop(); saidas.forEach((a) => a.stop()); };
  }, [mostrar, reduzido, forma, linhas]);

  // Android e web não entregam onDismiss.
  React.useEffect(() => {
    if (!montado && Platform.OS !== 'ios') avisarFechado();
  }, [montado, avisarFechado]);

  const aoDispensar = () => { if (!mostrarRef.current) avisarFechado(); };
  const a = ultimaAncora.current;
  if (!montado || !a) return <Modal visible={false} transparent animationType="none" onDismiss={aoDispensar} />;

  const esquerda = Math.min(Math.max(MARGEM, a.x + a.width - LARGURA), width - LARGURA - MARGEM);
  const cabeEmBaixo = a.y + a.height + AFASTAMENTO + ALTURA <= height - insets.bottom - MARGEM;
  const topo = cabeEmBaixo ? a.y + a.height + AFASTAMENTO : Math.max(insets.top + MARGEM, a.y - AFASTAMENTO - ALTURA);
  // De onde a forma parte: o centro e o tamanho da pastilha.
  const dx = a.x + a.width / 2 - (esquerda + LARGURA / 2);
  const dy = a.y + a.height / 2 - (topo + ALTURA / 2);
  const sx = Math.max(0.05, a.width / LARGURA);
  const sy = Math.max(0.05, a.height / ALTURA);

  const escolher = (tipo: TipoDeRadio) => {
    if (!mostrar) return;
    hapticSelection();
    escolha.current = tipo;
    aoFechar();
  };

  return (
    <Modal onDismiss={aoDispensar} transparent visible statusBarTranslucent animationType="none" onRequestClose={aoFechar}><DentroDeUmModal.Provider value>
      <Pressable disabled={!mostrar} style={StyleSheet.absoluteFill} onPress={aoFechar} accessibilityLabel="Close menu">
        <Animated.View style={[StyleSheet.absoluteFill, styles.veu, {
          opacity: forma.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
        }]} />
      </Pressable>
      {/* A forma: o fundo do menu, a crescer de dentro da pastilha. */}
      <Animated.View pointerEvents="none" style={[styles.forma, { left: esquerda, top: topo, width: LARGURA, height: ALTURA }, {
        opacity: forma.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
        transform: [
          { translateX: forma.interpolate({ inputRange: [0, 1], outputRange: [dx, 0] }) },
          { translateY: forma.interpolate({ inputRange: [0, 1], outputRange: [dy, 0] }) },
          { scaleX: forma.interpolate({ inputRange: [0, 1], outputRange: [sx, 1] }) },
          { scaleY: forma.interpolate({ inputRange: [0, 1], outputRange: [sy, 1] }) },
        ],
      }]}>
        <FundoDaFolha semLinha />
        {/* A pele da pastilha: desvanece-se enquanto a forma cresce. */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.pele, {
          opacity: forma.interpolate({ inputRange: [0, 0.45], outputRange: [1, 0], extrapolate: 'clamp' }),
        }]} />
      </Animated.View>
      <View pointerEvents={mostrar ? 'box-none' : 'none'} style={[styles.conteudo, { left: esquerda, top: topo, width: LARGURA, height: ALTURA }]}
        accessibilityRole="menu">
        <Animated.Text numberOfLines={1} style={[type.caption, styles.titulo, {
          opacity: linhas[0], transform: [{ translateY: linhas[0].interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }],
        }]}>{MENU_DO_RADIO.titulo}</Animated.Text>
        {MENU_DO_RADIO.opcoes.map((o, i) => (
          <Animated.View key={o.tipo} style={{
            opacity: linhas[i + 1], transform: [{ translateY: linhas[i + 1].interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }],
          }}>
            <Toque acende accessibilityRole="button" accessibilityLabel={o.rotulo} disabled={!mostrar}
              onPress={() => escolher(o.tipo)} style={styles.linha}>
              {o.tipo === 'musica'
                ? <Image source={capa ? { uri: capa } : null} style={styles.capa} contentFit="cover" />
                : <QuadradoDoMix capas={capasDoMix} />}
              <Text numberOfLines={1} style={[type.body, styles.rotulo]}>{o.rotulo}</Text>
            </Toque>
          </Animated.View>
        ))}
      </View>
    </DentroDeUmModal.Provider></Modal>
  );
}

/** As capas dos teus artistas em quadrado; sem nenhuma, o ícone do shuffle. */
function QuadradoDoMix({ capas }: { capas: readonly string[] }) {
  if (!capas.length) {
    return <View style={[styles.capa, styles.semCapas]}><Ionicons name="shuffle" size={20} color={colors.text} /></View>;
  }
  return (
    <View style={[styles.capa, styles.quadrado]}>
      {[0, 1, 2, 3].map((i) => (
        <Image key={i} source={capas[i % capas.length] ? { uri: capas[i % capas.length] } : null} style={styles.quarto} contentFit="cover" />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  veu: { backgroundColor: colors.overlay },
  forma: {
    position: 'absolute', borderRadius: radii.lg, borderCurve: 'continuous', overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong,
  },
  pele: { backgroundColor: 'rgba(233,234,238,0.16)' },
  conteudo: { position: 'absolute', paddingVertical: PADDING },
  titulo: {
    height: ALTURA_DO_TITULO, paddingHorizontal: spacing.lg, paddingTop: 8, color: colors.textSecondary,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderStrong,
  },
  linha: { height: ALTURA_DA_LINHA, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md },
  capa: { width: 40, height: 40, borderRadius: radii.sm, backgroundColor: colors.surfaceHigh, overflow: 'hidden' },
  quadrado: { flexDirection: 'row', flexWrap: 'wrap' },
  quarto: { width: 20, height: 20 },
  semCapas: { alignItems: 'center', justifyContent: 'center' },
  rotulo: { flex: 1, fontWeight: '600' },
});
