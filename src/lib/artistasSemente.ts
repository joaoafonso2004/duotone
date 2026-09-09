/**
 * Os artistas que alguém escolhe no primeiro dia, e quando é que eles contam.
 *
 * ## O problema
 *
 * Toda a pilha de recomendações bebe do `getTopArtists()`, que sai do
 * histórico: o `escolherAlvos` da descoberta, o `misturasDaBiblioteca` e o
 * `agruparPorEstilo`. Conta nova, histórico vazio, três prateleiras vazias --
 * e a app parece partida no único momento em que ninguém lhe dá o benefício da
 * dúvida.
 *
 * ## O que NÃO se faz
 *
 * Não se escrevem reproduções falsas para semear. Poluíam as estatísticas, a
 * retrospectiva e o "mais ouvidas" para sempre, e um dia alguém ia olhar para
 * o perfil e ver um artista no topo que nunca tinha ouvido.
 *
 * ## O que se faz
 *
 * As sementes ficam à parte e só COMPLETAM o histórico enquanto ele for magro.
 * À medida que se ouve a sério, o histórico enche e elas saem sozinhas de
 * cena -- sem data de validade, sem limpeza, sem ninguém ter de decidir quando
 * é que a conta deixou de ser nova.
 *
 * Um só sítio a decidir isto. As três prateleiras chamavam `getTopArtists`
 * cada uma por si; três fallbacks copiados divergiam ao primeiro acerto.
 *
 * Sem imports de runtime: `scripts/test-artistas-semente.ts` corre em Node
 * puro, como o resto da lógica desta app.
 */

/** Um artista, com o peso que a recomendação lhe dá. */
export type ArtistaComPeso = { name: string; plays: number };

/**
 * Abaixo de quantos artistas ouvidos é que as sementes ainda entram.
 *
 * Oito é o que a descoberta e as misturas precisam para encher a página sem se
 * repetirem. Acima disso o histórico já fala por si, e continuar a empurrar
 * escolhas de há meses seria prender alguém ao que disse no primeiro dia.
 */
export const HISTORICO_QUE_CHEGA = 8;

/**
 * Quantas reproduções vale uma semente.
 *
 * Uma, e não zero: o peso é a raiz da contagem em toda a app (ver o
 * `escolherAlvos` e o `agruparPorEstilo`), e a raiz de zero é zero -- uma
 * semente com peso zero é o mesmo que não existir. Uma é o mínimo que a põe na
 * corrida e o máximo que a mantém ATRÁS de qualquer coisa realmente ouvida.
 */
export const PESO_DA_SEMENTE = 1;

/**
 * Os artistas com que se recomenda: o histórico, completado pelas sementes.
 *
 * A ordem é a do histórico primeiro -- o que se ouve ganha sempre ao que se
 * escolheu numa lista -- e as sementes entram por baixo, pela ordem em que
 * foram escolhidas. Uma semente que entretanto passou a ser ouvida não entra
 * duas vezes: fica só a linha do histórico, que tem o peso verdadeiro.
 */
export function artistasParaRecomendar(
  historico: readonly ArtistaComPeso[],
  sementes: readonly string[],
  chaveDoNome: (nome: string) => string,
  minimo: number = HISTORICO_QUE_CHEGA,
): ArtistaComPeso[] {
  const saida = [...historico];
  if (saida.length >= minimo) return saida;

  const jaLa = new Set(saida.map((a) => chaveDoNome(a.name)).filter(Boolean));
  for (const nome of sementes) {
    if (saida.length >= minimo) break;
    const chave = chaveDoNome(nome);
    if (!chave || jaLa.has(chave)) continue;
    jaLa.add(chave);
    saida.push({ name: nome, plays: PESO_DA_SEMENTE });
  }
  return saida;
}

/** Quantos artistas se pedem a quem chega. */
export const SEMENTES_PEDIDAS = 3;

/** Chegam para se poder avançar? */
export function jaChegam(escolhidos: readonly string[]): boolean {
  return escolhidos.length >= SEMENTES_PEDIDAS;
}
