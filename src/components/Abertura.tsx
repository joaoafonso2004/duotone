import { Image } from 'expo-image';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Animated, AppState, Easing, Platform, Pressable, StyleSheet, View, useWindowDimensions,
} from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { ABERTURA } from '../lib/abertura';
import { useAbertura } from '../state/abertura';
import { useAuth } from '../state/auth';
import { colors } from '../theme';

/**
 * A abertura: um eclipse que se abre no logo, quando a app liga.
 *
 * ## Uma imagem animada, e não um vídeo nem uma animação em código
 *
 * - **Não é vídeo** porque no iPhone isso pedia um leitor do expo-video logo
 *   no arranque -- o mesmo que toca a música. Um segundo leitor mexe na sessão
 *   de áudio (podia calar o Spotify de quem abre a app) e reconstrói os
 *   comandos do Lock Screen.
 * - **Não é `Animated`** porque o efeito precisa de máscaras (o crescente é o
 *   que sobra de um disco depois de outro lhe passar por cima), e a app não
 *   tem nenhuma biblioteca que as faça no telemóvel.
 *
 * Fica um WebP animado com transparência, gerado a partir do `logo_windows.png`
 * pelo `scripts/gerar-abertura.py`. No iPhone o expo-image toca-o com o
 * SDWebImage; no PC é um `<img>`, que o Chromium anima fora da thread de
 * JavaScript. Em ambos anda sozinho enquanto a app arranca por baixo.
 *
 * ## Quando sai
 *
 * Quando a animação acabou E a app está pronta (a sessão lida). Nunca segura
 * a app mais do que o teto; sem o ficheiro a tempo, não há abertura. Um toque
 * salta-a. Quem pediu menos movimento não a vê, e uma app lançada em segundo
 * plano (tarefa de fundo no iPhone, arranque no tabuleiro no PC) também não --
 * não há ninguém a olhar.
 *
 * A saída é o véu a desaparecer com o logo a crescer 4%. No telemóvel com o
 * driver nativo; no PC em CSS -- sob o react-native-web o `Animated` não mexe
 * na opacidade (ver o comentário em `desktop/casca.web.tsx`).
 */

const NA_WEB = Platform.OS === 'web';
/** O fundo de cada casca. No PC é o `COR.fundo` dos tokens, mais escuro. */
const FUNDO = NA_WEB ? '#060608' : colors.bg;
const CURVA_WEB = 'cubic-bezier(0.45, 0, 0.55, 1)';
const FICHEIRO = require('../../assets/abertura.webp');

type Fase = 'a-carregar' | 'a-tocar' | 'a-sair' | 'fim';

export function Abertura() {
  const [fase, setFase] = useState<Fase>(() => (
    AppState.currentState === 'background' ? 'fim' : 'a-carregar'
  ));
  const [tocou, setTocou] = useState(false);
  const [noTeto, setNoTeto] = useState(false);
  const pronta = useAuth((s) => s.initialized);
  const reduzido = useReducedMotion();
  const saida = useRef(new Animated.Value(0)).current;
  const { width, height } = useWindowDimensions();
  // 236 pt num iPhone de 393 (o logo fica com 2/3 disso); no PC, 320 px.
  const lado = Math.min(320, Math.round(Math.min(width, height) * 0.6));

  const sair = useCallback(() => {
    setFase((f) => (f === 'a-carregar' || f === 'a-tocar' ? 'a-sair' : f));
  }, []);

  // Enquanto está à frente, os avisos que aparecem sozinhos esperam (ver
  // `state/abertura.ts`). Na saída já podem vir: sobem enquanto isto some.
  useLayoutEffect(() => {
    useAbertura.setState({ aFrente: fase === 'a-carregar' || fase === 'a-tocar' });
  }, [fase]);
  useEffect(() => () => useAbertura.setState({ aFrente: false }), []);

  // O teto conta desde que a abertura aparece, carregue o ficheiro ou não.
  useEffect(() => {
    const teto = setTimeout(() => setNoTeto(true), ABERTURA.tetoMs);
    return () => clearTimeout(teto);
  }, []);

  useEffect(() => {
    if (fase !== 'a-carregar') return;
    const id = setTimeout(sair, ABERTURA.esperaPeloFicheiroMs);
    return () => clearTimeout(id);
  }, [fase, sair]);

  // Conta a partir do `onLoad`, que no máximo chega com a imagem a começar a
  // andar -- no iPhone pode chegar bem depois, com a thread de JS ocupada (ver
  // `esperaPeloFicheiroMs`). Um atraso só alonga o logo parado no fim; nunca
  // corta o reflexo.
  useEffect(() => {
    if (fase !== 'a-tocar') return;
    const id = setTimeout(() => setTocou(true), ABERTURA.animacaoMs + ABERTURA.seguraMs);
    return () => clearTimeout(id);
  }, [fase]);

  useEffect(() => {
    if ((tocou && pronta) || noTeto || reduzido) sair();
  }, [tocou, pronta, noTeto, reduzido, sair]);

  useEffect(() => {
    if (fase !== 'a-sair') return;
    if (NA_WEB) {
      const id = setTimeout(() => setFase('fim'), ABERTURA.saidaMs);
      return () => clearTimeout(id);
    }
    const animacao = Animated.timing(saida, {
      toValue: 1,
      duration: ABERTURA.saidaMs,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    });
    animacao.start(({ finished }) => { if (finished) setFase('fim'); });
    return () => animacao.stop();
  }, [fase, saida]);

  if (fase === 'fim') return null;

  const saindo = fase === 'a-sair';
  const crescer = reduzido ? 1 : 1 + ABERTURA.crescimento;
  const transicao = (propriedade: string) => ({
    transitionProperty: propriedade,
    transitionDuration: `${ABERTURA.saidaMs}ms`,
    transitionTimingFunction: CURVA_WEB,
  });
  const veu = NA_WEB
    ? { opacity: saindo ? 0 : 1, ...transicao('opacity') }
    : { opacity: saida.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) };
  const logo = NA_WEB
    ? { transform: [{ scale: saindo ? crescer : 1 }], ...transicao('transform') }
    : { transform: [{ scale: saida.interpolate({ inputRange: [0, 1], outputRange: [1, crescer] }) }] };
  const Camada: any = NA_WEB ? View : Animated.View;

  return (
    <Camada
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      // Na saída já não apanha toques: a app por baixo responde logo.
      style={[StyleSheet.absoluteFill, styles.veu, veu, { pointerEvents: saindo ? 'none' : 'auto' }]}
    >
      <Pressable onPress={sair} style={styles.centro}>
        <Camada style={[{ width: lado, height: lado }, logo]}>
          <Image
            source={FICHEIRO}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            // Sem cache: toca uma vez por arranque e não tem de ficar em memória.
            cachePolicy="none"
            // O ficheiro (720 px) é mais largo que o ecrã pede. Reduzir uma
            // imagem animada no iPhone é refazer CADA fotograma a 60 fps; quem
            // encolhe é a GPU, de graça.
            allowDownscaling={false}
            autoplay
            transition={0}
            onLoad={() => setFase((f) => (f === 'a-carregar' ? 'a-tocar' : f))}
            onError={sair}
          />
        </Camada>
      </Pressable>
    </Camada>
  );
}

const styles = StyleSheet.create({
  veu: { backgroundColor: FUNDO, zIndex: 1000 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
