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
  /**
   * O id do album no catalogo.
   *
   * Nao entra na ESCOLHA -- nao se aceita nem recusa um candidato por causa
   * dele -- mas viaja com o vencedor, porque e a unica porta para o genero e o
   * ano. Vinha na resposta da pesquisa desde sempre e era deitado fora.
   */
  albumId?: number | null;
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

/**
 * As palavras que fazem de uma faixa OUTRA gravação da mesma música. O
 * `normalizar` deita fora o que vem entre parênteses, e por isso
 * "Fuera Del Planeta (Remix)" casava com "Fuera Del Planeta": com a duração
 * certa ao segundo, o remix entrava no lugar da original, com "Remix" a fazer
 * de artista e a capa dele (1/11, visto no Now Playing do PC, com a barra a
 * mostrar a original). Cada linha é uma versão, com as maneiras de a escrever.
 */
const VERSOES: readonly (readonly string[])[] = [
  ['remix', 'rmx'],
  ['live', 'ao vivo', 'en vivo'],
  ['acoustic', 'acustico', 'acustica'],
  ['sped up', 'speed up', 'spedup'],
  ['slowed'],
  ['reverb'],
  ['nightcore'],
  ['instrumental'],
  ['karaoke'],
  ['cover'],
  ['demo'],
  ['extended'],
  ['acapella', 'a cappella', 'acappella'],
  ['8d'],
];

/** As versões que um título diz que é, por palavra inteira e sem acentos. */
export function versoesDoTitulo(titulo: string): Set<string> {
  const t = ` ${titulo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ')} `;
  const saida = new Set<string>();
  for (const formas of VERSOES) if (formas.some((f) => t.includes(` ${f} `))) saida.add(formas[0]);
  return saida;
}

/** As duas são a mesma versão: as duas originais, ou as duas o mesmo remix, ao vivo, etc. */
export function mesmaVersao(a: string, b: string): boolean {
  const x = versoesDoTitulo(a), y = versoesDoTitulo(b);
  return x.size === y.size && [...x].every((v) => y.has(v));
}

/** Os "artistas" que não são ninguém: o catálogo põe-nos em compilações e em versões soltas. */
const ARTISTAS_QUE_NAO_SAO = new Set([
  'remix', 'remixes', 'various artists', 'varios artistas', 'various', 'va', 'unknown', 'unknown artist',
  'karaoke', 'instrumental', 'cover', 'covers', 'nightcore', 'sped up', 'slowed', 'lofi', 'lo fi',
]);

/** Um artista a sério, e não uma etiqueta. */
export function artistaDeVerdade(nome: string): boolean {
  const n = normalizar(nome);
  return !!n && !ARTISTAS_QUE_NAO_SAO.has(n);
}

/**
 * Um resultado do catálogo (o que se guardou, aqui ou noutro aparelho) ainda
 * serve esta faixa: a mesma versão e um artista a sério. O que já está na
 * tabela partilhada foi aceite antes destas regras, por isso também se passa
 * por elas quando se MOSTRA, e não só quando se procura.
 */
export function achadoServe(tituloLocal: string, achado: { titulo?: string | null; artista?: string | null }): boolean {
  if (achado.titulo && !mesmaVersao(tituloLocal, achado.titulo)) return false;
  if (achado.artista && !artistaDeVerdade(achado.artista)) return false;
  return true;
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
  // Outra versão (um remix no lugar da original) ou um artista que é uma etiqueta.
  if (!achadoServe(local.titulo, candidato)) return null;
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
