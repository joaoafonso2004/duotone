import type { Mistura } from './misturas';
import type { Track } from '../types';

/**
 * As misturas por GÉNERO.
 *
 * ## A coluna já estava cheia e não servia para nada
 *
 * O `track_catalog.genero` é escrito desde a 2.4.8 e nunca era lido por
 * ninguém. Isto é o que faltava para ela valer alguma coisa -- e, como as
 * décadas, não custa uma ida à rede: o género vem da mesma linha que já se lê
 * para corrigir o título e o artista.
 *
 * ## O género é grosso, e é por isso que funciona
 *
 * O Deezer diz "Rap/Hip Hop", não diz "Trap". Isso parece uma limitação e é
 * exactamente o contrário: uma etiqueta larga é a única que junta faixas que
 * cheguem para uma prateleira. As etiquetas finas são o que o
 * `lib/estilos.ts` já faz por outro caminho -- agrupar artistas que partilham
 * vizinhos -- e as duas respondem a perguntas diferentes:
 *
 *   estilos  -> "mais disto", onde "isto" é um grupo de artistas teus
 *   géneros  -> "a minha música de rap", que é uma gaveta e não uma vizinhança
 *
 * ## Porque é que um género precisa de muitas faixas
 *
 * Pela mesma razão das décadas: três faixas de jazz num catálogo de rap não
 * fazem de alguém um ouvinte de jazz, fazem-no dono de três faixas de jazz.
 * Uma prateleira que promete um género e entrega meia dúzia mente sobre o que
 * é.
 *
 * Sem imports de runtime: `scripts/test-generos.ts` corre em Node puro.
 */

/** Quantos géneros se mostram. */
export const GENEROS = 3;
/** Faixas por mistura. */
export const POR_GENERO = 30;
/** Abaixo disto o género não dá prateleira. Ver o cabeçalho. */
export const MINIMO_POR_GENERO = 15;

/**
 * A chave de agrupamento de um género.
 *
 * Sem maiúsculas e sem espaços à volta, porque o mesmo género chega escrito de
 * maneiras diferentes conforme o álbum -- "Rap/Hip Hop" e "rap/hip hop" são o
 * mesmo, e vê-los como dois partia a prateleira ao meio.
 */
export function chaveDoGenero(genero: string): string {
  return genero.trim().toLowerCase();
}

/** "Rap/Hip Hop mix". O nome mostrado é o primeiro que se viu, não a chave. */
export function nomeDoGenero(genero: string): string {
  return `${genero} mix`;
}

/**
 * As misturas por género, a partir da biblioteca.
 *
 * `generoDe` entra por parâmetro para este módulo não importar nada em tempo
 * de execução -- é a mesma decisão do `lib/misturas.ts` e do `lib/decadas.ts`.
 *
 * `peso` diz o quanto cada faixa conta para ordenar o género: normalmente as
 * reproduções. À frente fica o género que mais se OUVE, não aquele de que se
 * tem mais música -- são coisas diferentes, e a primeira é a interessante.
 */
export function misturasPorGenero(
  biblioteca: readonly Track[],
  generoDe: (t: Track) => string | null,
  chave: (t: Track) => string,
  peso: (t: Track) => number = () => 0,
  baralhar: <T>(l: readonly T[]) => T[] = (l) => [...l],
  quantos: number = GENEROS,
): Mistura[] {
  const porGenero = new Map<string, { nome: string; faixas: Track[] }>();
  const vistas = new Set<string>();

  for (const faixa of biblioteca) {
    const genero = generoDe(faixa);
    // Sem género não há gaveta. É o caso normal enquanto o catálogo não tiver
    // resolvido a faixa, e não é um erro -- simplesmente não entra.
    if (!genero) continue;
    const k = chaveDoGenero(genero);
    if (!k) continue;
    const idDaFaixa = chave(faixa);
    if (!idDaFaixa || vistas.has(idDaFaixa)) continue;
    vistas.add(idDaFaixa);
    const grupo = porGenero.get(k);
    if (grupo) grupo.faixas.push(faixa);
    else porGenero.set(k, { nome: genero.trim(), faixas: [faixa] });
  }

  return [...porGenero.entries()]
    .filter(([, g]) => g.faixas.length >= MINIMO_POR_GENERO)
    .map(([k, g]) => ({
      k,
      ...g,
      total: g.faixas.reduce((soma, t) => soma + Math.max(0, peso(t)), 0),
    }))
    // O mais ouvido primeiro. Empata-se pela quantidade e depois pela chave,
    // para a ordem ser sempre a mesma entre carregamentos.
    .sort((a, b) => b.total - a.total || b.faixas.length - a.faixas.length || a.k.localeCompare(b.k))
    .slice(0, Math.max(0, quantos))
    .map(({ k, nome, faixas }): Mistura => ({
      id: `genero:${k}`,
      nome: nomeDoGenero(nome),
      // Baralhadas: dentro de um género a ordem da biblioteca não quer dizer
      // nada, e ouvir sempre pela mesma ordem faz a prateleira parecer parada.
      faixas: baralhar(faixas).slice(0, POR_GENERO),
    }));
}
