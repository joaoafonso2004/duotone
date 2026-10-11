/**
 * Guardar a fila como playlist (11/10): o nome que se sugere e as músicas que
 * vão, a que toca primeiro e depois as próximas, sem repetidas.
 *
 * Para quando um Mix, o Radio ou uma prateleira saem bons: até aqui só dava
 * para guardar música a música.
 *
 * Puro, sem imports: `scripts/test-guardar-fila.ts`.
 */

type Faixa = { source: string; sourceId: string };
type Origem = { tipo: string; nome: string } | null | undefined;

const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * O nome sugerido: o da origem quando ela é uma coisa que ainda não está
 * guardada (um Mix, uma prateleira, um artista, uma pesquisa); senão "Queue ·
 * 11 Oct". De uma playlist ou das Liked Songs não se sugere o mesmo nome: era
 * uma segunda playlist com o nome da primeira.
 */
export function nomeParaAFila(origem: Origem, agora: Date): string {
  const nome = origem?.nome?.trim();
  if (nome && origem!.tipo !== 'playlist' && origem!.tipo !== 'guardadas') return nome.slice(0, 100);
  return `Queue · ${agora.getDate()} ${MESES[agora.getMonth()]}`;
}

/** A que toca e as próximas, pela ordem, sem a mesma música duas vezes. */
export function faixasDaFila<T extends Faixa>(atual: T | null | undefined, proximas: readonly T[]): T[] {
  const vistas = new Set<string>();
  const fora: T[] = [];
  for (const t of [...(atual ? [atual] : []), ...proximas]) {
    const chave = `${t.source}:${t.sourceId}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    fora.push(t);
  }
  return fora;
}
