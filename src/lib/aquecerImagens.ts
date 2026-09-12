/**
 * As capas da Pesquisa e do perfil, pedidas enquanto a abertura ainda corre.
 *
 * Os DADOS já carregavam no arranque -- as prateleiras vivem fora do ecrã
 * (`state/recomendacoes.ts`) e o perfil é lido para cache (`lib/cachePerfil.ts`).
 * O que faltava eram as IMAGENS: só iam à rede quando a secção aparecia, e por
 * isso a primeira visita à Pesquisa era sempre uma parede de quadrados vazios
 * a encher um a um, mesmo com os dados prontos há um minuto.
 *
 * A escolha do que aquecer está aqui, sem imports de runtime, e é testada em
 * `scripts/test-aquecer-imagens.ts`. Quem vai à rede é o
 * `hooks/useAquecerCapas.ts`, que sabe se está no iPhone (cache do
 * expo-image) ou no PC (cache do browser).
 */

/**
 * Quantas de cada lista, e quantas ao todo.
 *
 * Não é para descarregar a biblioteca inteira: é para a primeira coisa que se
 * vê estar lá. Três por prateleira cobre a fila visível antes de se deslizar,
 * e o teto de 24 evita que dez prateleiras dêem trinta pedidos no arranque --
 * que é justamente quando a app está a resolver a faixa que vai tocar.
 */
export const POR_LISTA = 3;
export const TETO = 24;

/**
 * As imagens a pedir já, pela ordem em que se veem.
 *
 * **Alternadas entre listas, não em fila.** Uma prateleira de cada vez faria
 * as três primeiras encherem-se e as outras ficarem sem nada -- e o que a
 * pessoa vê ao abrir é a PRIMEIRA de cada uma. Por isso leva-se a primeira de
 * todas, depois a segunda de todas, e assim por diante.
 *
 * Repetidos saem (a mesma faixa está em duas prateleiras com frequência), e o
 * que não é um endereço utilizável também.
 */
export function imagensAAquecer(
  listas: readonly (readonly (string | null | undefined)[])[],
  porLista: number = POR_LISTA,
  teto: number = TETO,
): string[] {
  const saida: string[] = [];
  const vistas = new Set<string>();
  for (let i = 0; i < porLista; i++) {
    for (const lista of listas) {
      if (saida.length >= teto) return saida;
      const url = lista?.[i];
      if (typeof url !== 'string') continue;
      const limpo = url.trim();
      if (!limpo || !/^https?:\/\//i.test(limpo) || vistas.has(limpo)) continue;
      vistas.add(limpo);
      saida.push(limpo);
    }
  }
  return saida;
}

/**
 * As capas de uma lista de faixas, sem confiar na forma do que vem.
 *
 * Recebe `unknown[]` de propósito: o `cachePerfil` guarda o que as APIs
 * devolveram sem lhes dar tipo, e uma linha estranha aqui não pode rebentar o
 * arranque da app por causa de uma imagem.
 */
export function capasDeFaixas(lista: readonly unknown[] | null | undefined): (string | null)[] {
  if (!Array.isArray(lista)) return [];
  return lista.map((t) => {
    const url = (t as { artworkUrl?: unknown } | null)?.artworkUrl;
    return typeof url === 'string' ? url : null;
  });
}

/** A primeira capa de cada playlist (a colagem usa até quatro; chega a de cima). */
export function capasDePlaylists(lista: readonly unknown[] | null | undefined): (string | null)[] {
  if (!Array.isArray(lista)) return [];
  return lista.map((p) => {
    const artworks = (p as { artworks?: unknown } | null)?.artworks;
    const primeira = Array.isArray(artworks) ? artworks[0] : null;
    return typeof primeira === 'string' ? primeira : null;
  });
}

/**
 * O avatar de um perfil, quando é mesmo uma imagem.
 *
 * O `avatar_url` guarda OU um endereço OU `emoji:<emoji>:<gradiente>` (ver
 * `lib/avatarPrefs.ts`); a segunda forma desenha-se e não se descarrega.
 */
export function capaDoPerfil(perfil: unknown): string | null {
  const url = (perfil as { avatar_url?: unknown } | null)?.avatar_url;
  return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;
}
