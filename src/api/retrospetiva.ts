import { lerReproducoes } from './listeningStats';
import {
  anosComReproducoes,
  calcularRetrospetiva,
  type Retrospetiva,
} from '../lib/retrospetiva';

export interface ResultadoRetrospetiva {
  /** Anos com escuta, do mais recente para o mais antigo. */
  anos: number[];
  /** `null` quando não há histórico nenhum. */
  retrospetiva: Retrospetiva | null;
  /** Bateu no teto de páginas: os números são um mínimo. */
  truncated: boolean;
  unavailable: boolean;
}

/**
 * Lê o histórico TODO, uma vez, e monta o ano pedido.
 *
 * Tem de ser o histórico todo e não só o do ano: "artistas que conheceste em
 * 2026" só se sabe olhando para trás — sem os anos anteriores, toda a gente
 * seria uma descoberta.
 */
export async function fetchRetrospetiva(
  ano?: number,
  targetUserId?: string
): Promise<ResultadoRetrospetiva> {
  const { rows, truncated, unavailable } = await lerReproducoes(null, targetUserId);
  if (unavailable) return { anos: [], retrospetiva: null, truncated: false, unavailable: true };

  const anos = anosComReproducoes(rows);
  const escolhido = ano ?? anos[0];
  return {
    anos,
    retrospetiva: escolhido === undefined ? null : calcularRetrospetiva(rows, escolhido),
    truncated,
    unavailable: false,
  };
}
