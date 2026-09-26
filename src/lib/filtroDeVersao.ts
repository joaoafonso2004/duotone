import { marcasDeVersao } from './trackMatch';

/**
 * O filtro por versão dos resultados da pesquisa (26/9): "remix de TESLA",
 * "slowed", "ao vivo" eram texto puro para o YouTube, e os resultados vinham
 * todos misturados. A classificação é a do comparador (`marcasDeVersao`, em
 * lib/trackMatch.ts) -- a mesma que já separa um ao vivo da gravação de
 * estúdio na importação --, para haver um só sítio a decidir o que é uma versão.
 */
export type FiltroDeVersao = 'todas' | 'original' | 'remix' | 'ritmo' | 'live' | 'acustica';

export const FILTROS_DE_VERSAO: readonly { id: FiltroDeVersao; nome: string }[] = [
  { id: 'todas', nome: 'All' },
  { id: 'original', nome: 'Original' },
  { id: 'remix', nome: 'Remix' },
  { id: 'ritmo', nome: 'Slowed / sped up' },
  { id: 'live', nome: 'Live' },
  { id: 'acustica', nome: 'Acoustic' },
];

export function versaoPassa(titulo: string, filtro: FiltroDeVersao): boolean {
  if (filtro === 'todas') return true;
  const marcas = marcasDeVersao(titulo).split('+').filter(Boolean);
  if (filtro === 'original') return marcas.length === 0;
  return marcas.includes(filtro);
}

/** Os filtros que valem a pena mostrar: os que têm pelo menos um resultado. */
export function filtrosComResultados(titulos: readonly string[]): FiltroDeVersao[] {
  return FILTROS_DE_VERSAO.map((f) => f.id).filter((id) => id === 'todas' || titulos.some((t) => versaoPassa(t, id)));
}
