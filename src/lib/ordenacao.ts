/**
 * As ordens das listas, partilhadas pelas duas plataformas.
 *
 * A regra que este ficheiro serve: **a decisão é partilhada, só o desenho é que
 * é por plataforma**. Custou aprendê-la — o mesmo perfil enquadrava a capa de
 * duas maneiras e tirava a cor de duas fontes, e dava resultados diferentes no
 * telemóvel e no PC.
 *
 * As três decisões que estavam duplicadas, e em que já divergiam:
 *
 *  - **comparar texto** — o PC usava `sensitivity: 'base'` e o telemóvel não,
 *    por isso `Ángel` e `angel` ordenavam em sítios diferentes;
 *  - **ordenar artistas** — o PC pelo histórico de escuta, o telemóvel pelo
 *    número de faixas;
 *  - **filtrar artistas** — o PC por pedaço da chave canónica, o telemóvel pelo
 *    comparador de pesquisa sem acentos. A mesma palavra dava listas
 *    diferentes.
 *
 * Funções puras -- ver scripts/test-ordenacao.ts.
 */

/** Ignora maiúsculas e acentos: `Ángel`, `ángel` e `ANGEL` valem o mesmo. */
export function compararTexto(a: string, b: string): number {
  return (a ?? '').localeCompare(b ?? '', undefined, { sensitivity: 'base' });
}

export type OrdemDeFaixas = 'title' | 'artist' | 'duration';

export function ordenarFaixas<T extends { title: string; artist: string | null; durationSeconds?: number | null }>(
  faixas: readonly T[],
  modo: OrdemDeFaixas,
): T[] {
  const copia = [...faixas];
  if (modo === 'duration') {
    // Sem duração conhecida vai para o fim, e não para a frente como faria um
    // zero: uma faixa por medir não é a mais curta da biblioteca.
    return copia.sort((a, b) => {
      const x = a.durationSeconds ?? Infinity;
      const y = b.durationSeconds ?? Infinity;
      return x !== y ? x - y : compararTexto(a.title, b.title);
    });
  }
  if (modo === 'artist') {
    return copia.sort((a, b) =>
      compararTexto(a.artist ?? '', b.artist ?? '') || compararTexto(a.title, b.title));
  }
  return copia.sort((a, b) => compararTexto(a.title, b.title));
}

export type GrupoOrdenavel = { nome: string; chave: string; faixas: readonly unknown[] };

/**
 * Artistas por ESCUTA, e não por alfabeto.
 *
 * A ordem alfabética parece neutra e é o contrário: põe à cabeça tudo o que
 * começa por símbolo ou número, que é onde se acumulam os nomes que a extração
 * não acertou. Quem tem duzentos artistas não procura pelo nome, procura por
 * quem ouve.
 *
 * O `ranking` vem do histórico e pode não conhecer toda a gente; quem não está
 * lá ordena-se pelo peso na biblioteca, que é o melhor sinal que sobra.
 */
export function ordenarArtistas<T extends GrupoOrdenavel>(
  grupos: readonly T[],
  ranking: ReadonlyMap<string, number> = new Map(),
): T[] {
  return [...grupos].sort((a, b) => {
    const ra = ranking.get(a.chave) ?? Infinity;
    const rb = ranking.get(b.chave) ?? Infinity;
    if (ra !== rb) return ra - rb;
    if (a.faixas.length !== b.faixas.length) return b.faixas.length - a.faixas.length;
    return compararTexto(a.nome, b.nome);
  });
}
