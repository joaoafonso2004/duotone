import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { degradesDoPoster } from '../lib/aparencia';
import { colors } from '../theme';

/** A passagem de uma música para a seguinte: a imagem (expo-image) e a cor, juntas. */
const PASSAGEM_MS = 450;

/**
 * O fundo do leitor com a capa "Poster" (16/11, a maquete que o João trouxe): a
 * capa nítida por trás do topo, do título e dos controlos, a toda a largura e
 * até `altura`; em cima e em baixo dissolve-se na cor dela (`corDoAmbiente`,
 * puxada para o escuro até o branco se ler), que continua por trás dos
 * controlos. Era preto nas duas bordas, e o João quis o tom da capa.
 *
 * A cor muda com a música numa passagem (opacidade, no motor nativo), como a
 * imagem: um salto de cor nas bordas a cada skip lia-se como um erro.
 */
export function FundoDoPoster({ uri, tom, altura }: { uri: string | null; tom: string | null; altura: number }) {
  const reduzido = useReducedMotion();
  const cor = tom ?? colors.bg;
  const [camadas, setCamadas] = useState<{ antes: string | null; agora: string }>({ antes: null, agora: cor });
  const entrada = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setCamadas((c) => (c.agora === cor ? c : { antes: c.agora, agora: cor }));
  }, [cor]);

  useEffect(() => {
    if (!camadas.antes) return;
    entrada.setValue(0);
    const a = Animated.timing(entrada, {
      toValue: 1, duration: reduzido ? 0 : PASSAGEM_MS, easing: Easing.out(Easing.quad), useNativeDriver: true,
    });
    a.start(({ finished }) => { if (finished) setCamadas((c) => (c.antes ? { antes: null, agora: c.agora } : c)); });
    return () => a.stop();
  }, [camadas.antes, camadas.agora, entrada, reduzido]);

  const imagem = [styles.imagem, { height: altura }];
  const fundo = (c: string) => <View style={[StyleSheet.absoluteFill, { backgroundColor: c }]} />;
  const veus = (c: string) => {
    const d = degradesDoPoster(c);
    return (
      <>
        <LinearGradient colors={d.topo.cores} locations={d.topo.paragens} style={imagem} />
        <LinearGradient colors={d.baixo.cores} locations={d.baixo.paragens} style={imagem} />
      </>
    );
  };
  const opacidadeDaNova = camadas.antes ? entrada : 1;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {camadas.antes ? fundo(camadas.antes) : null}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: opacidadeDaNova }]}>{fundo(camadas.agora)}</Animated.View>
      {uri ? <Image source={{ uri }} style={imagem} contentFit="cover" transition={PASSAGEM_MS} /> : null}
      {camadas.antes ? veus(camadas.antes) : null}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: opacidadeDaNova }]}>{veus(camadas.agora)}</Animated.View>
      {/* Por baixo da imagem, o tom escurece um pouco até ao fundo do ecrã: dá
          profundidade e não muda a cor que se vê atrás dos controlos. */}
      <LinearGradient colors={['rgba(6,6,8,0)', 'rgba(6,6,8,0.3)']} style={[styles.abaixo, { top: altura }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  imagem: { position: 'absolute', top: 0, left: 0, right: 0 },
  abaixo: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
