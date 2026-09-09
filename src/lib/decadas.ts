import type { Mistura } from './misturas';
import type { Track } from '../types';

/**
 * As misturas por década.
 *
 * ## A forma é a do Spotify, e é mais simples do que parece
 *
 * O algoritmo deles não é público -- procurei, e nenhum repositório o
 * documenta. O que ESTÁ documentado é a forma, e é o contrário do que se
 * assume: uma "Mix dos anos 2010" não é um motor de descoberta a propor música
 * daquela era, é **a tua própria música daquela era, ordenada por afinidade**.
 * Resume hábitos em vez de prever gostos.
 *
 * Isso muda o desenho todo. Não se vai ao catálogo buscar nada: a década sai
 * do ano que o `track_catalog` já guarda, e as faixas são as da biblioteca de
 * quem está a ouvir. É por isso que estas misturas são as mais baratas de
 * todas -- não custam uma ida à rede.
 *
 * ## Porque é que uma década precisa de muitas faixas
 *
 * Uma década com seis faixas não é uma era, é uma coincidência: quase toda a
 * gente tem uma ou duas músicas soltas dos anos 80 sem que isso queira dizer
 * nada. O mínimo é alto de propósito -- uma prateleira que promete uma década e
 * entrega meia dúzia de músicas mente sobre o que é.
 *
 * Sem imports de runtime: `scripts/test-decadas.ts` corre em Node puro, como o
 * resto da lógica desta app.
 */

/** Quantas décadas se mostram. */
export const DECADAS = 2;
/** Faixas por mistura. */
export const POR_DECADA = 30;
/**
 * Abaixo disto a década não dá prateleira.
 *
 * Doze e não cinco: ver o cabeçalho. Uma ou duas faixas soltas de uma era não
 * fazem dela uma parte do teu gosto.
 */
export const MINIMO_POR_DECADA = 12;

/** "2010s mix". A década é sempre o ano com o último dígito a zero. */
export function nomeDaDecada(decada: number): string {
  return `${decada}s mix`;
}

export function decadaDe(ano: number): number {
  return Math.floor(ano / 10) * 10;
}

/**
 * As misturas por década, a partir da biblioteca.
 *
 * `anoDe` entra por parâmetro para este módulo não importar nada em tempo de
 * execução -- é a mesma decisão do `lib/misturas.ts` e pela mesma razão.
 *
 * `peso` diz o quanto cada faixa conta para ordenar a década: normalmente as
 * reproduções. Sem ele, ordena-se pela ordem em que vieram, que já é a da
 * biblioteca.
 */
export function misturasPorDecada(
  biblioteca: readonly Track[],
  anoDe: (t: Track) => number | null,
  chave: (t: Track) => string,
  peso: (t: Track) => number = () => 0,
  baralhar: <T>(l: readonly T[]) => T[] = (l) => [...l],
  quantas: number = DECADAS,
): Mistura[] {
  const porDecada = new Map<number, Track[]>();
  const vistas = new Set<string>();

  for (const faixa of biblioteca) {
    const ano = anoDe(faixa);
    // Sem ano não há década. É o caso normal enquanto o catálogo não tiver
    // resolvido a faixa, e não é um erro -- simplesmente não entra.
    if (!ano || !Number.isFinite(ano)) continue;
    const k = chave(faixa);
    if (!k || vistas.has(k)) continue;
    vistas.add(k);
    const d = decadaDe(ano);
    const lista = porDecada.get(d);
    if (lista) lista.push(faixa);
    else porDecada.set(d, [faixa]);
  }

  return [...porDecada.entries()]
    .filter(([, faixas]) => faixas.length >= MINIMO_POR_DECADA)
    // A década com mais peso primeiro -- é a era que a pessoa mais ouve, e não
    // a mais recente. Empata-se pela quantidade, e depois pela década, para a
    // ordem ser sempre a mesma entre carregamentos.
    .map(([decada, faixas]) => ({
      decada,
      faixas,
      total: faixas.reduce((soma, t) => soma + Math.max(0, peso(t)), 0),
    }))
    .sort((a, b) => b.total - a.total || b.faixas.length - a.faixas.length || b.decada - a.decada)
    .slice(0, Math.max(0, quantas))
    .map(({ decada, faixas }): Mistura => ({
      id: `decada:${decada}`,
      nome: nomeDaDecada(decada),
      // Baralhadas: dentro de uma década a ordem da biblioteca não quer dizer
      // nada, e ouvir sempre pela mesma ordem faz a prateleira parecer parada.
      faixas: baralhar(faixas).slice(0, POR_DECADA),
    }));
}
