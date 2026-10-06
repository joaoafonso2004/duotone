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
import { FriendAvatar } from './FriendAvatar';

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
      setErro(e?.message || 'Could not send. Try again.');
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
            <Ionicons name="close" size={18} color="#AAAAB4" />
          </Pressable>
        </View>

        {item.track ? (
          <View style={s.musica}>
            {capa ? <Image source={{ uri: capa }} style={s.capa} /> : <View style={[s.capa, { backgroundColor: '#292931' }]} />}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={s.tituloM}>{tituloDaFaixa(item.track)}</Text>
              <Text numberOfLines={1} style={s.artistaM}>{displayArtist(item.track)}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Play ${tituloDaFaixa(item.track)}`} onPress={tocar} style={s.tocar}>
              <Ionicons name="play" size={13} color="#0B0B0E" style={{ marginLeft: 2 }} />
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
              placeholderTextColor="#84868F"
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
    width: '100%', backgroundColor: '#1C1C23', borderWidth: 1, borderColor: '#36363F', borderRadius: 18,
    shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 10 },
  },
  topo: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 14, paddingLeft: 14, paddingRight: 6 },
  abrir: { flex: 1, minWidth: 0, flexDirection: 'row', gap: 12, paddingBottom: 10 },
  linhaNome: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  nome: { color: '#F5F5F7', fontSize: 14, fontWeight: '700', flexShrink: 1 },
  hora: { color: '#84868F', fontSize: 11, fontFamily: 'JetBrains Mono, ui-monospace, monospace' },
  mensagem: { color: '#CDCDD4', fontSize: 13.5, lineHeight: 19, marginTop: 3 },
  fecharB: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  musica: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 14, marginBottom: 10, padding: 8, borderRadius: 12, backgroundColor: 'rgba(233,234,238,0.05)' },
  capa: { width: 40, height: 40, borderRadius: 6 },
  tituloM: { color: '#F5F5F7', fontSize: 13, fontWeight: '600' },
  artistaM: { color: '#9DA0AA', fontSize: 12, marginTop: 1 },
  tocar: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#E9EAEE', alignItems: 'center', justifyContent: 'center' },
  mais: { color: '#84868F', fontSize: 12, paddingHorizontal: 14, marginTop: -2, marginBottom: 10 },
  responder: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 14 },
  campo: {
    flex: 1, minWidth: 0, height: 38, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(233,234,238,0.10)',
    backgroundColor: 'rgba(233,234,238,0.06)', color: '#E9EAEE', fontSize: 14, paddingHorizontal: 12,
    outlineStyle: 'none',
  } as any,
  enviar: { height: 38, borderRadius: 12, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  enviarTexto: { fontSize: 13, fontWeight: '700' },
  erro: { color: '#E5484D', fontSize: 12, paddingHorizontal: 14, marginTop: -6, paddingBottom: 12 },
});
