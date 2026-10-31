import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ZONA_DA_MUSICA } from '../lib/doca';
import { hapticSelection } from '../lib/haptics';
import { ENTRADA } from '../lib/movimento';
import { ancoraDoUltimoToque } from '../lib/ultimoToque';
import {
  ANEL_MS, centro, DISCO, destinoNoIphone, fraseDaOrbita, ouvirOrbita, vooEmArco,
  type Retangulo,
} from '../lib/orbita';
import { useDoca } from '../state/doca';
import { pedirFluidez } from '../state/fluidez';
import { usePlayer } from '../state/player';

/**
 * A Órbita no iPhone (C4, 31/10; fecha o A2): ao pôr uma música na fila, a
 * tocar a seguir ou nas Liked Songs pelo menu de uma música, a capa vira disco
 * e voa do dedo para onde a música foi, e acende um anel. Era mudo: tocava-se
 * em "Add to queue" e ficava-se sem saber se tinha entrado.
 *
 * Fica por cima do mini leitor e NÃO lhe mexe (o leitor do iPhone só muda a
 * pedido): o destino sai das medidas da base (`destinoNoIphone`), não do mini.
 * Só transform e opacidade, no driver nativo, e `pedirFluidez` para os 120 Hz.
 * Sem texto no ecrã (decisão de 3/10: pôr na fila não mostra aviso); o
 * VoiceOver ouve a frase. Com menos movimento, só o anel acende, sem voo.
 */
type Voo = { id: number; de: Retangulo; para: Retangulo; capa?: string | null; destino: Parameters<typeof vooEmArco>[2]; calmo: boolean };

export function CamadaDaOrbita() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [voos, setVoos] = useState<Voo[]>([]);
  const calmo = useRef(false);
  const proximo = useRef(0);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => { calmo.current = v; }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => { calmo.current = v; });
    return () => sub.remove();
  }, []);

  useEffect(() => ouvirOrbita((p) => {
    const doca = useDoca.getState();
    const para = destinoNoIphone(p.destino, {
      largura: width, altura: height, fundoSeguro: insets.bottom, separadores: doca.alturaDosSeparadores,
      zonaDaMusica: ZONA_DA_MUSICA, modo: doca.modo, temMusica: !!usePlayer.getState().current,
    });
    AccessibilityInfo.announceForAccessibility(fraseDaOrbita(p.destino, p.titulo));
    if (!para) return false;
    const de = p.de ?? ancoraDoUltimoToque({ largura: width, altura: height });
    setVoos((v) => [...v.slice(-2), { id: ++proximo.current, de, para, capa: p.capa, destino: p.destino, calmo: calmo.current }]);
    return true;
  }), [width, height, insets.bottom]);

  if (!voos.length) return null;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {voos.map((v) => <DiscoQueVoa key={v.id} voo={v} aoAcabar={() => setVoos((l) => l.filter((x) => x.id !== v.id))} />)}
  </View>;
}

function DiscoQueVoa({ voo, aoAcabar }: { voo: Voo; aoAcabar: () => void }) {
  const v = vooEmArco(voo.de, voo.para, voo.destino);
  // Um só relógio (0 a 1) para o x a direito e o y na parábola do lançamento (lib/orbita.ts).
  const t = useRef(new Animated.Value(0)).current;
  const x = t.interpolate({ inputRange: [0, 1], outputRange: [0, v.dx] });
  const y = t.interpolate({ inputRange: v.arco.map((p) => p.t), outputRange: v.arco.map((p) => p.y) });
  const escala = useRef(new Animated.Value(1)).current;
  const visivel = useRef(new Animated.Value(voo.calmo ? 0 : 1)).current;
  const anel = useRef(new Animated.Value(0)).current;
  const anelEscala = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    let vivo = true;
    const acender = () => {
      if (!vivo) return;
      hapticSelection();
      pedirFluidez(ANEL_MS + 100);
      Animated.timing(anelEscala, { toValue: voo.calmo ? 0.9 : 1.25, duration: ANEL_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      Animated.sequence([
        Animated.timing(anel, { toValue: 0.6, duration: ANEL_MS * 0.35, useNativeDriver: true }),
        Animated.timing(anel, { toValue: 0, duration: ANEL_MS * 0.65, useNativeDriver: true }),
      ]).start(() => { if (vivo) aoAcabar(); });
    };
    if (voo.calmo) { acender(); return () => { vivo = false; }; }
    pedirFluidez(v.duracao + 100);
    // Cada valor anda sozinho (nada de Animated.parallel: a regra dos valores sem filhos).
    Animated.timing(t, { toValue: 1, duration: v.duracao, easing: Easing.linear, useNativeDriver: true }).start(({ finished }) => {
      if (!vivo) return;
      visivel.setValue(0);
      if (finished) acender(); else aoAcabar();
    });
    Animated.spring(escala, { toValue: v.escalaFinal, ...ENTRADA, useNativeDriver: true }).start();
    return () => { vivo = false; };
    // Um voo é um acontecimento: corre uma vez, com o que tinha ao nascer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const c = centro(voo.de), alvo = centro(voo.para);
  const ladoDoAnel = Math.max(voo.para.width, voo.para.height) + 10;
  return <>
    <Animated.View style={[s.disco, { left: c.x - DISCO / 2, top: c.y - DISCO / 2, opacity: visivel, transform: [{ translateX: x }, { translateY: y }, { scale: escala }] }]}>
      {voo.capa ? <Image source={{ uri: voo.capa }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
    </Animated.View>
    <Animated.View style={[s.anel, {
      left: alvo.x - ladoDoAnel / 2, top: alvo.y - ladoDoAnel / 2, width: ladoDoAnel, height: ladoDoAnel, borderRadius: ladoDoAnel / 2,
      opacity: anel, transform: [{ scale: anelEscala }],
    }]} />
  </>;
}

const s = StyleSheet.create({
  disco: {
    position: 'absolute', width: DISCO, height: DISCO, borderRadius: DISCO / 2, overflow: 'hidden', backgroundColor: '#34363E',
  },
  anel: { position: 'absolute', borderWidth: 1.5, borderColor: '#E9EAEE' },
});
