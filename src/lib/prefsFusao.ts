/**
 * As regras de fusão das preferências entre a conta e o aparelho.
 *
 * Vive à parte do `prefsSync` porque não fala com ninguém: é só decisão, e
 * assim testa-se em Node sem arrastar o cliente do Supabase atrás.
 */

export const PREFIXO = 'pref:';

/** Preferências que NÃO entram aqui, e porquê. */
export const DE_FORA = new Set([
  // Têm tabela própria, com fusão por data e escrita imediata.
  'pref:ajustesPorFaixa',
  'pref:searchHistory',
  'pref:chatsVistos',
  // Sincronização imediata por artista, incluindo remoções.
  'pref:artistasFavoritos',
  // É do APARELHO e não da pessoa: um endereço local não serve no outro.
  'pref:potServerUrl',
  // Do aparelho (15/11): cada um esconde o OUTRO, e no outro a escolha é a inversa.
  'pref:mostrarOutroAparelho',
  // Do aparelho (15/11): um iPhone novo na conta não começa a descarregar gigas sozinho.
  'pref:descarregarGostadas',
  // O equalizador de cada plataforma (15/11, lib/eqDaPlataforma.ts): o padrão de
  // antes, que era um só, e o Recommended dos auscultadores ligados a ESTE aparelho.
  'pref:eqPadrao',
  'pref:eqRecomendado',
  'pref:eqModelosDasSaidas',
]);

/**
 * As preferências que são da CONTA e não da pessoa ao aparelho (28/11, o João:
 * uma conta nova no PC ficou com os "Pinned" da conta principal). O tema, o EQ ou
 * o shuffle de quem usa o aparelho podem passar de uma conta para a outra; isto
 * não: aponta para playlists, amigos e gostos de quem lá estava, ou diz o que ESSA
 * conta já viu. Ao entrar noutra conta saem do aparelho, e a fusão traz as dela.
 */
export const DA_CONTA: ReadonlySet<string> = new Set([
  // Os atalhos fixados na lateral do PC (playlists, músicas, amigos dessa conta).
  'pref:atalhosDaLateral',
  // A gaveta da Home do iPhone: as mesmas peças.
  'pref:gaveta',
  // O questionário da primeira vez já feito, e o que lá se escolheu.
  'pref:boasVindas',
  'pref:artistasSemente',
  // O gosto lido do Spotify dessa conta (entra nas recomendações).
  'pref:gostoDoSpotify',
  // O último resumo do mês que essa conta viu.
  'pref:resumoVistoEm',
]);

/**
 * De quem são as `DA_CONTA` que estão no aparelho. Sem o `pref:`: é do aparelho
 * e não viaja (o `prefsSync` só envia o que começa por `pref:`).
 */
export const CHAVE_DO_DONO = 'conta-das-prefs';

/**
 * O que sai do aparelho ao entrar na conta `userId`: as `DA_CONTA` que lá estão,
 * se o dono delas for outra conta. Sem dono guardado (a primeira vez com esta
 * regra) não se sabe de quem são, e ficam: o caso de sempre é a mesma conta.
 */
export function chavesDeOutraConta(dono: string | null, userId: string, locais: readonly string[]): string[] {
  if (!dono || dono === userId) return [];
  return locais.filter((chave) => DA_CONTA.has(chave));
}


/**
 * O que se escreve localmente ao entrar na conta.
 *
 * A regra é tímida de propósito: só entra uma chave que o aparelho NÃO tenha.
 * Isso resolve o caso que interessa -- o aparelho acabou de ser limpo -- sem
 * arriscar apagar uma definição que a pessoa mudou aqui há dois minutos.
 */
export function chavesAEscrever(
  locais: Readonly<Record<string, string>>,
  remotas: Readonly<Record<string, unknown>>,
  deFora: ReadonlySet<string> = DE_FORA,
): [string, string][] {
  const saida: [string, string][] = [];
  for (const [chave, valor] of Object.entries(remotas)) {
    if (!chave.startsWith(PREFIXO) || deFora.has(chave)) continue;
    if (typeof valor !== 'string') continue;
    if (locais[chave] === undefined) saida.push([chave, valor]);
  }
  return saida;
}
