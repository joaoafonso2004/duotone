import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { checkIsSaved, removeFromLibrary, saveToLibrary } from '../api/library';
import { declineOrRemoveFriendship, shareItem, type Friendship } from '../api/social';
import { lerMisturaDosDois } from '../api/vocesOsDois';
import { FriendAvatar } from '../components/FriendAvatar';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { estaFixado } from '../lib/atalhosDaLateral';
import { contextoDaPrateleira } from '../lib/contextoDaDescoberta';
import { faixaDoAmigo, opcoesDoMenuDoAmigo, posicaoDoMenu, type AcaoDoAmigo } from '../lib/menuDoAmigo';
import { useAtalhosDaLateral } from '../state/atalhosDaLateral';
import { useAuth } from '../state/auth';
import { ouvirComAmigo } from '../state/ouvirComAmigo';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { usePlayer } from '../state/player';
import { useSaved } from '../state/saved';
import { useSocial } from '../state/social';
import type { Route } from './rotas';
import { COR, FONT } from './tokens.web';
import { Button, Dialog, marcar } from './ui.web';
import { pausarAtalhosDaJanela } from './useAtalhosDaJanela.web';

// Sem tipos instalados para o react-dom; só se usa o portal (como na lateral).
const { createPortal } = require('react-dom') as { createPortal: (filho: React.ReactNode, onde: Element) => React.ReactElement };

const LARGURA = 280;

/**
 * O menu do botão direito num amigo da lateral (2/10, maquete
 * `docs/mensagens-e-menu-do-amigo.html`). Abre onde está o rato; as regras
 * (que ações, por que ordem, com que nome) vivem em `lib/menuDoAmigo.ts`.
 *
 * Fecha com um clique fora, Esc, a roda do rato, ou a janela a perder o foco.
 * Enquanto está aberto, os atalhos da janela (espaço, setas) ficam parados:
 * as setas são do menu.
 */
export function MenuDoAmigo({ amigo, sessaoDele, rato, aoFechar, aoPedirRemover, navigate, notify }: {
  amigo: Friendship;
  /** O Jam aberto dele, se houver. */
  sessaoDele: string | null;
  rato: { x: number; y: number };
  aoFechar: () => void;
  aoPedirRemover: (a: Friendship) => void;
  navigate: (r: Route) => void;
  notify: (texto: string) => void;
}) {
  const nome = amigo.name || amigo.username || 'your friend';
  const faixa = useMemo(() => faixaDoAmigo(amigo.currentlyPlaying), [amigo.currentlyPlaying]);
  const guardadas = useSaved((s) => s.keys);
  const estouNumJam = useOuvirJuntos((s) => !!s.sessao);
  const tenhoFaixa = usePlayer((s) => !!s.current);
  const atalhos = useAtalhosDaLateral((s) => s.lista);
  const fixado = estaFixado(atalhos, `amigo:${amigo.friendId}`);
  const faixaGuardada = !!faixa && guardadas.has(`${faixa.source}:${faixa.sourceId}`);
  const linhas = opcoesDoMenuDoAmigo({ nome, faixa: faixa ? { titulo: faixa.title } : null, temJam: !!sessaoDele, faixaGuardada, estouNumJam, tenhoFaixa, fixado });

  const caixa = useRef<any>(null);
  const itens = useRef<any[]>([]);
  const [onde, setOnde] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    pausarAtalhosDaJanela(true);
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains?.(e.target)) aoFechar(); };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); aoFechar(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      const lista = itens.current.filter(Boolean);
      if (!lista.length) return;
      const agora = lista.indexOf(document.activeElement);
      const proximo = e.key === 'Home' ? 0 : e.key === 'End' ? lista.length - 1
        : e.key === 'ArrowDown' ? (agora + 1) % lista.length : (agora <= 0 ? lista.length - 1 : agora - 1);
      lista[proximo]?.focus?.();
    };
    const fechar = () => aoFechar();
    document.addEventListener('mousedown', fora, true);
    window.addEventListener('keydown', tecla, true);
    window.addEventListener('blur', fechar);
    window.addEventListener('resize', fechar);
    window.addEventListener('wheel', fechar, { passive: true });
    return () => {
      pausarAtalhosDaJanela(false);
      document.removeEventListener('mousedown', fora, true);
      window.removeEventListener('keydown', tecla, true);
      window.removeEventListener('blur', fechar);
      window.removeEventListener('resize', fechar);
      window.removeEventListener('wheel', fechar);
    };
  }, [aoFechar]);

  const executar = async (id: AcaoDoAmigo) => {
    aoFechar();
    try {
      switch (id) {
        case 'ouvir':
          await ouvirComAmigo(amigo, sessaoDele);
          break;
        case 'tocar':
          if (faixa) await usePlayer.getState().playTrack(faixa, [faixa], false, false, undefined, null);
          break;
        case 'fila':
          if (faixa) { usePlayer.getState().addToQueue(faixa); notify(`${tituloDaFaixa(faixa)} added to the queue.`); }
          break;
        case 'gostar':
          if (!faixa) break;
          if (faixaGuardada) {
            useSaved.getState().markSaved(faixa, false);
            const { trackId } = await checkIsSaved(faixa.source, faixa.sourceId);
            if (trackId) await removeFromLibrary(trackId);
            notify('Removed from Liked Songs.');
          } else {
            useSaved.getState().markSaved(faixa, true);
            await saveToLibrary(faixa);
            notify('Added to Liked Songs.');
          }
          window.dispatchEvent(new Event('duotone:refresh-library'));
          break;
        case 'mensagem':
          navigate({ name: 'social', friendId: amigo.friendId });
          break;
        case 'perfil':
          navigate({ name: 'friend-profile', userId: amigo.friendId });
          break;
        case 'mistura': {
          const eu = useAuth.getState().session?.user?.id;
          if (!eu) break;
          const mistura = await lerMisturaDosDois(eu, amigo.friendId);
          if (!mistura.length) { notify(`Not enough listening yet for a mix with ${nome}.`); break; }
          await usePlayer.getState().playTrack(mistura[0], mistura, false, false, contextoDaPrateleira('amigos'), null);
          notify(`Playing a mix of you and ${nome}.`);
          break;
        }
        case 'jam': {
          const jam = useOuvirJuntos.getState();
          if (jam.sessao) {
            await jam.convidarMais([amigo.friendId]);
            notify(`${nome} was invited to your Jam.`);
          } else {
            await jam.abrir(usePlayer.getState().current ?? null, [amigo.friendId]);
            notify(`Jam started. ${nome} was invited.`);
          }
          break;
        }
        case 'partilhar': {
          const atual = usePlayer.getState().current;
          if (!atual) break;
          await shareItem(amigo.friendId, 'track', atual);
          notify(`Sent ${tituloDaFaixa(atual)} to ${nome}.`);
          break;
        }
        case 'fixar': {
          const ficou = useAtalhosDaLateral.getState().alternar({ tipo: 'amigo', id: amigo.friendId, nome, avatar: amigo.avatarUrl ?? null });
          notify(ficou ? `${nome} pinned to the sidebar.` : `${nome} unpinned.`);
          break;
        }
        case 'remover':
          aoPedirRemover(amigo);
          break;
      }
    } catch (e: any) {
      // O gostar otimista volta atrás se o servidor recusar.
      if (id === 'gostar' && faixa) useSaved.getState().markSaved(faixa, faixaGuardada);
      notify(e?.message || 'Something went wrong. Try again.');
    }
  };

  const estado = faixa ? `${tituloDaFaixa(faixa)} · ${displayArtist(faixa)}` : amigo.online ? 'Online' : 'Offline';
  const virado = onde ? { x: onde.x < rato.x, y: onde.y < rato.y } : { x: false, y: false };

  return createPortal(
    <View
      ref={caixa}
      accessibilityRole={'menu' as any}
      accessibilityLabel={`Options for ${nome}`}
      onLayout={(e) => {
        if (onde) return;
        const { width, height } = e.nativeEvent.layout;
        setOnde(posicaoDoMenu(rato, { largura: width, altura: height }, { largura: window.innerWidth, altura: window.innerHeight }));
      }}
      {...(onde ? marcar('menu-amigo') : {})}
      style={{
        position: 'fixed', zIndex: 300, width: LARGURA, left: onde?.x ?? rato.x, top: onde?.y ?? rato.y,
        opacity: onde ? 1 : 0, padding: 6, borderRadius: 14, backgroundColor: '#18181F',
        borderWidth: 1, borderColor: '#33333C', boxShadow: '0 16px 40px rgba(0,0,0,.55)',
        transformOrigin: `${virado.y ? 'bottom' : 'top'} ${virado.x ? 'right' : 'left'}`,
      } as any}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 10 }}>
        <FriendAvatar avatarUrl={amigo.avatarUrl} name={nome} size={36} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontFamily: FONT.body, fontSize: 14, fontWeight: '700', color: COR.texto }}>{nome}</Text>
          <Text numberOfLines={1} style={{ fontFamily: FONT.body, fontSize: 12, color: COR.textoMedio, marginTop: 1 }}>{estado}</Text>
        </View>
      </View>
      {linhas.map((l, i) => (
        <React.Fragment key={l.id}>
          {l.inicioDeGrupo ? <View style={{ height: 1, backgroundColor: COR.linhaSuave, marginVertical: 5, marginHorizontal: 6 }} /> : null}
          <Pressable
            ref={(n: any) => { itens.current[i] = n; }}
            accessibilityRole={'menuitem' as any}
            {...marcar('menu-linha')}
            onPress={() => { void executar(l.id); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 9 }}
          >
            <Ionicons name={l.icone as any} size={17} color={l.perigo ? COR.erro : COR.textoMedio} />
            <Text numberOfLines={1} style={{ flex: 1, fontFamily: FONT.body, fontSize: 13.5, color: l.perigo ? COR.erro : COR.texto }}>{l.rotulo}</Text>
          </Pressable>
        </React.Fragment>
      ))}
    </View>,
    document.body,
  );
}

/** A confirmação de remover um amigo (o menu já fechou quando ela abre). */
export function ConfirmarRemoverAmigo({ amigo, aoFechar, notify }: {
  amigo: Friendship | null;
  aoFechar: () => void;
  notify: (texto: string) => void;
}) {
  const [aRemover, setARemover] = useState(false);
  if (!amigo) return null;
  const nome = amigo.name || amigo.username || 'this friend';
  const remover = async () => {
    if (aRemover) return;
    setARemover(true);
    try {
      await declineOrRemoveFriendship(amigo.friendId);
      // Um amigo que saiu também sai dos atalhos da lateral.
      useAtalhosDaLateral.getState().tirar(`amigo:${amigo.friendId}`);
      void useSocial.getState().refresh();
      notify(`${nome} was removed from your friends.`);
      aoFechar();
    } catch (e: any) {
      notify(e?.message || 'Could not remove this friend.');
    } finally {
      setARemover(false);
    }
  };
  return createPortal(
    <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 310 } as any}>
      <Dialog open title={`Remove ${nome}?`} width={380} onClose={aoFechar}>
        <Text style={{ fontFamily: FONT.body, fontSize: 14, lineHeight: 21, color: COR.textoMedio, marginBottom: 18 }}>
          You will stop seeing what each other is listening to. Your conversation stays.
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
          <Button secondary onPress={aoFechar}>Cancel</Button>
          <Button danger disabled={aRemover} onPress={() => { void remover(); }}>Remove</Button>
        </View>
      </Dialog>
    </View>,
    document.body,
  );
}
