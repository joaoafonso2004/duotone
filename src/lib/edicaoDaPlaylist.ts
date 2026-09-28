/**
 * A edição de uma playlist no iPhone (28/9): o nome e a ordem num só sítio.
 *
 * Era um "Rename" num menu e um "Edit" com setas ↑↓ e um caixote por linha,
 * que apagava logo no servidor depois de uma confirmação por música. Agora
 * tudo fica num RASCUNHO até ao Save: arrastar muda a ordem, deslizar tira (com
 * Undo), o nome edita-se em cima, e o Cancel deita tudo fora. Sem imports: o
 * ecrã passa as faixas e grava o `planoDeGravacao`.
 */

export type Tirada<T> = { faixa: T; onde: number };
export type Rascunho<T> = { nome: string; faixas: T[]; tiradas: Tirada<T>[] };

export function comecarRascunho<T>(nome: string, faixas: readonly T[]): Rascunho<T> {
  return { nome, faixas: [...faixas], tiradas: [] };
}

export function moverNoRascunho<T>(r: Rascunho<T>, de: number, para: number): Rascunho<T> {
  if (de === para || de < 0 || para < 0 || de >= r.faixas.length || para >= r.faixas.length) return r;
  const faixas = [...r.faixas];
  const [faixa] = faixas.splice(de, 1);
  faixas.splice(para, 0, faixa);
  return { ...r, faixas };
}

export function tirarDoRascunho<T>(r: Rascunho<T>, indice: number): Rascunho<T> {
  if (indice < 0 || indice >= r.faixas.length) return r;
  const faixas = [...r.faixas];
  const [faixa] = faixas.splice(indice, 1);
  return { ...r, faixas, tiradas: [...r.tiradas, { faixa, onde: indice }] };
}

/** O Undo: a última que saiu volta para onde estava. */
export function desfazerTirada<T>(r: Rascunho<T>): Rascunho<T> {
  const ultima = r.tiradas[r.tiradas.length - 1];
  if (!ultima) return r;
  const faixas = [...r.faixas];
  faixas.splice(Math.min(ultima.onde, faixas.length), 0, ultima.faixa);
  return { ...r, faixas, tiradas: r.tiradas.slice(0, -1) };
}

export type PlanoDeGravacao = {
  /** O nome novo, ou `null` se não mudou (ou ficou vazio: um nome vazio não se grava). */
  nome: string | null;
  /** Os ids das faixas a tirar da playlist. */
  tirar: string[];
  /** A ordem nova das que ficam, ou `null` se é a mesma. */
  ordem: string[] | null;
};

export function planoDeGravacao<T>(
  r: Rascunho<T>,
  nomeOriginal: string,
  originais: readonly T[],
  idDe: (t: T) => string,
): PlanoDeGravacao {
  const nome = r.nome.trim();
  const tirar = r.tiradas.map((t) => idDe(t.faixa));
  const saem = new Set(tirar);
  const antes = originais.map(idDe).filter((id) => !saem.has(id));
  const depois = r.faixas.map(idDe);
  const mesmaOrdem = antes.length === depois.length && antes.every((id, i) => id === depois[i]);
  return {
    nome: nome && nome !== nomeOriginal.trim() ? nome : null,
    tirar,
    ordem: mesmaOrdem ? null : depois,
  };
}

/** O Save só acende quando há alguma coisa para gravar. */
export function haAlgoParaGravar(p: PlanoDeGravacao): boolean {
  return p.nome !== null || p.tirar.length > 0 || p.ordem !== null;
}
