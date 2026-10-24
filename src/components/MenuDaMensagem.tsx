import type React from 'react';
import type { SharedItem } from '../api/social';

/** O que o menu de uma mensagem faz com a conversa onde está. */
export type OpcoesDoMenuDaMensagem = {
  aoReagir: (m: SharedItem, emoji: string | null) => void;
  aoResponder: (m: SharedItem) => void;
  /** A tua reação nesta mensagem: o emoji fica aceso, e escolhê-lo outra vez tira-o. */
  minhaReacao: (m: SharedItem) => string | null;
};

export type AbrirMenuDaMensagem = (m: SharedItem, e: any, opcoes?: { podeResponder?: boolean }) => void;

/**
 * O menu de uma mensagem no botão direito é só do PC (`MenuDaMensagem.web.tsx`,
 * 24/10). No iPhone premir sem largar abre as reações, pelo seu caminho.
 */
export function useMenuDaMensagem(_opcoes: OpcoesDoMenuDaMensagem): { abrirMenuDaMensagem?: AbrirMenuDaMensagem; menuDaMensagem: React.ReactNode } {
  return { abrirMenuDaMensagem: undefined, menuDaMensagem: null };
}
