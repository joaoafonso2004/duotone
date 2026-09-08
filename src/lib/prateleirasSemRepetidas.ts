import type { Track } from '../types';

/**
 * A mesma música só aparece numa prateleira.
 *
 * ## O problema
 *
 * Cada prateleira é calculada por conta própria, e o `filterSuggestions` que
 * as limpa compara cada uma com as preferências do utilizador -- nunca com as
 * vizinhas. Só que o `descobrir` e o `flow` saem ambos da mesma biblioteca com
 * lógica aparentada, e a mesma faixa senta-se nas duas sem que nada a impeça.
 * Seis prateleiras com repetições lêem-se como menos música do que realmente
 * há, que é o contrário do que uma página de descoberta devia fazer.
 *
 * ## Porque é por ordem de EXIBIÇÃO e não de chegada
 *
 * As prateleiras publicam-se à medida que aterram, de propósito: três são
 * consultas à base de dados e chegam quase logo, a descoberta fala com o
 * catálogo e com o YouTube e demora segundos.
 *
 * Um dedupe à chegada daria uma página diferente a cada abertura -- ficava com
 * a música quem aterrasse primeiro, e isso muda com a rede do dia. Pior: a
 * descoberta, que é a razão de ser da página, chega sempre em último e seria
 * sempre ela a perder.
 *
 * Por isso decide a ORDEM em que se vêem. Cada faixa fica na prateleira mais
 * acima onde aparece, e recalcula-se tudo de cada vez que uma nova aterra --
 * a partir dos originais por filtrar, que é para isso que eles são guardados.
 * O resultado não depende de quem chegou primeiro.
 *
 * A chave vem de fora em vez de ser importada, como no `saltoAposFalha`: sem
 * imports de runtime isto corre em Node puro -- `scripts/test-prateleiras.ts`
 * -- e continua a usar exactamente a mesma noção de identidade que o resto da
 * app, em vez de uma cópia que podia divergir dela sem ninguém reparar.
 */
export function semRepetidas<N extends string>(
  prateleiras: Partial<Record<N, readonly Track[]>>,
  ordem: readonly N[],
  chaveDaFaixa: (t: Track) => string,
): Record<N, Track[]> {
  const vistas = new Set<string>();
  const saida = {} as Record<N, Track[]>;
  for (const nome of ordem) {
    const faixas = prateleiras[nome] ?? [];
    const limpa: Track[] = [];
    for (const faixa of faixas) {
      const chave = chaveDaFaixa(faixa);
      // Uma prateleira pode trazer a mesma faixa duas vezes; o `Set` trata dos
      // dois casos de uma vez, dentro e entre prateleiras.
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      limpa.push(faixa);
    }
    saida[nome] = limpa;
  }
  return saida;
}
