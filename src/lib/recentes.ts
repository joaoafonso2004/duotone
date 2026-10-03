/**
 * O "Jump back in" da Home do iPhone (3/10, variante A de
 * `docs/barra-home-folhas.html`): os últimos sítios de onde se ouviu -- uma
 * playlist, as Liked Songs, um artista, um álbum, uma mistura, a Daily mix --
 * para voltar onde se estava. Toma o lugar da grelha de atalhos fixos.
 *
 * Vem da origem da fila (`lib/origemDaFila.ts`): cada vez que começa uma lista
 * com origem, ela entra à frente. Uma pesquisa não é um sítio para onde voltar.
 * Sem imports: `scripts/test-recentes.ts`.
 */

export type TipoDeRecente = 'playlist' | 'guardadas' | 'artista' | 'album' | 'mistura' | 'prateleira';

export type Recente = {
  chave: string;
  tipo: TipoDeRecente;
  nome: string;
  /** O id da playlist ou da mistura; numa prateleira, o nome dela ("doDia" é a Daily mix). */
  id?: string;
  /** Até quatro capas da lista, para o mosaico. */
  capas: string[];
  quando: number;
};

export const MAXIMO_DE_RECENTES = 12;
/** Quantos se mostram na Home (três linhas de dois). */
export const NA_HOME = 6;

const TIPOS: ReadonlySet<string> = new Set(['playlist', 'guardadas', 'artista', 'album', 'mistura', 'prateleira']);

/** Uma origem que se pode reabrir. */
export function podeVoltar(o: { tipo: string; nome?: string; id?: string } | null | undefined): o is { tipo: TipoDeRecente; nome: string; id?: string } {
  if (!o || !TIPOS.has(o.tipo) || !o.nome?.trim()) return false;
  if ((o.tipo === 'playlist' || o.tipo === 'mistura' || o.tipo === 'prateleira') && !o.id) return false;
  return true;
}

export function chaveDoRecente(o: { tipo: string; nome: string; id?: string }): string {
  return `${o.tipo}:${o.id ?? o.nome.trim().toLowerCase()}`;
}

/** Entra à frente; o mesmo sítio não aparece duas vezes. */
export function registarRecente(lista: readonly Recente[], novo: Omit<Recente, 'chave'>, maximo = MAXIMO_DE_RECENTES): Recente[] {
  const chave = chaveDoRecente(novo);
  const anterior = lista.find((r) => r.chave === chave);
  // Sem capas novas (uma lista que ainda não carregou), ficam as de antes.
  const capas = novo.capas.length ? novo.capas : anterior?.capas ?? [];
  return [{ ...novo, chave, capas }, ...lista.filter((r) => r.chave !== chave)].slice(0, maximo);
}

/** As capas da fila, sem repetir, até quatro. */
export function capasDaFila(fila: readonly { artworkUrl?: string | null }[], quantas = 4): string[] {
  const vistas: string[] = [];
  for (const f of fila) {
    if (f.artworkUrl && !vistas.includes(f.artworkUrl)) vistas.push(f.artworkUrl);
    if (vistas.length >= quantas) break;
  }
  return vistas;
}

/**
 * O que a Home mostra: os recentes primeiro, e só depois os atalhos de sempre
 * (Liked Songs e as misturas) a encher o que falta -- uma conta nova ainda não
 * ouviu nada, e uma grelha vazia não leva a lado nenhum.
 */
export function recentesParaMostrar(recentes: readonly Recente[], extras: readonly Recente[], n = NA_HOME): Recente[] {
  const fora = new Set(recentes.map((r) => r.chave));
  return [...recentes, ...extras.filter((e) => !fora.has(e.chave))].slice(0, n);
}

/** Lido do disco: só o que tem a forma certa. */
export function lerRecentes(texto: string | null): Recente[] {
  if (!texto) return [];
  try {
    const v = JSON.parse(texto);
    if (!Array.isArray(v)) return [];
    return (v as Recente[]).filter((r) => r && typeof r.chave === 'string' && podeVoltar(r) && Array.isArray(r.capas))
      .map((r) => ({ ...r, capas: r.capas.filter((c: unknown) => typeof c === 'string').slice(0, 4) }))
      .slice(0, MAXIMO_DE_RECENTES);
  } catch {
    return [];
  }
}
