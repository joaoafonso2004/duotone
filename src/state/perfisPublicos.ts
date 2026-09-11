import { create } from 'zustand';
import { getPublicProfiles, type PublicProfile } from '../api/profiles';

/**
 * Nome e fotografia de quem aparece num Jam -- incluindo a própria pessoa.
 *
 * As listas do Jam iam buscar as caras à lista de amigos, e isso falhava em
 * dois sítios: a PRÓPRIA pessoa não é amiga de si mesma (aparecia "You" com a
 * inicial "Y" num círculo), e num Jam de grupo dois convidados podem não ser
 * amigos um do outro (aparecia "Someone"). O perfil público resolve os dois --
 * é o que a barra lateral do PC já lê para mostrar a conta.
 *
 * Em memória e por sessão da app: nomes e fotografias mudam, e uma cópia em
 * disco mostraria os de ontem.
 */
type Estado = { perfis: Record<string, PublicProfile> };

export const usePerfisPublicos = create<Estado>(() => ({ perfis: {} }));

/** Pedidos em curso, para dez linhas a pedir a mesma pessoa serem um pedido só. */
const aPedir = new Set<string>();

/** Vai buscar os que faltam. Sem rede não faz mal: fica a lista de amigos. */
export function garantirPerfis(ids: readonly string[]): void {
  const conhecidos = usePerfisPublicos.getState().perfis;
  const faltam = [...new Set(ids)].filter((id) => !!id && !conhecidos[id] && !aPedir.has(id));
  if (!faltam.length) return;
  faltam.forEach((id) => aPedir.add(id));
  void getPublicProfiles(faltam)
    .then((lista) => {
      if (!lista.length) return;
      usePerfisPublicos.setState((s) => ({
        perfis: { ...s.perfis, ...Object.fromEntries(lista.map((p) => [p.id, p])) },
      }));
    })
    .catch(() => {})
    .finally(() => faltam.forEach((id) => aPedir.delete(id)));
}

/** Ao sair da conta: as caras de uma conta não aparecem a quem entra a seguir. */
export function limparPerfisPublicos(): void {
  aPedir.clear();
  usePerfisPublicos.setState({ perfis: {} });
}
