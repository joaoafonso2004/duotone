/**
 * O baralho do shuffle (27/11): o que já tocou de cada lista, para o shuffle ir à
 * lista inteira antes de repetir.
 *
 * Um amigo do João, com quase 2000 músicas: "o shuffle parece que ainda não está a
 * fazer full random ... parece que ouço tipo 200". O baralhar é um Fisher-Yates sem
 * enviesamento (`lib/shuffle.ts`), mas a ordem não sobrevivia: carregar outra vez em
 * Shuffle, ou o iPhone fechar a app, dava uma ordem nova de raiz. Quem ouve 20
 * músicas por dia tirava todos os dias 20 de um baralho novo, e ao fim de semanas
 * tinha ouvido as mesmas muitas vezes e nunca as outras.
 *
 * Agora cada lista (a `OrigemDaFila`) guarda as que já tocaram com o shuffle, e uma
 * ordem nova põe primeiro as que faltam, baralhadas, e as já ouvidas no fim. Quando
 * tocaram todas, o baralho recomeça. Sem imports: as contas testam-se sozinhas
 * (`test-baralho-do-shuffle.ts`); o disco é do `state/baralhoDoShuffle.ts`.
 */

/** A lista de onde a fila veio, como chave do baralho. Sem id nem nome, não há baralho. */
export function chaveDoBaralho(origem: { tipo: string; nome?: string | null; id?: string | null } | null | undefined): string | null {
  if (!origem) return null;
  const quem = origem.id || origem.nome;
  return quem ? `${origem.tipo}:${quem}` : null;
}

/**
 * A ordem nova com as já ouvidas no fim. A cabeça (a que vai tocar agora) fica onde
 * está; o resto mantém a ordem baralhada dentro de cada grupo. Sem nada por ouvir,
 * a ordem fica como veio.
 */
export function ouvidasParaOFim(ordem: readonly string[], ouvidas: ReadonlySet<string>): string[] {
  if (ordem.length < 3 || ouvidas.size === 0) return ordem.slice();
  const [cabeca, ...resto] = ordem;
  const porOuvir: string[] = [], ja: string[] = [];
  for (const k of resto) (ouvidas.has(k) ? ja : porOuvir).push(k);
  if (!porOuvir.length) return ordem.slice();
  return [cabeca!, ...porOuvir, ...ja];
}

/** Uma escolha ao acaso entre as que ainda não tocaram (ou entre todas, se já tocaram todas). */
export function inicioAoAcaso(chaves: readonly string[], ouvidas: ReadonlySet<string>, rng: () => number = Math.random): number {
  const porOuvir: number[] = [];
  chaves.forEach((k, i) => { if (!ouvidas.has(k)) porOuvir.push(i); });
  if (!porOuvir.length) return Math.floor(rng() * chaves.length);
  return porOuvir[Math.floor(rng() * porOuvir.length)]!;
}

/**
 * Juntar uma que tocou. Quando o baralho tem tantas como a lista, tocaram todas:
 * recomeça (vazio), e a próxima ordem volta a ser toda ao acaso.
 */
export function juntarOuvida(ouvidas: readonly string[], chave: string, tamanhoDaLista: number): string[] {
  if (ouvidas.includes(chave)) return ouvidas.slice();
  const seguintes = [...ouvidas, chave];
  if (tamanhoDaLista > 0 && seguintes.length >= tamanhoDaLista) return [];
  return seguintes.length > MAXIMO_POR_LISTA ? seguintes.slice(-MAXIMO_POR_LISTA) : seguintes;
}

/** Quantas se lembram por lista (as maiores bibliotecas andam pelas 5000). */
export const MAXIMO_POR_LISTA = 10_000;
/** Quantas listas se lembram (as mais recentes). */
export const MAXIMO_DE_LISTAS = 30;
