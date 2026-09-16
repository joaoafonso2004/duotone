/**
 * O que o "Discover new" já mostrou, para a semana seguinte não o repetir.
 *
 * A lista é a MESMA durante sete dias, de propósito (`descobertasDaSemana`). O
 * defeito era a semana seguinte: a escolha dos vizinhos é estável, e com o
 * mesmo gosto voltavam as mesmas faixas -- "aparecem-me sempre as mesmas
 * músicas", a queixa de um amigo do João (13/9).
 *
 * - **Guardam-se as últimas `SEMANAS_SEM_REPETIR` semanas**, por chave de faixa.
 *   A semana corrente não conta para ela própria: refrescar dentro da semana já
 *   tem o que está no ecrã para não repetir.
 * - **Aperta-se e, se não chegar, alarga-se** (`TENTATIVAS_SEM_REPETIR`): quem
 *   ouve poucos artistas tem poucos vizinhos, e excluir um mês inteiro deixava-o
 *   com a prateleira vazia. Uma prateleira repetida é melhor do que nenhuma.
 * - **Só se regista a lista que ficou**: refrescar três vezes na mesma semana
 *   não pode tirar noventa faixas às semanas seguintes.
 *
 * Sem imports de runtime: testado em Node puro (scripts/test-descobertas-mostradas.ts).
 */

export const SEMANAS_SEM_REPETIR = 4;

/** Das mais apertadas para as mais largas; a última (0) não exclui nada. */
export const TENTATIVAS_SEM_REPETIR = [SEMANAS_SEM_REPETIR, 1, 0] as const;

/** Teto por semana: uma prateleira são 30, e isto vive numa linha da cache.
 * Cada faixa leva o upload e as chaves da música (umas quatro). */
export const CHAVES_POR_SEMANA = 200;

export type HistoricoDeDescobertas = { semana: number; chaves: string[] }[];

/** Aceita o que vier da cache e devolve só o que tem a forma certa. */
export function lerHistorico(valor: unknown): HistoricoDeDescobertas {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((s): s is { semana: number; chaves: unknown[] } =>
      !!s && typeof s.semana === 'number' && Array.isArray(s.chaves))
    .map((s) => ({ semana: s.semana, chaves: s.chaves.filter((k): k is string => typeof k === 'string' && !!k) }));
}

/** As chaves mostradas nas `semanas` anteriores à atual (a atual não conta). */
export function aEvitar(historico: HistoricoDeDescobertas, semanaAtual: number, semanas: number): Set<string> {
  const evitar = new Set<string>();
  for (const s of historico) {
    if (s.semana < semanaAtual && s.semana >= semanaAtual - semanas) {
      for (const k of s.chaves) evitar.add(k);
    }
  }
  return evitar;
}

/** Chegam para uma prateleira? Metade do pedido já é uma prateleira. */
export function chegam(obtidas: number, pedidas: number): boolean {
  return obtidas >= Math.ceil(pedidas / 2);
}

/**
 * O histórico com a lista desta semana. Substitui a da mesma semana (é a lista
 * que ficou) e esquece o que já saiu da janela.
 */
export function registarSemana(
  historico: HistoricoDeDescobertas,
  semana: number,
  chaves: readonly string[],
): HistoricoDeDescobertas {
  const desta = { semana, chaves: [...new Set(chaves.filter(Boolean))].slice(0, CHAVES_POR_SEMANA) };
  return [desta, ...historico.filter((s) => s.semana !== semana && s.semana >= semana - SEMANAS_SEM_REPETIR)]
    .sort((a, b) => b.semana - a.semana);
}
