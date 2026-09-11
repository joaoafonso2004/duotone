/**
 * O perfil já lido, para não se esperar por ele outra vez.
 *
 * ## Porquê
 *
 * Abrir o perfil eram duas viagens em série -- o perfil e depois as secções --
 * e só no fim da segunda é que aparecia alguma coisa. Entre o toque e o
 * conteúdo havia uma roda a girar, todas as vezes, mesmo quando nada tinha
 * mudado desde a última.
 *
 * O que se guarda aqui é a ÚLTIMA leitura boa. Quando se abre o perfil, ela
 * entra imediatamente no ecrã e a leitura nova corre em silêncio por trás. Se
 * mudou alguma coisa, o ecrã actualiza-se sem piscar; se não mudou, ninguém
 * esperou por nada.
 *
 * ## Em memória, e sem prazo de validade
 *
 * Não se persiste em disco de propósito: um perfil de ontem escrito em disco
 * envelhece mal -- mudam capas, nomes, playlists -- e reinstalar a app passaria
 * a mostrar dados velhos antes dos verdadeiros. Aqui morre com o processo, que
 * é exactamente a vida que deve ter.
 *
 * E não tem prazo porque não precisa: o que está em cache é sempre substituído
 * pela leitura que corre a seguir. Um prazo só serviria para decidir se se
 * mostra ou não o que já se tem -- e mostrar é sempre melhor do que uma roda.
 */

/** Uma leitura completa do perfil, tal como o ecrã a usa. */
export type PerfilEmCache = {
  perfil: unknown;
  most: unknown[];
  recent: unknown[];
  playlists: unknown[];
  guardadas: Set<string>;
  highlights: unknown;
  highlightsLidos: boolean;
};

const cache = new Map<string, PerfilEmCache>();

export function perfilEmCache(userId: string): PerfilEmCache | null {
  return cache.get(userId) ?? null;
}

export function guardarPerfil(userId: string, dados: PerfilEmCache): void {
  cache.set(userId, dados);
}

/**
 * Esquecer tudo. Chamado ao sair da conta -- os dados da pessoa anterior não
 * podem aparecer, nem por um instante, a quem entra a seguir.
 */
export function limparCachePerfil(): void {
  cache.clear();
}

/**
 * Ler o próprio perfil assim que a app abre, para não se esperar por ele
 * quando se toca no separador.
 *
 * Corre em silêncio e nunca lança: é uma conveniência, e uma conveniência que
 * falha não pode aparecer em lado nenhum. Se falhar, o perfil abre como abria
 * antes -- com o esqueleto e uma leitura na altura.
 *
 * `own = true` porque isto só aquece o perfil de quem está autenticado. O de um
 * amigo aquece-se sozinho da primeira vez que se abre, e adivinhar quais os
 * amigos que ele vai visitar seria gastar rede por nada.
 */
/**
 * As leituras em curso, para nao se fazerem duas do mesmo.
 *
 * **Era isto que fazia o aquecimento nao servir de nada.** Ele arranca no
 * arranque da app e demora -- sao duas viagens em serie, o perfil e depois as
 * seccoes -- e tocar no separador do Perfil enquanto ele corria nao encontrava
 * cache nenhuma. O ecra pedia tudo outra vez, e ficava a olhar para a roda a
 * esperar pelo SEU pedido, com o do aquecimento a chegar ao lado sem ninguem o
 * usar. Duas viagens, o dobro do tempo, e a sensacao de que o perfil so comeca
 * a carregar quando se clica nele -- que foi exactamente a queixa.
 *
 * Agora quem chega a meio recebe a MESMA promessa e espera pelo que ja vinha a
 * caminho.
 */
const emCurso = new Map<string, Promise<void>>();

export async function aquecerPerfilProprio(userId: string): Promise<void> {
  if (!userId || cache.has(userId)) return;
  const pendente = emCurso.get(userId);
  if (pendente) return pendente;
  const trabalho = lerParaCache(userId).finally(() => { emCurso.delete(userId); });
  emCurso.set(userId, trabalho);
  return trabalho;
}

async function lerParaCache(userId: string): Promise<void> {
  try {
    const { getSocialProfile } = await import('../api/profiles');
    const { loadProfileSections } = await import('../api/profileSections');
    const perfil = await getSocialProfile(userId);
    const r = await loadProfileSections(userId, true, (perfil as any)?.canView ?? true);
    cache.set(userId, {
      perfil,
      most: r.most.status === 'fulfilled' ? (r.most.value as unknown[]) : [],
      recent: r.recent.status === 'fulfilled' ? (r.recent.value as unknown[]) : [],
      playlists: r.playlists.status === 'fulfilled' ? (r.playlists.value as unknown[]) : [],
      guardadas: r.copies.status === 'fulfilled' ? (r.copies.value as Set<string>) : new Set<string>(),
      highlights: r.highlights.status === 'fulfilled'
        ? r.highlights.value
        : { playlistIds: [], moment: null },
      highlightsLidos: r.highlights.status === 'fulfilled',
    });
  } catch {
    // Idem.
  }
}
