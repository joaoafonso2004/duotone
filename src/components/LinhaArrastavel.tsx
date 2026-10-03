import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import {
  PanGestureHandler, State,
  type PanGestureHandlerGestureEvent, type PanGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import { limiarDaLinha } from '../lib/arrastarFila';
import { colors } from '../theme';

/** Quanto tempo de dedo parado numa linha abre o arrasto. */
export const TOQUE_LONGO_PARA_ARRASTAR_MS = 500;

/**
 * Uma linha que se pega e se muda de sítio.
 *
 * ## Os dois gestos
 *
 * **A pega (≡) pega logo**, ao primeiro movimento: é o gesto de reordenar que
 * o iOS ensinou, e o que a pega promete.
 *
 * **Meio segundo de dedo parado em qualquer ponto da linha** também abre o
 * arrasto, para quem não der pela pega. Mexer antes disso é deslizar a lista
 * (o gesto falha e a lista fica com o dedo); um toque curto toca a música.
 *
 * ## Porque é do Gesture Handler (3/10)
 *
 * Era um `PanResponder`, e continuou a sê-lo enquanto a fila vivia numa folha
 * feita à mão (que sabia não fechar com uma linha pegada). A fila passou a
 * uma folha NATIVA do iOS, e aí o gesto da folha -- arrastar para baixo -- é
 * um reconhecedor do UIKit, que passa à frente dos toques do React Native e os
 * cancela: arrastar uma música para baixo arrastava a folha. Os gestos do
 * Gesture Handler entram na mesma arbitragem do UIKit, e o primeiro a ativar
 * fica com o dedo -- o toque longo (o dedo parado) e a pega (ao primeiro
 * ponto) ativam antes de a folha ter distância para começar.
 *
 * ## Quem é a linha pegada, sem esperar pelo React
 *
 * O `pegadaRef` diz qual das linhas está pegada, e é escrito no próprio
 * gesto. Com uma prop, o primeiro movimento a seguir ao toque longo ainda
 * chegava antes do render que a marcava.
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
  /** O arrasto abre aqui (a pega, ou o toque longo). */
  aoComecar: (index: number) => void;
  /**
   * O arrasto arrancou, com o dedo `yNaVista` pontos abaixo do topo de `vista`
   * (a linha ou a pega). Quem é dono da lista mede onde a vista está nela.
   * Nada de coordenadas do ecrã: numa folha nativa, as do React Native e as do
   * UIKit não batem (ver `useArrastarLista`).
   */
  aoPegar: (yNaVista: number, vista: View | null) => void;
  /**
   * A cada movimento, quanto o dedo andou. Quem escreve no `dy` animado é o
   * dono da lista e não esta linha: durante o deslize o valor tem de somar o
   * que a lista correu, senão a linha fica para trás.
   */
  aoMover: (dy: number) => void;
  aoLargar: (dyFinal: number) => void;
  /**
   * O sistema tirou-nos o dedo (uma chamada a entrar, por exemplo). Não é um
   * largar: largar com o deslocamento a zero ainda contava o que a lista
   * tinha corrido, e a música mudava de sítio sem ninguém a ter largado.
   */
  aoCancelar: () => void;
  /**
   * Recebe quem embrulha a pega (≡) com o gesto dela, ou `null` sem arrasto.
   * A pega desenha-se como sempre e passa por `envolverPega(<View>≡</View>)`.
   */
  children: (envolverPega: ((pega: React.ReactElement) => React.ReactElement) | null) => React.ReactNode;
}) {
  const activo = arrastarIndex === index;
  // Os gestos leem tudo por referência -- incluindo o índice, que muda quando
  // a fila se reordena e esta mesma linha passa a estar noutro sítio.
  const indexRef = React.useRef(index);
  indexRef.current = index;
  const podeRef = React.useRef(podeArrastar);
  podeRef.current = podeArrastar;
  const cb = React.useRef({ aoComecar, aoPegar, aoMover, aoLargar, aoCancelar });
  cb.current = { aoComecar, aoPegar, aoMover, aoLargar, aoCancelar };
  const minha = () => pegadaRef.current === indexRef.current;
  // As vistas dos dois gestos: o `y` de cada um é relativo à SUA vista.
  const vistaDaLinha = React.useRef<View>(null);
  const vistaDaPega = React.useRef<View>(null);

  // Os mesmos para a linha e para a pega: só muda o que os ativa.
  const aoMexer = React.useCallback((e: PanGestureHandlerGestureEvent) => {
    if (minha()) cb.current.aoMover(e.nativeEvent.translationY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const criarAoMudar = (vista: React.RefObject<View | null>) => (e: PanGestureHandlerStateChangeEvent) => {
    const { state, oldState, translationY, y } = e.nativeEvent;
    if (state === State.ACTIVE) {
      if (!podeRef.current) return;
      cb.current.aoComecar(indexRef.current);
      // `y` é onde o dedo está agora; o arrasto conta a partir de onde pegou.
      cb.current.aoPegar(y - translationY, vista.current);
      return;
    }
    if (oldState !== State.ACTIVE) return;
    if (state === State.END) cb.current.aoLargar(translationY);
    else cb.current.aoCancelar();
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const aoMudarNaLinha = React.useCallback(criarAoMudar(vistaDaLinha), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const aoMudarNaPega = React.useCallback(criarAoMudar(vistaDaPega), []);

  const envolverPega = React.useCallback((pega: React.ReactElement) => (
    <PanGestureHandler minDist={1} onGestureEvent={aoMexer} onHandlerStateChange={aoMudarNaPega}>
      {/* Uma vista própria por baixo do gesto: o filho de um handler tem de ser nativo. */}
      <View ref={vistaDaPega} collapsable={false}>{pega}</View>
    </PanGestureHandler>
  ), [aoMexer, aoMudarNaPega]);

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
    <PanGestureHandler
      enabled={podeArrastar}
      activateAfterLongPress={TOQUE_LONGO_PARA_ARRASTAR_MS}
      onGestureEvent={aoMexer}
      onHandlerStateChange={aoMudarNaLinha}
    >
      <Animated.View
        ref={vistaDaLinha}
        // O `zIndex` é o que põe a linha pegada POR CIMA das vizinhas. Sem ele
        // ela passa por baixo assim que as alcança, e o que se vê é a música a
        // desaparecer debaixo da lista.
        style={[estilo, activo && styles.aPegar]}
      >
        <View style={activo ? styles.pegada : undefined}>
          {children(podeArrastar ? envolverPega : null)}
        </View>
      </Animated.View>
    </PanGestureHandler>
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
