import React, { useMemo, useRef } from 'react';
import {
  Animated, Pressable, StyleSheet,
  type PressableProps, type StyleProp, type ViewStyle,
} from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  BRILHO_DA_LINHA, ESCALA, OPACIDADE_SEM_MOVIMENTO, PREMIR, SOLTAR,
} from '../lib/movimento';
import { colors } from '../theme';

/**
 * Um `Pressable` que responde ao dedo.
 *
 * A app tinha 177 `Pressable` e três com alguma resposta ao toque. Carregar num
 * botão não mudava nada no ecrã até a acção acontecer -- e quando a acção
 * demora (guardar, descarregar, pedir à rede), o utilizador fica sem saber se
 * o toque foi sequer registado, e carrega outra vez.
 *
 * ## Porque é um componente e não um estilo
 *
 * `({ pressed }) => ...` do próprio `Pressable` resolveria isto numa linha --
 * mas SALTA entre dois valores. É o que dá a sensação de troca de fotograma:
 * não há nada entre o estado solto e o premido. Uma mola tem esse entre.
 *
 * ## O que anima, e o que não
 *
 * Só `transform` e `opacity`, sempre no driver nativo. Não é preferência de
 * desempenho: uma vista tem UM nó de propriedades, e assim que uma delas vai
 * para nativo o React Native leva a vista inteira -- animar outra a partir do
 * JS deixa de degradar e passa a atirar. Com 177 botões, um erro destes
 * multiplica-se. Ver `scripts/test-driver-de-animacao.ts`.
 *
 * ## Encolher não serve tudo
 *
 * Uma linha de lista inteira a encolher lê-se como a lista a saltar, não como
 * uma resposta. Por isso as linhas usam `acende`: o fundo ilumina-se e nada se
 * desloca. É a mesma informação sem o efeito secundário.
 */
type Props = Omit<PressableProps, 'style'> & {
  /**
   * `style` só aceita objecto -- a forma `({ pressed }) => ...` do Pressable
   * deixa de fazer sentido aqui, e o TypeScript passa a apontar os sítios que
   * ainda a usam, que é exactamente o que se quer ao converter.
   */
  style?: StyleProp<ViewStyle>;
  /** Quanto encolhe. Ver `ESCALA` -- a escolha certa depende do tamanho. */
  escala?: number;
  /** Acende o fundo em vez de encolher. Para linhas de lista. */
  acende?: boolean;
  /** O raio do brilho, para acompanhar os cantos do que está por baixo. */
  raio?: number;
  children?: React.ReactNode;
};

const PressableAnimado = Animated.createAnimatedComponent(Pressable);

export function Toque({
  style, escala = ESCALA.botao, acende = false, raio = 0,
  onPressIn, onPressOut, disabled, children, ...resto
}: Props) {
  const reduzido = useReducedMotion();
  const premido = useRef(new Animated.Value(0)).current;

  const mover = (para: number, mola: typeof PREMIR) => {
    Animated.spring(premido, {
      toValue: para,
      ...mola,
      useNativeDriver: true,
    }).start();
  };

  const animado = useMemo<Animated.WithAnimatedObject<ViewStyle>>(() => {
    // Acender não mexe na geometria: o brilho é uma vista à parte, por baixo
    // do conteúdo, e o que anima é a opacidade dela.
    if (acende) return {};
    // Quem pediu menos movimento continua a precisar de saber que acertou --
    // troca-se o deslocamento por opacidade, que diz o mesmo sem mexer nada.
    if (reduzido) {
      return {
        opacity: premido.interpolate({
          inputRange: [0, 1],
          outputRange: [1, OPACIDADE_SEM_MOVIMENTO],
        }),
      };
    }
    return {
      transform: [
        { scale: premido.interpolate({ inputRange: [0, 1], outputRange: [1, escala] }) },
      ],
    };
  }, [acende, reduzido, escala, premido]);

  return (
    <PressableAnimado
      {...resto}
      disabled={disabled}
      style={[style, animado]}
      onPressIn={(e) => {
        if (!disabled) mover(1, PREMIR);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (!disabled) mover(0, SOLTAR);
        onPressOut?.(e);
      }}
    >
      {acende && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: colors.text,
              borderRadius: raio,
              opacity: premido.interpolate({
                inputRange: [0, 1],
                outputRange: [0, BRILHO_DA_LINHA],
              }),
            },
          ]}
        />
      )}
      {children}
    </PressableAnimado>
  );
}
