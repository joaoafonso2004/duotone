import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { PropsDoHeroPc } from './ProfileHeroPc';
import { BotaoDeVidro } from './ProfileHero';
import { FriendAvatar } from './FriendAvatar';
import { profileImageCacheKey } from '../lib/profileMedia';
import { enquadrarCapa } from '../lib/profileImageCrop';
import { estadoDaCapa, eTeclaDaCapa, progressoDaRolagem, tamanhoDoNome } from '../lib/capaDoPerfilPc';
import { colors } from './socialTokens';
import { COR, FONT } from '../desktop/tokens.web';
const { createPortal } = require('react-dom') as { createPortal: (filho: React.ReactNode, onde: Element) => React.ReactElement };

/**
 * O perfil no PC com a capa por página (30/10, passo 5 de
 * `docs/PLANO-ELEVAR-PC.md`, maquete `docs/pc-elevar-maquete.html`): a
 * fotografia cobre a janela toda e fica presa enquanto o resto da página sobe
 * por cima. Ao rolar, escurece e afasta-se. O botão do canto, ou a tecla F,
 * abre a capa INTEIRA, sem cortes: no cabeçalho de antes (320 a 560 pt de altura)
 * a fotografia, que se guarda a 3:2, aparecia cortada a um terço e nunca se via
 * toda.
 *
 * Devolve DUAS peças que o `SocialProfileView` tem de pôr como filhas diretas do
 * scroll (e não dentro de outra caixa): a capa, presa ao topo do scroll
 * (`sticky` só cola dentro da caixa que tem a altura da página inteira), e o
 * palco da identidade, por cima dela. O conteúdo da página vem a seguir.
 *
 * O afastamento (escala, subida, véu, pista) escreve-se direto no DOM, uma vez
 * por fotograma, e só enquanto se rola: não redesenha a página.
 */

/** A janela que rola, onde as linhas ficam cortadas. */
function janelaQueRola(no: HTMLElement | null): HTMLElement | null {
  for (let el = no?.parentElement ?? null; el; el = el.parentElement) {
    const y = getComputedStyle(el).overflowY;
    if (y === 'auto' || y === 'scroll') return el;
  }
  return null;
}

/** Uma cápsula de vidro, para as ações da identidade. */
function Pilula({ rotulo, aoCarregar, icone, branca = false, cor }: {
  rotulo: string; aoCarregar: () => void; icone?: keyof typeof Ionicons.glyphMap; branca?: boolean; cor?: string;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={rotulo} onPress={aoCarregar}
    style={({ pressed, hovered }: any) => [estilos.pilula, branca
      ? { backgroundColor: '#fff', borderColor: 'transparent', opacity: pressed ? 0.85 : 1 }
      : { backgroundColor: pressed || hovered ? 'rgba(10,10,15,0.7)' : 'rgba(10,10,15,0.45)', borderColor: 'rgba(255,255,255,0.28)' }]}>
    {icone ? <Ionicons name={icone} size={17} color={cor ?? (branca ? COR.fundo : '#fff')} /> : null}
    <Text numberOfLines={1} style={[estilos.pilulaTexto, { color: branca ? COR.fundo : '#fff' }]}>{rotulo}</Text>
  </Pressable>;
}

export function ProfileHeroPc({ profile, own, cover, unread, status, altura, largura, menu, onEdit, onMessage, onBack, onSocial, onStats,
  onRefresh, onAddFriend, pending, onVocesOsDois }: PropsDoHeroPc) {
  const capaRef = useRef<any>(null), imagemRef = useRef<any>(null), veuRef = useRef<any>(null), pistaRef = useRef<any>(null);
  const caixaRef = useRef<any>(null), antesDoFoco = useRef<HTMLElement | null>(null);
  const [aberta, setAberta] = useState(false);
  // A capa cobre a janela do perfil; numa muito baixa, o mínimo que deixa ver a identidade.
  const H = Math.max(420, Math.round(altura) || 0);

  // O afastamento ao rolar: escala e subida (só com movimento), véu escuro e a pista a apagar-se.
  useEffect(() => {
    const no = capaRef.current as HTMLElement | null;
    const raiz = janelaQueRola(no);
    if (!no || !raiz) return;
    const calmo = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let quadro = 0;
    const pintar = () => {
      quadro = 0;
      const e = estadoDaCapa(progressoDaRolagem(raiz.scrollTop, H));
      if (imagemRef.current && !calmo) imagemRef.current.style.transform = `translateY(${e.subida}px) scale(${e.escala})`;
      if (veuRef.current) veuRef.current.style.opacity = String(e.veu);
      if (pistaRef.current) pistaRef.current.style.opacity = String(e.pista);
    };
    const agendar = () => { if (!quadro) quadro = requestAnimationFrame(pintar); };
    pintar();
    raiz.addEventListener('scroll', agendar, { passive: true });
    return () => { cancelAnimationFrame(quadro); raiz.removeEventListener('scroll', agendar); };
  }, [H, cover]);

  // F abre e fecha a capa inteira; Esc fecha. Só com a página à vista (por baixo do
  // Now Playing a página continua montada, e a tecla não é dela) e fora de um campo.
  useEffect(() => {
    if (!cover) return;
    const tecla = (e: KeyboardEvent) => {
      if (aberta && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setAberta(false); return; }
      const no = capaRef.current as HTMLElement | null;
      if (!no || !no.getClientRects().length || getComputedStyle(no).visibility === 'hidden') return;
      if (!eTeclaDaCapa(e as unknown as Parameters<typeof eTeclaDaCapa>[0])) return;
      e.preventDefault();
      setAberta((a) => !a);
    };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, [aberta, cover]);

  // O foco vai para a capa aberta e volta para onde estava ao fechar.
  useEffect(() => {
    if (!aberta) return;
    antesDoFoco.current = document.activeElement as HTMLElement | null;
    (caixaRef.current as HTMLElement | null)?.focus();
    return () => { if (antesDoFoco.current?.isConnected) antesDoFoco.current.focus?.(); };
  }, [aberta]);

  const e = enquadrarCapa(largura, H);
  const nome = profile?.profile.name ?? '';
  const tamanho = tamanhoDoNome(nome, largura);
  const bio = profile?.appearance?.bio?.trim();
  return <>
    <View ref={capaRef} pointerEvents="none" style={{ position: 'sticky', top: 0, height: H, marginBottom: -H, overflow: 'hidden', zIndex: 0 } as any}>
      <View ref={imagemRef} style={[StyleSheet.absoluteFill, { transformOrigin: '50% 40%' } as any]}>
        {cover && e.largura > 0 ? <Image source={{ uri: cover, cacheKey: profileImageCacheKey(cover) }} contentFit="fill" cachePolicy="memory-disk"
          style={{ position: 'absolute', width: e.largura, height: e.altura, left: e.left, top: e.top }} /> : null}
      </View>
      <LinearGradient colors={['rgba(6,6,8,0.25)', 'rgba(6,6,8,0)', 'rgba(6,6,8,0.15)', 'rgba(6,6,8,0.82)']} locations={[0, 0.28, 0.55, 1]}
        style={StyleSheet.absoluteFill} />
      <View ref={veuRef} style={[StyleSheet.absoluteFill, { backgroundColor: '#060608', opacity: 0 }]} />
    </View>
    <View {...(menu ?? {})} style={{ height: H, zIndex: 2, justifyContent: 'flex-end', paddingHorizontal: 44, paddingBottom: 46 }}>
      <View style={estilos.botoes} pointerEvents="box-none">
        {onBack ? <BotaoDeVidro label="Back" icon="chevron-back" onPress={onBack} /> : null}
        <View style={{ flex: 1 }} pointerEvents="none" />
        {cover ? <BotaoDeVidro label="View full cover (F)" icon="expand-outline" onPress={() => setAberta(true)} /> : null}
        {own && onSocial ? <BotaoDeVidro label="Friends and chats" icon="chatbubbles-outline" onPress={onSocial} badge={unread} /> : null}
        {onStats ? <BotaoDeVidro label="Listening stats" icon="stats-chart-outline" onPress={onStats} /> : null}
        <BotaoDeVidro label="Refresh profile" icon="refresh-outline" onPress={onRefresh} />
      </View>
      {profile ? <View style={{ alignItems: 'flex-start' }}>
        <View style={estilos.anel}><FriendAvatar avatarUrl={profile.profile.avatar_url} name={profile.profile.name} size={112} /></View>
        <Text numberOfLines={1} accessibilityRole="header"
          style={[estilos.nome, { fontSize: tamanho, lineHeight: Math.round(tamanho * 0.95), letterSpacing: -tamanho * 0.04 }]}>{nome}</Text>
        <Text numberOfLines={1} style={estilos.arroba}>
          @{profile.profile.username}{status ? <Text style={{ color: status.startsWith('●') ? colors.online : 'rgba(255,255,255,0.7)' }}>{`  ·  ${status}`}</Text> : null}
        </Text>
        {bio ? <Text style={estilos.bio}>{bio}</Text> : null}
        <View style={estilos.acoes}>
          {own
            ? <Pilula rotulo="Edit profile" aoCarregar={onEdit} />
            : profile.canView
              ? <>
                <Pilula rotulo="Message" aoCarregar={onMessage} icone="chatbubble-outline" branca />
                {onVocesOsDois ? <Pilula rotulo="You two" aoCarregar={onVocesOsDois} icone="sparkles-outline" /> : null}
              </>
              : <Pilula rotulo={pending ? 'Request pending' : 'Add friend'} aoCarregar={pending ? () => {} : onAddFriend}
                icone={pending ? 'time-outline' : 'person-add-outline'} branca={!pending} />}
        </View>
      </View> : null}
      <View ref={pistaRef} pointerEvents="none" style={estilos.pista}>
        <Text style={estilos.pistaTexto}>SCROLL</Text>
        <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.7)" />
      </View>
    </View>
    {aberta && cover ? createPortal(
      <div ref={caixaRef} role="dialog" aria-modal="true" aria-label="Full cover photo" tabIndex={-1} data-dt="veu" onClick={() => setAberta(false)}
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 320, background: 'rgba(0,0,0,0.94)', display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, cursor: 'zoom-out', outline: 'none' }}>
        <img data-dt="dialogo" src={cover} alt="Cover photo" draggable={false}
          style={{ maxWidth: '92%', maxHeight: '84%', objectFit: 'contain', borderRadius: 10, boxShadow: '0 30px 100px #000' }} />
        <span style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: 1.4, color: '#fff', textTransform: 'uppercase' }}>Full cover · click or press Esc to close</span>
      </div>,
      document.body,
    ) : null}
  </>;
}

const estilos = StyleSheet.create({
  botoes: { position: 'absolute', top: 16, left: 24, right: 24, flexDirection: 'row', gap: 10, zIndex: 3 },
  anel: { width: 118, height: 118, borderRadius: 59, borderWidth: 3, borderColor: 'rgba(255,255,255,0.92)', overflow: 'hidden', marginBottom: 18,
    boxShadow: '0 16px 40px rgba(0,0,0,0.5)' } as any,
  nome: { fontFamily: FONT.display, fontWeight: '900', color: '#fff', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 8 }, textShadowRadius: 40 },
  arroba: { fontFamily: FONT.mono, fontSize: 12.5, color: 'rgba(255,255,255,0.7)', marginTop: 8 },
  bio: { fontFamily: FONT.body, fontSize: 16, lineHeight: 23, color: '#fff', marginTop: 10, maxWidth: 520 },
  acoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  pilula: { minHeight: 44, borderRadius: 22, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 18 },
  pilulaTexto: { fontFamily: FONT.body, fontSize: 13.5, fontWeight: '700' },
  pista: { position: 'absolute', left: 0, right: 0, bottom: 14, alignItems: 'center', gap: 4 },
  pistaTexto: { fontFamily: FONT.mono, fontSize: 10, letterSpacing: 1.6, color: 'rgba(255,255,255,0.7)' },
});
