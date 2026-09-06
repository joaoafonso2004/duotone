import { normalizarPesquisa } from './searchText';

/**
 * Procurar no que já é teu, antes de ir ao YouTube.
 *
 * **Porque é que isto faltava.** A Pesquisa da app ia só ao YouTube. Com 2.694
 * faixas guardadas, encontrar uma que já tens obrigava a sair dali, ir aos
 * Songs e usar OUTRA caixa de pesquisa — e a que se vê primeiro, a do
 * separador Pesquisa, era a única que não sabia da tua biblioteca.
 *
 * **Porque é que não chega o `correspondeAPesquisa`.** Esse responde sim ou
 * não, e serve para filtrar uma lista que já está ordenada por outra coisa.
 * Uma pesquisa precisa de ORDEM: escrever `magnolia` tem de pôr a faixa
 * chamada Magnolia em primeiro, e não uma qualquer de um artista cujo nome
 * calhe conter essas letras.
 *
 * Funções puras — ver scripts/test-pesquisa-local.ts.
 */

export interface FaixaPesquisavel {
  title: string;
  artist: string | null;
  album?: string | null;
}

/**
 * Quanto é que esta faixa responde à pesquisa. Zero é não responder.
 *
 * A escala não é arbitrária, e o que a decide é isto: **um artista certo vale
 * mais do que um título por acaso**. Escrever `Playboi Carti` casa com o NOME
 * dele e casa também com o título de todos os vídeos dele (que costumam
 * trazer o nome lá dentro). Se "título contém" ganhasse a "artista exacto", a
 * ordem passava a ser aleatória dentro do artista todo.
 */
export function pontuarNaPesquisa(consulta: string, f: FaixaPesquisavel): number {
  const q = normalizarPesquisa(consulta);
  if (!q) return 0;

  const titulo = normalizarPesquisa(f.title);
  const artista = normalizarPesquisa(f.artist);
  const album = normalizarPesquisa(f.album);

  if (titulo === q) return 100;
  // O artista exacto vem ANTES de qualquer coisa do título que não seja
  // igual. O caso que o decide: procurar `Playboi Carti` e haver uma faixa
  // de outra pessoa cujo título comece por esse nome (uma participação, ou
  // uma atribuição errada). A faixa que É dele vale mais.
  if (artista === q) return 85;
  if (titulo.startsWith(q)) return 75;
  if (titulo.includes(q)) return 60;
  if (artista.startsWith(q)) return 50;
  if (artista.includes(q)) return 40;
  if (album && album.includes(q)) return 15;
  return 0;
}

/**
 * As faixas da biblioteca que respondem, das que mais respondem para as que
 * menos.
 *
 * A ordem entre iguais é a que vinha — na biblioteca isso é o mais recente
 * primeiro, e entre dois `Magnolia` o que se guardou ontem interessa mais do
 * que o de há três anos. `sort` em JavaScript é estável desde o ES2019, por
 * isso isto sai de graça.
 *
 * O limite existe porque isto vai para cima dos resultados do YouTube: uma
 * pesquisa por `carti` que devolvesse trezentas faixas empurrava tudo o resto
 * para fora do ecrã, e aí deixava de ser uma pesquisa e passava a ser a
 * biblioteca outra vez.
 */
export function pesquisarNaBiblioteca<T extends FaixaPesquisavel>(
  consulta: string,
  faixas: readonly T[],
  limite = 12,
): T[] {
  if (!normalizarPesquisa(consulta)) return [];
  const comPonto: { f: T; ponto: number }[] = [];
  for (const f of faixas) {
    const ponto = pontuarNaPesquisa(consulta, f);
    if (ponto > 0) comPonto.push({ f, ponto });
  }
  comPonto.sort((a, b) => b.ponto - a.ponto);
  return comPonto.slice(0, limite).map((x) => x.f);
}
