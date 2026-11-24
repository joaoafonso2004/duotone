/**
 * O Social do PC na pele da B4 (22/11, `.claude/planos/PLANO-SOCIAL-B4.md`): o que o
 * `SocialHub` (partilhado com o iPhone) desenha nos ramos web. O par `SocialPc.tsx`
 * é o do iPhone, que não muda.
 *
 * - **O diálogo** é o `Dialog` do PC (com a saída), e não o `SocialModal` com borda.
 * - **O cabeçalho da conversa**: a cara de 44 com o ponto, o nome em Archivo 26 e as
 *   ações de texto (Start a Jam, Play all, Save as playlist), sem pílulas.
 * - **O campo de escrever**: uma superfície `flutuante` de 52, com o + dentro e o
 *   enviar num disco de metal (♪ com o campo vazio, ↑ com texto, a rodar na troca).
 * - **O painel do amigo**: à direita da conversa, com a música dele, o tempo, o
 *   Listen along e as próximas dele. Ajusta-se de 180 a 360 com a pega das barras.
 * - **A cor**: com a conversa de um amigo que está a ouvir, a janela toma a cor da
 *   capa dele (`corDaConversa.web.ts`, lida pelo `RootNavigator`).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, Dialog, marcar } from '../desktop/ui.web';
import { COR, ESP, ESTADO, FONT, RAIO, TIPO, flutuante } from '../desktop/tokens.web';
import { CapaDuotone } from '../desktop/duotone.web';
import { SeparadorDoPainelDoAmigo } from '../desktop/SeparadorDeLargura.web';
import { definirCorDaConversa } from '../desktop/corDaConversa.web';
import { useSaida } from '../desktop/useSaida.web';
import { FriendAvatar } from './FriendAvatar';
import { SocialIconButton } from './socialUI';
import { Barrinhas, ouvirJunto } from './SocialOverview.web';
import { agoraNoServidor, presencaDe, type SocialFriend } from '../state/social';
import { useSeguirAmigo } from '../state/seguirAmigo';
import { musicaDoAmigo } from '../lib/amigosNaLateral';
import { posicaoDoAmigo } from '../lib/posicaoDoAmigo';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { SOCIAL_COM_PAINEL } from '../lib/largurasDasBarras';
import type { BotoesDoDialogoProps, CabecalhoDaConversaProps, CampoDeEscreverProps, DialogoDoSocialProps, LayoutDaConversaProps } from './socialPcTipos';

/** Quanto leva o painel a sair (a curva `sair`, 180 a 200 ms). */
const SAIDA_DO_PAINEL_MS = 190;
/** As próximas dele que o painel mostra. */
const PROXIMAS_NO_PAINEL = 5;

export function DialogoDoSocial({ visible, title, onClose, children, largura }: DialogoDoSocialProps) {
  // Um conteúdo comprido rola dentro do diálogo, como na folha do PC (BottomSheet.web.tsx):
  // o `Dialog` não tem altura máxima, e as Recommendations e o Edit profile passavam da janela.
  return <Dialog open={visible} title={title} onClose={onClose} width={largura ?? 460}>
    <View style={{ maxHeight: 'calc(100dvh - 160px)', minHeight: 0, flexShrink: 1 } as any}>{children}</View>
  </Dialog>;
}

export function BotoesDoDialogo({ botoes }: BotoesDoDialogoProps) {
  return <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 20 }}>
    {botoes.map((b) => <Button key={b.rotulo} secondary={!b.principal} disabled={b.desligado} ocupado={b.ocupado} onPress={b.aoCarregar}>{b.rotulo}</Button>)}
  </View>;
}

/** Uma ação de texto com ícone, sem contorno nem fundo (o `AcaoDaConversa`, com as fontes da app). */
export function AcaoDeTexto({ rotulo, icone, texto, cor, onPress }: {
  rotulo: string; icone: React.ComponentProps<typeof Ionicons>['name']; texto: string; cor?: string; onPress: () => void;
}) {
  const tom = cor ?? COR.textoMedio;
  return <Pressable {...marcar('premir')} accessibilityRole="button" accessibilityLabel={rotulo} onPress={onPress}
    style={({ hovered, focused }: any) => [{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: ESP.sm, borderRadius: RAIO.cartao },
      (hovered || focused) && { backgroundColor: ESTADO.hover }]}>
    <Ionicons name={icone} size={16} color={tom}/>
    <Text style={{ fontFamily: FONT.body, fontSize: 13, fontWeight: '600', color: tom }}>{texto}</Text>
  </Pressable>;
}

export function CabecalhoDaConversaPc({ titulo, amigo, estado, comPainel, acoes, aoPerfil, aoOuvirJuntos, aoFechar, aoLado }: CabecalhoDaConversaProps) {
  const musica = amigo ? musicaDoAmigo<any>(amigo) : null;
  const sigo = useSeguirAmigo((s) => !!amigo && s.seguindo?.id === amigo.friendId);
  const linha = sigo ? 'You’re listening along' : musica ? `♫ ${tituloDaFaixa(musica)} · ${displayArtist(musica)}` : estado;
  // Estreito (a 960, sem o painel), as ações passam para baixo do nome, à direita, em vez de o
  // apertarem até "R…": o nome tem uma base de 220 px e as ações quebram a linha.
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: ESP.md, rowGap: ESP.xs, minHeight: 56 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`View ${titulo}`} disabled={!amigo} onPress={aoPerfil}
      style={{ flexGrow: 1, flexShrink: 1, flexBasis: 220, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: ESP.md }}>
      <View>
        <FriendAvatar avatarUrl={amigo?.avatarUrl ?? null} name={titulo} size={44}/>
        {amigo?.online ? <View style={{ position: 'absolute', right: -1, bottom: -1, width: 12, height: 12, borderRadius: 6, backgroundColor: COR.ok, borderWidth: 2, borderColor: COR.painel }}/> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: FONT.display, fontSize: 26, fontWeight: '650' as any, letterSpacing: -0.4, color: COR.texto }}>{titulo}</Text>
        {amigo ? <Text numberOfLines={1} style={{ fontFamily: FONT.body, fontSize: 13, color: musica || sigo ? COR.texto : COR.textoMedio, marginTop: 1 }}>{linha}</Text> : null}
      </View>
    </Pressable>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 'auto', flexShrink: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {/* Start a Jam só quando ele não está a ouvir; a ouvir, o Listen along é do painel (ou daqui, sem ele). */}
      {amigo && !musica ? <AcaoDeTexto rotulo={`Start a Jam with ${titulo}`} icone="headset-outline" texto="Start a Jam" onPress={aoOuvirJuntos}/> : null}
      {amigo && musica && !comPainel && !sigo ? <AcaoDeTexto rotulo={`Listen along with ${titulo}`} icone="headset-outline" texto="Listen along" cor={COR.texto} onPress={aoOuvirJuntos}/> : null}
      {acoes}
      <SocialIconButton label="Back to chats" icon={aoLado ? 'close' : 'chevron-back'} onPress={aoFechar}/>
    </View>
  </View>;
}

export function CampoDeEscreverPc({ campoRef, valor, aoMudar, ocupado, aoEnviar, aoEnviarMusica, aTocar, aoEnviarATocar }: CampoDeEscreverProps) {
  const comTexto = !!valor.trim();
  // Com o campo vazio e uma música a tocar, o disco manda-a (♪); com texto, envia (↑).
  const manda = !comTexto && !!aTocar;
  const desligado = ocupado || (!comTexto && !aTocar);
  return <View style={[flutuante(RAIO.superficie), { flexDirection: 'row', alignItems: 'flex-end', gap: ESP.sm, minHeight: 52, paddingVertical: 8, paddingHorizontal: 8 }]}>
    <Pressable {...marcar('premir')} accessibilityRole="button" accessibilityLabel="Send music" onPress={aoEnviarMusica}
      style={({ hovered, focused }: any) => [{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(233,234,238,0.06)' },
        (hovered || focused) && { backgroundColor: 'rgba(233,234,238,0.12)' }]}>
      <Ionicons name="add" size={20} color={COR.texto}/>
    </Pressable>
    <TextInput ref={campoRef as any} accessibilityLabel="Message" placeholder="Message…" placeholderTextColor={COR.textoFraco}
      value={valor} onChangeText={aoMudar} multiline maxLength={4000} editable={!ocupado}
      style={{ flex: 1, minHeight: 36, maxHeight: 120, paddingVertical: 8, paddingHorizontal: 4, fontFamily: FONT.body, fontSize: 14, color: COR.texto, backgroundColor: 'transparent', outlineStyle: 'none' } as any}
      {...({ onKeyPress: (e: any) => {
        const evento = e?.nativeEvent ?? e;
        if (evento?.key !== 'Enter' || evento?.shiftKey || evento?.isComposing) return;
        e.preventDefault?.(); evento.preventDefault?.();
        if (!ocupado && valor.trim()) aoEnviar();
      } } as any)}/>
    <Pressable {...marcar('disco-metal', comTexto ? 'com-texto' : '')} accessibilityRole="button"
      accessibilityLabel={manda && aTocar ? `Send what you're playing: ${tituloDaFaixa(aTocar)}` : 'Send'}
      disabled={desligado} onPress={() => (manda ? aoEnviarATocar() : aoEnviar())}
      style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', opacity: desligado ? 0.42 : 1 }}>
      <View {...marcar('vira')}><Ionicons name={manda ? 'musical-note' : 'arrow-up'} size={18} color={COR.fundo}/></View>
    </Pressable>
  </View>;
}

/**
 * Uma mensagem a entrar na conversa (B4): a tua sobe do campo com a mola SOLTAR
 * (26 px e 0,94) e a linha dela abre-se, para as de cima subirem a deslizar; a dele
 * chega 8 px e a 0,98 com a ENTRADA; ao abrir a conversa, as dez de baixo sobem em
 * cascata de 28 ms. No fim da animação a marca sai (o `overflow` da abertura também).
 * Sempre os mesmos dois `<div>`, para o React não refazer o balão a meio.
 */
export function EntradaDaMensagem({ tipo, atraso = 0, children }: { tipo: 'minha' | 'dele' | 'cascata' | null; atraso?: number; children: React.ReactNode }) {
  const [anim, setAnim] = useState(tipo);
  const acabar = (e: React.AnimationEvent) => {
    if (/^dt-msg-(sobe|chega|cascata)$/.test(e.animationName)) setAnim(null);
  };
  const dentro = <div style={anim === 'cascata' && atraso ? { animationDelay: `${atraso}ms` } : undefined}>{children}</div>;
  // As marcas por extenso, para o test-animacoes-do-pc.ts as ver.
  if (anim === 'minha') return <div data-dt="msg-minha" onAnimationEnd={acabar}>{dentro}</div>;
  if (anim === 'dele') return <div data-dt="msg-dele" onAnimationEnd={acabar}>{dentro}</div>;
  if (anim === 'cascata') return <div data-dt="msg-cascata" onAnimationEnd={acabar}>{dentro}</div>;
  return <div>{dentro}</div>;
}

/** As mensagens esbatem-se nos 28 px de cima (B4): uma máscara num invólucro, porque a lista invertida vira-se. */
export function MascaraDaConversa({ children }: { children: React.ReactNode }) {
  return <View {...marcar('mascara-da-conversa')} style={{ flex: 1, minHeight: 0 }}>{children}</View>;
}

const doisDigitos = (n: number) => String(Math.floor(n)).padStart(2, '0');
const tempo = (ms: number) => `${Math.floor(ms / 60000)}:${doisDigitos((ms / 1000) % 60)}`;

type Proxima = { title: string; artist: string | null; artworkUrl: string | null; chave: string };

/** As próximas dele, da presença que já está em memória (a do Listen along): nenhum pedido. */
function proximasDe(amigoId: string): Proxima[] {
  const fila = (presencaDe(amigoId)?.currently_playing as any)?.aSeguir;
  if (!Array.isArray(fila)) return [];
  return fila.filter((f: any) => f && typeof f.title === 'string' && typeof f.sourceId === 'string').slice(0, PROXIMAS_NO_PAINEL)
    .map((f: any, i: number) => ({ title: f.title, artist: typeof f.artist === 'string' ? f.artist : null, artworkUrl: typeof f.artworkUrl === 'string' ? f.artworkUrl : null, chave: `${f.sourceId}:${i}` }));
}

/**
 * O painel dele (o que faz a B4): as barrinhas e "<nome> is listening", a capa a toda a
 * largura, o título em Archivo 22, a barra com os tempos, o Listen along num disco de
 * metal (que passa a "Leave"), e "UP NEXT · <nome>" com até cinco das próximas dele.
 */
function PainelDoAmigo({ amigo, musica }: { amigo: SocialFriend; musica: any }) {
  const sigo = useSeguirAmigo((s) => s.seguindo?.id === amigo.friendId);
  const [, setTique] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTique((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const nome = amigo.name;
  const capa = capaParaLista(musica.artworkUrl) ?? musica.artworkUrl;
  const onde = posicaoDoAmigo(musica, agoraNoServidor());
  const proximas = proximasDe(amigo.friendId);
  return <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: ESP.md, paddingBottom: ESP.xl }} showsVerticalScrollIndicator={false}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: ESP.sm, minHeight: 20 }}>
      <Barrinhas/>
      <Text numberOfLines={1} style={{ ...TIPO.micro, color: COR.textoMedio, flexShrink: 1 }}>{sigo ? 'LISTENING ALONG' : `${nome} IS LISTENING`}</Text>
    </View>
    <View style={{ width: '100%', aspectRatio: 1, borderRadius: RAIO.cartao, overflow: 'hidden', boxShadow: '0 28px 70px rgba(0,0,0,0.6)' } as any}>
      <CapaDuotone uri={capa} viva style={{ borderRadius: RAIO.cartao }}/>
    </View>
    <View style={{ gap: 2 }}>
      <Text numberOfLines={2} style={{ fontFamily: FONT.display, fontSize: 22, fontWeight: '700', letterSpacing: -0.3, color: COR.texto }}>{tituloDaFaixa(musica)}</Text>
      <Text numberOfLines={1} style={{ fontFamily: FONT.body, fontSize: 14, color: COR.textoMedio }}>{displayArtist(musica)}</Text>
    </View>
    {onde ? <View style={{ gap: 6 }}>
      <View style={{ height: 3, borderRadius: 2, backgroundColor: 'rgba(233,234,238,0.14)', overflow: 'hidden' }}>
        <View style={{ height: 3, width: '100%', transformOrigin: 'left', transform: [{ scaleX: Math.round(onde.fracao * 1000) / 1000 }], backgroundColor: COR.texto } as any}/>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ ...TIPO.numero, fontSize: 10, color: COR.textoFraco }}>{tempo(onde.ms)}</Text>
        <Text style={{ ...TIPO.numero, fontSize: 10, color: COR.textoFraco }}>{musica.durationSeconds ? tempo(musica.durationSeconds * 1000) : ''}</Text>
      </View>
    </View> : null}
    <Pressable {...marcar('disco-metal', 'premir', sigo ? 'a-seguir' : '')} accessibilityRole="button"
      accessibilityLabel={sigo ? `Stop listening along with ${nome}` : `Listen along with ${nome}`}
      onPress={() => { if (sigo) useSeguirAmigo.getState().parar(null); else void ouvirJunto(amigo); }}
      style={{ height: 40, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: ESP.sm }}>
      <View {...marcar('vira')}><Ionicons name={sigo ? 'close' : 'headset'} size={16} color={COR.fundo}/></View>
      <Text style={{ fontFamily: FONT.body, fontSize: 13, fontWeight: '700', color: COR.fundo }}>{sigo ? 'Leave' : 'Listen along'}</Text>
    </Pressable>
    {proximas.length ? <View style={{ gap: ESP.sm, marginTop: ESP.sm }}>
      <Text numberOfLines={1} style={{ ...TIPO.micro, color: COR.textoFraco }}>{`UP NEXT · ${nome}`}</Text>
      {proximas.map((p) => <View key={p.chave} style={{ flexDirection: 'row', alignItems: 'center', gap: ESP.sm }}>
        <View style={{ width: 36, height: 36, borderRadius: RAIO.ctrl, overflow: 'hidden', flexShrink: 0 }}>
          <CapaDuotone uri={capaParaLista(p.artworkUrl) ?? p.artworkUrl} style={{ borderRadius: RAIO.ctrl }}/>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontFamily: FONT.body, fontSize: 13, fontWeight: '600', color: COR.texto }}>{p.title}</Text>
          {p.artist ? <Text numberOfLines={1} style={{ ...TIPO.legenda, color: COR.textoMedio }}>{p.artist}</Text> : null}
        </View>
      </View>)}
    </View> : null}
  </ScrollView>;
}

/**
 * A conversa com o painel dele à direita. Na mesma superfície, sem caixa: a conversa
 * abre lugar (`padding-right` em 460 ms) e o painel entra 140 ms depois (a opacidade
 * em 320 ms e 28 px com a mola ENTRADA); a sair, a curva `sair`, mostrando até ao fim
 * o que tinha. **Janela estreita**: abaixo de `SOCIAL_COM_PAINEL` o painel não aparece
 * (o Listen along fica no cabeçalho), porque a lista e a conversa já ocupam tudo.
 * A cor da janela segue a música dele enquanto a conversa está aberta.
 */
export function LayoutDaConversa({ chave, amigo, largura, children }: LayoutDaConversaProps) {
  const musica = amigo ? musicaDoAmigo<any>(amigo) : null;
  const comPainel = !!musica && largura >= SOCIAL_COM_PAINEL;
  const saida = useSaida(comPainel, SAIDA_DO_PAINEL_MS);
  const visto = useRef<{ amigo: SocialFriend; musica: any } | null>(null);
  if (comPainel && amigo && musica) visto.current = { amigo, musica };
  const capa = musica ? capaParaLista(musica.artworkUrl) ?? musica.artworkUrl : null;
  useEffect(() => { definirCorDaConversa(capa ?? null); }, [capa]);
  useEffect(() => () => definirCorDaConversa(null), []);
  return <View style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
    <View key={chave} {...marcar('conversa-com-painel', 'conversa-entra', comPainel ? 'com-painel' : '')} style={{ flex: 1, minHeight: 0 }}>
      {children}
    </View>
    {saida.montado && visto.current ? <View {...marcar('painel-amigo', saida.aSair ? 'a-sair' : '')} pointerEvents={saida.aSair ? 'none' : 'auto'}
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 'var(--dt-painel-amigo, 220px)', paddingTop: ESP.xl, paddingLeft: ESP.md } as any}>
      <SeparadorDoPainelDoAmigo/>
      <PainelDoAmigo amigo={visto.current.amigo} musica={visto.current.musica}/>
    </View> : null}
  </View>;
}
