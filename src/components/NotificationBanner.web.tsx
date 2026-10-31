import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { shareComGrupo, shareItem } from '../api/social';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { textoSobre } from '../lib/corDaCapa';
import type { InAppNotification, NotificationTarget } from '../lib/inAppNotifications';
import { haQuantoTempo } from '../lib/social';
import { useNotifications } from '../state/notifications';
import { usePlayer } from '../state/player';
import { useSocial } from '../state/social';
import { useTheme } from '../state/theme';
import { marcar } from '../desktop/ui.web';
import { COR, RAIO, TIPO } from '../desktop/tokens.web';
import { FriendAvatar } from './FriendAvatar';

import { mensagemDeErro } from '../lib/mensagemDeErro';
/** Quanto o aviso fica, sem ninguém a mexer nele. */
const FICA_MS = 8000;

/**
 * O aviso de uma mensagem nova dentro da app do PC (2/10, maquete
 * `docs/mensagens-e-menu-do-amigo.html`). Mostra a mensagem a sério; se for
 * uma música, a capa com o ▶ para a tocar dali; e responde-se no próprio
 * aviso, sem sair do que se está a ver. Várias da mesma conversa juntam-se
 * ("+2 more", `quantas`, em lib/inAppNotifications.ts).
 *
 * Com a janela escondida continua a ser o aviso do Windows
 * (useDesktopNotifications). O do iPhone é o `NotificationBanner.tsx`.
 */
export function NotificationBanner({ onOpen }: { onOpen: (target: NotificationTarget) => void }) {
  const item = useNotifications((s) => s.banners[0]);
  if (!item) return null;
  // Pela conversa e não pelo id: uma mensagem nova da mesma pessoa troca o
  // conteúdo sem voltar a animar, e o que se estava a escrever fica.
  return <Aviso key={item.conversationKey} item={item} onOpen={onOpen} />;
}

function Aviso({ item, onOpen }: { item: InAppNotification; onOpen: (target: NotificationTarget) => void }) {
  const accent = useTheme((s) => s.theme.color);
  const [resposta, setResposta] = useState('');
  const [aEscrever, setAEscrever] = useState(false);
  const [porCima, setPorCima] = useState(false);
  const [aEnviar, setAEnviar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const entrada = useRef<TextInput>(null);
  const fechar = () => useNotifications.getState().dismiss(item.id);

  // Desaparece sozinho, mas não enquanto se escreve, se tem o rato em cima ou
  // há uma resposta por mandar.
  const ocupado = aEscrever || porCima || aEnviar || resposta.trim().length > 0;
  useEffect(() => {
    if (ocupado) return;
    const t = setTimeout(() => useNotifications.getState().dismiss(item.id), FICA_MS);
    return () => clearTimeout(t);
  }, [item.id, ocupado]);

  const abrir = () => { fechar(); onOpen(item.target); };
  const tocar = () => {
    if (!item.track) return;
    void usePlayer.getState().tocarMusica(item.track, [item.track], false, undefined, null);
    fechar();
  };
  const enviar = async () => {
    const texto = resposta.trim();
    if (!texto || aEnviar) return;
    setAEnviar(true); setErro(null);
    try {
      if (item.target.groupId) await shareComGrupo(item.target.groupId, 'track', null, texto);
      else if (item.target.friendId) await shareItem(item.target.friendId, 'track', null, texto);
      // Quem responde leu: a conversa deixa de ter mensagens por ler.
      void useSocial.getState().markRead(item.conversationKey, item.createdAt);
      fechar();
    } catch (e: any) {
      setErro(mensagemDeErro(e, "Couldn't send. Try again."));
      setAEnviar(false);
    }
  };

  const mensagem = item.mensagem ?? (item.track ? 'Sent you a song' : item.body);
  const mais = (item.quantas ?? 1) - 1;
  const capa = item.track ? capaParaLista(item.track.artworkUrl) ?? item.track.artworkUrl : null;

  return (
    <View pointerEvents="box-none" style={s.host}>
      <View
        {...(marcar('aviso-msg') as any)}
        {...({ onPointerEnter: () => setPorCima(true), onPointerLeave: () => setPorCima(false) } as any)}
        style={s.card}
      >
        <View style={s.topo}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}: ${mensagem}. Open conversation`} onPress={abrir} style={s.abrir}>
            <FriendAvatar avatarUrl={item.avatarUrl ?? null} name={item.title} size={40} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={s.linhaNome}>
                <Text numberOfLines={1} style={s.nome}>{item.title}</Text>
                <Text style={s.hora}>{haQuantoTempo(item.createdAt)}</Text>
              </View>
              <Text numberOfLines={3} style={s.mensagem}>{mensagem}</Text>
            </View>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notification" onPress={fechar} style={s.fecharB}>
            <Ionicons name="close" size={18} color={COR.textoMedio} />
          </Pressable>
        </View>

        {item.track ? (
          <View style={s.musica}>
            {capa ? <Image source={{ uri: capa }} style={s.capa} /> : <View style={[s.capa, { backgroundColor: COR.hover }]} />}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={s.tituloM}>{tituloDaFaixa(item.track)}</Text>
              <Text numberOfLines={1} style={s.artistaM}>{displayArtist(item.track)}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Play ${tituloDaFaixa(item.track)}`} onPress={tocar} style={s.tocar}>
              <Ionicons name="play" size={13} color={COR.fundo} style={{ marginLeft: 2 }} />
            </Pressable>
          </View>
        ) : null}

        {mais > 0 ? <Text style={s.mais}>{`+${mais} more from ${item.title}`}</Text> : null}

        {item.kind === 'message' ? (
          <View style={s.responder}>
            <TextInput
              ref={entrada}
              value={resposta}
              onChangeText={(t) => { setResposta(t); if (erro) setErro(null); }}
              onFocus={() => setAEscrever(true)}
              onBlur={() => setAEscrever(false)}
              // Teclas pelo onKeyPress: o onKeyDown do RNW fica por cima do nosso.
              onKeyPress={(e: any) => {
                if (e.nativeEvent?.key === 'Enter' && !e.nativeEvent?.shiftKey) { e.preventDefault?.(); void enviar(); }
                if (e.nativeEvent?.key === 'Escape') fechar();
              }}
              placeholder={`Reply to ${item.title}…`}
              placeholderTextColor={COR.textoFraco}
              editable={!aEnviar}
              style={s.campo}
            />
            <Pressable accessibilityRole="button" accessibilityLabel="Send reply" onPress={() => { void enviar(); }}
              disabled={!resposta.trim() || aEnviar}
              style={[s.enviar, { backgroundColor: accent, opacity: !resposta.trim() || aEnviar ? 0.5 : 1 }]}>
              <Text style={[s.enviarTexto, { color: textoSobre(accent) }]}>{aEnviar ? 'Sending…' : 'Send'}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={s.responder}>
            <Pressable accessibilityRole="button" onPress={abrir} style={[s.enviar, { backgroundColor: accent, flex: 1 }]}>
              <Text style={[s.enviarTexto, { color: textoSobre(accent) }]}>View request</Text>
            </Pressable>
          </View>
        )}
        {erro ? <Text style={s.erro}>{erro}</Text> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  host: { position: 'absolute', right: 20, top: 48, width: 400, maxWidth: '94%' as any, zIndex: 10000 },
  card: {
    width: '100%', backgroundColor: COR.elevado, borderWidth: 1, borderColor: COR.linha, borderRadius: RAIO.superficie,
    shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 10 },
  },
  topo: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 14, paddingLeft: 14, paddingRight: 6 },
  abrir: { flex: 1, minWidth: 0, flexDirection: 'row', gap: 12, paddingBottom: 10 },
  linhaNome: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  nome: { ...TIPO.corpo, color: COR.texto, fontWeight: '600', flexShrink: 1 },
  hora: { ...TIPO.numero, color: COR.textoFraco },
  mensagem: { ...TIPO.corpo, color: COR.texto, lineHeight: 19, marginTop: 3 },
  fecharB: { width: 32, height: 32, borderRadius: RAIO.pilula, alignItems: 'center', justifyContent: 'center' },
  musica: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 14, marginBottom: 10, padding: 8, borderRadius: RAIO.cartao, backgroundColor: COR.linhaSuave },
  capa: { width: 40, height: 40, borderRadius: RAIO.ctrl },
  tituloM: { ...TIPO.corpo, color: COR.texto, fontWeight: '600' },
  artistaM: { ...TIPO.legenda, color: COR.textoMedio, marginTop: 1 },
  tocar: { width: 30, height: 30, borderRadius: RAIO.pilula, backgroundColor: COR.metalClaro, alignItems: 'center', justifyContent: 'center' },
  mais: { ...TIPO.legenda, color: COR.textoFraco, paddingHorizontal: 14, marginTop: -2, marginBottom: 10 },
  responder: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 14 },
  campo: {
    flex: 1, minWidth: 0, height: 38, borderRadius: RAIO.cartao, borderWidth: 1, borderColor: COR.linha,
    backgroundColor: COR.linhaSuave, ...TIPO.corpo, color: COR.texto, paddingHorizontal: 12,
    outlineStyle: 'none',
  } as any,
  enviar: { height: 38, borderRadius: RAIO.cartao, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  enviarTexto: { ...TIPO.corpo, fontWeight: '600' },
  erro: { ...TIPO.legenda, color: COR.erro, paddingHorizontal: 14, marginTop: -6, paddingBottom: 12 },
});
