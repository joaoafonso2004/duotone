import { useSyncExternalStore } from 'react';

/**
 * A cor da conversa (22/11, a B4 de `.claude/planos/PLANO-SOCIAL-B4.md`): com a
 * conversa aberta de um amigo que está a ouvir, a janela toma a cor da capa dele.
 * É a MESMA camada do Now Playing e da página do artista (`FundoDaCapa
 * onde="janela"`, no `RootNavigator.web.tsx`), que lê daqui a capa; quem a
 * escreve é a conversa do Social (`SocialPc.web.tsx`). Só memória, sem pedidos.
 */
let capa: string | null = null;
const ouvintes = new Set<() => void>();

export function definirCorDaConversa(nova: string | null): void {
  if (nova === capa) return;
  capa = nova;
  ouvintes.forEach((f) => f());
}

const ouvir = (f: () => void) => {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
};
const ler = () => capa;

/** A capa do amigo da conversa aberta, ou `null`. */
export function useCorDaConversa(): string | null {
  return useSyncExternalStore(ouvir, ler, ler);
}
