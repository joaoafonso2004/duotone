import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { useComandarOutro } from '../lib/comandarOutro';
import { estaAcordado } from '../lib/duotoneConnect';
import { deviceLabel, resumoDaFila } from '../lib/handoff';
import { hapticSelection } from '../lib/haptics';
import { useHandoffSession } from '../lib/sessionSync';
import { useAlturaDosSeparadores } from '../state/doca';
import { usePlayer } from '../state/player';
import { useTheme } from '../state/theme';
import { colors, MINI_PLAYER_HEIGHT, radii } from '../theme';
import { ComandoRemoto, fmtRelogio, PontoAoVivo } from './OutroAparelho';

/**
 * O aviso de chegada do outro aparelho, no iPhone (1/11,
 * `docs/continuar-aqui-maquete.html`): "● PLAYING ON PC · 0:32", a música, a
 * fila numa linha, ⏮ ⏯ ⏭ e o "Continue here".
 *
 * É só a CHEGADA: o X recolhe-o para a lingueta no canto da base (com música
 * aqui) ou para o mini do outro aparelho (sem música aqui), e marca a sessão
 * como vista. Antes calava o aparelho 15 minutos, sem porta para voltar.
 * Também é aqui que vive o `useHandoffSession` (uma vez só): o resto lê a store.
 */
export function HandoffBanner() {
  const insets = useSafeAreaInsets();
  const separadores = useAlturaDosSeparadores();
  const theme = useTheme((s) => s.theme);
  const aTocarAqui = usePlayer((s) => s.isPlaying && !!s.current);
  const comMusicaAqui = usePlayer((s) => !!s.current);
  const expanded = usePlayer((s) => s.expanded);
  const { session, aviso, positionMs, dismiss, adopt } = useHandoffSession();
  const { comandar, aMandar, aviso: avisoDoComando } = useComandarOutro(session);
  const reduzido = useReducedMotion();
  const saida = useRef(new Animated.Value(0)).current;
  useEffect(() => { saida.setValue(0); }, [session?.deviceId, aviso, saida]);

  // Com o Now Playing aberto o banner ficaria por baixo do overlay.
  if (!session || !aviso || expanded) return null;

  // O X: desce e encolhe para onde vai ficar (a lingueta à direita, ou o mini por baixo).
  const fechar = () => {
    hapticSelection();
    if (reduzido) { dismiss(); return; }
    Animated.timing(saida, { toValue: 1, duration: 380, useNativeDriver: true }).start(() => dismiss());
  };

  const nome = deviceLabel(session);
  const { proxima, depois } = resumoDaFila(session);
  const segunda = [
    displayArtist(session.track),
    proxima ? `Next: ${tituloDaFaixa(proxima)}${depois ? ` · ${depois} more` : ''}` : '',
  ].filter(Boolean).join(' · ');
  const nota = avisoDoComando || (!estaAcordado(session) ? `${nome} isn't taking commands right now.` : aTocarAqui ? 'Replaces what’s playing here' : '');
  // Por cima da linha da música: a de cá, ou a do outro aparelho (sem música aqui).
  const bottom = separadores + insets.bottom + 8 + MINI_PLAYER_HEIGHT + 10;
  const durationMs = (session.track.durationSeconds ?? 0) * 1000;
  const fraction = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;
  const capa = capaParaLista(session.track.artworkUrl);

  return (
    <Animated.View style={[styles.wrap, { bottom, borderColor: theme.soft, opacity: saida.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
      transform: [
        { translateX: saida.interpolate({ inputRange: [0, 1], outputRange: [0, comMusicaAqui ? 110 : 0] }) },
        { translateY: saida.interpolate({ inputRange: [0, 1], outputRange: [0, comMusicaAqui ? 70 : 110] }) },
        { scale: saida.interpolate({ inputRange: [0, 1], outputRange: [1, 0.2] }) },
      ] }]}>
      <View style={styles.cima}>
        {capa ? <Image source={{ uri: capa }} style={styles.capa} contentFit="cover" /> : <View style={styles.capa} />}
        <View style={styles.textos}>
          <View style={styles.olhoLinha}>
            <PontoAoVivo cor={theme.color} aTocar={session.isPlaying} />
            <Text numberOfLines={1} style={[styles.olho, { color: theme.color }]}>
              {session.isPlaying ? 'PLAYING' : 'PAUSED'} ON {nome.toUpperCase()}{durationMs > 0 ? ` · ${fmtRelogio(positionMs)}` : ''}
            </Text>
          </View>
          <Text numberOfLines={1} style={styles.titulo}>{tituloDaFaixa(session.track)}</Text>
          <Text numberOfLines={1} style={styles.segunda}>{segunda}</Text>
        </View>
        <Pressable onPress={fechar} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss" style={styles.fechar}>
          <Ionicons name="close" size={16} color={colors.textTertiary} />
        </Pressable>
      </View>
      <View style={styles.baixo}>
        <ComandoRemoto sessao={session} comandar={comandar} aMandar={aMandar} />
        <View style={{ flex: 1 }} />
        {/* O texto do botão vem do TEMA, não é branco fixo: sobre o acento
            `steel` (#E9EAEE) o branco deixava o botão sem letras. */}
        <Pressable accessibilityRole="button" accessibilityLabel="Continue here"
          onPress={() => { hapticSelection(); void adopt(); }}
          style={({ pressed }) => [styles.cta, { backgroundColor: theme.color }, pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] }]}>
          <Ionicons name="play" size={15} color={theme.textColorOnGradient} />
          <Text style={[styles.ctaTexto, { color: theme.textColorOnGradient }]}>Continue here</Text>
        </Pressable>
      </View>
      {nota ? <Text numberOfLines={1} style={styles.nota}>{nota}</Text> : null}
      {/* Barra de progresso projetada — anda sozinha entre batimentos. */}
      <View style={styles.fio}><View style={[styles.fioCheio, { width: `${fraction * 100}%`, backgroundColor: theme.color }]} /></View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 10, right: 10, borderRadius: 20, borderCurve: 'continuous', overflow: 'hidden',
    backgroundColor: 'rgba(30, 30, 40, 0.97)', borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.45, shadowRadius: 20, elevation: 8,
  },
  cima: { flexDirection: 'row', gap: 12, paddingTop: 12, paddingHorizontal: 12, paddingBottom: 8 },
  capa: { width: 56, height: 56, borderRadius: radii.md, borderCurve: 'continuous', backgroundColor: colors.surfaceHigh },
  textos: { flex: 1, minWidth: 0 },
  olhoLinha: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  olho: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, flexShrink: 1 },
  titulo: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 3 },
  segunda: { fontSize: 13, color: colors.textSecondary, marginTop: 1 },
  fechar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  baixo: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 38, paddingHorizontal: 16, borderRadius: 19 },
  ctaTexto: { fontSize: 15, fontWeight: '700' },
  nota: { fontSize: 12, color: colors.textTertiary, paddingHorizontal: 12, paddingBottom: 10, marginTop: -4 },
  fio: { height: 3, backgroundColor: 'rgba(255,255,255,0.06)' },
  fioCheio: { height: 3 },
});
