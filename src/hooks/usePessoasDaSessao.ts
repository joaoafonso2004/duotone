import { useEffect } from 'react';
import { garantirPerfis, usePerfisPublicos } from '../state/perfisPublicos';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { useSocial } from '../state/social';

/**
 * Quem é quem num Jam: o nome e a fotografia de cada pessoa, para as listas.
 *
 * Um sítio só para as três superfícies que mostram pessoas do Jam -- a folha
 * do iPhone, a janela do PC e a barra por cima do leitor. Cada uma tinha a sua
 * cópia do "procura nos amigos", e as três mostravam "You" com a inicial "Y"
 * em vez da própria pessoa. Ver `state/perfisPublicos.ts`.
 */
export function usePessoasDaSessao() {
  const membros = useOuvirJuntos((s) => s.membros);
  const fila = useOuvirJuntos((s) => s.fila);
  const hostId = useOuvirJuntos((s) => s.sessao?.hostId ?? null);
  const auxDe = useOuvirJuntos((s) => s.sessao?.auxDe ?? null);
  const euId = useOuvirJuntos((s) => s.euId);
  const amigos = useSocial((s) => s.friends);
  const perfis = usePerfisPublicos((s) => s.perfis);

  // Uma chave estável e não o array: um array novo a cada render voltava a
  // correr o efeito sem nada ter mudado.
  const chave = [...new Set([
    ...membros.map((m) => m.userId), ...fila.map((i) => i.postoPor), hostId, auxDe, euId,
  ].filter((id): id is string => !!id))].sort().join(',');
  useEffect(() => { if (chave) garantirPerfis(chave.split(',')); }, [chave]);

  const amigo = (id: string) => amigos.find((f) => f.friendId === id);
  /** O nome do perfil; a lista de amigos só enquanto o perfil não chega. */
  const nomeDe = (id: string) =>
    perfis[id]?.name || amigo(id)?.name || (id === euId ? 'You' : 'Someone');
  const avatarDe = (id: string) => perfis[id]?.avatar_url ?? amigo(id)?.avatarUrl ?? null;
  /**
   * A linha de uma pessoa: o nome dela, e depois os papéis. "you" fica, mas
   * como marca ao lado do nome -- como nos membros de um grupo -- e não em
   * vez dele.
   */
  const rotuloDe = (id: string) =>
    `${nomeDe(id)}${id === hostId ? ' · host' : ''}${id === euId ? ' · you' : ''}`;

  return { euId, nomeDe, avatarDe, rotuloDe };
}
