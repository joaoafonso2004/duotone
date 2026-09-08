import type { Track } from '../types';

/**
 * Uma faixa de cada artista antes da segunda de qualquer um.
 *
 * ## Porquê
 *
 * O `descobrirNovas` já fazia isto para si próprio, e por uma razão que ficou
 * escrita lá: "senão a prateleira enchia-se com quatro do mesmo e parecia um
 * álbum". Só que as outras prateleiras não passam por ele -- o *heavy
 * rotation*, o *forgotten favourites* e o *daily flow* são consultas top-N
 * directas à base de dados, e o SQL não tem opinião nenhuma sobre variedade.
 * Quem ouve muito dois artistas vê catorze faixas onde os dois se alternam, e
 * isso lê-se como repetição mesmo quando nenhuma música se repete.
 *
 * ## Reordena, não corta
 *
 * A tentação é limitar a três por artista. Não presta aqui: numa prateleira
 * que promete "o que mais ouves", deitar fora a quarta faixa mais ouvida é
 * mentir sobre o que ela é. Intercalar mantém tudo e só muda a ordem por que
 * se encontra -- o primeiro de cada artista aparece antes do segundo de
 * qualquer um, e a ordem entre faixas do MESMO artista fica intacta, por isso
 * a mais ouvida dele continua a ser a primeira dele.
 *
 * A ordem de saída dos artistas é a ordem por que apareceram à entrada, e não
 * uma qualquer: quem estava no topo continua no topo.
 *
 * Sem imports de runtime -- `scripts/test-intercalar.ts` corre em Node puro.
 */
export function intercalarPorArtista(
  faixas: readonly Track[],
  chaveDoArtista: (t: Track) => string,
): Track[] {
  if (faixas.length < 3) return [...faixas];

  const porArtista = new Map<string, Track[]>();
  for (const faixa of faixas) {
    const chave = chaveDoArtista(faixa);
    const lista = porArtista.get(chave);
    if (lista) lista.push(faixa);
    // O `Map` preserva a ordem de inserção: o primeiro artista a aparecer é o
    // primeiro a ser servido em cada volta.
    else porArtista.set(chave, [faixa]);
  }
  if (porArtista.size === 1) return [...faixas];

  const saida: Track[] = [];
  const listas = [...porArtista.values()];
  const maior = Math.max(...listas.map((l) => l.length));
  for (let volta = 0; volta < maior; volta++) {
    for (const lista of listas) {
      const faixa = lista[volta];
      if (faixa) saida.push(faixa);
    }
  }
  return saida;
}
