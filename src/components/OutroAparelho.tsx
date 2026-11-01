import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { useComandarOutro } from '../lib/comandarOutro';
import { estaAcordado, type TipoDePedido } from '../lib/duotoneConnect';
import { deviceLabel, type RemoteSession } from '../lib/handoff';
import { hapticSelection } from '../lib/haptics';
import { continuarAqui, usePosicaoDoOutro } from '../lib/sessionSync';
import { desvioDaMusica, desvioDoVidro, useAlturaDosSeparadores } from '../state/doca';
import { abrirOutroAparelho, fecharOutroAparelho, useOutroAparelho } from '../state/outroAparelho';
import { useTheme } from '../state/theme';
import { colors, MINI_PLAYER_HEIGHT, radii } from '../theme';
import { BottomSheet } from './BottomSheet';

/**
 * O outro aparelho a tocar, no iPhone (1/11, `docs/continuar-aqui-maquete.html`).
 *
 * O aviso (`HandoffBanner.tsx`) é só a chegada. O que fica:
 *  - com música aqui, uma LINGUETA presa ao canto do vidro da base ("● PC ·
 *    Beverly Hills…"), enquanto o outro tocar;
 *  - sem música aqui, o MINI do outro aparelho, na linha da música da base:
 *    "● Playing on PC", com o ⏯ e o ⏭ a comandá-lo.
 * Os dois abrem a folha (`FolhaDoOutroAparelho`). Tudo lê a mesma sessão
 * (`state/outroAparelho.ts`): nenhum pedido novo. O leitor do iPhone (Now
 * Playing e o mini de cá) não muda.
 */

export function fmtRelogio(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** O ponto "ao vivo": respira com o outro a tocar, parado em pausa. */
export function PontoAoVivo({ cor, aTocar }: { cor: string; aTocar: boolean }) {
  const reduzido = useReducedMotion();
  const brilho = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduzido || !aTocar) { brilho.setValue(aTocar ? 1 : 0.5); return; }
    const ciclo = Animated.loop(Animated.sequence([
      Animated.timing(brilho, { toValue: 0.35, duration: 800, useNativeDriver: true }),
      Animated.timing(brilho, { toValue: 1, duration: 800, useNativeDriver: true }),
    ]));
    ciclo.start();
    return () => ciclo.stop();
  }, [reduzido, aTocar, brilho]);
  return <Animated.View style={[estilos.ponto, { backgroundColor: cor, opacity: brilho }]} />;
}

/** ⏮ ⏯ ⏭ numa pílula: comandam o outro aparelho. Apagados se ele não ouve ordens. */
export function ComandoRemoto({ sessao, comandar, aMandar }: {
  sessao: RemoteSession; comandar: (tipo: TipoDePedido) => void; aMandar: boolean;
}) {
  const nome = deviceLabel(sessao);
  const ouve = estaAcordado(sessao);
  const botao = (rotulo: string, icone: React.ComponentProps<typeof Ionicons>['name'], tipo: TipoDePedido, principal = false) => (
    <Pressable hitSlop={4} accessibilityRole="button" accessibilityLabel={`${rotulo} on ${nome}`} disabled={aMandar || !ouve}
      onPress={() => { hapticSelection(); comandar(tipo); }} style={estilos.botaoRemoto}>
      <Ionicons name={icone} size={principal ? 18 : 16} color={principal ? colors.text : colors.textSecondary} />
    </Pressable>
  );
  return (
    <View style={[estilos.remoto, !ouve && { opacity: 0.4 }]}>
      {botao('Previous', 'play-skip-back', 'anterior')}
      {botao(sessao.isPlaying ? 'Pause' : 'Play', sessao.isPlaying ? 'pause' : 'play', 'tocar-pausa', true)}
      {botao('Next', 'play-skip-forward', 'seguinte')}
    </View>
  );
}

/** A lingueta no canto do vidro da base: com música aqui e o outro a tocar, depois do X. */
export function LinguetaDoOutroAparelho({ alturaDoVidro }: { alturaDoVidro: number }) {
  const oferta = useOutroAparelho((s) => s.oferta);
  const aviso = useOutroAparelho((s) => s.aviso);
  const cor = useTheme((s) => s.theme.color);
  const entrada = useRef(new Animated.Value(0)).current;
  const visivel = !!oferta && !aviso;
  useEffect(() => {
    if (!visivel) { entrada.setValue(0); return; }
    Animated.spring(entrada, { toValue: 1, damping: 18, stiffness: 220, mass: 1, useNativeDriver: true }).start();
  }, [visivel, entrada]);
  if (!oferta || aviso) return null;
  const nome = deviceLabel(oferta);
  return (
    <Animated.View style={[estilos.lingueta, { bottom: alturaDoVidro, transform: [{ translateY: desvioDoVidro },
      { translateY: entrada.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Playing on ${nome}: ${tituloDaFaixa(oferta.track)}`}
        onPress={() => { hapticSelection(); abrirOutroAparelho(); }} style={estilos.linguetaToque}>
        <PontoAoVivo cor={cor} aTocar={oferta.isPlaying} />
        <Text style={[estilos.linguetaNome, { color: cor }]}>{nome}</Text>
        <Text numberOfLines={1} style={estilos.linguetaFaixa}>{tituloDaFaixa(oferta.track)}</Text>
      </Pressable>
    </Animated.View>
  );
}

/** O mini do outro aparelho, na linha da música da base, quando aqui não toca nada. */
export function MiniDoOutroAparelho() {
  const oferta = useOutroAparelho((s) => s.oferta);
  const cor = useTheme((s) => s.theme.color);
  const insets = useSafeAreaInsets();
  const separadores = useAlturaDosSeparadores();
  const posicao = usePosicaoDoOutro(oferta);
  const { comandar, aMandar } = useComandarOutro(oferta);
  if (!oferta) return null;
  const nome = deviceLabel(oferta);
  const ouve = estaAcordado(oferta);
  const duracao = (oferta.track.durationSeconds ?? 0) * 1000;
  const fracao = duracao > 0 ? Math.min(1, posicao / duracao) : 0;
  const capa = capaParaLista(oferta.track.artworkUrl);
  return (
    <Animated.View style={[estilos.mini, { bottom: separadores + insets.bottom + 4, transform: [{ translateY: desvioDaMusica }] }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Playing on ${nome}: ${tituloDaFaixa(oferta.track)}`}
        onPress={() => { hapticSelection(); abrirOutroAparelho(); }} style={estilos.miniDentro}>
        {capa ? <Image source={{ uri: capa }} style={estilos.miniCapa} contentFit="cover" /> : <View style={estilos.miniCapa} />}
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text numberOfLines={1} style={estilos.miniTitulo}>{tituloDaFaixa(oferta.track)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <PontoAoVivo cor={cor} aTocar={oferta.isPlaying} />
            <Text numberOfLines={1} style={[estilos.miniOnde, { color: cor }]}>Playing on {nome}</Text>
          </View>
        </View>
        <Pressable hitSlop={8} accessibilityRole="button" accessibilityLabel={`${oferta.isPlaying ? 'Pause' : 'Play'} on ${nome}`}
          disabled={aMandar || !ouve} onPress={() => { hapticSelection(); comandar('tocar-pausa'); }} style={[estilos.miniBotao, !ouve && { opacity: 0.4 }]}>
          <Ionicons name={oferta.isPlaying ? 'pause' : 'play'} size={22} color={colors.text} />
        </Pressable>
        <Pressable hitSlop={8} accessibilityRole="button" accessibilityLabel={`Next on ${nome}`}
          disabled={aMandar || !ouve} onPress={() => { hapticSelection(); comandar('seguinte'); }} style={[estilos.miniBotao, !ouve && { opacity: 0.4 }]}>
          <Ionicons name="play-skip-forward" size={20} color={colors.text} />
        </Pressable>
      </Pressable>
      <View style={estilos.miniFio} pointerEvents="none">
        <View style={{ height: 2, borderRadius: 1, width: `${fracao * 100}%`, backgroundColor: cor }} />
      </View>
    </Animated.View>
  );
}

/** A folha do outro aparelho: o cartão com a barra, os comandos grandes e o "Continue here". */
export function FolhaDoOutroAparelho() {
  const oferta = useOutroAparelho((s) => s.oferta);
  const aberto = useOutroAparelho((s) => s.aberto);
  const tema = useTheme((s) => s.theme);
  const posicao = usePosicaoDoOutro(aberto ? oferta : null);
  const { comandar, aMandar, aviso } = useComandarOutro(oferta);
  const nome = oferta ? deviceLabel(oferta) : '';
  return (
    <BottomSheet visible={aberto && !!oferta} onClose={fecharOutroAparelho} titulo={oferta ? `Playing on ${nome}` : undefined}>
      {oferta ? (() => {
        const ouve = estaAcordado(oferta);
        const duracao = (oferta.track.durationSeconds ?? 0) * 1000;
        const fracao = duracao > 0 ? Math.min(1, posicao / duracao) : 0;
        const capa = capaParaLista(oferta.track.artworkUrl);
        const grande = (rotulo: string, icone: React.ComponentProps<typeof Ionicons>['name'], tipo: TipoDePedido, principal = false) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`${rotulo} on ${nome}`} disabled={aMandar || !ouve}
            onPress={() => { hapticSelection(); comandar(tipo); }}
            style={[principal ? estilos.grandePrincipal : estilos.grande, !ouve && { opacity: 0.35 }]}>
            <Ionicons name={icone} size={26} color={principal ? colors.bg : colors.text} />
          </Pressable>
        );
        return (
          <View style={[estilos.cartao, { borderColor: tema.soft }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              {capa ? <Image source={{ uri: capa }} style={estilos.cartaoCapa} contentFit="cover" /> : <View style={estilos.cartaoCapa} />}
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <PontoAoVivo cor={tema.color} aTocar={oferta.isPlaying} />
                  <Text style={[estilos.olho, { color: tema.color }]}>{oferta.isPlaying ? 'PLAYING' : 'PAUSED'} ON {nome.toUpperCase()}</Text>
                </View>
                <Text numberOfLines={1} style={estilos.cartaoTitulo}>{tituloDaFaixa(oferta.track)}</Text>
                <Text numberOfLines={1} style={estilos.cartaoArtista}>{displayArtist(oferta.track)}</Text>
              </View>
            </View>
            <View style={estilos.barra}><View style={{ height: 4, borderRadius: 2, width: `${fracao * 100}%`, backgroundColor: tema.color }} /></View>
            <View style={estilos.tempos}>
              <Text style={estilos.tempo}>{fmtRelogio(posicao)}</Text>
              <Text style={estilos.tempo}>{duracao > 0 ? fmtRelogio(duracao) : '--:--'}</Text>
            </View>
            <View style={estilos.grandes}>
              {grande('Previous', 'play-skip-back', 'anterior')}
              {grande(oferta.isPlaying ? 'Pause' : 'Play', oferta.isPlaying ? 'pause' : 'play', 'tocar-pausa', true)}
              {grande('Next', 'play-skip-forward', 'seguinte')}
            </View>
            {!ouve || aviso ? <Text style={estilos.nota}>{aviso || `${nome} isn't taking commands right now. Open Duotone there.`}</Text> : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Continue here"
              onPress={() => { hapticSelection(); void continuarAqui(); }}
              style={({ pressed }) => [estilos.continuar, { backgroundColor: tema.color }, pressed && { opacity: 0.85 }]}>
              <Ionicons name="play" size={17} color={tema.textColorOnGradient} />
              <Text style={[estilos.continuarTexto, { color: tema.textColorOnGradient }]}>Continue here</Text>
            </Pressable>
          </View>
        );
      })() : null}
    </BottomSheet>
  );
}

const estilos = StyleSheet.create({
  ponto: { width: 6, height: 6, borderRadius: 3 },
  remoto: { flexDirection: 'row', alignItems: 'center', gap: 2, padding: 2, borderRadius: radii.pill, backgroundColor: 'rgba(255,255,255,0.07)' },
  botaoRemoto: { width: 38, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  lingueta: {
    position: 'absolute', right: 22, height: 30, maxWidth: 240, borderTopLeftRadius: 15, borderTopRightRadius: 15, borderCurve: 'continuous',
    backgroundColor: 'rgba(24,24,32,0.96)', borderWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0, borderColor: 'rgba(255,255,255,0.14)',
  },
  linguetaToque: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 10, paddingRight: 12, minHeight: 30 },
  linguetaNome: { fontSize: 12, fontWeight: '700' },
  linguetaFaixa: { fontSize: 12, fontWeight: '500', color: colors.textSecondary, flexShrink: 1 },
  mini: { position: 'absolute', left: 0, right: 0, height: MINI_PLAYER_HEIGHT, overflow: 'hidden' },
  miniDentro: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 10 },
  miniCapa: { width: 48, height: 48, borderRadius: radii.sm, borderCurve: 'continuous', backgroundColor: colors.surface },
  miniTitulo: { fontSize: 13, fontWeight: '600', color: colors.text },
  miniOnde: { fontSize: 11, fontWeight: '600' },
  miniBotao: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  miniFio: { position: 'absolute', left: 16, right: 16, bottom: 0, height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.10)' },
  cartao: { borderRadius: 20, borderCurve: 'continuous', padding: 14, borderWidth: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.04)', marginBottom: 8 },
  cartaoCapa: { width: 72, height: 72, borderRadius: 12, borderCurve: 'continuous', backgroundColor: colors.surface },
  olho: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  cartaoTitulo: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 4 },
  cartaoArtista: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  barra: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden', marginTop: 16, marginBottom: 4 },
  tempos: { flexDirection: 'row', justifyContent: 'space-between' },
  tempo: { fontSize: 12, color: colors.textTertiary, fontVariant: ['tabular-nums'] },
  grandes: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 34, marginTop: 10, marginBottom: 14 },
  grande: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  grandePrincipal: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.text },
  nota: { fontSize: 13, color: colors.textTertiary, textAlign: 'center', marginTop: -4, marginBottom: 12 },
  continuar: { height: 48, borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  continuarTexto: { fontSize: 16, fontWeight: '700' },
});
