import React from 'react';
import { Animated, PanResponder, StyleSheet, View, type GestureResponderHandlers } from 'react-native';
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
 * ## Os dois gestos
 *
 * **A pega (≡) pega logo**, sem espera: é o gesto de reordenar que o iOS
 * ensinou, e o que a pega promete. Esteve só desenhada -- arrastá-la fazia a
 * lista deslizar, que é o contrário do que ela diz.
 *
 * **Meio segundo de dedo parado em qualquer ponto da linha** também abre o
 * arrasto, para quem não der pela pega. Começou em mil, para não colidir com
 * o toque longo de 350 ms das outras listas -- o raciocínio estava certo e o
 * número errado: um segundo parece a app a não responder.
 *
 * Nos dois, a partir daí quem manda no dedo é esta linha e mais ninguém: o
 * `onPanResponderTerminationRequest` recusa entregá-lo. Sem isso a folha
 * inferior -- que fecha ao arrastar para baixo -- roubava o gesto a meio.
 *
 * ## Quem é a linha pegada, sem esperar pelo React
 *
 * O `pegadaRef` diz qual das linhas está pegada, e é escrito no próprio
 * gesto. Com uma prop, o primeiro movimento a seguir ao toque longo ainda
 * chegava antes do render que a marcava, e perdia-se para a lista ou para a
 * folha.
 */
export function LinhaArrastavel({
  index, arrastarIndex, pegadaRef, podeArrastar, altura, dy,
  aoComecar, aoPegar, aoMover, aoLargar, aoCancelar, children,
}: {
  index: number;
  /** Qual das linhas está a ser arrastada, para o desenho. `null` = nenhuma. */
  arrastarIndex: number | null;
  /** O mesmo, mas escrito no gesto: é o que decide quem fica com o dedo. */
  pegadaRef: React.RefObject<number | null>;
  /** Numa sessão a fila é de toda a gente e não se reordena daqui. */
  podeArrastar: boolean;
  altura: number;
  dy: Animated.Value;
  /** A pega foi tocada: o arrasto abre aqui, como abre com o toque longo. */
  aoComecar: (index: number) => void;
  /** O dedo mexeu-se e o arrasto arrancou mesmo. */
  aoPegar: (dedoY: number) => void;
  /**
   * A cada movimento: o deslocamento do gesto e a posição ABSOLUTA do dedo.
   *
   * A segunda é que permite o deslize nas bordas -- o `dy` diz quanto o dedo
   * andou, e não onde ele está. Quem decide se a lista tem de correr precisa
   * de saber se o dedo está encostado a uma borda, e isso o `dy` nunca diz.
   *
   * Quem escreve no `dy` é o dono da lista e não esta linha: durante o deslize
   * o valor tem de somar o que a lista correu, senão a linha fica para trás
   * enquanto o conteúdo passa por baixo dela.
   */
  aoMover: (dy: number, dedoY: number) => void;
  aoLargar: (dyFinal: number) => void;
  /**
   * O sistema tirou-nos o dedo (uma chamada a entrar, por exemplo). Não é um
   * largar: largar com o deslocamento a zero ainda contava o que a lista
   * tinha corrido, e a música mudava de sítio sem ninguém a ter largado.
   */
  aoCancelar: () => void;
  /** Recebe os gestos da pega, para quem desenha a linha os pôr no ≡. */
  children: (pega: GestureResponderHandlers | null) => React.ReactNode;
}) {
  const activo = arrastarIndex === index;
  // Os PanResponders fecham sobre o primeiro render. Tudo o que muda chega-lhes
  // por referência -- incluindo o índice, que muda quando a fila se reordena
  // e esta mesma linha passa a estar noutro sítio.
  const indexRef = React.useRef(index);
  indexRef.current = index;
  const podeRef = React.useRef(podeArrastar);
  podeRef.current = podeArrastar;
  const cb = React.useRef({ aoComecar, aoPegar, aoMover, aoLargar, aoCancelar });
  cb.current = { aoComecar, aoPegar, aoMover, aoLargar, aoCancelar };
  const minha = () => pegadaRef.current === indexRef.current;

  const pan = React.useMemo(
    () =>
      PanResponder.create({
        // Só depois do toque longo. Antes disso o dedo é do toque simples, que
        // toca a música.
        onMoveShouldSetPanResponder: minha,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => cb.current.aoPegar(e.nativeEvent.pageY),
        onPanResponderMove: (_e, g) => {
          if (minha()) cb.current.aoMover(g.dy, g.moveY);
        },
        onPanResponderRelease: (_e, g) => cb.current.aoLargar(g.dy),
        onPanResponderTerminate: () => cb.current.aoCancelar(),
      }),
    // Sem dependências, de propósito: recriar isto a meio de um arrasto
    // perdia o dedo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const pega = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => podeRef.current,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          cb.current.aoComecar(indexRef.current);
          cb.current.aoPegar(e.nativeEvent.pageY);
        },
        onPanResponderMove: (_e, g) => {
          if (minha()) cb.current.aoMover(g.dy, g.moveY);
        },
        onPanResponderRelease: (_e, g) => cb.current.aoLargar(g.dy),
        onPanResponderTerminate: () => cb.current.aoCancelar(),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
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
      <View style={activo ? styles.pegada : undefined}>
        {children(podeArrastar ? pega.panHandlers : null)}
      </View>
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
