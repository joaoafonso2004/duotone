import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { useComandarOutro } from '../lib/comandarOutro';
import { estaAcordado } from '../lib/duotoneConnect';
import { deviceLabel, resumoDaFila, type RemoteSession } from '../lib/handoff';
import { continuarAqui, usePosicaoDoOutro } from '../lib/sessionSync';
import { abrirOutroAparelho, fecharOutroAparelho, useOutroAparelho } from '../state/outroAparelho';
import { useTheme } from '../state/theme';
import { styles } from './estilos.web';
import { COR, ESP, ESTADO, FONT, RAIO, TIPO } from './tokens.web';
import { Artwork } from './ui.web';

const { createPortal } = require('react-dom') as { createPortal: (filho: React.ReactNode, onde: Element) => React.ReactElement };
const P = Pressable as any;

/**
 * O outro aparelho a tocar, no PC (1/11, `docs/continuar-aqui-maquete.html`).
 *
 * O aviso (`HandoffBanner.web.tsx`) é só a chegada. O que fica é o botão na
 * barra do leitor, com o nome do outro aparelho, enquanto ele tocar: abre o
 * cartão dele (o que toca, a barra, ⏮ ⏯ ⏭ e o "Continue here"). Sem nada a
 * tocar aqui, a própria barra comanda o outro (`BarraDoOutroAparelho`).
 * Tudo lê a mesma sessão (`state/outroAparelho.ts`): nenhum pedido novo.
 */

export const ID_DO_BOTAO = 'botao-do-outro-aparelho';

export function fmtRelogio(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Um ecrã e um telemóvel: "outro aparelho". */
export function IconeDosAparelhos({ cor, tamanho = 19 }: { cor: string; tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth={1.7} strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="4" width="13" height="10" rx="1.6" />
      <path d="M6 18h6" />
      <rect x="16" y="8" width="6" height="12" rx="1.4" />
    </svg>
  );
}

/** O ponto "ao vivo": respira com o outro a tocar, parado em pausa. */
export function PontoAoVivo({ cor, aTocar, tamanho = 6 }: { cor: string; aTocar: boolean; tamanho?: number }) {
  return (
    <View style={[{ width: tamanho, height: tamanho, borderRadius: tamanho / 2, backgroundColor: cor }, aTocar
      ? ({ animationName: 'duotone-respirar', animationDuration: '1.6s', animationTimingFunction: 'ease-in-out', animationIterationCount: 'infinite' } as any)
      : { opacity: 0.5 }]} />
  );
}

/** ⏮ ⏯ ⏭ numa pílula: comandam o outro aparelho. Apagados se ele não ouve ordens. */
export function ComandoRemoto({ sessao, comandar, aMandar }: {
  sessao: RemoteSession; comandar: ReturnType<typeof useComandarOutro>['comandar']; aMandar: boolean;
}) {
  const nome = deviceLabel(sessao);
  const ouve = estaAcordado(sessao);
  const botao = (rotulo: string, icone: React.ComponentProps<typeof Ionicons>['name'], tipo: 'anterior' | 'tocar-pausa' | 'seguinte', principal = false) => (
    <P accessibilityRole="button" accessibilityLabel={`${rotulo} on ${nome}`} disabled={aMandar || !ouve} onPress={() => comandar(tipo)}
      style={({ hovered }: any) => [{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }, hovered && ouve && { backgroundColor: ESTADO.hover }]}>
      <Ionicons name={icone} size={principal ? 15 : 13} color={principal ? COR.texto : COR.textoMedio} />
    </P>
  );
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 2, padding: 3, borderRadius: RAIO.pilula, backgroundColor: 'rgba(233,234,238,0.06)', boxShadow: `inset 0 0 0 1px ${COR.linhaSuave}` } as any, !ouve && { opacity: ESTADO.apagado }]}>
      {botao('Previous', 'play-skip-back', 'anterior')}
      {botao(sessao.isPlaying ? 'Pause' : 'Play', sessao.isPlaying ? 'pause' : 'play', 'tocar-pausa', true)}
      {botao('Next', 'play-skip-forward', 'seguinte')}
    </View>
  );
}

/** O botão principal: metal, como o primário do PC. */
export function BotaoContinuar({ onPress, pequeno = false }: { onPress: () => void; pequeno?: boolean }) {
  return (
    <P accessibilityRole="button" accessibilityLabel="Continue here" onPress={onPress}
      style={({ hovered, pressed }: any) => [{
        flexDirection: 'row', alignItems: 'center', gap: 6, height: pequeno ? 30 : 34, paddingHorizontal: pequeno ? 12 : 15,
        borderRadius: RAIO.pilula, backgroundColor: COR.texto, cursor: 'pointer', flexShrink: 0,
      }, hovered && { opacity: 0.9 }, pressed && { transform: [{ scale: 0.96 }] }]}>
      <Ionicons name="play" size={pequeno ? 12 : 13} color="#0b0b0d" />
      <Text style={{ fontFamily: FONT.body, fontSize: pequeno ? 12 : 13, fontWeight: '600', color: '#0b0b0d' }}>Continue here</Text>
    </P>
  );
}

/** "PLAYING ON IPHONE · 0:32": o olho dos cartões. */
export function OlhoDoOutro({ sessao, posicaoMs, cor, comTempo = true }: { sessao: RemoteSession; posicaoMs: number; cor: string; comTempo?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <PontoAoVivo cor={cor} aTocar={sessao.isPlaying} />
      <Text numberOfLines={1} style={[TIPO.micro, { color: cor, fontWeight: '600', letterSpacing: 0.9, flexShrink: 1 }]}>
        {sessao.isPlaying ? 'Playing on' : 'Paused on'} {deviceLabel(sessao)}{comTempo ? ` · ${fmtRelogio(posicaoMs)}` : ''}
      </Text>
    </View>
  );
}

/**
 * O botão da barra do leitor: só existe com o outro aparelho a tocar. Acende
 * com o ponto e o nome dele; carregar abre o cartão por cima.
 */
export function BotaoDoOutroAparelho() {
  const oferta = useOutroAparelho((s) => s.oferta);
  const aberto = useOutroAparelho((s) => s.aberto);
  const cor = useTheme((s) => s.theme.color);
  if (!oferta) return null;
  const nome = deviceLabel(oferta);
  return (
    <>
      <P nativeID={ID_DO_BOTAO} accessibilityRole="button" accessibilityLabel={`Playing on ${nome}`} accessibilityState={{ expanded: aberto }}
        onPress={() => (aberto ? fecharOutroAparelho() : abrirOutroAparelho())}
        style={({ hovered }: any) => [{ height: 32, borderRadius: RAIO.cartao, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 8, cursor: 'pointer' },
          (hovered || aberto) && { backgroundColor: ESTADO.hover }]}>
        <View>
          <IconeDosAparelhos cor={COR.texto} />
          <View style={{ position: 'absolute', left: 13, top: -2, borderRadius: RAIO.pilula, borderWidth: 2, borderColor: '#0A0A0D' }}>
            <PontoAoVivo cor={cor} aTocar={oferta.isPlaying} tamanho={7} />
          </View>
        </View>
        <Text numberOfLines={1} style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: '600', letterSpacing: 0.4, color: cor, maxWidth: 90 }}>{nome.toUpperCase()}</Text>
      </P>
      {aberto ? <CartaoDoOutroAparelho sessao={oferta} /> : null}
    </>
  );
}

/** O cartão do outro aparelho, por cima do botão (num portal: ver a nota da fila). */
function CartaoDoOutroAparelho({ sessao }: { sessao: RemoteSession }) {
  const cor = useTheme((s) => s.theme.color);
  const posicao = usePosicaoDoOutro(sessao);
  const { comandar, aMandar, aviso } = useComandarOutro(sessao);
  const [lugar, setLugar] = useState<{ right: number; bottom: number } | null>(null);
  useEffect(() => {
    const botao = document.getElementById(ID_DO_BOTAO);
    if (botao) {
      const r = botao.getBoundingClientRect();
      setLugar({ right: Math.max(12, window.innerWidth - r.right - 60), bottom: window.innerHeight - r.top + 10 });
    }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') fecharOutroAparelho(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);
  if (!lugar) return null;
  const duracao = (sessao.track.durationSeconds ?? 0) * 1000;
  const fracao = duracao > 0 ? Math.min(1, posicao / duracao) : 0;
  const nome = deviceLabel(sessao);
  return createPortal(
    <View style={{ position: 'fixed', inset: 0, zIndex: 320 } as any}>
      {/* Um clique fora fecha. */}
      <P accessibilityLabel="Close" onPress={fecharOutroAparelho} style={{ position: 'absolute', inset: 0, cursor: 'default' } as any} />
      <View accessibilityRole={'dialog' as any} accessibilityLabel={`Playing on ${nome}`}
        style={{ position: 'absolute', right: lugar.right, bottom: lugar.bottom, width: 360, borderRadius: 12, backgroundColor: '#15151B',
          borderWidth: 1, borderColor: COR.linha, boxShadow: '0 26px 60px rgba(0,0,0,.65)', overflow: 'hidden',
          animationName: 'dt-linha', animationDuration: '260ms', animationTimingFunction: 'var(--dt-curva)' } as any}>
        <Text style={[TIPO.seccao, { color: COR.texto, paddingHorizontal: ESP.lg, paddingTop: 14, paddingBottom: ESP.sm }]}>Playing on {nome}</Text>
        <View style={{ marginHorizontal: 10, marginBottom: 10, borderRadius: RAIO.cartao, padding: ESP.md, borderWidth: 1, borderColor: COR.linha, backgroundColor: 'rgba(233,234,238,0.03)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: ESP.md }}>
            <Artwork track={sessao.track} size={56} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <OlhoDoOutro sessao={sessao} posicaoMs={posicao} cor={cor} comTempo={false} />
              <Text numberOfLines={1} style={[TIPO.corpo, { color: COR.texto, fontWeight: '600', marginTop: 4 }]}>{tituloDaFaixa(sessao.track)}</Text>
              <Text numberOfLines={1} style={[TIPO.legenda, { color: COR.textoMedio, marginTop: 2 }]}>{displayArtist(sessao.track)}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: ESP.sm, marginTop: ESP.md, marginBottom: 10 }}>
            <Text style={[TIPO.numero, { fontSize: 11, color: COR.textoFraco }]}>{fmtRelogio(posicao)}</Text>
            <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(233,234,238,0.12)', overflow: 'hidden' }}>
              <View style={{ height: 4, width: `${fracao * 100}%`, backgroundColor: cor, borderRadius: 2 }} />
            </View>
            <Text style={[TIPO.numero, { fontSize: 11, color: COR.textoFraco }]}>{duracao > 0 ? fmtRelogio(duracao) : '--:--'}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: ESP.sm, justifyContent: 'space-between' }}>
            <ComandoRemoto sessao={sessao} comandar={comandar} aMandar={aMandar} />
            <BotaoContinuar onPress={() => void continuarAqui()} />
          </View>
          {!estaAcordado(sessao) || aviso ? (
            <Text style={[TIPO.legenda, { color: COR.textoFraco, marginTop: 9 }]}>
              {aviso || `${nome} isn't taking commands right now. Open Duotone there to control it.`}
            </Text>
          ) : null}
        </View>
      </View>
    </View>,
    document.body,
  );
}

/**
 * Sem nada a tocar no PC, a barra do leitor é a do outro aparelho: o que toca
 * lá, "PLAYING ON IPHONE", ⏮ ⏯ ⏭ a comandá-lo e o "Continue here". Como no
 * Spotify. Nada de motor: o som é do outro lado.
 */
export function BarraDoOutroAparelho() {
  const oferta = useOutroAparelho((s) => s.oferta);
  const cor = useTheme((s) => s.theme.color);
  const posicao = usePosicaoDoOutro(oferta);
  const { comandar, aMandar } = useComandarOutro(oferta);
  if (!oferta) return null;
  const duracao = (oferta.track.durationSeconds ?? 0) * 1000;
  const fracao = duracao > 0 ? Math.min(1, posicao / duracao) : 0;
  const ouve = estaAcordado(oferta);
  const controlo = (rotulo: string, icone: React.ComponentProps<typeof Ionicons>['name'], tipo: 'anterior' | 'seguinte') => (
    <P accessibilityRole="button" accessibilityLabel={`${rotulo} on ${deviceLabel(oferta)}`} disabled={aMandar || !ouve} onPress={() => comandar(tipo)}
      style={({ hovered }: any) => [{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }, hovered && ouve && { backgroundColor: ESTADO.hover }]}>
      <Ionicons name={icone} size={18} color={COR.textoMedio} />
    </P>
  );
  return (
    <View style={styles.player}>
      <View style={styles.playerTrack}>
        <View style={[styles.playerTrackLink, { cursor: 'default' } as any]}>
          <Artwork track={oferta.track} size={52} />
          <View style={{ minWidth: 0, flexShrink: 1 }}>
            <Text numberOfLines={1} style={styles.playerTitle}>{tituloDaFaixa(oferta.track)}</Text>
            <Text numberOfLines={1} style={styles.playerArtista}>{displayArtist(oferta.track)}</Text>
            <View style={{ marginTop: 3 }}><OlhoDoOutro sessao={oferta} posicaoMs={posicao} cor={cor} comTempo={false} /></View>
          </View>
        </View>
      </View>
      <View style={styles.playerCenter}>
        <View style={[styles.playerControls, !ouve && { opacity: ESTADO.apagado }]}>
          {controlo('Previous', 'play-skip-back', 'anterior')}
          <P accessibilityRole="button" accessibilityLabel={`${oferta.isPlaying ? 'Pause' : 'Play'} on ${deviceLabel(oferta)}`} disabled={aMandar || !ouve}
            onPress={() => comandar('tocar-pausa')} style={({ hovered, pressed }: any) => [styles.playButton, hovered && { transform: [{ scale: 1.05 }] }, pressed && { transform: [{ scale: 0.97 }] }]}>
            <Ionicons name={oferta.isPlaying ? 'pause' : 'play'} size={18} color="#111117" />
          </P>
          {controlo('Next', 'play-skip-forward', 'seguinte')}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', maxWidth: 520 }}>
          <Text style={[TIPO.numero, { fontSize: 11, color: COR.textoFraco }]}>{fmtRelogio(posicao)}</Text>
          <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(233,234,238,0.12)', overflow: 'hidden' }}>
            <View style={{ height: 4, width: `${fracao * 100}%`, backgroundColor: cor, borderRadius: 2 }} />
          </View>
          <Text style={[TIPO.numero, { fontSize: 11, color: COR.textoFraco }]}>{duracao > 0 ? fmtRelogio(duracao) : '--:--'}</Text>
        </View>
      </View>
      <View style={styles.playerRight}>
        <BotaoContinuar pequeno onPress={() => void continuarAqui()} />
        <BotaoDoOutroAparelho />
      </View>
    </View>
  );
}

/** Para o aviso: a próxima e quantas faltam, numa linha. */
export function linhaDaFila(sessao: RemoteSession): string {
  const { proxima, depois } = resumoDaFila(sessao);
  return proxima ? `Next: ${tituloDaFaixa(proxima)}${depois ? ` · ${depois} more` : ''}` : '';
}
