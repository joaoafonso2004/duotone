/**
 * Decidir se um resultado do catálogo É mesmo a faixa que temos.
 *
 * O catálogo é uma sugestão de fora, e uma sugestão errada é pior do que
 * nenhuma: pôr `P!nk` numa faixa do Blac Youngsta estraga a biblioteca de uma
 * maneira que o utilizador não consegue desfazer. Medido em 120 faixas reais,
 * aceitar o primeiro resultado por título dava sensivelmente um erro em cada
 * quatro — daí as regras abaixo serem restritivas de propósito.
 *
 * Funções puras — ver scripts/test-catalogo-faixa.ts.
 */

/** Quanto pode a duração divergir e ainda ser a mesma gravação. */
export const TOLERANCIA_DE_DURACAO_S = 4;

export type Candidato = {
  titulo: string;
  artista: string;
  album?: string | null;
  capa?: string | null;
  /** Segundos, como o Deezer devolve. */
  duracao?: number | null;
};

export type FaixaLocal = {
  titulo: string;
  /** O artista que a app adivinhou, e se se pode confiar nele. */
  artista: string;
  artistaFiavel: boolean;
  duracaoSegundos?: number | null;
};

/** Sem acentos, sem pontuação e sem o que vem entre parênteses. */
export function normalizar(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Um título casa quando é igual, ou quando um contém o outro sem ser curto
 * de mais — `Spiral` dentro de `Spiral` conta; `Go` dentro de `Go Crazy` não. */
export function titulosCasam(a: string, b: string): boolean {
  const x = normalizar(a), y = normalizar(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const menor = x.length < y.length ? x : y;
  const maior = x.length < y.length ? y : x;
  return menor.length >= 5 && maior.includes(menor);
}

/** As durações batem certo dentro da tolerância. Sem uma delas, não decide. */
export function duracoesCasam(a: number | null | undefined, b: number | null | undefined): boolean {
  if (!a || !b || a <= 0 || b <= 0) return false;
  return Math.abs(a - b) <= TOLERANCIA_DE_DURACAO_S;
}

export type Aceitacao = 'artista' | 'duracao' | null;

/**
 * Duas provas, e chega uma delas:
 *
 *  - **o artista bate certo** e o título casa — o caminho normal, e o mais
 *    seguro, porque o artista já veio confirmado pela biblioteca;
 *  - **a duração bate certo** e o título é EXACTAMENTE igual — o que salva as
 *    faixas cujo artista a app não conseguiu adivinhar, sem cair no problema
 *    dos títulos genéricos: há muitas músicas chamadas `So What`, mas não com
 *    a mesma duração ao segundo.
 *
 * Sem nenhuma das duas devolve `null`, e quem chama fica com o que já tinha.
 */
export function aceitar(
  local: FaixaLocal,
  candidato: Candidato,
  mesmaChaveDeArtista: (a: string, b: string) => boolean,
): Aceitacao {
  if (!titulosCasam(local.titulo, candidato.titulo)) return null;
  if (local.artistaFiavel && mesmaChaveDeArtista(local.artista, candidato.artista)) return 'artista';
  if (normalizar(local.titulo) === normalizar(candidato.titulo)
    && duracoesCasam(local.duracaoSegundos, candidato.duracao)) return 'duracao';
  return null;
}

/** O primeiro candidato que passe, com a prova que o fez passar. */
export function escolher(
  local: FaixaLocal,
  candidatos: readonly Candidato[],
  mesmaChaveDeArtista: (a: string, b: string) => boolean,
): { candidato: Candidato; prova: Exclude<Aceitacao, null> } | null {
  for (const c of candidatos) {
    const prova = aceitar(local, c, mesmaChaveDeArtista);
    if (prova) return { candidato: c, prova };
  }
  return null;
}
