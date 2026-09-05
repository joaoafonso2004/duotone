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
  // É do APARELHO e não da pessoa: um endereço local não serve no outro.
  'pref:potServerUrl',
]);


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
