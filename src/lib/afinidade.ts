/**
 * Que artistas se parecem com os que estás a ouvir, e porquê.
 *
 * **O problema.** As sugestões do shuffle inteligente não tinham relação com a
 * playlist: a única parte "nova" saía de uma escolha ao acaso do catálogo. E as
 * recomendações da Pesquisa têm o mesmo defeito, pela mesma razão — o
 * `get_flow_mix` mistura 70% do histórico com 30% de faixas tiradas à sorte.
 *
 * **O que existe para trabalhar.** Não há géneros nem características de áudio:
 * o YouTube não os dá, e estas faixas não passam pelo Spotify. O sinal que
 * existe mesmo é o ARTISTA, e a partir dele duas coisas que já estão na base de
 * dados do próprio utilizador:
 *
 *  1. **Co-ocorrência** — dois artistas que aparecem nas mesmas playlists estão
 *     relacionados *para esta pessoa*. Não é uma verdade sobre música, é uma
 *     verdade sobre o gosto dela, o que aqui vale mais.
 *  2. **Peso no contexto** — numa playlist com dez de trap e uma de fado, não é
 *     a de fado que manda. O retrato conta os artistas, não olha só para a
 *     última faixa.
 *
 * Sem imports de runtime — testável em Node puro
 * (`scripts/test-afinidade.ts`), como o resto da lógica.
 */

/** Uma faixa, reduzida ao que aqui interessa. */
export type FaixaComArtista = { artista: string; playlistId?: string | null };

/** Quantos artistas do retrato se usam. Mais do que isto e a semelhança
 * dilui-se: uma biblioteca grande acabaria por "parecer-se" com tudo. */
export const ARTISTAS_DO_RETRATO = 8;
/** As primeiras faixas do contexto valem inteiras: na biblioteca são as
 * gostadas mais recentes. */
export const RECENTES_DO_RETRATO = 60;
/** O que vem depois conta, mas menos. Ver `retratoDoContexto`. */
export const PESO_DAS_ANTIGAS = 0.25;

/**
 * O retrato do contexto: que artistas o compõem e com que peso.
 *
 * O peso é a raiz da contagem e não a contagem: sem isso, um artista com 40
 * faixas numa biblioteca de 60 abafava todos os outros e as sugestões seriam
 * sempre dele. A raiz mantém a ordem mas aproxima os extremos.
 */
export function retratoDoContexto(
  faixas: readonly FaixaComArtista[],
  chave: (nome: string) => string,
): Map<string, number> {
  const contagem = new Map<string, { nome: string; n: number }>();
  // **A biblioteca inteira, com as mais recentes a pesar mais.** Era só um
  // corte das primeiras 60: um favorito antigo que não estivesse numa playlist
  // desaparecia do retrato (auditoria de 16/9). As antigas contam a um quarto,
  // para quarenta faixas guardadas há anos não passarem à frente do presente.
  faixas.forEach((f, i) => {
    const k = chave(f.artista);
    if (!k) return;
    const peso = i < RECENTES_DO_RETRATO ? 1 : PESO_DAS_ANTIGAS;
    const actual = contagem.get(k);
    if (actual) actual.n += peso;
    else contagem.set(k, { nome: f.artista, n: peso });
  });
  const ordenado = [...contagem.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, ARTISTAS_DO_RETRATO);
  return new Map(ordenado.map(([k, v]) => [k, Math.sqrt(v.n)]));
}

/**
 * Quem anda com quem: para cada artista, os que partilham playlists com ele.
 *
 * Faixas sem playlist não contam — duas músicas soltas na biblioteca não dizem
 * nada uma sobre a outra. É estar na MESMA lista que é o sinal.
 */
export function vizinhosPorPlaylist(
  faixas: readonly FaixaComArtista[],
  chave: (nome: string) => string,
): Map<string, Map<string, number>> {
  const porPlaylist = new Map<string, Set<string>>();
  for (const f of faixas) {
    if (!f.playlistId) continue;
    const k = chave(f.artista);
    if (!k) continue;
    const conjunto = porPlaylist.get(f.playlistId) ?? new Set<string>();
    conjunto.add(k);
    porPlaylist.set(f.playlistId, conjunto);
  }

  const vizinhos = new Map<string, Map<string, number>>();
  for (const conjunto of porPlaylist.values()) {
    // Uma playlist com um artista só não relaciona ninguém. E uma playlist
    // gigante relaciona toda a gente com toda a gente, o que não diz nada:
    // o peso desce com o tamanho da lista.
    const lista = [...conjunto];
    if (lista.length < 2 || lista.length > 60) continue;
    const peso = 1 / Math.log2(lista.length + 1);
    for (const a of lista) {
      for (const b of lista) {
        if (a === b) continue;
        const dele = vizinhos.get(a) ?? new Map<string, number>();
        dele.set(b, (dele.get(b) ?? 0) + peso);
        vizinhos.set(a, dele);
      }
    }
  }
  return vizinhos;
}

export type ArtistaPontuado = { chave: string; pontos: number };

/**
 * A co-ocorrencia ajuda, mas o conjunto inteiro dos vizinhos nunca pode pesar
 * mais de metade do retrato. Sem este teto, uma unica playlist com muitos
 * artistas criava dezenas de bilhetes para o mesmo sorteio e afastava quase
 * sempre o artista que a pessoa estava realmente a ouvir.
 */
const FRACAO_MAXIMA_DOS_VIZINHOS = 0.5;

/**
 * Os artistas a quem vale a pena ir buscar sugestões.
 *
 * Soma, para cada vizinho, o peso do artista do retrato que lhe chegou. Um
 * artista puxado por três dos teus vale mais do que um puxado por um só — e é
 * isso que faz a sugestão parecer-se com a PLAYLIST e não com uma faixa dela.
 *
 * Os que já estão no retrato ficam de fora: procura-se ao lado, não no meio.
 */
export function artistasVizinhos(
  retrato: ReadonlyMap<string, number>,
  vizinhos: ReadonlyMap<string, ReadonlyMap<string, number>>,
): ArtistaPontuado[] {
  const pontos = new Map<string, number>();
  for (const [artista, peso] of retrato) {
    const dele = vizinhos.get(artista);
    if (!dele) continue;
    for (const [vizinho, forca] of dele) {
      if (retrato.has(vizinho)) continue;
      pontos.set(vizinho, (pontos.get(vizinho) ?? 0) + peso * forca);
    }
  }
  return [...pontos.entries()]
    .map(([chave, p]) => ({ chave, pontos: p }))
    .sort((a, b) => b.pontos - a.pontos);
}

/**
 * Por onde procurar a seguir: uma mistura dos vizinhos e dos próprios.
 *
 * Os artistas do retrato têm o peso principal. Os vizinhos acrescentam
 * exploração, mas o conjunto inteiro deles fica limitado a metade do retrato;
 * criar muitas ligações numa playlist não cria peso ilimitado no sorteio.
 *
 * A ordem é aleatória com viés, e não a melhor primeiro: sugerir sempre pelo
 * topo dava sempre as mesmas sugestões.
 */
export function alvosDeProcura(
  retrato: ReadonlyMap<string, number>,
  vizinhos: readonly ArtistaPontuado[],
  quantos: number,
  aleatorio: () => number = Math.random,
): string[] {
  const doRetrato: ArtistaPontuado[] = [...retrato]
    .map(([chave, peso]) => ({ chave, pontos: Math.max(peso, 0) }));
  const pesoDoRetrato = doRetrato.reduce((s, a) => s + a.pontos, 0);
  const pesoDosVizinhos = vizinhos.reduce((s, a) => s + Math.max(a.pontos, 0), 0);
  const tetoDosVizinhos = pesoDoRetrato * FRACAO_MAXIMA_DOS_VIZINHOS;
  const escalaDosVizinhos = pesoDoRetrato > 0 && pesoDosVizinhos > tetoDosVizinhos
    ? tetoDosVizinhos / pesoDosVizinhos
    : 1;
  const candidatos: ArtistaPontuado[] = [
    ...doRetrato,
    ...vizinhos.map(({ chave, pontos }) => ({ chave, pontos: pontos * escalaDosVizinhos })),
  ];
  if (candidatos.length === 0) return [];

  const saida: string[] = [];
  const restantes = [...candidatos];
  while (saida.length < quantos && restantes.length > 0) {
    const total = restantes.reduce((s, c) => s + Math.max(c.pontos, 0.0001), 0);
    let sorteio = aleatorio() * total;
    let i = 0;
    for (; i < restantes.length; i++) {
      sorteio -= Math.max(restantes[i].pontos, 0.0001);
      if (sorteio <= 0) break;
    }
    const escolhido = restantes[Math.min(i, restantes.length - 1)];
    if (!saida.includes(escolhido.chave)) saida.push(escolhido.chave);
    restantes.splice(Math.min(i, restantes.length - 1), 1);
  }
  return saida;
}
