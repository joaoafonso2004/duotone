import React, { useEffect, useMemo, useState } from 'react';
import { sessoesDeAmigos } from '../api/ouvirJuntos';
import { shareItem } from '../api/social';
import { lerMisturaDosDois } from '../api/vocesOsDois';
import { tituloDaFaixa } from '../lib/artistName';
import { avisarErro, avisarFeito, avisarInfo } from '../lib/avisoDeRemocao';
import { contextoDaPrateleira } from '../lib/contextoDaDescoberta';
import { alternarGuardada } from '../lib/guardarFaixa';
import { faixaDoAmigo, opcoesDoMenuDoAmigo, type AcaoDoAmigo } from '../lib/menuDoAmigo';
import { mensagemDeErro } from '../lib/mensagemDeErro';
import { novaEscolha } from '../lib/ultimaEscolha';
import { useAuth } from '../state/auth';
import { ouvirComAmigo } from '../state/ouvirComAmigo';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { usePlayer } from '../state/player';
import { useSaved } from '../state/saved';
import type { SocialFriend } from '../state/social';
import { MenuFlutuante, type Ancora } from './MenuFlutuante';
import type { PlayerAction } from './PlayerActionsSheet';

/**
 * O menu de um amigo no iPhone (5/10, auditoria de consistência M5): o toque
 * longo numa linha do Social. Pedia logo para REMOVER o amigo, enquanto no PC
 * o botão direito abria um menu útil -- ouvir com ele, tocar a música dele,
 * mensagem, perfil, a mistura dos dois, Jam. As regras são as mesmas
 * (`lib/menuDoAmigo.ts`, sem o "Pin", que é da lateral do PC); "Remove friend"
 * fica no fim e passa pela confirmação de sempre (`aoPedirRemover`).
 */
export function OpcoesDoAmigo({ amigo, ancora, aoFechar, aoMensagem, aoPerfil, aoPedirRemover }: {
  amigo: SocialFriend | null;
  ancora: Ancora | null;
  aoFechar: () => void;
  aoMensagem: (friendId: string) => void;
  aoPerfil: (friendId: string) => void;
  aoPedirRemover: (friendId: string) => void;
}) {
  const nome = amigo?.name || amigo?.username || 'your friend';
  const faixa = useMemo(() => faixaDoAmigo(amigo?.currentlyPlaying as any), [amigo?.currentlyPlaying]);
  const guardadas = useSaved((s) => s.keys);
  const estouNumJam = useOuvirJuntos((s) => !!s.sessao);
  const tenhoFaixa = usePlayer((s) => !!s.current);
  const faixaGuardada = !!faixa && guardadas.has(`${faixa.source}:${faixa.sourceId}`);
  // O Jam aberto dele: "ouvir com ele" entra nele (a mesma porta do PC).
  const [sessaoDele, setSessaoDele] = useState<string | null>(null);
  useEffect(() => {
    setSessaoDele(null);
    if (!amigo) return;
    let vivo = true;
    void sessoesDeAmigos().then((m) => { if (vivo) setSessaoDele(m.get(amigo.friendId) ?? null); }).catch(() => {});
    return () => { vivo = false; };
  }, [amigo?.friendId]);
  // O que se escolheu, guardado no toque: quando a ação corre o menu já fechou
  // e o pai já largou o amigo.
  const escolha = React.useRef<{ id: AcaoDoAmigo; amigo: SocialFriend; sessao: string | null } | null>(null);

  const linhas = amigo ? opcoesDoMenuDoAmigo({
    nome, faixa: faixa ? { titulo: faixa.title } : null, temJam: !!sessaoDele, faixaGuardada,
    estouNumJam, tenhoFaixa, fixado: false, plataforma: 'ios',
  }) : [];

  const executar = async (id: AcaoDoAmigo, a: SocialFriend, sessaoDele: string | null) => {
    const faixa = faixaDoAmigo(a.currentlyPlaying as any);
    const nome = a.name || a.username || 'your friend';
    try {
      switch (id) {
        case 'ouvir': await ouvirComAmigo(a, sessaoDele); break;
        case 'tocar': if (faixa) await usePlayer.getState().playTrack(faixa, [faixa], true, false, undefined, null); break;
        case 'fila': if (faixa) { usePlayer.getState().addToQueue(faixa); avisarFeito('Added to queue', tituloDaFaixa(faixa)); } break;
        // Tirar já mostra o aviso com "Undo"; guardar não mostra nada (3/10).
        case 'gostar': if (faixa) await alternarGuardada(faixa); break;
        case 'mensagem': aoMensagem(a.friendId); break;
        case 'perfil': aoPerfil(a.friendId); break;
        case 'mistura': {
          const eu = useAuth.getState().session?.user?.id;
          if (!eu) break;
          // O último toque ganha (lib/ultimaEscolha.ts).
          const aindaVale = novaEscolha();
          const mistura = await lerMisturaDosDois(eu, a.friendId);
          if (!aindaVale()) break;
          if (!mistura.length) { avisarInfo(`Not enough listening yet for a mix with ${nome}`); break; }
          await usePlayer.getState().playTrack(mistura[0], mistura, true, false, contextoDaPrateleira('amigos'), null);
          break;
        }
        case 'jam': {
          const jam = useOuvirJuntos.getState();
          if (jam.sessao) { await jam.convidarMais([a.friendId]); avisarFeito(`${nome} was invited to your Jam`); }
          else { await jam.abrir(usePlayer.getState().current ?? null, [a.friendId]); avisarFeito('Jam started', `${nome} was invited`); }
          break;
        }
        case 'partilhar': {
          const atual = usePlayer.getState().current;
          if (!atual) break;
          await shareItem(a.friendId, 'track', atual);
          avisarFeito(`Sent to ${nome}`, tituloDaFaixa(atual));
          break;
        }
        case 'remover': aoPedirRemover(a.friendId); break;
        default: break;
      }
    } catch (e) {
      avisarErro(mensagemDeErro(e, 'Something went wrong. Try again.'));
    }
  };

  const accoes: PlayerAction[] = linhas.map((l) => ({
    label: l.rotulo, icon: l.icone as any, destructive: l.perigo, inicioDeGrupo: l.inicioDeGrupo,
    onPress: () => { if (amigo) escolha.current = { id: l.id, amigo, sessao: sessaoDele }; aoFechar(); },
  }));

  // A ação corre depois de o menu sair do ecrã (ver o `aoFechado` do MenuFlutuante).
  return <MenuFlutuante visivel={!!amigo && !!ancora} ancora={ancora} accoes={accoes} aoFechar={aoFechar}
    aoFechado={() => {
      const e = escolha.current;
      escolha.current = null;
      if (e) void executar(e.id, e.amigo, e.sessao);
    }} />;
}
