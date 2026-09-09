import React, { useEffect, useRef, useState } from 'react';
import { AppState, Image, PixelRatio, StyleSheet, Text, View } from 'react-native';
import { Asset } from 'expo-asset';
import { requireOptionalNativeModule } from 'expo';
import type { ExpoWebGLRenderingContext } from 'expo-gl';
import { definirAnaliseDaCapa, lerAnaliseDaCapa, temAnaliseDaCapa } from '../../modules/duotone-audio';
import { criarRendererIOS } from '../lib/glitchRendererIOS';
import { loadCapaIOS, useCapaIOS } from '../state/capaIOS';
import { useReducedMotion } from '../hooks/useReducedMotion';
import type { CapaReactivaProps } from './CapaReactiva';

// Uma build antiga continua a mostrar a capa normal, mesmo com este bundle.
const GLView: typeof import('expo-gl').GLView | null = requireOptionalNativeModule('ExpoGL') ? require('expo-gl').GLView : null;
type Renderer = ReturnType<typeof criarRendererIOS>;
export function CapaReactiva({ uri, size, active, onError }: CapaReactivaProps) {
  const mode = useCapaIOS(s => s.mode), feedback = useCapaIOS(s => s.feedback);
  const reduced = useReducedMotion();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [label, setLabel] = useState(false);
  const initialFeedback = useRef(feedback);
  useEffect(() => { void loadCapaIOS(); }, []);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (feedback === initialFeedback.current) return;
    setLabel(true); const timer = setTimeout(() => setLabel(false), 1000);
    return () => clearTimeout(timer);
  }, [feedback]);
  const enabled = active && foreground && mode === 'reactive' && temAnaliseDaCapa && !!GLView;
  return <View style={StyleSheet.absoluteFill}>
    <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={onError} />
    {enabled && <ReactiveSurface key={`${uri}:${size}:${reduced}`} uri={uri} size={size} fps={reduced ? 30 : 60} />}
    {label && <View style={styles.label}><Text style={styles.labelText}>{mode === 'reactive' ? 'Reactive' : mode === 'static' ? 'Static' : 'Off'}</Text></View>}
  </View>;
}
function ReactiveSurface({ uri, size, fps }: { uri: string; size: number; fps: number }) {
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
      setSignal(values.length === 9);
      if (values.length === 9) {
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
      const result = criarRendererIOS(gl, size, { localUri, ...dimensions });
      renderer.current = result;
      if (samples.current.length === 9) result.draw(samples.current, performance.now() / 1000);
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
