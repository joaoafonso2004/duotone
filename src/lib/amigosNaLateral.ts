/**
 * Quem aparece na lateral do PC, e por que ordem (26/9). Puro e sem imports:
 * `scripts/test-amigos-na-lateral.ts`.
 *
 * Só amigos aceites e ONLINE. Primeiro quem está a ouvir (é o que dá para
 * fazer alguma coisa: ouvir com ele), depois os outros, e dentro de cada grupo
 * por nome -- uma ordem que mexesse a cada batimento faria as linhas saltar
 * debaixo do rato. No máximo oito linhas; o resto é "+N more online".
 */
export const MAXIMO_NA_LATERAL = 8;

type Amigo = { friendId: string; name: string; username: string; status: string; online?: boolean; currentlyPlaying?: unknown | null };

export function amigosNaLateral<T extends Amigo>(amigos: readonly T[], maximo = MAXIMO_NA_LATERAL): { visiveis: T[]; resto: number; online: number } {
  const online = amigos.filter((a) => a.status === 'accepted' && a.online);
  const nome = (a: Amigo) => (a.name || a.username || '').toLocaleLowerCase();
  const ordem = [...online].sort((a, b) => {
    const ouveA = a.currentlyPlaying ? 0 : 1;
    const ouveB = b.currentlyPlaying ? 0 : 1;
    return ouveA - ouveB || nome(a).localeCompare(nome(b));
  });
  return { visiveis: ordem.slice(0, maximo), resto: Math.max(0, ordem.length - maximo), online: online.length };
}
