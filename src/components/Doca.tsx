import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { comAlfa, posicoesDaDoca, ZONA_DA_MUSICA } from '../lib/doca';
import { molaIOS } from '../lib/transicaoDoLeitor';
import { geometriaDoVidro, MUSICA_NO_VIDRO, VIDRO_DA_BASE } from '../lib/vidroDaBase';
import { MINI_PLAYER_HEIGHT } from '../theme';
import { IconesDosSeparadores, SelecaoDoVidro } from '../navigation/BarraDeSeparadores';
import { definirAlturaDosSeparadores, desvioDaMusica, desvioDoVidro, desvioDosIcones, useAlturaDosSeparadores, useDoca } from '../state/doca';
import { pedirFluidez } from '../state/fluidez';
import { usePlayer } from '../state/player';
import { useTheme } from '../state/theme';
import { useOutroAparelho } from '../state/outroAparelho';
import { LinguetaDoOutroAparelho, MiniDoOutroAparelho } from './OutroAparelho';
import { useVidro, Vidro } from './Vidro';

/**
 * A base de baixo do iPhone: o mini-player e os separadores numa peça só de
 * vidro (3/10, variante A de `docs/base-e-barrinhas.html`). Eram duas peças de
 * materiais diferentes -- um cartão opaco pousado numa barra desfocada -- e
 * liam-se como duas coisas coladas.
 *
 * Aqui só o vidro e os separadores; a linha da música é do `PlayerRoot`, por
 * cima (é lá que vivem o gesto, a capa que voa e o resto do leitor). Os dois
 * mexem-se pelos mesmos valores (`state/doca.ts`), no motor nativo:
 *  - fechar a música (deslizar para a direita) desce o vidro até ficar só a
 *    altura dos separadores;
 *  - um ecrã aberto por cima das secções tira os separadores, e a música desce
 *    para o fundo;
 *  - nas Definições, no Library check e no Importar sai tudo (`ECRAS_SEM_BASE`).
 *
 * Vive DENTRO da app de trás (RootNavigator), por cima dos ecrãs: recua com ela
 * quando o leitor abre, como a barra dos separadores recuava.
 */
export function Doca() {
  const insets = useSafeAreaInsets();
  const modo = useDoca((s) => s.modo);
  const separadores = useDoca((s) => s.separadores);
  // Também a fechar (o som a desvanecer) já conta como sem música: o vidro
  // desce com a linha a sair, e não 300 ms depois (3/10).
  const comMusicaNaLoja = usePlayer((s) => !!s.current && !s.closing);
  const aFechar = useDoca((s) => s.aFechar);
  // O outro aparelho a tocar e nada aqui (1/11): a linha da música é a dele.
  const doOutro = useOutroAparelho((s) => !!s.oferta);
  const temMusica = (comMusicaNaLoja && !aFechar) || (doOutro && !comMusicaNaLoja);
  const alturaDosSeparadores = useAlturaDosSeparadores();
  const reduzido = useReducedMotion();
  const primeira = useRef(true);

  useEffect(() => {
    const alvo = posicoesDaDoca(modo, temMusica, insets.bottom, alturaDosSeparadores);
    const pares: [Animated.Value, number][] = [[desvioDoVidro, alvo.vidro], [desvioDaMusica, alvo.musica], [desvioDosIcones, alvo.icones]];
    if (primeira.current || reduzido) {
      primeira.current = false;
      for (const [valor, para] of pares) valor.setValue(para);
      return;
    }
    // Cada uma à parte, e não num `Animated.parallel`: a da música fica sem
    // quem a use quando a música fecha, e o React Native pára-a -- num
    // `parallel`, parava as outras com ela (ver "A abertura e o raio" no CLAUDE.md).
    const molas = pares.map(([valor, para]) =>
      Animated.spring(valor, { toValue: para, ...molaIOS(0.46, 0.9), useNativeDriver: true }));
    pedirFluidez(800);
    molas.forEach((m) => m.start());
    return () => molas.forEach((m) => m.stop());
  }, [modo, temMusica, insets.bottom, alturaDosSeparadores, reduzido]);

  const altura = ZONA_DA_MUSICA + alturaDosSeparadores + insets.bottom;
  // O Liquid Glass (opção da Customise), refeito a 27/11 depois da 7.2.8
  // (`lib/vidroDaBase.ts`): duas cápsulas soltas como a barra do iOS 26, a dos
  // separadores e a da música, cada uma com o vidro do sistema e a sua forma (o
  // raio no próprio vidro, sem vista de fora a cortá-lo: cortado, perde o rebordo).
  const vidro = useVidro();
  const [linha, setLinha] = useState(0);
  const [larguraDaCapsula, setLarguraDaCapsula] = useState(0);
  const geo = geometriaDoVidro(insets.bottom, linha);
  // A altura que o resto da app conta (o fim das listas, a linha da música, os
  // avisos) passa a ser a da cápsula: tudo fica por cima dela.
  useEffect(() => { if (vidro && linha > 0) definirAlturaDosSeparadores(geo.separadores); }, [vidro, linha, geo.separadores]);
  const musicaNoVidro = useRef(new Animated.Value(temMusica ? 1 : 0)).current;
  useEffect(() => {
    if (!vidro || reduzido) { musicaNoVidro.setValue(temMusica ? 1 : 0); return; }
    pedirFluidez(400);
    const a = Animated.timing(musicaNoVidro, { toValue: temMusica ? 1 : 0, duration: 220, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [vidro, temMusica, reduzido, musicaNoVidro]);
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {vidro ? <>
        {/* O fundo a escurecer por trás das cápsulas: o que passa por baixo do vidro
            não compete com os nomes (o "deliquify" das referências do iOS 26). */}
        <Animated.View pointerEvents="none" style={[styles.esbatido, { height: altura + 28, transform: [{ translateY: desvioDoVidro }] }]}>
          <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.72)']} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
        </Animated.View>
        {/* A cápsula da música, por baixo da linha dela (que é do PlayerRoot). */}
        <Animated.View pointerEvents="none" style={[styles.capsulaDaMusica, {
          bottom: alturaDosSeparadores + insets.bottom + 4, opacity: musicaNoVidro, transform: [{ translateY: desvioDaMusica }],
        }]}>
          <Vidro style={[StyleSheet.absoluteFill, { borderRadius: MINI_PLAYER_HEIGHT / 2 }]} />
        </Animated.View>
      </> : (
        // Sem `pointerEvents`: o vidro engole os toques que não acertam num botão,
        // para não irem parar à lista por baixo.
        <Animated.View style={[styles.vidro, { height: altura, transform: [{ translateY: desvioDoVidro }] }]}>
          <BlurView tint="dark" intensity={85} style={StyleSheet.absoluteFill} />
          <TintaDaDoca />
        </Animated.View>
      )}
      <Animated.View
        pointerEvents={modo === 'separadores' ? 'box-none' : 'none'}
        style={[styles.icones, { paddingBottom: vidro ? geo.fundo : insets.bottom, transform: [{ translateY: desvioDosIcones }] }]}
      >
        {vidro ? (
          // A cápsula dos separadores: o vidro, a cápsula do escolhido e os ícones.
          // Engole os toques que não acertam num ícone.
          <View style={[styles.capsulaDosSeparadores, { height: geo.altura }]} onLayout={(e) => setLarguraDaCapsula(e.nativeEvent.layout.width)}>
            <Vidro style={[StyleSheet.absoluteFill, { borderRadius: geo.raio }]} />
            {separadores ? <SelecaoDoVidro state={separadores.state} position={separadores.position} largura={larguraDaCapsula} altura={geo.altura} /> : null}
            <View style={styles.linhaNoVidro} onLayout={(e) => setLinha(e.nativeEvent.layout.height)}>
              {separadores ? <IconesDosSeparadores state={separadores.state} navigation={separadores.navigation} /> : null}
            </View>
          </View>
        ) : (
          // Medidos aqui: é esta altura que o resto da app usa (auditoria 1.3).
          <View onLayout={(e) => definirAlturaDosSeparadores(e.nativeEvent.layout.height)}>
            {separadores ? <IconesDosSeparadores state={separadores.state} navigation={separadores.navigation} /> : null}
          </View>
        )}
      </Animated.View>
      {/* O outro aparelho (1/11): a lingueta no canto do vidro com música aqui,
          o mini dele na linha da música sem nada aqui. */}
      {modo === 'separadores' && comMusicaNaLoja ? <LinguetaDoOutroAparelho alturaDoVidro={altura} /> : null}
      {modo !== 'escondida' && !comMusicaNaLoja ? <MiniDoOutroAparelho /> : null}
    </View>
  );
}

/**
 * A cor da capa no topo do vidro -- só com "seguir a cor da capa" ligado
 * (João, 3/10). Desligado, o vidro é neutro. A cor animada (`theme`) e não o
 * destino: a passagem entre capas vê-se, e só este bocado redesenha.
 */
function TintaDaDoca() {
  const segue = useTheme((s) => s.mode === 'cover');
  const cor = useTheme((s) => s.theme.color);
  return (
    <>
      <View style={[StyleSheet.absoluteFill, styles.tinta]} />
      {segue ? (
        <LinearGradient
          colors={[comAlfa(cor, 0.26), comAlfa(cor, 0)]}
          locations={[0, 0.6]}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  vidro: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderCurve: 'continuous',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
  // A tinta escura. Com 66% e o desfoque a 60, as screenshots de 4/10 liam o
  // texto das listas por baixo dos nomes dos separadores ("you were good to
  // me" entre "Songs" e "Artists"): mais desfoque e um pouco mais de tinta. A
  // cor do que passa continua a ver-se; as letras não.
  tinta: { backgroundColor: 'rgba(6,6,8,0.74)' },
  // O Liquid Glass (`lib/vidroDaBase.ts`).
  esbatido: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  capsulaDaMusica: {
    position: 'absolute', left: MUSICA_NO_VIDRO.margem, right: MUSICA_NO_VIDRO.margem, height: MINI_PLAYER_HEIGHT,
  },
  capsulaDosSeparadores: { marginHorizontal: VIDRO_DA_BASE.margem, justifyContent: 'center' },
  linhaNoVidro: { paddingHorizontal: VIDRO_DA_BASE.folgaDaLinha },
  icones: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
