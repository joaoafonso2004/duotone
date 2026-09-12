import { Image } from 'expo-image';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Animated, AppState, Easing, Platform, Pressable, StyleSheet, View, useWindowDimensions,
} from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { ABERTURA, PORTAL, escalaParaAbrir } from '../lib/abertura';
import { useAbertura } from '../state/abertura';
import { useAuth } from '../state/auth';

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
 * ## Como sai: o logo vem na direção do ecrã
 *
 * O logo cresce depressa e a app aparece pelo VAZIO que ele tem no meio, até
 * esse vazio passar as bordas. Quem faz isto é o `assets/abertura-portal.png`:
 * o mesmo logo, mas opaco em toda a tela menos no vazio
 * (`scripts/gerar-portal-da-abertura.py`). Ampliá-lo é abrir uma janela para a
 * app, que já está montada por baixo -- a abertura nunca a atrasou, só a
 * tapava.
 *
 * As duas imagens entram no MESMO quadrado, uma por cima da outra, e a saída
 * troca-as: o WebP pára no último fotograma e o portal acende-se. Por isso o
 * portal é gerado com a geometria do WebP -- o logo a 2/3 da tela. Quando
 * enchia a tela, o logo dava um salto de 1,5x no instante da troca e via-se
 * uma segunda camada a aparecer por cima dele.
 *
 * O véu deixa de ser um retângulo inteiro e passa a ser QUATRO tiras à volta
 * do logo: se continuasse inteiro por trás, tapava o vazio e não haveria nada
 * para ver. As tiras entram 2 px por baixo do portal para não ficar uma
 * costura de meio pixel entre elas e ele.
 *
 * Quem pediu menos movimento leva a saída antiga -- o véu a desaparecer com o
 * logo a crescer 4%. Um salto de 34x no ecrã é exatamente o que essa opção
 * existe para evitar.
 */

const NA_WEB = Platform.OS === 'web';
/**
 * O fundo da abertura.
 *
 * É o mesmo nas duas plataformas porque está PINTADO dentro do
 * `abertura-portal.png`: as tiras à volta têm de usar exatamente esta cor, e
 * dois quase-pretos diferentes dariam uma emenda visível a toda a volta do
 * logo durante a ampliação. Era o `colors.bg` (#0A0A0F) no telemóvel; a
 * diferença para este é de quatro níveis em 255.
 */
const FUNDO = '#060608';
const CURVA_WEB = 'cubic-bezier(0.45, 0, 0.55, 1)';
/** A ida ao ecrã acelera: devagar no início, depressa no fim. */
/**
 * A ida ao ecrã acelera -- mas começa a andar cedo. A curva anterior
 * (0.55, 0, 0.85, 0.35) ficava quase parada nos primeiros 200 ms, e com a
 * ida a durar 400 ms isso lia-se como lentidão. Esta é a easeInQuad.
 */
const CURVA_DO_PORTAL_WEB = 'cubic-bezier(0.11, 0, 0.5, 0)';
const FICHEIRO = require('../../assets/abertura.webp');
const PORTAL_FICHEIRO = require('../../assets/abertura-portal.png');

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
  // À parte da escala: a escala acelera e o giro anda sempre ao mesmo ritmo,
  // e uma propriedade `transform` não leva duas curvas.
  const giro = useRef(new Animated.Value(0)).current;
  const desvanecer = useRef(new Animated.Value(0)).current;
  const { width, height } = useWindowDimensions();
  // 236 pt num iPhone de 393 (o logo fica com 2/3 disso); no PC, 320 px.
  const lado = Math.min(320, Math.round(Math.min(width, height) * 0.6));
  // Quanto o portal tem de crescer para o vazio passar as bordas deste ecrã.
  const escalaFinal = escalaParaAbrir(width, height, lado);
  const comPortal = !reduzido;

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
    const duracao = comPortal ? PORTAL.zoomMs : ABERTURA.saidaMs;
    if (NA_WEB) {
      const id = setTimeout(() => setFase('fim'), duracao);
      return () => clearTimeout(id);
    }
    const animacao = comPortal
      ? Animated.parallel([
        // A escala acelera.
        Animated.timing(saida, {
          toValue: 1, duration: duracao, easing: Easing.in(Easing.quad), useNativeDriver: true,
        }),
        // O giro não: ao ritmo da escala só se via no fim, fora do ecrã.
        Animated.timing(giro, {
          toValue: 1, duration: duracao, easing: Easing.linear, useNativeDriver: true,
        }),
        // E o WebP sai por cima do portal, para a troca não dar um clique.
        Animated.timing(desvanecer, {
          toValue: 1, duration: PORTAL.desvanecerMs, easing: Easing.linear, useNativeDriver: true,
        }),
      ])
      // A saída antiga é simétrica e não tem portal nenhum.
      : Animated.timing(saida, {
        toValue: 1, duration: duracao, easing: Easing.inOut(Easing.quad), useNativeDriver: true,
      });
    animacao.start(({ finished }) => { if (finished) setFase('fim'); });
    return () => animacao.stop();
  }, [fase, saida, giro, desvanecer, comPortal]);

  if (fase === 'fim') return null;

  const saindo = fase === 'a-sair';
  const comPortalAgora = saindo && comPortal;
  const crescer = comPortal ? escalaFinal : 1 + ABERTURA.crescimento;
  const transicao = (propriedade: string, ms: number, curva: string) => ({
    transitionProperty: propriedade,
    transitionDuration: `${ms}ms`,
    transitionTimingFunction: curva,
  });

  // Com o portal o véu não desaparece: abre-se. A opacidade só entra na saída
  // antiga, e no PC continua a ser CSS -- sob o react-native-web o `Animated`
  // não mexe na opacidade (ver o comentário em `desktop/casca.web.tsx`).
  const veu = comPortal
    ? null
    : NA_WEB
      ? { opacity: saindo ? 0 : 1, ...transicao('opacity', ABERTURA.saidaMs, CURVA_WEB) }
      : { opacity: saida.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) };
  const logo = NA_WEB
    ? {
        transform: [{ scale: saindo ? crescer : 1 }],
        ...transicao('transform', comPortal ? PORTAL.zoomMs : ABERTURA.saidaMs,
          comPortal ? CURVA_DO_PORTAL_WEB : CURVA_WEB),
      }
    : { transform: [{ scale: saida.interpolate({ inputRange: [0, 1], outputRange: [1, crescer] }) }] };
  // O giro vive numa camada por FORA da escala: uma so `transform` nao leva as
  // duas curvas, e no PC quem anima e o CSS.
  const giroDoLogo = !comPortal
    ? null
    : NA_WEB
      ? {
          transform: [{ rotate: saindo ? `${PORTAL.giroGraus}deg` : '0deg' }],
          ...transicao('transform', PORTAL.zoomMs, 'linear'),
        }
      : {
          transform: [{
            rotate: giro.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${PORTAL.giroGraus}deg`] }),
          }],
        };
  // O WebP para no ultimo fotograma e sai por cima do portal, que se acendeu
  // por baixo dele.
  const saidaDoWebp = !comPortal
    ? null
    : NA_WEB
      ? { opacity: saindo ? 0 : 1, ...transicao('opacity', PORTAL.desvanecerMs, 'linear') }
      : { opacity: desvanecer.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) };
  const Camada: any = NA_WEB ? View : Animated.View;

  // As tiras que tapam o resto do ecrã enquanto o vazio não lá chega.
  //
  // Vivem DENTRO da camada que cresce e as medidas são as do quadrado do logo,
  // por isso a borda interior delas fica colada à borda do portal enquanto ele
  // se amplia -- e o que a app mostra é sempre, e só, o que já passou pelo
  // vazio. Paradas no ecrã (como estavam) a app aparecia dentro do quadrado do
  // logo e mais nada, e o resto do véu desaparecia de uma vez com a camada: um
  // fotograma a libertar o ecrã inteiro em vez de uma abertura.
  //
  // `fora` é o maior lado do ecrã: a s = 1 já cobre o dobro do que falta tapar,
  // e à medida que a camada cresce sobra ainda mais.
  const fora = Math.max(width, height);
  // Meio pixel de costura entre a tira e o portal vê-se numa ampliação destas;
  // 1% do lado entra por cima da moldura do portal, que tem 1/6 de cada lado.
  const costura = Math.max(1, Math.round(lado * PORTAL.costuraDasTiras));
  const tiras = comPortalAgora ? [
    { left: -fora, right: -fora, bottom: lado - costura, height: fora },
    { left: -fora, right: -fora, top: lado - costura, height: fora },
    { top: -fora, bottom: -fora, right: lado - costura, width: fora },
    { top: -fora, bottom: -fora, left: lado - costura, width: fora },
  ] : [];

  return (
    <Camada
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      // Na saída já não apanha toques: a app por baixo responde logo.
      style={[
        StyleSheet.absoluteFill,
        styles.veu,
        // Durante o portal o fundo tem de sair do caminho: quem tapa passam a
        // ser as tiras, e o meio fica aberto para a app.
        comPortalAgora ? styles.semFundo : null,
        veu,
        { pointerEvents: saindo ? 'none' : 'auto' },
      ]}
    >
      <Pressable onPress={sair} style={styles.centro} pointerEvents={saindo ? 'none' : 'auto'}>
        <Camada style={giroDoLogo}>
          <Camada style={[{ width: lado, height: lado }, logo]}>
            {/* Tapam o ecrã à volta do portal e crescem com ele. */}
            {tiras.map((tira, i) => (
              <View key={i} style={[styles.tira, tira]} pointerEvents="none" />
            ))}
            {/* Montado desde o início, invisível, e POR BAIXO do WebP: é o
                mesmo logo com o vazio recortado, e tem de estar pronto no
                instante em que a saída começa (carregá-lo só aí dava um
                piscar). Acende-se tapado pelo WebP, que depois se desvanece --
                é isso que faz a troca ser uma dissolução e não um clique. */}
            {comPortal ? (
              <Image
                source={PORTAL_FICHEIRO}
                style={[StyleSheet.absoluteFill, { opacity: comPortalAgora ? 1 : 0 }]}
                contentFit="contain"
                transition={0}
                allowDownscaling={false}
              />
            ) : null}
            <Camada style={[StyleSheet.absoluteFill, saidaDoWebp]}>
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
          </Camada>
        </Camada>
      </Pressable>
    </Camada>
  );
}

const styles = StyleSheet.create({
  veu: { backgroundColor: FUNDO, zIndex: 1000 },
  semFundo: { backgroundColor: 'transparent' },
  tira: { position: 'absolute', backgroundColor: FUNDO },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
