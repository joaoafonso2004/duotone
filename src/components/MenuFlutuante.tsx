import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Toque } from './Toque';
import { hapticSelection } from '../lib/haptics';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { ESTADO } from '../lib/movimento';
import { colors, radii, spacing, type } from '../theme';
import type { PlayerAction } from './PlayerActionsSheet';

export type Ancora = { x: number; y: number; width: number; height: number };

const LARGURA = 232;
const MARGEM = 12;

/**
 * Um menu que abre junto ao dedo.
 *
 * ## Porque não é a folha de baixo
 *
 * A app já tem folhas, e elas continuam onde estão. A diferença não é de
 * gosto, é de trabalho:
 *
 *   - **folha** quando há uma lista de onde ESCOLHER -- os teus amigos, as
 *     tuas playlists. Precisa de altura, de deslizar, e de vir de um sítio
 *     fixo porque pode ser longa.
 *   - **menu** quando são quatro acções fixas que se lêem de uma vez. Aparece
 *     onde o dedo está e some-se logo a seguir.
 *
 * Uma folha a subir do fundo do ecrã para mostrar quatro linhas percorre
 * seiscentos pixels para entregar duzentos, e o utilizador tem de ir buscar
 * lá abaixo o que pediu aqui em cima. Com a regra escrita, as duas coisas
 * convivem -- é o que o iOS faz. Sem a regra, seriam duas linguagens.
 *
 * ## O que decide onde ele nasce
 *
 * A âncora vem medida em coordenadas de ECRÃ, do botão que o abriu. O menu
 * encosta-se à direita desse botão e desce por baixo dele; se não houver
 * espaço em baixo, sobe. Sem isto nasceria sempre no mesmo sítio e a ligação
 * entre o que se tocou e o que abriu perdia-se.
 */
export function MenuFlutuante({ visivel, ancora, accoes, aoFechar }: {
  visivel: boolean;
  ancora: Ancora | null;
  accoes: PlayerAction[];
  aoFechar: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const reduzido = useReducedMotion();
  const entrada = React.useRef(new Animated.Value(0)).current;
  // O `Modal` só desmonta quando a saída acaba: fechá-lo no toque cortava a
  // animação a meio e o menu desaparecia de um fotograma para o outro.
  const [montado, setMontado] = React.useState(visivel);

  React.useEffect(() => {
    if (visivel) {
      setMontado(true);
      if (reduzido) { entrada.setValue(1); return; }
      const mola = Animated.spring(entrada, { toValue: 1, ...ESTADO, useNativeDriver: true });
      mola.start();
      return () => mola.stop();
    }
    if (!montado) return;
    if (reduzido) { entrada.setValue(0); setMontado(false); return; }
    // A saída é mais rápida do que a entrada, e de propósito: a entrada tem de
    // se ver para se perceber de onde veio; a saída já não tem nada a dizer.
    const saida = Animated.timing(entrada, { toValue: 0, duration: 130, useNativeDriver: true });
    saida.start(({ finished }) => { if (finished) setMontado(false); });
    return () => saida.stop();
  }, [visivel, reduzido, entrada, montado]);

  if (!montado || !ancora) return null;

  const alturaEstimada = accoes.length * 52 + spacing.sm * 2;
  const cabeEmBaixo = ancora.y + ancora.height + MARGEM + alturaEstimada < height;
  const topo = cabeEmBaixo
    ? ancora.y + ancora.height + MARGEM
    : Math.max(MARGEM, ancora.y - alturaEstimada - MARGEM);
  const esquerda = Math.min(
    Math.max(MARGEM, ancora.x + ancora.width - LARGURA),
    width - LARGURA - MARGEM
  );

  return (
    <Modal transparent visible statusBarTranslucent animationType="none" onRequestClose={aoFechar}>
      {/* Tocar fora fecha. Ocupa o ecrã todo de propósito: um menu aberto tem
          de se poder dispensar sem se acertar em nada. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={aoFechar} accessibilityLabel="Close menu">
        <Animated.View style={[StyleSheet.absoluteFill, styles.veu, { opacity: entrada }]} />
      </Pressable>
      <Animated.View
        style={[
          styles.menu,
          { top: topo, left: esquerda, width: LARGURA },
          {
            opacity: entrada,
            transform: [{ scale: entrada.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
          },
        ]}
      >
        <BlurView tint="dark" intensity={40} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.tinta]} />
        {accoes.map((accao) => (
          <Toque
            key={accao.label}
            acende
            accessibilityRole="button"
            accessibilityLabel={accao.label}
            accessibilityState={{ disabled: !!accao.disabled }}
            disabled={accao.disabled}
            onPress={() => { hapticSelection(); accao.onPress(); }}
            style={[styles.linha, accao.disabled && styles.apagada]}
          >
            <Ionicons
              name={accao.icon}
              size={19}
              color={accao.destructive ? colors.danger : colors.text}
            />
            <Text
              numberOfLines={2}
              style={[type.body, styles.etiqueta, accao.destructive && { color: colors.danger }]}
            >
              {accao.label}
            </Text>
          </Toque>
        ))}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  veu: { backgroundColor: colors.overlay },
  menu: {
    position: 'absolute',
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    paddingVertical: spacing.sm,
  },
  tinta: { backgroundColor: 'rgba(29,29,40,0.82)' },
  linha: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  etiqueta: { flex: 1 },
  apagada: { opacity: 0.4 },
});
