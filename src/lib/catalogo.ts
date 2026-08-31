/**
 * Ligar um nome escrito num título a um artista REAL de um catálogo de música,
 * e ordenar o que o catálogo devolve pelo gosto de quem está a ouvir.
 *
 * **O problema que isto resolve.** As recomendações encheram-se de música
 * bhojpuri vinda de um canal chamado "999 Music". O `999` anda colado ao Juice
 * WRLD nos títulos, o extractor tomou-o por nome de artista, a afinidade usou-o
 * como alvo de pesquisa, e o YouTube devolveu o catálogo inteiro desse canal.
 * Um alvo mau não dá uma recomendação má: dá doze.
 *
 * **A tentativa que se deitou fora.** A primeira correção foi uma lista de
 * palavras suspeitas — "music", "records", "tv" — e um teste ao número de
 * dígitos do nome. Isso é adivinhar pelos caracteres: rejeita o "Rap Nation"
 * mas deixa passar o próximo nome de canal que não leve nenhuma das palavras,
 * e um dia rejeita um artista a sério por ele ter "TV" no nome.
 *
 * **O que se faz em vez disso.** Pergunta-se a um catálogo de música se aquele
 * nome é um artista. E não se pergunta "existe?" — o "999 Music" até existe lá,
 * com zero fãs. Pergunta-se **quem se parece com ele**, que é a pergunta cuja
 * resposta separa mesmo as duas coisas:
 *
 * ```
 *   999 Music, 999 Hz Music, Rap Nation, NoCopyrightSounds,
 *   Lyrics, Various Artists, Vevo, Chill Vibes ......  0 semelhantes
 *   Juice WRLD, Dillaz, Amália Rodrigues, Slow J,
 *   Sam The Kid, Capitão Fausto, Xutos & Pontapés ...  20 semelhantes
 * ```
 *
 * Medido, não suposto (ver o cabeçalho de `api/catalogo.ts`). Um agregador não
 * tem vizinhança no grafo de co-escuta porque ninguém o ouve *ao lado* de nada:
 * é um sítio onde se despeja música, não um artista de quem se gosta. A defesa
 * deixa de ser uma lista de palavras e passa a ser uma propriedade do sinal.
 *
 * Lógica pura, sem rede — testável em Node puro (`scripts/test-catalogo.ts`).
 */

/** Um artista tal como o catálogo o conhece. */
export type ArtistaDoCatalogo = {
  id: number;
  nome: string;
  /** Quantas pessoas o seguem. Serve para desempatar homónimos, não para julgar. */
  fas: number;
};

/**
 * A chave por que se compara um nome escrito num título com um nome de catálogo.
 *
 * É mais tolerante do que a `chaveDeArtista` de propósito, e só para ESTA
 * comparação: aqui os dois lados referem-se à mesma pessoa e estão escritos por
 * fontes diferentes. O caso que obrigou a isto foi real — procurar
 * "Xutos e Pontapes" e o catálogo ter "Xutos & Pontapés": com uma chave estrita
 * não casavam, e a resolução caía num homónimo de 1732 fãs em vez da banda de
 * 70 mil. As palavras de ligação (`&`, `e`, `and`) e o `the` inicial caem, por
 * serem exactamente onde as duas grafias divergem.
 */
export function chaveDeCatalogo(nome: string): string {
  const base = (nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\$/g, 's')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!base) return '';
  const palavras = base.split(' ').filter((p) => p && !LIGACOES.has(p));
  // Um nome que SÓ tem ligações ("The", "and") não fica vazio: nesse caso o
  // nome original é o que há, e apagá-lo faria casar tudo com tudo.
  return palavras.length > 0 ? palavras.join(' ') : base;
}

/** Palavras onde as duas grafias do mesmo nome costumam divergir. */
const LIGACOES = new Set(['e', 'and', 'the', 'y']);

/**
 * Os candidatos que podem ser o artista procurado, do mais provável ao menos.
 *
 * Não devolve um só: devolve uma ORDEM, e quem chama vai descendo até um deles
 * ter vizinhança. É essa a diferença entre perguntar "existe com este nome?" —
 * que o "999 Music" passa — e "é um artista?".
 *
 * A ordenação do próprio catálogo não serve para nada: procurar "Radiohead"
 * devolve em primeiro um homónimo de 502 fãs e só depois os Radiohead com
 * quatro milhões. Ordena-se por audiência, entre os que casam pelo nome.
 */
export function candidatosPlausiveis(
  procurado: string,
  candidatos: readonly ArtistaDoCatalogo[],
): ArtistaDoCatalogo[] {
  const alvo = chaveDeCatalogo(procurado);
  if (!alvo) return [];
  return candidatos
    .filter((c) => chaveDeCatalogo(c.nome) === alvo)
    .sort((a, b) => b.fas - a.fas);
}

/**
 * Os semelhantes que o catálogo deu, reordenados pelo gosto de quem ouve.
 *
 * O catálogo sabe quem se parece com quem **em geral**; a biblioteca da pessoa
 * sabe do que ela gosta **em particular**. Nenhum dos dois chega sozinho: só o
 * catálogo dava a mesma lista a toda a gente, e só a biblioteca nunca saía dela
 * — que era o defeito de origem. Aqui o catálogo propõe e a afinidade escolhe.
 *
 * **Recebe uma lista POR ARTISTA de partida, e não uma só.** Isto foi um defeito
 * apanhado a correr a coisa de ponta a ponta: partindo de "Juice WRLD" e de
 * "Dillaz", as doze sugestões saíram todas do lado do Juice WRLD e nenhuma do
 * rap português. A razão não era musical — era que as duas listas vinham
 * coladas numa só, e quem estava na segunda metade herdava uma posição pior só
 * por ter sido acrescentado depois. Contando a posição DENTRO da lista de onde
 * veio, o primeiro semelhante do Dillaz compete com o primeiro do Juice WRLD.
 *
 * As duas parcelas ficam ambas entre 0 e 1 para que nenhuma possa esmagar a
 * outra: a escala da afinidade depende do tamanho da biblioteca, e em bruto
 * decidia sozinha.
 */
export function ordenarPorGosto(
  listas: readonly (readonly ArtistaDoCatalogo[])[],
  afinidade: ReadonlyMap<string, number>,
  excluir: ReadonlySet<string> = new Set(),
  chave: (nome: string) => string = chaveDeCatalogo,
): ArtistaDoCatalogo[] {
  const maiorAfinidade = Math.max(0, ...afinidade.values());
  const melhor = new Map<string, { artista: ArtistaDoCatalogo; pontos: number }>();

  for (const lista of listas) {
    lista.forEach((a, i) => {
      const k = chave(a.nome);
      if (!k || excluir.has(k)) return;
      const doCatalogo = (lista.length - i) / lista.length;
      const bruta = afinidade.get(k) ?? 0;
      const doGosto = maiorAfinidade > 0 ? bruta / maiorAfinidade : 0;
      const pontos = doCatalogo + doGosto;
      // Aparecer nas listas de dois artistas diferentes não soma: vale a
      // melhor posição. Somar premiava quem é semelhante de toda a gente.
      const actual = melhor.get(k);
      if (!actual || pontos > actual.pontos) melhor.set(k, { artista: a, pontos });
    });
  }

  return [...melhor.values()]
    .sort((a, b) => b.pontos - a.pontos)
    .map((x) => x.artista);
}
