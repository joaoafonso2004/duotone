import React from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import { limiarDaLinha } from '../lib/arrastarFila';
import { colors } from '../theme';

/**
 * Uma linha que se pega e se muda de sítio.
 *
 * ## Porque é feita à mão
 *
 * O caminho habitual para isto é o `react-native-draggable-flatlist`, que
 * arrasta atrás de si o `reanimated` e o `gesture-handler`. São duas
 * dependências NATIVAS -- entram no binário, obrigam a uma build nova, e
 * passam a ter voz em qualquer actualização de Expo daqui para a frente.
 * Pagar isso para reordenar uma lista de músicas não se justifica.
 *
 * O `PanResponder` e o `Animated` já cá estão, já são o que a app usa em todo
 * o lado -- a folha inferior, a barra de progresso, o cubo das letras -- e
 * chegam perfeitamente para uma lista de linhas todas da mesma altura.
 *
 * ## O gesto
 *
 * Um segundo de dedo parado abre o arrasto. Não é um número escolhido ao
 * calhas: o toque simples toca a música e o toque longo curto (350 ms) já
 * significa outra coisa nas outras listas da app. Com um segundo não há
 * hipótese de se confundirem, e ninguém pega numa linha sem querer enquanto
 * percorre a fila.
 *
 * A partir daí quem manda no dedo é esta linha e mais ninguém: o
 * `onPanResponderTerminationRequest` recusa entregá-lo. Sem isso a folha
 * inferior -- que fecha ao arrastar para baixo -- roubava o gesto a meio, e
 * arrastar uma música para baixo fechava a fila em vez de a reordenar.
 */
export function LinhaArrastavel({
  index, arrastarIndex, altura, dy, aoPegar, aoLargar, children,
}: {
  index: number;
  /** Qual das linhas está a ser arrastada. `null` = nenhuma. */
  arrastarIndex: number | null;
  altura: number;
  dy: Animated.Value;
  /** O dedo mexeu-se e o arrasto arrancou mesmo. */
  aoPegar: () => void;
  aoLargar: (dyFinal: number) => void;
  children: React.ReactNode;
}) {
  const activo = arrastarIndex === index;
  // O `PanResponder` fecha sobre o primeiro valor que vê. Sem a referência,
  // continuaria a achar que esta linha não está activa depois de o ser.
  const activoRef = React.useRef(activo);
  activoRef.current = activo;
  const largarRef = React.useRef(aoLargar);
  largarRef.current = aoLargar;
  const pegarRef = React.useRef(aoPegar);
  pegarRef.current = aoPegar;

  const pan = React.useMemo(
    () =>
      PanResponder.create({
        // Só depois do segundo de espera. Antes disso o dedo é do toque
        // simples, que toca a música.
        onMoveShouldSetPanResponder: () => activoRef.current,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => pegarRef.current(),
        onPanResponderMove: (_e, g) => {
          if (activoRef.current) dy.setValue(g.dy);
        },
        onPanResponderRelease: (_e, g) => largarRef.current(g.dy),
        // O sistema tirou-nos o dedo (uma chamada a entrar, por exemplo):
        // devolve-se a linha ao sítio de onde veio em vez de a deixar a meio.
        onPanResponderTerminate: () => largarRef.current(0),
      }),
    [dy]
  );

  const estilo = React.useMemo(() => {
    if (activo) return { transform: [{ translateY: dy }, { scale: 1.03 }] };
    if (arrastarIndex == null || altura <= 0) return { transform: [{ translateY: 0 }] };
    // A linha cede o lugar a meio caminho, e não quando é alcançada: é onde o
    // olho diz que já trocaram. A banda estreita faz disso um deslizar em vez
    // de um salto -- ver `limiarDaLinha` para o meio pixel que separa os dois
    // lados.
    const limiar = limiarDaLinha(index, arrastarIndex, altura);
    const banda = 8;
    return {
      transform: [{
        translateY: dy.interpolate({
          inputRange: [limiar - banda, limiar + banda],
          outputRange: index > arrastarIndex ? [0, -altura] : [altura, 0],
          extrapolate: 'clamp' as const,
        }),
      }],
    };
  }, [activo, arrastarIndex, altura, dy, index]);

  return (
    <Animated.View
      {...pan.panHandlers}
      // O `zIndex` é o que põe a linha pegada POR CIMA das vizinhas. Sem ele
      // ela passa por baixo assim que as alcança, e o que se vê é a música a
      // desaparecer debaixo da lista.
      style={[estilo, activo && styles.aPegar]}
    >
      <View style={activo ? styles.pegada : undefined}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  aPegar: { zIndex: 3, elevation: 3 },
  pegada: {
    backgroundColor: colors.surfaceHigh,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
});
