import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { checkIsSaved, removeFromLibrary, saveToLibrary } from '../api/library';
import { declineOrRemoveFriendship, shareItem, type Friendship } from '../api/social';
import { lerMisturaDosDois } from '../api/vocesOsDois';
import { FriendAvatar } from '../components/FriendAvatar';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { estaFixado } from '../lib/atalhosDaLateral';
import { contextoDaPrateleira } from '../lib/contextoDaDescoberta';
import { faixaDoAmigo, opcoesDoMenuDoAmigo, type AcaoDoAmigo } from '../lib/menuDoAmigo';
import { MenuDeContexto } from './MenuDeContexto.web';
import { useAtalhosDaLateral } from '../state/atalhosDaLateral';
import { useAuth } from '../state/auth';
import { ouvirComAmigo } from '../state/ouvirComAmigo';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { usePlayer } from '../state/player';
import { useSaved } from '../state/saved';
import { useSocial } from '../state/social';
import type { Route } from './rotas';
import { COR, FONT } from './tokens.web';
import { Button, Dialog } from './ui.web';
import { novaEscolha } from '../lib/ultimaEscolha';

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
          // O último toque ganha: escolher outra música enquanto se lê não
          // deixa a mistura tomar-lhe o lugar (lib/ultimaEscolha.ts).
          const aindaVale = novaEscolha();
          const mistura = await lerMisturaDosDois(eu, amigo.friendId);
          if (!aindaVale()) break;
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
  // O menu de contexto comum do PC (5/10, MenuDeContexto.web.tsx).
  return <MenuDeContexto
    rato={rato}
    rotulo={`Options for ${nome}`}
    cabecalho={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <FriendAvatar avatarUrl={amigo.avatarUrl} name={nome} size={36} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: FONT.body, fontSize: 14, fontWeight: '700', color: COR.texto }}>{nome}</Text>
        <Text numberOfLines={1} style={{ fontFamily: FONT.body, fontSize: 12, color: COR.textoMedio, marginTop: 1 }}>{estado}</Text>
      </View>
    </View>}
    linhas={linhas.map((l) => ({ id: l.id, rotulo: l.rotulo, icone: l.icone, perigo: l.perigo, inicioDeGrupo: l.inicioDeGrupo }))}
    aoEscolher={(id) => { void executar(id as AcaoDoAmigo); }}
    aoFechar={aoFechar}
  />;
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
