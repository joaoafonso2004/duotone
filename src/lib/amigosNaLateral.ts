/**
 * Quem aparece na lateral do PC, e por que ordem (26/9). Puro e sem imports:
 * `scripts/test-amigos-na-lateral.ts`.
 *
 * Amigos aceites que estão ONLINE ou A OUVIR. Primeiro quem está a ouvir (é o
 * que dá para fazer alguma coisa: ouvir com ele), depois os outros, e dentro de
 * cada grupo por nome -- uma ordem que mexesse a cada batimento faria as linhas
 * saltar debaixo do rato. No máximo oito linhas; o resto é "+N more online".
 *
 * A OUVIR conta como online nesta lista (8/11). A presença tem dois relógios:
 * o `online_until`, que só se renova com a app à frente, e o `playing_until`,
 * que se renova enquanto a música toca, também com o ecrã bloqueado. Com o
 * iPhone bloqueado a tocar, o primeiro caducava e o amigo saía da lista -- e o
 * Social, que lê o segundo, punha-o em "Listening now" com o "Listen along".
 * O João via o calito a ouvir no Social e não o via nos amigos ("nem mostra
 * online, sendo que ele está a ouvir música"). Aqui aparece com a música, o
 * ponto verde e entra no "N ONLINE". O `online` do resto da app (as conversas,
 * o "Last seen") fica o da app à frente.
 */
export const MAXIMO_NA_LATERAL = 8;

type Atividade = { listening: boolean; track: unknown } | null;
type Amigo = {
  friendId: string; name: string; username: string; status: string; online?: boolean;
  currentlyPlaying?: unknown | null; musicActivity?: Atividade;
};

/**
 * O que o amigo está a ouvir AGORA: com a app à frente (`currentlyPlaying`, que
 * só vem com ele online) ou em segundo plano (`musicActivity.listening`). As
 * duas são o mesmo `currently_playing` da presença, com a posição e o
 * `updatedAt` para a barra de progresso.
 */
export function musicaDoAmigo<F>(a: { currentlyPlaying?: F | null; musicActivity?: Atividade }): F | null {
  if (a.currentlyPlaying) return a.currentlyPlaying;
  return a.musicActivity?.listening ? (a.musicActivity.track as F) : null;
}

export function amigosNaLateral<T extends Amigo>(amigos: readonly T[], maximo = MAXIMO_NA_LATERAL): { visiveis: T[]; resto: number; online: number } {
  const ativos = amigos.filter((a) => a.status === 'accepted' && (a.online || !!musicaDoAmigo(a)));
  const nome = (a: Amigo) => (a.name || a.username || '').toLocaleLowerCase();
  const ordem = [...ativos].sort((a, b) => {
    const ouveA = musicaDoAmigo(a) ? 0 : 1;
    const ouveB = musicaDoAmigo(b) ? 0 : 1;
    return ouveA - ouveB || nome(a).localeCompare(nome(b));
  });
  // "N ONLINE" conta quem está na lista: a app à frente ou a música a tocar.
  return { visiveis: ordem.slice(0, maximo), resto: Math.max(0, ordem.length - maximo), online: ativos.length };
}
