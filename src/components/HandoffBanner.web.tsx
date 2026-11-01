import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { useComandarOutro } from '../lib/comandarOutro';
import { estaAcordado } from '../lib/duotoneConnect';
import { deviceLabel } from '../lib/handoff';
import { useHandoffSession } from '../lib/sessionSync';
import { COR, ESTADO, TIPO } from '../desktop/tokens.web';
import { Artwork } from '../desktop/ui.web';
import { BotaoContinuar, ComandoRemoto, ID_DO_BOTAO, linhaDaFila, OlhoDoOutro } from '../desktop/OutroAparelho.web';
import { usePlayer } from '../state/player';
import { useTheme } from '../state/theme';

const P = Pressable as any;

/**
 * O aviso de chegada do outro aparelho, no PC (1/11, `docs/continuar-aqui-maquete.html`).
 *
 * É só a CHEGADA: o X recolhe-o, a voar, para o botão com o nome do aparelho na
 * barra do leitor (`desktop/OutroAparelho.web.tsx`), que fica enquanto o outro
 * tocar. Não o cala 15 minutos como antes: marca a sessão como vista.
 * Também é aqui que vive o `useHandoffSession` (uma vez só): o resto lê a store.
 */
export function HandoffBanner() {
  const cor = useTheme((s) => s.theme.color);
  const aTocarAqui = usePlayer((s) => s.isPlaying && !!s.current);
  const { session, aviso, positionMs, dismiss, adopt } = useHandoffSession();
  const { comandar, aMandar, aviso: avisoDoComando } = useComandarOutro(session);
  const cartao = useRef<any>(null);

  // Entra a subir, como os avisos do PC (sem com "menos movimento").
  useEffect(() => {
    const el: HTMLElement | null = cartao.current;
    if (!aviso || !el?.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.animate([{ opacity: 0, transform: 'translateY(14px) scale(.98)' }, { opacity: 1, transform: 'none' }],
      { duration: 420, easing: 'cubic-bezier(.2,.9,.25,1.06)' });
  }, [aviso, session?.deviceId]);

  if (!session || !aviso) return null;

  // O X: o cartão voa para o botão da barra, e só depois se marca como visto.
  const fechar = () => {
    const el: HTMLElement | null = cartao.current;
    const alvo = document.getElementById(ID_DO_BOTAO);
    if (!el?.animate || !alvo || matchMedia('(prefers-reduced-motion: reduce)').matches) { dismiss(); return; }
    const a = el.getBoundingClientRect(), b = alvo.getBoundingClientRect();
    const dx = (b.left + b.width / 2) - (a.left + a.width / 2), dy = (b.top + b.height / 2) - (a.top + a.height / 2);
    el.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(.08)`, opacity: 0 }],
      { duration: 460, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }).finished.then(() => {
      dismiss();
      alvo.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 620, easing: 'cubic-bezier(.2,.9,.25,1.06)' });
    }, dismiss);
  };

  const nome = deviceLabel(session);
  const durationMs = (session.track.durationSeconds ?? 0) * 1000;
  const fraction = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;
  const fila = linhaDaFila(session);
  const nota = avisoDoComando || (!estaAcordado(session) ? `${nome} isn't taking commands right now. Open Duotone there to control it.` : '');

  return (
    <View ref={cartao} style={{
      position: 'absolute', left: 24, bottom: 96, zIndex: 30, width: 430, borderRadius: 12, overflow: 'hidden',
      borderWidth: 1, borderColor: COR.linha, backgroundImage: 'linear-gradient(180deg, #1A1A22, #131319)',
      boxShadow: '0 1px 0 rgba(255,255,255,.06) inset, 0 22px 50px rgba(0,0,0,.6)',
    } as any}>
      <View style={{ flexDirection: 'row', gap: 14, padding: 14, paddingBottom: 10 }}>
        <Artwork track={session.track} size={64} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <OlhoDoOutro sessao={session} posicaoMs={positionMs} cor={cor} />
          <Text numberOfLines={1} style={[TIPO.corpo, { color: COR.texto, fontSize: 15, fontWeight: '600', marginTop: 5 }]}>{tituloDaFaixa(session.track)}</Text>
          <Text numberOfLines={1} style={[TIPO.legenda, { color: COR.textoMedio, fontSize: 12.5, marginTop: 2 }]}>{displayArtist(session.track)}</Text>
          {fila ? <Text numberOfLines={1} style={[TIPO.legenda, { color: COR.textoFraco, marginTop: 6 }]}>{fila}</Text> : null}
          {aTocarAqui ? <Text numberOfLines={1} style={[TIPO.legenda, { color: COR.textoFraco, marginTop: 2 }]}>Replaces what’s playing here</Text> : null}
        </View>
        <P accessibilityRole="button" accessibilityLabel="Dismiss" onPress={fechar}
          style={({ hovered }: any) => [{ width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginTop: -4, marginRight: -4, cursor: 'pointer' }, hovered && { backgroundColor: ESTADO.hover }]}>
          <Ionicons name="close" size={15} color={COR.textoFraco} />
        </P>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingBottom: nota ? 8 : 12 }}>
        <ComandoRemoto sessao={session} comandar={comandar} aMandar={aMandar} />
        <View style={{ flex: 1 }} />
        <BotaoContinuar onPress={() => void adopt()} />
      </View>
      {nota ? <Text style={[TIPO.legenda, { color: COR.textoFraco, paddingHorizontal: 14, paddingBottom: 12 }]}>{nota}</Text> : null}
      {/* Progresso projetado a partir da última escrita do outro aparelho. */}
      <View style={{ height: 3, backgroundColor: 'rgba(255,255,255,.06)' }}>
        <View style={{ height: 3, width: `${fraction * 100}%`, backgroundColor: cor }} />
      </View>
    </View>
  );
}

