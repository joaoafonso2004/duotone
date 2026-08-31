import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * O brilho do modo inteligente: um gradiente com pontos a cintilar.
 *
 * A referência é o deslizador de esforço do Claude Code — uma pílula com um
 * campo de pontinhos que piscam, do âmbar ao roxo. O que se aproveita dele não
 * é a forma (aquilo é um deslizador, isto é um botão) mas a **textura**: uma
 * coisa viva, que se percebe à primeira que não é o modo normal.
 *
 * Feito com `Animated` e `expo-linear-gradient`, que já cá estavam — não vale
 * a pena trazer Skia nem Reanimated para umas bolinhas. As mesmas primitivas
 * correm no telemóvel e, via react-native-web, no PC.
 *
 * **Respeita quem pediu menos movimento.** Com o "reduzir movimento" ligado os
 * pontos ficam quietos a meia opacidade: continua a ler-se como o modo
 * especial, sem nada a piscar.
 */

/**
 * Duas implementacoes do mesmo cintilar, e vale a pena dizer porque:
 *
 * - Na WEB e CSS. Uma animacao CSS corre fora da thread de JavaScript, nao
 *   gasta nada, e nao depende de o `requestAnimationFrame` estar a ser
 *   servido. Sao oito pontos por botao; com `Animated` seriam oito ciclos de
 *   JS a mexer em opacidades a 60 Hz por cada botao no ecra.
 * - No TELEMOVEL e `Animated` com o driver nativo, que e o caminho barato la:
 *   a animacao passa para a thread de UI e nem toca no JS.
 *
 * O `useNativeDriver` tem de ser false na web de qualquer maneira: nao ha
 * modulo nativo de animacao no react-native-web.
 */
const DRIVER_NATIVO = Platform.OS !== 'web';
const NA_WEB = Platform.OS === 'web';

const CORES = ['#E8B84B', '#D98BA6', '#A78BFA'] as [string, string, string];

/** Posições fixas, não aleatórias por render: um `Math.random()` no corpo do
 * componente mudava as bolinhas a cada redesenho e a coisa fervia. */
const PONTOS = [
  { x: 0.10, y: 0.30, r: 1.4, atraso: 0 },
  { x: 0.22, y: 0.68, r: 1.1, atraso: 420 },
  { x: 0.35, y: 0.22, r: 1.6, atraso: 180 },
  { x: 0.47, y: 0.60, r: 1.2, atraso: 700 },
  { x: 0.58, y: 0.32, r: 1.5, atraso: 260 },
  { x: 0.70, y: 0.70, r: 1.1, atraso: 900 },
  { x: 0.82, y: 0.28, r: 1.4, atraso: 540 },
  { x: 0.92, y: 0.62, r: 1.2, atraso: 120 },
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

function Ponto({ ponto, largura, altura, parado }: {
  ponto: typeof PONTOS[number]; largura: number; altura: number; parado: boolean;
}) {
  const brilho = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    if (NA_WEB) return;
    if (parado) { brilho.setValue(0.5); return; }
    // Cada ponto com o seu atraso: em fase, aquilo pisca como um alarme em vez
    // de cintilar.
    const ciclo = Animated.loop(Animated.sequence([
      Animated.delay(ponto.atraso),
      Animated.timing(brilho, { toValue: 1, duration: 620, easing: Easing.inOut(Easing.quad), useNativeDriver: DRIVER_NATIVO }),
      Animated.timing(brilho, { toValue: 0.25, duration: 780, easing: Easing.inOut(Easing.quad), useNativeDriver: DRIVER_NATIVO }),
    ]));
    ciclo.start();
    return () => ciclo.stop();
  }, [brilho, parado, ponto.atraso]);

  const base = {
    position: 'absolute' as const,
    left: ponto.x * largura - ponto.r,
    top: ponto.y * altura - ponto.r,
    width: ponto.r * 2,
    height: ponto.r * 2,
    borderRadius: ponto.r,
    backgroundColor: '#FFF7E0',
  };

  // O keyframe `duotone-cintilar` vive em casca.web.tsx. Vai no ESTILO e nao
  // por `className`: o react-native-web gera as classes dele e deita fora a
  // nossa -- verificado no DOM, o elemento saia com `css-g5y9jx r-633pao` e
  // mais nada. As chaves de estilo desconhecidas, essas, passam.
  //
  // NAO VERIFICADO daqui: que os pontos se mexem MESMO. O painel de
  // pre-visualizacao esta escondido e num separador escondido nem CSS nem
  // requestAnimationFrame avancam -- o que se pode confirmar e que o
  // `animationName` e os atrasos chegam ao DOM, e isso esta confirmado.
  if (NA_WEB) {
    return <View
      pointerEvents="none"
      style={[base, {
        opacity: 0.35,
        animationName: 'duotone-cintilar',
        animationDuration: '1.6s',
        animationTimingFunction: 'ease-in-out',
        animationIterationCount: 'infinite',
        animationDelay: `${ponto.atraso}ms`,
      } as any]}
    />;
  }

  return <Animated.View pointerEvents="none" style={[base, { opacity: brilho }]} />;
}

export function BrilhoInteligente({
  largura,
  altura,
  raio,
  quantosPontos = PONTOS.length,
}: {
  largura: number;
  altura: number;
  /** Por omissão fica uma pílula. */
  raio?: number;
  quantosPontos?: number;
}) {
  const parado = usarMovimentoReduzido();
  const pontos = useMemo(() => PONTOS.slice(0, quantosPontos), [quantosPontos]);

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0, top: 0,
        width: largura,
        height: altura,
        borderRadius: raio ?? altura / 2,
        overflow: 'hidden',
      }}
    >
      <LinearGradient
        colors={CORES}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ width: largura, height: altura, opacity: 0.30 }}
      />
      {pontos.map((p, i) => (
        <Ponto key={i} ponto={p} largura={largura} altura={altura} parado={parado} />
      ))}
    </View>
  );
}

/**
 * A marca pequena, para o canto do botão de shuffle e para as linhas da fila.
 *
 * Aqui não cabem pontos — a uns 11 px seriam sujidade. O que fica é a estrela
 * a respirar, que é o mesmo sinal na versão que cabe.
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
      style={[base, {
        opacity: 0.8,
        animationName: 'duotone-cintilar',
        animationDuration: '1.8s',
        animationTimingFunction: 'ease-in-out',
        animationIterationCount: 'infinite',
      } as any]}
    />;
  }

  return <Animated.View pointerEvents="none" style={[base, { opacity: pulso }]} />;
}
