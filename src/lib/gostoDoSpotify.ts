/**
 * O gosto lido do Spotify, e como entra nas recomendações.
 *
 * ## Porque existe
 *
 * Quem chega do Spotify traz anos de escuta e a app não sabia nada disso: a
 * descoberta partia de uma biblioteca quase vazia, dava sempre os mesmos
 * vizinhos dos mesmos dois artistas, e "nem são relacionadas ao que ouço" -- a
 * razão de um amigo do João não usar a app (13/9).
 *
 * ## O que se lê
 *
 * Só o que o Spotify ainda deixa uma app pequena ler: os artistas mais ouvidos
 * (último mês, últimos seis meses, desde sempre) e as últimas 50 músicas. As
 * playlists que o próprio Spotify gera (Daily Mix, Discover Weekly, Blend)
 * estão fechadas a apps novas desde o fim de 2024, e não se tenta.
 *
 * ## Como pesa
 *
 * - **O mês pesa mais do que o "desde sempre"**: a pergunta é o que ele ouve
 *   agora. Dentro de cada lista, o primeiro vale mais do que o último.
 * - **O maior peso é `PESO_MAXIMO`**, uma escala de escutas: para quem ainda
 *   não ouviu nada na app o Spotify manda; para quem ouve todos os dias, as
 *   escutas a sério passam-lhe à frente sozinhas. Não há data de validade -- a
 *   mesma ideia das sementes (`lib/artistasSemente.ts`).
 * - **Soma-se ao histórico, não o substitui.** Um artista que ele ouve lá E cá
 *   é duas vezes gosto. E nada disto vai para o `plays`: as estatísticas e o
 *   perfil continuam a dizer só o que se ouviu na app.
 *
 * Sem imports de runtime: testado em Node puro (scripts/test-gosto-do-spotify.ts).
 */

export type ArtistaDoSpotify = { name: string; plays: number };
export type GostoDoSpotify = { artistas: ArtistaDoSpotify[]; lidoEm: number };

/** Quantos artistas se guardam. Mais do que isto já não diz nada sobre o gosto. */
export const ARTISTAS_DO_SPOTIFY = 30;

/** O peso do artista mais ouvido, em escutas. */
export const PESO_MAXIMO = 20;

/** Quanto conta cada lista do Spotify. O que se ouve agora pesa mais. */
export const PESO_DAS_LISTAS = { curto: 1, medio: 0.7, longo: 0.4 } as const;

/** Quanto conta cada aparição nas últimas músicas ouvidas. */
export const PESO_DE_UMA_RECENTE = 0.15;

export function gostoAPartirDoSpotify(
  listas: {
    curto: readonly string[];
    medio: readonly string[];
    longo: readonly string[];
    recentes: readonly string[];
  },
  chave: (nome: string) => string,
  lidoEm: number,
): GostoDoSpotify {
  const pontos = new Map<string, { nome: string; pontos: number }>();
  const somar = (nome: string, valor: number) => {
    const limpo = nome.trim();
    const k = limpo ? chave(limpo) : '';
    if (!k) return;
    const antes = pontos.get(k);
    // Fica a PRIMEIRA grafia vista, que é a da lista mais recente.
    if (antes) antes.pontos += valor;
    else pontos.set(k, { nome: limpo, pontos: valor });
  };

  for (const [lista, peso] of [
    [listas.curto, PESO_DAS_LISTAS.curto],
    [listas.medio, PESO_DAS_LISTAS.medio],
    [listas.longo, PESO_DAS_LISTAS.longo],
  ] as const) {
    lista.forEach((nome, i) => somar(nome, (peso * (lista.length - i)) / lista.length));
  }
  for (const nome of listas.recentes) somar(nome, PESO_DE_UMA_RECENTE);

  const ordenados = [...pontos.values()].sort((a, b) => b.pontos - a.pontos).slice(0, ARTISTAS_DO_SPOTIFY);
  const maior = ordenados[0]?.pontos ?? 0;
  return {
    artistas: ordenados.map((a) => ({
      name: a.nome,
      plays: Math.max(1, Math.round((a.pontos / maior) * PESO_MAXIMO)),
    })),
    lidoEm,
  };
}

/**
 * O histórico da app com o gosto do Spotify somado, do mais pesado para o mais
 * leve. A mesma grafia do histórico ganha quando o artista está nos dois.
 */
export function juntarComOSpotify<T extends { name: string; plays: number }>(
  historico: readonly T[],
  spotify: readonly ArtistaDoSpotify[],
  chave: (nome: string) => string,
  limite: number,
): { name: string; plays: number }[] {
  const porChave = new Map<string, { name: string; plays: number }>();
  for (const a of historico) {
    const k = chave(a.name);
    if (k && !porChave.has(k)) porChave.set(k, { name: a.name, plays: a.plays });
  }
  for (const a of spotify) {
    const k = chave(a.name);
    if (!k) continue;
    const ja = porChave.get(k);
    if (ja) ja.plays += a.plays;
    else porChave.set(k, { name: a.name, plays: a.plays });
  }
  // O sort do JS é estável: em empate fica a ordem de chegada, histórico primeiro.
  return [...porChave.values()].sort((a, b) => b.plays - a.plays).slice(0, limite);
}

export type FalhaDoSpotify = 'sem-configuracao' | 'cancelado' | 'sem-acesso' | 'rede' | 'vazio';

/**
 * O que se diz quando a leitura não dá. Cancelar não é erro e não diz nada.
 *
 * O `sem-acesso` é quase sempre o modo de desenvolvimento do Spotify: só as
 * contas acrescentadas à mão no painel da app podem entrar.
 */
export function mensagemDoSpotify(tipo: FalhaDoSpotify): string | null {
  switch (tipo) {
    case 'cancelado': return null;
    case 'sem-configuracao': return 'Spotify is not set up in this version of the app.';
    case 'sem-acesso': return 'Spotify refused. Your account may need to be added to the app.';
    case 'vazio': return 'Your Spotify has no listening history to read yet.';
    case 'rede': return 'Could not reach Spotify. Try again.';
  }
}
