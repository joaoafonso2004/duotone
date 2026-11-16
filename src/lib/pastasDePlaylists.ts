/**
 * As pastas de playlists (16/11, supabase/pastas-de-playlists.sql). Uma pasta
 * é um nome guardado na própria playlist: as que têm o mesmo nome estão juntas.
 * Aqui o que é puro: a grelha (pastas e playlists soltas, pela ordem da lista),
 * os nomes, e o que se pode fazer com uma playlist arrastada para cima de outra
 * no PC.
 *
 * Sem imports: `scripts/test-pastas-de-playlists.ts`.
 */

type ComPasta = { id: string; pasta?: string | null; artworks?: readonly string[]; souColaborador?: boolean };

export type ItemDaGrelha<P extends ComPasta> =
  | { tipo: 'pasta'; nome: string; playlists: P[]; capas: string[] }
  | { tipo: 'playlist'; playlist: P };

export const MAXIMO_DO_NOME_DA_PASTA = 60;

/** O nome como se guarda: sem espaços à volta, e com o teto do SQL. Vazio é "sem pasta". */
export function limparNomeDaPasta(nome: string | null | undefined): string | null {
  const t = (nome ?? '').replace(/\s+/g, ' ').trim().slice(0, MAXIMO_DO_NOME_DA_PASTA).trim();
  return t || null;
}

/** A mesma pasta escrita com outras maiúsculas é a mesma pasta. */
const chaveDaPasta = (nome: string) => nome.toLocaleLowerCase();

/**
 * A grelha: cada pasta aparece no lugar da sua primeira playlist (a lista já
 * vem pela ordem que se escolheu), com as capas das primeiras quatro; as
 * playlists sem pasta ficam como estavam. Uma pasta com uma playlist só continua
 * a ser uma pasta: foi o que se pediu.
 */
export function grelhaComPastas<P extends ComPasta>(playlists: readonly P[]): ItemDaGrelha<P>[] {
  const fora: ItemDaGrelha<P>[] = [];
  const pastas = new Map<string, Extract<ItemDaGrelha<P>, { tipo: 'pasta' }>>();
  for (const p of playlists) {
    const nome = limparNomeDaPasta(p.pasta);
    if (!nome) { fora.push({ tipo: 'playlist', playlist: p }); continue; }
    const k = chaveDaPasta(nome);
    let pasta = pastas.get(k);
    if (!pasta) {
      pasta = { tipo: 'pasta', nome, playlists: [], capas: [] };
      pastas.set(k, pasta);
      fora.push(pasta);
    }
    pasta.playlists.push(p);
    const capa = p.artworks?.find(Boolean);
    if (capa && pasta.capas.length < 4) pasta.capas.push(capa);
  }
  return fora;
}

/** As playlists de uma pasta, pela ordem da lista. */
export function playlistsDaPasta<P extends ComPasta>(playlists: readonly P[], nome: string): P[] {
  const k = chaveDaPasta(nome);
  return playlists.filter((p) => { const n = limparNomeDaPasta(p.pasta); return !!n && chaveDaPasta(n) === k; });
}

/** Os nomes das pastas que existem, pela ordem em que aparecem. */
export function nomesDasPastas(playlists: readonly ComPasta[]): string[] {
  return grelhaComPastas(playlists).flatMap((i) => (i.tipo === 'pasta' ? [i.nome] : []));
}

/** "New folder", e se já houver, "New folder 2", "New folder 3"... */
export function nomeDePastaNova(existentes: readonly string[]): string {
  const usados = new Set(existentes.map(chaveDaPasta));
  if (!usados.has(chaveDaPasta(FRASES_DAS_PASTAS.nova))) return FRASES_DAS_PASTAS.nova;
  for (let n = 2; ; n++) {
    const nome = `${FRASES_DAS_PASTAS.nova} ${n}`;
    if (!usados.has(chaveDaPasta(nome))) return nome;
  }
}

/** Só as minhas mudam de pasta: a linha de uma playlist de outra pessoa não é minha. */
export function podeIrParaUmaPasta(p: ComPasta): boolean {
  return !p.souColaborador;
}

/**
 * Uma playlist largada em cima de outra (o PC, 16/11): numa pasta entra nela;
 * em cima de uma playlist solta, a escolha entre fazer uma pasta com as duas e
 * juntar as músicas (o "Merge" que já existia, `mergePlaylists`).
 */
export type AoLargarAPlaylist = 'entrar-na-pasta' | 'escolher';
export function oQueFazAoLargar(alvo: { tipo: 'pasta' } | { tipo: 'playlist' }): AoLargarAPlaylist {
  return alvo.tipo === 'pasta' ? 'entrar-na-pasta' : 'escolher';
}

export const FRASES_DAS_PASTAS = {
  nova: 'New folder',
  mover: 'Move to folder…',
  tirar: 'Remove from folder',
  renomear: 'Rename folder…',
  desfazer: 'Ungroup',
  criar: 'New folder…',
  nomeDaPasta: 'Folder name',
  quantas: (n: number) => `${n} ${n === 1 ? 'playlist' : 'playlists'}`,
  movida: (pasta: string) => `Moved to ${pasta}`,
  tirada: 'Removed from the folder',
  desfeita: 'Folder ungrouped',
  fazerPasta: 'New folder with both',
  juntar: (destino: string) => `Merge into “${destino}”`,
} as const;
