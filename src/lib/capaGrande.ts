/**
 * A capa GRANDE do leitor do iPhone: que imagem pedir para cada faixa.
 *
 * O leitor aberto mostra a `maxresdefault.jpg` (1280 px), e não a miniatura que
 * as listas já descarregaram. Por isso a capa de uma faixa nova vinha SEMPRE da
 * rede no instante do skip -- e, sem maxres, ainda esperava por um erro para ir
 * à `hqdefault`. Era o "fica sem capa uns segundos" de 14/9.
 *
 * Aqui só se escolhe o endereço; quem pré-carrega e se lembra de quem não tem
 * maxres é o `state/capasGrandes.ts`. Sem imports de runtime, testado em
 * `scripts/test-capa-grande.ts`.
 */

type FaixaComCapa = { source: string; sourceId: string; artworkUrl?: string | null };

export function capaGrandeDaFaixa(t: FaixaComCapa, semMaxres: ReadonlySet<string>): string | null {
  if (t.source === 'youtube' && t.sourceId) {
    const tamanho = semMaxres.has(t.sourceId) ? 'hqdefault' : 'maxresdefault';
    return `https://i.ytimg.com/vi/${t.sourceId}/${tamanho}.jpg`;
  }
  return t.artworkUrl ?? null;
}

/** A que existe sempre, para quando a grande falha. */
export function capaDeRecurso(t: FaixaComCapa): string | null {
  if (t.source === 'youtube' && t.sourceId) return `https://i.ytimg.com/vi/${t.sourceId}/hqdefault.jpg`;
  return t.artworkUrl ?? null;
}
