import type { DadosDaPrimeira } from '../lib/gaveta';
import { useRecentes } from './recentes';
import { useSocial } from './social';
import { useOutroAparelho } from './outroAparelho';

/**
 * O que a primeira gaveta usa (`gavetaInicial`), lido do que já está em memória
 * no instante em que ela abre pela primeira vez: o "Jump back in", os amigos
 * aceites (os ligados primeiro) e se há um PC a tocar nesta conta. Nenhum pedido.
 */
export function dadosDaPrimeiraGaveta(): DadosDaPrimeira {
  const amigos = useSocial.getState().friends
    .filter((f) => f.status === 'accepted')
    .sort((a, b) => Number(!!b.online) - Number(!!a.online))
    .map((f) => ({ id: f.friendId, nome: f.name || f.username, avatar: f.avatarUrl }));
  return {
    recentes: useRecentes.getState().lista,
    amigos,
    temPc: useOutroAparelho.getState().oferta?.deviceKind === 'desktop',
  };
}
