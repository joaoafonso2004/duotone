/**
 * Os novos lançamentos dos teus artistas (10/10, C1 da análise de 9/10).
 *
 * Uma vez por dia, a app lê no YouTube Music os álbuns, EPs e singles dos
 * artistas favoritos e dos mais ouvidos (`state/novosLancamentos.ts`), e
 * guarda o que viu NO APARELHO -- não custa nada ao Supabase. O YouTube Music
 * só dá o ANO de cada lançamento, por isso "novo" quer dizer: apareceu no
 * canal desde a última vez que se olhou, e é deste ano (ou do anterior, em
 * janeiro). Fica "New" 14 dias.
 *
 * A primeira vez que se olha para um artista não há novos: tudo o que lá está
 * já existia. Para a prateleira não nascer vazia, mostra também o lançamento
 * mais recente de cada um, se for deste ano.
 *
 * Puro, sem imports: `scripts/test-novos-lancamentos.ts`.
 */

export type Lancamento = {
  /** A playlist do lançamento (`OLAK5uy_...`), que abre a pré-visualização do álbum. */
  id: string;
  titulo: string;
  /** "Album", "EP" ou "Single". */
  tipo: string;
  ano: string | null;
  capa: string | null;
  /** O artista como se mostra, e a chave por que se agrupa (`chaveDeArtista`). */
  artista: string;
  chave: string;
};

export type AlbumLido = { id: string; titulo: string; tipo: string; ano: string | null; capa: string | null };

export type MemoriaDoArtista = {
  canal: string | null;
  /** Os ids que já se viram no canal (os mais novos primeiro). */
  vistos: string[];
  recente: Lancamento | null;
};

export type NovoLancamento = { lancamento: Lancamento; desde: number };

export type MemoriaDosLancamentos = {
  v: 1;
  /** Quando acabou a última verificação. */
  verificadoEm: number;
  artistas: Record<string, MemoriaDoArtista>;
  novos: NovoLancamento[];
  /** Quando se abriu a página de cada artista: o ponto sai depois disso. */
  abertos: Record<string, number>;
};

export type ItemDaPrateleira = { lancamento: Lancamento; novo: boolean };

const DIA_MS = 24 * 60 * 60 * 1000;
/** Quantos artistas se veem por dia: um pedido ao YouTube Music por cada. */
export const MAX_ARTISTAS = 15;
/** De quanto em quanto tempo se volta a olhar (menos de um dia, para o mesmo
 * horário de abrir a app não ir passando para o dia seguinte). */
export const VERIFICAR_DE_MS = 20 * 60 * 60 * 1000;
export const NOVO_DURANTE_MS = 14 * DIA_MS;
export const MAX_NA_PRATELEIRA = 20;
const MAX_VISTOS = 200;

export function memoriaVazia(): MemoriaDosLancamentos {
  return { v: 1, verificadoEm: 0, artistas: {}, novos: [], abertos: {} };
}

const eTexto = (x: unknown): x is string => typeof x === 'string';
function lancamentoValido(x: any): Lancamento | null {
  if (!x || !eTexto(x.id) || !eTexto(x.titulo) || !eTexto(x.tipo) || !eTexto(x.artista) || !eTexto(x.chave)) return null;
  return {
    id: x.id, titulo: x.titulo, tipo: x.tipo, artista: x.artista, chave: x.chave,
    ano: eTexto(x.ano) ? x.ano : null, capa: eTexto(x.capa) ? x.capa : null,
  };
}

/** O que estava guardado, ou uma memória vazia se não presta (outra versão, corrompido). */
export function lerMemoria(guardado: unknown): MemoriaDosLancamentos {
  const g = guardado as any;
  if (!g || g.v !== 1 || typeof g.artistas !== 'object' || !g.artistas) return memoriaVazia();
  const artistas: Record<string, MemoriaDoArtista> = {};
  for (const [chave, a] of Object.entries<any>(g.artistas)) {
    if (!a || !Array.isArray(a.vistos)) continue;
    artistas[chave] = {
      canal: eTexto(a.canal) ? a.canal : null,
      vistos: a.vistos.filter(eTexto).slice(0, MAX_VISTOS),
      recente: lancamentoValido(a.recente),
    };
  }
  const novos: NovoLancamento[] = [];
  for (const n of Array.isArray(g.novos) ? g.novos : []) {
    const l = lancamentoValido(n?.lancamento);
    if (l && Number.isFinite(n.desde)) novos.push({ lancamento: l, desde: n.desde });
  }
  const abertos: Record<string, number> = {};
  for (const [k, t] of Object.entries<any>(g.abertos ?? {})) if (Number.isFinite(t)) abertos[k] = t;
  return { v: 1, verificadoEm: Number.isFinite(g.verificadoEm) ? g.verificadoEm : 0, artistas, novos, abertos };
}

export function precisaDeVerificar(m: MemoriaDosLancamentos, agora: number): boolean {
  return agora - m.verificadoEm >= VERIFICAR_DE_MS || agora < m.verificadoEm;
}

/**
 * Os artistas a ver hoje: os favoritos primeiro, depois os mais ouvidos, só os
 * que estão na biblioteca (é pelas músicas dele que se escolhe o canal certo:
 * o Isak e não o Isak Danielson).
 */
export function escolherArtistas<T>(
  favoritos: readonly string[],
  maisOuvidos: readonly string[],
  grupos: ReadonlyMap<string, { nome: string; faixas: readonly T[] }>,
  max = MAX_ARTISTAS,
): { chave: string; nome: string; faixas: readonly T[] }[] {
  const fora: { chave: string; nome: string; faixas: readonly T[] }[] = [];
  const vistos = new Set<string>();
  for (const chave of [...favoritos, ...maisOuvidos]) {
    if (fora.length >= max) break;
    const g = grupos.get(chave);
    if (!chave || vistos.has(chave) || !g || !g.faixas.length) continue;
    vistos.add(chave);
    fora.push({ chave, nome: g.nome, faixas: g.faixas });
  }
  return fora;
}

/** Deste ano, ou do anterior em janeiro (um single de 28/12 continua novo). */
export function anoRecente(ano: string | null, agora: number): boolean {
  if (!ano || !/^\d{4}$/.test(ano)) return false;
  const d = new Date(agora);
  const atual = d.getUTCFullYear();
  return Number(ano) >= (d.getUTCMonth() === 0 ? atual - 1 : atual);
}

/** O lançamento mais recente: o ano mais alto; no mesmo ano, o primeiro do
 * canal (o YouTube Music põe os mais novos à frente). */
function maisRecente(lancamentos: readonly Lancamento[]): Lancamento | null {
  let melhor: Lancamento | null = null;
  for (const l of lancamentos) {
    if (!l.ano) continue;
    if (!melhor || Number(l.ano) > Number(melhor.ano)) melhor = l;
  }
  return melhor;
}

/**
 * Junta o que se leu agora do canal de um artista. Um canal diferente do de
 * ontem (as provas mudaram) conta como a primeira vez: senão todos os
 * lançamentos do outro canal apareciam como novos.
 */
export function registarArtista(
  m: MemoriaDosLancamentos, chave: string, artista: string, canal: string | null,
  albuns: readonly AlbumLido[], agora: number,
): MemoriaDosLancamentos {
  const antes = m.artistas[chave];
  const lidos: Lancamento[] = albuns.map((a) => ({ ...a, artista, chave }));
  const primeiraVez = !antes || (!!antes.canal && !!canal && antes.canal !== canal);
  const ja = new Set(primeiraVez ? [] : antes.vistos);
  const jaNovos = new Set(m.novos.map((n) => n.lancamento.id));
  const novos = primeiraVez ? [] : lidos.filter((l) => !ja.has(l.id) && !jaNovos.has(l.id) && anoRecente(l.ano, agora));
  const ids = lidos.map((l) => l.id);
  const vistos = [...ids, ...(primeiraVez ? [] : antes.vistos.filter((id) => !ids.includes(id)))].slice(0, MAX_VISTOS);
  return {
    ...m,
    artistas: { ...m.artistas, [chave]: { canal: canal ?? antes?.canal ?? null, vistos, recente: maisRecente(lidos) ?? antes?.recente ?? null } },
    novos: [...novos.map((lancamento) => ({ lancamento, desde: agora })), ...m.novos],
  };
}

/** Os novos que já passaram dos 14 dias saem. */
export function limparNovos(m: MemoriaDosLancamentos, agora: number): MemoriaDosLancamentos {
  return { ...m, novos: m.novos.filter((n) => agora - n.desde < NOVO_DURANTE_MS && n.desde <= agora) };
}

/**
 * A prateleira: os novos primeiro (os mais recentes à frente), e depois o
 * mais recente de cada artista se for deste ano, pela ordem dos artistas.
 */
export function prateleira(m: MemoriaDosLancamentos, agora: number, ordem: readonly string[] = []): ItemDaPrateleira[] {
  const fora: ItemDaPrateleira[] = [];
  const ids = new Set<string>();
  for (const n of [...limparNovos(m, agora).novos].sort((a, b) => b.desde - a.desde)) {
    if (ids.has(n.lancamento.id)) continue;
    ids.add(n.lancamento.id);
    fora.push({ lancamento: n.lancamento, novo: true });
  }
  const posicao = (chave: string) => { const i = ordem.indexOf(chave); return i < 0 ? ordem.length : i; };
  const recentes = Object.entries(m.artistas)
    .map(([chave, a]) => ({ chave, l: a.recente }))
    .filter((x): x is { chave: string; l: Lancamento } => !!x.l && anoRecente(x.l.ano, agora) && !ids.has(x.l.id))
    .sort((a, b) => Number(b.l.ano) - Number(a.l.ano) || posicao(a.chave) - posicao(b.chave));
  for (const { l } of recentes) {
    if (ids.has(l.id)) continue;
    ids.add(l.id);
    fora.push({ lancamento: l, novo: false });
  }
  return fora.slice(0, MAX_NA_PRATELEIRA);
}

/** Os artistas com um lançamento novo que ainda não se foi ver à página dele. */
export function artistasComNovidade(m: MemoriaDosLancamentos, agora: number): Set<string> {
  const fora = new Set<string>();
  for (const n of limparNovos(m, agora).novos) {
    if (n.desde > (m.abertos[n.lancamento.chave] ?? 0)) fora.add(n.lancamento.chave);
  }
  return fora;
}

export function marcarAberto(m: MemoriaDosLancamentos, chave: string, agora: number): MemoriaDosLancamentos {
  return { ...m, abertos: { ...m.abertos, [chave]: agora } };
}

/** A linha por baixo do título: "Plutónio · Single". */
export function legendaDoLancamento(l: Pick<Lancamento, 'artista' | 'tipo'>): string {
  return `${l.artista} · ${l.tipo}`;
}
