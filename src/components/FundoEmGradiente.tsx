import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { lerCelulasDaCapa } from '../lib/celulasDaCapa';
import { coresDoGradiente } from '../lib/corDaCapa';
import { pedirFluidez } from '../state/fluidez';

type Par = [string, string];
/** Sem capa, ou enquanto ela não se lê: o fundo da app. */
const SEM_CAPA: Par = ['#1A1A22', '#0A0A0F'];
/** Uma volta inteira do movimento: devagar, para se sentir e não se ver. */
const VOLTA_MS = 18_000;
/** A passagem das cores de uma música para as da seguinte. */
const PASSAGEM_MS = 600;
// Uma volta de 0 a 1 com o mesmo valor nas duas pontas: a onda recomeça sem
// salto. Em amostras, porque o motor nativo só interpola por troços.
const AMOSTRAS = Array.from({ length: 9 }, (_, i) => i / 8);
const ONDA = AMOSTRAS.map((t) => (1 - Math.cos(2 * Math.PI * t)) / 2);

/**
 * O fundo "Gradient" do leitor do iPhone (10/10, personalização, fase 2): duas
 * cores da capa (`coresDoGradiente`), em diagonal, e por cima o mesmo par na
 * diagonal oposta a aparecer e desaparecer devagar. O movimento é só
 * opacidade, no motor nativo, e fica a 60 Hz de propósito: pedir os 120 Hz
 * durante uma volta que não acaba era aquecer o telemóvel por um efeito que se
 * quer lento. Só a passagem das cores de uma música para a outra os pede.
 *
 * Pára quando não se vê (o leitor fechado, a app atrás) e com o movimento
 * reduzido, como a capa 3D a flutuar.
 */
export function FundoEmGradiente({ uri, animar }: { uri: string | null; animar: boolean }) {
  const reduzido = useReducedMotion();
  const [aFrente, setAFrente] = useState(AppState.currentState === 'active');
  const [camadas, setCamadas] = useState<{ antes: Par | null; agora: Par }>({ antes: null, agora: SEM_CAPA });
  const entrada = useRef(new Animated.Value(1)).current;
  const volta = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (e) => setAFrente(e === 'active'));
    return () => sub.remove();
  }, []);

  // As cores da capa (em cache por endereço: voltar a uma música não lê outra vez).
  useEffect(() => {
    let vivo = true;
    void lerCelulasDaCapa(uri).then((celulas) => {
      if (!vivo) return;
      const par = coresDoGradiente(celulas) ?? SEM_CAPA;
      setCamadas((c) => (c.agora[0] === par[0] && c.agora[1] === par[1] ? c : { antes: c.agora, agora: par }));
    });
    return () => { vivo = false; };
  }, [uri]);

  useEffect(() => {
    if (!camadas.antes) return;
    entrada.setValue(0);
    pedirFluidez(PASSAGEM_MS + 100);
    const a = Animated.timing(entrada, { toValue: 1, duration: reduzido ? 0 : PASSAGEM_MS, easing: Easing.out(Easing.quad), useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [camadas, entrada, reduzido]);

  useEffect(() => {
    volta.stopAnimation();
    volta.setValue(0);
    if (!animar || !aFrente || reduzido) return;
    const a = Animated.loop(Animated.timing(volta, { toValue: 1, duration: VOLTA_MS, easing: Easing.linear, useNativeDriver: true }));
    a.start();
    return () => a.stop();
  }, [animar, aFrente, reduzido, volta]);

  const opacidadeDoPar = volta.interpolate({ inputRange: AMOSTRAS, outputRange: ONDA });
  const par = (cores: Par) => (
    <>
      <LinearGradient colors={cores} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: opacidadeDoPar }]}>
        <LinearGradient colors={[cores[1], cores[0]]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </>
  );
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {camadas.antes ? par(camadas.antes) : null}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: entrada }]}>
        {par(camadas.agora)}
      </Animated.View>
    </View>
  );
}
