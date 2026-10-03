import { NavigationContext } from '@react-navigation/native';
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Easing, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  ALTURA_MAXIMA, BARRAS, FASES_PARADAS, LARGURA, PASSAGEM_MS, amostrasDaOnda, pecasDaCapsula,
} from '../lib/barrasDaFaixa';
import { usePlayer } from '../state/player';

/**
 * As barrinhas por cima da capa da música que toca (3/10, `lib/barrasDaFaixa.ts`).
 * A tocar mexem; em pausa encolhem, suaves, até serem reticências, e voltam a
 * crescer ao tocar. Tudo no motor nativo.
 *
 * Só andam à vista: com a app atrás, o ecrã fora de foco (os separadores ficam
 * todos montados) ou o leitor aberto por cima, a onda pára onde está. Retoma do
 * princípio -- mas ninguém viu onde tinha parado.
 */
export function BarrasDaFaixa() {
  const aTocar = usePlayer((s) => s.isPlaying);
  const aVista = useAVista();
  const reduzido = useReducedMotion();
  const fases = useRef(BARRAS.map(() => new Animated.Value(0))).current;
  const tocando = useRef(new Animated.Value(aTocar ? 1 : 0)).current;
  const entrada = useRef(new Animated.Value(0)).current;

  // Os nós uma vez só: refazê-los a cada desenho religava o grafo nativo.
  const barras = useMemo(() => fases.map((fase, i) => {
    const extra = Animated.multiply(fase.interpolate({ ...amostrasDaOnda(i), extrapolate: 'clamp' }), tocando);
    const { escalaDoMeio } = pecasDaCapsula(1);
    return {
      cima: Animated.multiply(extra, -0.5),
      baixo: Animated.multiply(extra, 0.5),
      // Um quase nada acima de zero: uma escala 0 é uma matriz sem inversa.
      meio: Animated.add(Animated.multiply(extra, escalaDoMeio), 0.0001),
    };
  }), [fases, tocando]);

  useEffect(() => {
    Animated.timing(entrada, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [entrada]);

  // Da barra ao ponto e de volta.
  useEffect(() => {
    const passagem = Animated.timing(tocando, {
      toValue: aTocar ? 1 : 0, duration: PASSAGEM_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    });
    passagem.start();
    return () => passagem.stop();
  }, [aTocar, tocando]);

  // A onda continua enquanto encolhe, e só pára depois: parar no instante da
  // pausa congelava as barras a meio e via-se.
  const [onda, setOnda] = useState(aTocar);
  useEffect(() => {
    if (aTocar) { setOnda(true); return; }
    const t = setTimeout(() => setOnda(false), PASSAGEM_MS + 40);
    return () => clearTimeout(t);
  }, [aTocar]);

  const anda = onda && aVista && !reduzido;
  useEffect(() => {
    if (reduzido) { fases.forEach((f, i) => f.setValue(FASES_PARADAS[i])); return; }
    if (!anda) return;
    // Do 0, sempre: o loop nativo volta ao valor com que COMEÇOU, e a onda só
    // fecha sem salto entre 0 e 1 (ver "Nunca uma sequência de ida e volta"
    // no CLAUDE.md). Quando recomeça, as barras são pontos -- não se vê.
    const voltas = fases.map((f, i) => {
      f.setValue(0);
      return Animated.loop(Animated.timing(f, {
        toValue: 1, duration: BARRAS[i].duracaoMs, easing: Easing.linear, useNativeDriver: true,
      }));
    });
    voltas.forEach((v) => v.start());
    return () => voltas.forEach((v) => v.stop());
  }, [anda, reduzido, fases]);

  return (
    <Animated.View pointerEvents="none" style={[styles.veu, { opacity: entrada }]}>
      {barras.map((b, i) => (
        <View key={i} style={styles.barra}>
          <Animated.View style={[styles.meio, { transform: [{ scaleY: b.meio }] }]} />
          <Animated.View style={[styles.ponto, { transform: [{ translateY: b.cima }] }]} />
          <Animated.View style={[styles.ponto, { transform: [{ translateY: b.baixo }] }]} />
        </View>
      ))}
    </Animated.View>
  );
}

/** Se alguém pode estar a ver: a app à frente, o ecrã em foco e o leitor fechado. */
function useAVista(): boolean {
  // Opcional: uma linha também pode viver fora de um ecrã do navegador.
  const navegacao = useContext(NavigationContext);
  const [focado, setFocado] = useState(() => navegacao?.isFocused() ?? true);
  useEffect(() => {
    if (!navegacao) return;
    setFocado(navegacao.isFocused());
    const a = navegacao.addListener('focus', () => setFocado(true));
    const b = navegacao.addListener('blur', () => setFocado(false));
    return () => { a(); b(); };
  }, [navegacao]);
  const [ativa, setAtiva] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (e) => setAtiva(e === 'active'));
    return () => sub.remove();
  }, []);
  const leitorAberto = usePlayer((s) => s.expanded);
  return focado && ativa && !leitorAberto;
}

const styles = StyleSheet.create({
  // A capa escurece um pouco: as barras leem-se em qualquer capa, clara ou escura.
  veu: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.42)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  barra: { width: LARGURA, height: ALTURA_MAXIMA },
  meio: {
    position: 'absolute',
    top: LARGURA / 2,
    width: LARGURA,
    height: ALTURA_MAXIMA - LARGURA,
    backgroundColor: '#fff',
  },
  ponto: {
    position: 'absolute',
    top: (ALTURA_MAXIMA - LARGURA) / 2,
    width: LARGURA,
    height: LARGURA,
    borderRadius: LARGURA / 2,
    backgroundColor: '#fff',
  },
});
