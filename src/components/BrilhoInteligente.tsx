import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * O brilho do modo inteligente: um campo de partículas a atravessar, da
 * direita para a esquerda.
 *
 * A referência é o deslizador de esforço do Claude Code. A primeira versão
 * fazia os pontos piscarem no sítio; o pedido era outro — que ANDEM.
 *
 * **Como é que o ciclo não se nota.** O campo de pontos é desenhado DUAS vezes
 * lado a lado, e a camada inteira desliza exatamente uma largura antes de
 * voltar ao princípio. Como a segunda cópia está onde a primeira estava, o
 * salto cai num sítio onde a imagem é igual e não se vê emenda.
 *
 * Duas implementações do mesmo efeito, de propósito:
 *
 * - Na WEB é CSS. Uma animação CSS corre fora da thread de JavaScript e não
 *   depende de o `requestAnimationFrame` estar a ser servido.
 * - No TELEMÓVEL é `Animated` com o driver nativo, que passa a animação para a
 *   thread de UI e nem toca no JS.
 *
 * O `useNativeDriver` tem de ser false na web de qualquer maneira: não há
 * módulo nativo de animação no react-native-web.
 *
 * **Respeita quem pediu menos movimento**: com essa definição ligada o campo
 * fica quieto, e continua a ler-se como o modo especial.
 */

const DRIVER_NATIVO = Platform.OS !== 'web';
const NA_WEB = Platform.OS === 'web';

const CORES = ['#E8B84B', '#D98BA6', '#A78BFA'] as [string, string, string];

/** Quanto tempo o campo leva a atravessar uma largura. Lento de propósito:
 * isto é um sinal de estado, não um carrossel. */
const SEGUNDOS = 3.2;

/** Posições fixas, não aleatórias por render: um `Math.random()` no corpo do
 * componente mudava as bolinhas a cada redesenho e a coisa fervia. */
const PONTOS = [
  { x: 0.04, y: 0.30, r: 1.4, o: 0.85 },
  { x: 0.13, y: 0.68, r: 1.1, o: 0.45 },
  { x: 0.21, y: 0.22, r: 1.6, o: 1 },
  { x: 0.29, y: 0.55, r: 1.0, o: 0.35 },
  { x: 0.37, y: 0.78, r: 1.3, o: 0.7 },
  { x: 0.45, y: 0.30, r: 1.2, o: 0.5 },
  { x: 0.53, y: 0.62, r: 1.5, o: 0.9 },
  { x: 0.61, y: 0.18, r: 1.1, o: 0.4 },
  { x: 0.69, y: 0.72, r: 1.3, o: 0.75 },
  { x: 0.77, y: 0.38, r: 1.0, o: 0.5 },
  { x: 0.85, y: 0.66, r: 1.5, o: 0.95 },
  { x: 0.93, y: 0.26, r: 1.2, o: 0.6 },
];

function usarMovimentoReduzido(): boolean {
  const [reduzido, setReduzido] = useState(false);
  useEffect(() => {
    let vivo = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { if (vivo) setReduzido(v); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduzido);
    return () => { vivo = false; sub?.remove?.(); };
  }, []);
  return reduzido;
}

/** Uma cópia do campo, deslocada. São duas — ver o comentário do topo. */
function Campo({ largura, altura, deslocamento }: {
  largura: number; altura: number; deslocamento: number;
}) {
  return (
    <>
      {PONTOS.map((p, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: deslocamento + p.x * largura - p.r,
            top: p.y * altura - p.r,
            width: p.r * 2,
            height: p.r * 2,
            borderRadius: p.r,
            backgroundColor: '#FFF7E0',
            opacity: p.o,
          }}
        />
      ))}
    </>
  );
}

/**
 * O brilho preenche o botão em que está — **não tem tamanho próprio**.
 *
 * Tinha: recebia `largura` e `altura` a martelo (132×40 no telemóvel, 150×38 no
 * PC) e desenhava-se em absoluto a partir do canto. Só que os botões não têm
 * esse tamanho — o do telemóvel é `flex: 1` com 48 de altura, e o do PC é
 * medido pelo conteúdo. Dava um bloco de gradiente mais pequeno do que o botão,
 * com um anel escuro à volta.
 *
 * Agora estica-se pelo pai e **mede-se** para saber quanto tem de andar. Quem o
 * usa trata do recorte: o botão leva `overflow: 'hidden'` e é o raio dele que
 * decide a forma, o que dispensa escrever o mesmo raio em dois sítios.
 */
export function BrilhoInteligente() {
  const parado = usarMovimentoReduzido();
  const desliza = useRef(new Animated.Value(0)).current;
  const [medida, setMedida] = useState({ largura: 0, altura: 0 });
  const { largura, altura } = medida;

  useEffect(() => {
    // Sem medida ainda não há distância nenhuma para percorrer.
    if (NA_WEB || parado || largura <= 0) return;
    desliza.setValue(0);
    const ciclo = Animated.loop(
      Animated.timing(desliza, {
        toValue: -largura,
        duration: SEGUNDOS * 1000,
        easing: Easing.linear,
        useNativeDriver: DRIVER_NATIVO,
      }),
    );
    ciclo.start();
    return () => ciclo.stop();
  }, [desliza, largura, parado]);

  // A camada tem o DOBRO da largura e leva o campo duas vezes: é isso que
  // torna o regresso ao princípio invisível.
  const camada = {
    position: 'absolute' as const,
    left: 0, top: 0,
    width: largura * 2,
    height: altura,
  };
  const animacaoWeb = parado ? {} : {
    animationName: 'duotone-atravessar',
    animationDuration: `${SEGUNDOS}s`,
    animationTimingFunction: 'linear',
    animationIterationCount: 'infinite',
  };

  return (
    <View
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        // Só quando muda mesmo. O `onLayout` dispara a cada redesenho, e
        // reiniciar a animação em cada um fazia o campo tremer no sítio.
        setMedida((antes) => (
          Math.abs(antes.largura - width) < 1 && Math.abs(antes.altura - height) < 1
            ? antes
            : { largura: width, altura: height }
        ));
      }}
      style={StyleSheet.absoluteFill}
    >
      <LinearGradient
        colors={CORES}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[StyleSheet.absoluteFill, { opacity: 0.30 }]}
      />
      {largura > 0 && (NA_WEB ? (
        <View style={[camada, animacaoWeb as any]}>
          <Campo largura={largura} altura={altura} deslocamento={0} />
          <Campo largura={largura} altura={altura} deslocamento={largura} />
        </View>
      ) : (
        <Animated.View style={[camada, { transform: [{ translateX: desliza }] }]}>
          <Campo largura={largura} altura={altura} deslocamento={0} />
          <Campo largura={largura} altura={altura} deslocamento={largura} />
        </Animated.View>
      ))}
    </View>
  );
}

/**
 * A marca pequena, para o canto do botão de shuffle e para as linhas da fila.
 *
 * Aqui não cabem partículas — a 7 px seriam sujidade. Fica um ponto a
 * respirar, que é o mesmo sinal na versão que cabe.
 */
export function EstrelaInteligente({ tamanho = 11, cor = '#E8B84B' }: {
  tamanho?: number; cor?: string;
}) {
  const parado = usarMovimentoReduzido();
  const pulso = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (NA_WEB) return;
    if (parado) { pulso.setValue(0.9); return; }
    const ciclo = Animated.loop(Animated.sequence([
      Animated.timing(pulso, { toValue: 0.55, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: DRIVER_NATIVO }),
      Animated.timing(pulso, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: DRIVER_NATIVO }),
    ]));
    ciclo.start();
    return () => ciclo.stop();
  }, [pulso, parado]);

  const base = {
    width: tamanho, height: tamanho, borderRadius: tamanho / 2, backgroundColor: cor,
  };

  if (NA_WEB) {
    return <View
      pointerEvents="none"
      style={[base, parado ? { opacity: 0.8 } : {
        opacity: 0.8,
        animationName: 'duotone-respirar',
        animationDuration: '1.8s',
        animationTimingFunction: 'ease-in-out',
        animationIterationCount: 'infinite',
      } as any]}
    />;
  }

  return <Animated.View pointerEvents="none" style={[base, { opacity: pulso }]} />;
}
