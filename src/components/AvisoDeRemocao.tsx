import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Animated, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { avisos, duracaoDoAviso, type AvisoDeRemocao as Aviso } from '../lib/avisoDeRemocao';
import { textoSobre } from '../lib/corDaCapa';
import { hapticImpact } from '../lib/haptics';
import { ENTRADA, SOLTAR } from '../lib/movimento';
import { usePlayer } from '../state/player';
import { useTheme } from '../state/theme';
import { colors, MINI_PLAYER_HEIGHT } from '../theme';

/** A barra dos separadores sem a safe area (a mesma conta do HandoffBanner). */
const TAB_BAR_BASE = 49;

/**
 * O aviso do que se tirou, com "Undo" (3/10). A lógica vive em
 * `lib/avisoDeRemocao.ts`; isto só o desenha: por cima do mini-player, perto
 * do polegar, e por cima das folhas (FullWindowOverlay) -- tirar uma música da
 * fila acontece dentro de uma. Entra a subir, sai a descer, e desliza-se para
 * baixo para o tirar antes do tempo.
 */
export function AvisoDeRemocao() {
  const aviso = useSyncExternalStore(avisos.ouvir, avisos.atual);
  const [mostrado, setMostrado] = useState<Aviso | null>(null);
  const insets = useSafeAreaInsets();
  const temFaixa = usePlayer((s) => !!s.current);
  const aberto = usePlayer((s) => s.expanded);
  const cor = useTheme((s) => s.destino.color);
  const reduzido = useReducedMotion();
  const entrada = useRef(new Animated.Value(0)).current;
  const arrasto = useRef(new Animated.Value(0)).current;
  const tempo = useRef(new Animated.Value(1)).current;
  const idRef = useRef<number | null>(null);
  idRef.current = aviso?.id ?? null;

  useEffect(() => {
    if (aviso) {
      // Um aviso que substitui outro troca só o texto: sair e voltar a entrar
      // piscava.
      const jaAVista = mostrado !== null;
      setMostrado(aviso);
      hapticImpact();
      arrasto.setValue(0);
      if (jaAVista || reduzido) entrada.setValue(1);
      else {
        entrada.setValue(0);
        Animated.spring(entrada, { toValue: 1, ...ENTRADA, useNativeDriver: true }).start();
      }
      tempo.setValue(1);
      Animated.timing(tempo, { toValue: 0, duration: duracaoDoAviso(aviso), useNativeDriver: true }).start();
      return;
    }
    if (!mostrado) return;
    Animated.timing(entrada, { toValue: 0, duration: reduzido ? 0 : 180, useNativeDriver: true })
      .start(({ finished }) => { if (finished && idRef.current === null) setMostrado(null); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aviso?.id]);

  const gesto = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_e, g) => arrasto.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_e, g) => {
      const id = idRef.current;
      if (id !== null && (g.dy > 28 || g.vy > 0.6)) avisos.fechar(id);
      else Animated.spring(arrasto, { toValue: 0, ...SOLTAR, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => Animated.spring(arrasto, { toValue: 0, ...SOLTAR, useNativeDriver: true }).start(),
  })).current;

  if (!mostrado) return null;

  const desfazer = async () => {
    try {
      await avisos.desfazer(mostrado.id);
    } catch (e: any) {
      Alert.alert("Couldn't undo", e?.message ? 'Check your connection and try again.' : undefined);
    }
  };

  // Com o leitor aberto não há mini-player: fica acima dos controlos de baixo.
  const bottom = aberto
    ? insets.bottom + 90
    : TAB_BAR_BASE + insets.bottom + 8 + (temFaixa ? MINI_PLAYER_HEIGHT + 8 : 0);

  const conteudo = (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill]}>
      <Animated.View
        {...gesto.panHandlers}
        accessibilityLiveRegion="polite"
        style={[styles.cartao, {
          bottom,
          opacity: entrada,
          transform: [
            { translateY: Animated.add(arrasto, entrada.interpolate({ inputRange: [0, 1], outputRange: [36, 0] })) },
          ],
        }]}
      >
        <View style={[styles.icone, { backgroundColor: cor }]}>
          <Ionicons name="checkmark" size={17} color={textoSobre(cor)} />
        </View>
        <View style={styles.textos}>
          <Text numberOfLines={1} style={styles.texto}>{mostrado.texto}</Text>
          {mostrado.detalhe ? <Text numberOfLines={1} style={styles.detalhe}>{mostrado.detalhe}</Text> : null}
        </View>
        {mostrado.desfazer ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Undo" hitSlop={10} onPress={() => { void desfazer(); }}
            style={({ pressed }) => [styles.botao, pressed && { opacity: 0.6 }]}>
            <Text style={[styles.desfazer, { color: cor }]}>Undo</Text>
          </Pressable>
        ) : null}
        {/* O tempo que falta, num fio: diz quanto ainda dá para desfazer. */}
        <View style={styles.trilho}>
          <Animated.View style={[styles.tempo, { transform: [{ scaleX: tempo }] }]} />
        </View>
      </Animated.View>
    </View>
  );

  // Por cima das folhas (a fila é uma), sem abrir modal nenhum.
  return Platform.OS === 'ios' ? <FullWindowOverlay>{conteudo}</FullWindowOverlay> : conteudo;
}

const styles = StyleSheet.create({
  cartao: {
    position: 'absolute',
    left: 12,
    right: 12,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(32,32,42,0.97)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    overflow: 'hidden',
  },
  icone: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  textos: { flex: 1, minWidth: 0 },
  texto: { color: colors.text, fontSize: 15, fontWeight: '500' },
  detalhe: { color: colors.textSecondary, fontSize: 13, marginTop: 1 },
  botao: { paddingVertical: 8, paddingHorizontal: 8 },
  desfazer: { fontSize: 15, fontWeight: '700' },
  trilho: { position: 'absolute', left: 14, right: 14, bottom: 0, height: 2, borderRadius: 1, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.06)' },
  tempo: { height: 2, backgroundColor: 'rgba(255,255,255,0.28)', transformOrigin: 'left' },
});
