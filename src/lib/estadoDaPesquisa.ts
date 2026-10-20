/**
 * O que a pesquisa de músicas mostra, nas duas plataformas (20/10, revisão de
 * qualidade, Q1 e Q2 em docs/REVISAO-DE-QUALIDADE.md).
 *
 * Cada ecrã decidia isto sozinho, e cada um errava à sua maneira:
 *
 *  - **o iPhone escondia o que já é teu.** O esqueleto da pesquisa online e o
 *    "Something went wrong" vinham ANTES da lista com "In your library": sem
 *    rede, procurar uma música guardada dava um erro em vez da música, e em
 *    cada pesquisa havia meio segundo de esqueleto por cima de resultados que
 *    já estavam encontrados. O `useMusicSearch` existe justamente para o que é
 *    teu não esperar pela rede;
 *  - **o PC calava a falha** quando havia resultados da biblioteca: a parte
 *    online desaparecia sem uma palavra;
 *  - **nenhum dos dois deixava tentar outra vez**, e cada um dizia a falha à
 *    sua maneira ("Something went wrong" com o texto cru do erro, "Search
 *    failed").
 *
 * Agora: o que é teu aparece sempre que existe, a parte online diz por baixo
 * se está a carregar ou se falhou, e uma falha tem "Try again" -- que repete a
 * MESMA pergunta (o `pesquisarAgora` do hook), sem a reescrever.
 *
 * Puro e sem imports: `scripts/test-estado-da-pesquisa.ts`.
 */

/** As frases da pesquisa, iguais nas duas plataformas. */
export const FRASES_DA_PESQUISA = {
  /** A pesquisa falhou e não há nada para mostrar. */
  falhou: 'Search failed',
  /** A parte online falhou, por baixo do que já é teu. */
  falhouOnline: "Couldn't search online",
  /** Quando o erro não diz nada de útil (o `recurso` do `mensagemDeErro`). */
  semMotivo: 'Check your connection, then try again.',
  tentarDeNovo: 'Try again',
  semResultados: 'No results',
  semResultadosCorpo: 'Try a different search term.',
  /** A parte online ainda a chegar, por baixo do que já é teu. */
  aProcurarOnline: 'Searching online…',
} as const;

export type EstadoDaPesquisa =
  /** Menos de duas letras: a Home, o histórico. É quem desenha que decide. */
  | { tipo: 'curta' }
  /** A procurar, e ainda sem nada para mostrar. */
  | { tipo: 'a-carregar' }
  /** Falhou, e não há nada da biblioteca para mostrar no lugar. */
  | { tipo: 'falhou' }
  | { tipo: 'sem-resultados' }
  /**
   * Há o que mostrar. O `rodape` é a parte online, quando ainda não chegou
   * (`a-carregar`) ou quando falhou (`falhou`) por baixo do que é teu.
   */
  | { tipo: 'resultados'; rodape: 'a-carregar' | 'falhou' | null };

export function estadoDaPesquisa(e: {
  pergunta: string;
  /** A pesquisa online está a correr. */
  aCarregar: boolean;
  /** A pesquisa online falhou (a frase, ou só `true`). */
  erro: string | boolean | null;
  /** Quantos resultados online chegaram. */
  online: number;
  /** Quantos resultados vieram da biblioteca (não esperam pela rede). */
  naBiblioteca: number;
}): EstadoDaPesquisa {
  // As mesmas duas letras que o `useMusicSearch` exige para procurar.
  if (e.pergunta.trim().length < 2) return { tipo: 'curta' };
  if (e.online > 0) return { tipo: 'resultados', rodape: null };
  if (e.naBiblioteca > 0) {
    return { tipo: 'resultados', rodape: e.aCarregar ? 'a-carregar' : e.erro ? 'falhou' : null };
  }
  if (e.aCarregar) return { tipo: 'a-carregar' };
  if (e.erro) return { tipo: 'falhou' };
  return { tipo: 'sem-resultados' };
}
