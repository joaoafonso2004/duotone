/**
 * Playlists colaborativas (7/10): quem é o quê numa playlist, e o que cada um
 * pode fazer. Plano em docs/PLANO-PLAYLISTS-PARTILHADAS.md; as permissões a
 * sério são da RLS (supabase/playlists-colaborativas.sql) -- isto só decide o
 * que se MOSTRA, e tem de dizer o mesmo que ela.
 *
 * Sem imports de runtime: testado em Node puro.
 */

export type PapelNaPlaylist = 'dono' | 'colaborador' | 'leitor';

export type PessoaDaPlaylist = {
  id: string;
  papel: 'dono' | 'colaborador';
  nome: string;
  username: string;
  avatarUrl: string | null;
};

/** O mesmo teto da função `convidar_para_playlist`. */
export const MAXIMO_DE_COLABORADORES = 20;

export function papelNaPlaylist(p: {
  donoId: string | null | undefined;
  eu: string | null | undefined;
  pessoas: readonly PessoaDaPlaylist[];
}): PapelNaPlaylist {
  if (!p.eu) return 'leitor';
  if (p.donoId && p.donoId === p.eu) return 'dono';
  return p.pessoas.some((x) => x.papel === 'colaborador' && x.id === p.eu) ? 'colaborador' : 'leitor';
}

/** Pôr, tirar e reordenar músicas. */
export const podeMexerNasFaixas = (papel: PapelNaPlaylist): boolean => papel !== 'leitor';
/** Nome, apagar, mostrar no perfil e decidir quem colabora: só o dono. */
export const podeGerir = (papel: PapelNaPlaylist): boolean => papel === 'dono';

export const colaboradoresDe = (pessoas: readonly PessoaDaPlaylist[]): PessoaDaPlaylist[] =>
  pessoas.filter((x) => x.papel === 'colaborador');

/** Há mais alguém além do dono: é aí que se mostram as caras. */
export const eColaborativa = (pessoas: readonly PessoaDaPlaylist[]): boolean => colaboradoresDe(pessoas).length > 0;

export const vagasParaColaboradores = (pessoas: readonly PessoaDaPlaylist[]): number =>
  Math.max(0, MAXIMO_DE_COLABORADORES - colaboradoresDe(pessoas).length);

type Amigo = { friendId: string; status: 'pending' | 'accepted'; name: string; username: string };

/** Os amigos ACEITES que ainda não estão na playlist, por nome. */
export function amigosParaConvidar<A extends Amigo>(amigos: readonly A[], pessoas: readonly PessoaDaPlaylist[]): A[] {
  const ja = new Set(pessoas.map((x) => x.id));
  const vistos = new Set<string>();
  return amigos
    .filter((a) => {
      if (a.status !== 'accepted' || ja.has(a.friendId) || vistos.has(a.friendId)) return false;
      vistos.add(a.friendId);
      return true;
    })
    .sort((a, b) => (a.name || a.username).localeCompare(b.name || b.username, undefined, { sensitivity: 'base' }));
}

/**
 * A cara de quem pôs uma música. Só numa playlist com colaboradores (numa só
 * do dono seria a mesma cara em todas as linhas), e só de quem ainda lá está.
 */
export function quemPos(
  addedBy: string | null | undefined,
  pessoas: readonly PessoaDaPlaylist[],
): PessoaDaPlaylist | null {
  if (!addedBy || !eColaborativa(pessoas)) return null;
  return pessoas.find((x) => x.id === addedBy) ?? null;
}

/** Nome para mostrar: o nome, ou o @, ou nada. */
export const nomeDaPessoa = (p: Pick<PessoaDaPlaylist, 'nome' | 'username'>): string =>
  p.nome?.trim() || (p.username ? `@${p.username}` : 'Someone');

/**
 * A linha por baixo do título: "Ana and 2 others". `null` sem colaboradores.
 * As caras são as primeiras três, o dono primeiro.
 */
export function resumoDasPessoas(pessoas: readonly PessoaDaPlaylist[]): { caras: PessoaDaPlaylist[]; texto: string } | null {
  if (!eColaborativa(pessoas)) return null;
  const dono = pessoas.find((x) => x.papel === 'dono');
  const ordem = [...(dono ? [dono] : []), ...colaboradoresDe(pessoas)];
  const primeiro = nomeDaPessoa(ordem[0]);
  const resto = ordem.length - 1;
  const texto = resto === 0 ? primeiro
    : resto === 1 ? `${primeiro} and ${nomeDaPessoa(ordem[1])}`
      : `${primeiro} and ${resto} others`;
  return { caras: ordem.slice(0, 3), texto };
}

/** A linha de uma playlist na lista: diz que é colaborativa. */
export function metaDaPlaylist(p: { trackCount: number; colaborativa?: boolean }): string {
  const faixas = `${p.trackCount} ${p.trackCount === 1 ? 'track' : 'tracks'}`;
  return p.colaborativa ? `Collaborative · ${faixas}` : faixas;
}

/** A mensagem que vai no chat a quem acabou de entrar. */
export const MENSAGEM_DO_CONVITE = 'Added you to this playlist. You can add songs too.';
