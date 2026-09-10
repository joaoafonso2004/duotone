import React, { useEffect, useRef, useState } from 'react';
import { AppState, Image, PixelRatio, StyleSheet, Text, View } from 'react-native';
import { Asset } from 'expo-asset';
import { addLowPowerModeListener, isLowPowerModeEnabledAsync } from 'expo-battery';
import { requireOptionalNativeModule } from 'expo';
import type { ExpoWebGLRenderingContext } from 'expo-gl';
import { definirAnaliseDaCapa, lerAnaliseDaCapa, temAnaliseDaCapa, VALORES_DA_CAPA } from '../../modules/duotone-audio';
import { criarRendererIOS, MULTIPLICADOR } from '../lib/glitchRendererIOS';
import { getEffectIntensity } from '../lib/prefs';
import { loadCapaIOS, useCapaIOS } from '../state/capaIOS';
import { useReducedMotion } from '../hooks/useReducedMotion';
import type { CapaReactivaProps } from './CapaReactiva';

// Uma build antiga continua a mostrar a capa normal, mesmo com este bundle.
const GLView: typeof import('expo-gl').GLView | null = requireOptionalNativeModule('ExpoGL') ? require('expo-gl').GLView : null;

/**
 * A que ritmo se desenha -- e porque nao sao 60.
 *
 * Pelo desenho do proprio shader, o efeito nao TEM 60 estados por segundo: os
 * desvios RGB so se sorteiam a 15 Hz (`passo = floor(segundos * 15)`) e o
 * espectro vem com suavizacao 0,68, que e uma media de umas cinco leituras.
 * A 60 desenhava-se duas vezes a mesma coisa.
 *
 * E custava a dobrar nos dois sitios que pesam: o desenho na GPU, e uma ida
 * assincrona a thread principal por fotograma a transportar 257 numeros.
 *
 * Com menos movimento pedido, cai para o proprio passo do shader: ve-se cada
 * estado do glitch e nada pelo meio.
 */
const FPS = 30;
const FPS_REDUZIDO = 15;
type Renderer = ReturnType<typeof criarRendererIOS>;
export function CapaReactiva({ uri, size, active, onError }: CapaReactivaProps) {
  const mode = useCapaIOS(s => s.mode), feedback = useCapaIOS(s => s.feedback);
  const reduced = useReducedMotion();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  /**
   * O MODO DE POUPANCA DO IOS desliga o efeito.
   *
   * Quando alguem liga a poupanca de bateria, o sistema esta literalmente a
   * dizer "poupa-me" -- e a app ignorava-o. E a reducao automatica mais
   * legitima que ha, porque foi o utilizador a pedi-la, e por isso nao tem
   * interruptor: obedecer a uma definicao do sistema nao se negocia.
   *
   * A capa fica na mesma, parada. Nao desaparece nada.
   */
  const [poupanca, setPoupanca] = useState(false);
  const [label, setLabel] = useState(false);
  // A MESMA preferência do PC ("Effect intensity"). Estava presa em `normal`,
  // e era por isso que baixar a intensidade não fazia nada no telemóvel.
  const [intensidade, setIntensidade] = useState(1);
  const initialFeedback = useRef(feedback);
  useEffect(() => { void loadCapaIOS(); }, []);
  useEffect(() => {
    let vivo = true;
    void getEffectIntensity()
      .then((v) => { if (vivo) setIntensidade(MULTIPLICADOR[v] ?? 1); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => listener.remove();
  }, []);
  useEffect(() => {
    let vivo = true;
    void isLowPowerModeEnabledAsync().then((v) => { if (vivo) setPoupanca(v); }).catch(() => {});
    // E enquanto a app esta aberta: ligar a poupanca a meio de uma musica tem
    // de apagar o efeito nesse instante, e nao so da proxima vez.
    const sub = addLowPowerModeListener(({ lowPowerMode }) => setPoupanca(lowPowerMode));
    return () => { vivo = false; sub.remove(); };
  }, []);
  useEffect(() => {
    if (feedback === initialFeedback.current) return;
    setLabel(true); const timer = setTimeout(() => setLabel(false), 1000);
    return () => clearTimeout(timer);
  }, [feedback]);
  const enabled = active && foreground && !poupanca && mode === 'reactive' && temAnaliseDaCapa && !!GLView;
  return <View style={StyleSheet.absoluteFill}>
    <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={onError} />
    {/* A intensidade entra na `key`: fica cozida no programa de GL, e mudá-la
        nas Definições tem de reconstruir a superfície. */}
    {enabled && <ReactiveSurface key={`${uri}:${size}:${reduced}:${intensidade}`}
      uri={uri} size={size} fps={reduced ? FPS_REDUZIDO : FPS} intensidade={intensidade} />}
    {label && <View style={styles.label}><Text style={styles.labelText}>{mode === 'reactive' ? 'Reactive' : mode === 'static' ? 'Static' : 'Off'}</Text></View>}
  </View>;
}
function ReactiveSurface({ uri, size, fps, intensidade }:
  { uri: string; size: number; fps: number; intensidade: number }) {
  const renderer = useRef<Renderer | null>(null);
  const alive = useRef(true);
  const samples = useRef<number[]>([]);
  const [signal, setSignal] = useState(false);
  const [receivedAudio, setReceivedAudio] = useState(false);
  const [ready, setReady] = useState(false);
  const failed = useRef(false);
  useEffect(() => {
    alive.current = true;
    definirAnaliseDaCapa(true);
    let frame = 0, timer: ReturnType<typeof setTimeout> | undefined, last = -Infinity;
    const tick = async (now: number) => {
      if (!alive.current || failed.current) return;
      if (now - last < 1000 / fps - 1) { frame = requestAnimationFrame(tick); return; }
      last = now;
      const values = await lerAnaliseDaCapa();
      if (!alive.current || failed.current) return;
      samples.current = values;
      setSignal(values.length === VALORES_DA_CAPA);
      if (values.length === VALORES_DA_CAPA) {
        setReceivedAudio(true);
        try { renderer.current?.draw(values, now / 1000); }
        catch { failed.current = true; setReady(false); definirAnaliseDaCapa(false); return; }
        frame = requestAnimationFrame(tick);
      } else {
        // HLS/buffering: capa estática e apenas uma verificação a cada 250 ms.
        timer = setTimeout(() => { frame = requestAnimationFrame(tick); }, 250);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => {
      alive.current = false; cancelAnimationFrame(frame); clearTimeout(timer);
      definirAnaliseDaCapa(false); renderer.current?.destroy(); renderer.current = null;
    };
  }, [fps]);
  const create = async (gl: ExpoWebGLRenderingContext) => {
    try {
      const asset = await Asset.fromURI(uri).downloadAsync();
      if (!alive.current) return;
      const localUri = asset.localUri; if (!localUri) throw Error('missing artwork');
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        Image.getSize(localUri, (width, height) => resolve({ width, height }), reject);
      });
      if (!alive.current) return;
      const result = criarRendererIOS(gl, size, { localUri, ...dimensions }, intensidade);
      // ENQUANTO CARREGA, A CAPA NORMAL. O `ready` só passa a true depois de se
      // confirmar que saiu mesmo imagem na textura -- ver o `desenhouAlgo`. Sem
      // esta confirmação, a superfície aparecia à frente da capa antes de ela
      // ter chegado à GPU, e o que se via era um quadrado preto em vez da capa
      // com o efeito de respiração por baixo.
      if (!result.desenhouAlgo()) { result.destroy(); throw Error('capa vazia'); }
      if (!alive.current) { result.destroy(); return; }
      renderer.current = result;
      if (samples.current.length === VALORES_DA_CAPA) result.draw(samples.current, performance.now() / 1000);
      setReady(true);
    } catch {
      if (alive.current) { failed.current = true; setReady(false); definirAnaliseDaCapa(false); }
    }
  };
  // Limitar a resolução a 1,5x sem alterar o tamanho visual da capa.
  const scale = Math.min(1, 1.5 / PixelRatio.get()), bufferSize = size * scale;
  return GLView && receivedAudio ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', opacity: signal && ready ? 1 : 0 }]}>
    <GLView msaaSamples={0} onContextCreate={create} style={{ width: bufferSize, height: bufferSize, transform: [{ scale: 1 / scale }] }} />
  </View> : null;
}
const styles = StyleSheet.create({
  label: { position: 'absolute', bottom: 16, alignSelf: 'center', paddingHorizontal: 13, paddingVertical: 7, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.65)' },
  labelText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
