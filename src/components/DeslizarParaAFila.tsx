import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { PanGestureHandler, State, type PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import { hapticNotification, hapticSelection } from '../lib/haptics';
import { useTheme } from '../state/theme';
import { pedirFluidez } from '../state/fluidez';

/** Quanto é preciso puxar para a direita para pôr na fila. */
export const LIMIAR_DA_FILA = 88;
/** Mais largo do que qualquer ecrã: a faixa de cor desliza atrás da linha. */
const LARGURA_DA_FAIXA = 640;

/**
 * Deslizar uma música para a DIREITA põe-na na fila (29/9), o gesto que quem vem
 * do Spotify já faz sem pensar. É o espelho do `DeslizarParaTirar` da fila (que
 * tira para a esquerda): só apanha gestos claramente horizontais para a
 * direita, e o toque, o toque longo e o scroll da lista continuam como estavam.
 *
 * A cor só existe na faixa que a linha destapa, e anda com ela: a linha é
 * transparente (por trás está o fundo desfocado da app), e uma cor por baixo
 * da linha inteira via-se através do texto. A linha não sai: volta ao sítio,
 * e o ícone passa a um visto com uma vibração -- no iPhone não há um aviso
 * global onde dizer "Added to queue". Sem `ativo`, não embrulha nada.
 *
 * Do Gesture Handler (4/10, auditoria 3.1): o dedo escreve num valor do motor
 * nativo (a linha segue-o com o JavaScript ocupado), e o JavaScript só entra
 * no limiar (a vibração, por um ouvinte do valor) e ao largar. Com o
 * PanResponder, uma folha nativa do iOS roubava o gesto às linhas dela.
 */
export function DeslizarParaAFila({ ativo, aoPorNaFila, children }: {
  ativo: boolean;
  aoPorNaFila: () => void;
  children: React.ReactNode;
}) {
  const theme = useTheme((s) => s.theme);
  const [feito, setFeito] = useState(false);
  const passou = useRef(false);
  const acaoRef = useRef(aoPorNaFila);
  acaoRef.current = aoPorNaFila;

  useEffect(() => {
    if (!feito) return;
    const t = setTimeout(() => setFeito(false), 700);
    return () => clearTimeout(t);
  }, [feito]);

  /** A translação do dedo, escrita no lado nativo. */
  const dedo = useRef(new Animated.Value(0)).current;
  // Resiste depois do limiar, como uma mola: diz que já chega. Para a esquerda
  // não anda (é o tirar da fila).
  const dx = useMemo(() => dedo.interpolate({
    inputRange: [0, LIMIAR_DA_FILA, LIMIAR_DA_FILA + 1000],
    outputRange: [0, LIMIAR_DA_FILA, LIMIAR_DA_FILA + 350],
    extrapolateLeft: 'clamp',
  }), [dedo]);
  const aoMexer = useMemo(
    () => Animated.event([{ nativeEvent: { translationX: dedo } }], { useNativeDriver: true }),
    [dedo],
  );
  // A vibração no limiar: só se ouve o valor enquanto o dedo está pousado.
  const ouvinte = useRef<string | null>(null);
  const largarOuvinte = () => {
    if (ouvinte.current !== null) { dedo.removeListener(ouvinte.current); ouvinte.current = null; }
  };
  useEffect(() => largarOuvinte, []); // eslint-disable-line react-hooks/exhaustive-deps
  const aoMudarDeEstado = (e: PanGestureHandlerStateChangeEvent) => {
    const { state, translationX } = e.nativeEvent;
    if (state === State.ACTIVE) {
      passou.current = false;
      largarOuvinte();
      ouvinte.current = dedo.addListener(({ value }) => {
        const agora = value >= LIMIAR_DA_FILA;
        if (agora !== passou.current) { passou.current = agora; if (agora) hapticSelection(); }
      });
      return;
    }
    if (state !== State.END && state !== State.CANCELLED && state !== State.FAILED) return;
    largarOuvinte();
    pedirFluidez(600);
    if (state === State.END && translationX >= LIMIAR_DA_FILA) {
      hapticNotification();
      acaoRef.current();
      setFeito(true);
    }
    Animated.spring(dedo, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
  };

  if (!ativo) return <>{children}</>;

  const faixa = { transform: [{ translateX: Animated.subtract(dx, LARGURA_DA_FAIXA) }] };
  const icone = dx.interpolate({ inputRange: [0, 40, LIMIAR_DA_FILA], outputRange: [0, 0.6, 1], extrapolate: 'clamp' });
  return (
    <View style={styles.caixa}>
      <Animated.View pointerEvents="none" style={[styles.faixa, { backgroundColor: theme.color }, faixa]}>
        <Animated.View style={{ opacity: icone, transform: [{ scale: icone }] }}>
          <Ionicons name={feito ? 'checkmark-circle' : 'list'} size={20} color={theme.textColorOnGradient} />
        </Animated.View>
      </Animated.View>
      {/* Só um gesto claramente horizontal e para a DIREITA: falha com 10 pt
          na vertical (é o scroll da lista) e não arranca para a esquerda. */}
      <PanGestureHandler
        activeOffsetX={12}
        failOffsetY={[-10, 10]}
        onGestureEvent={aoMexer}
        onHandlerStateChange={aoMudarDeEstado}
      >
        <Animated.View
          accessibilityActions={[{ name: 'addToQueue', label: 'Add to queue' }]}
          onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'addToQueue') acaoRef.current(); }}
          style={{ transform: [{ translateX: dx }] }}
        >
          {children}
        </Animated.View>
      </PanGestureHandler>
    </View>
  );
}

const styles = StyleSheet.create({
  caixa: { overflow: 'hidden' },
  faixa: {
    position: 'absolute', top: 0, bottom: 0, left: 0, width: LARGURA_DA_FAIXA,
    alignItems: 'flex-end', justifyContent: 'center', paddingRight: 22,
  },
});
