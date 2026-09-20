/**
 * O que o "Discover" já mostrou, para o dia seguinte não o repetir.
 *
 * **Era por SEMANA e passou a ser por DIA (20/9).** A lista ficava a mesma
 * durante sete dias de propósito, e o João deu com o defeito do outro lado:
 * *"ficam sempre as mesmas, não atualizam, sou obrigado a clicar no refresh"*.
 * Uma página de descoberta que só muda à sexta-feira obriga a carregar num
 * botão para fazer o que ela promete.
 *
 * - **Guardam-se os últimos `DIAS_SEM_REPETIR` dias**, por chave de faixa. O
 *   dia corrente não conta para ele próprio: refrescar dentro do dia já tem o
 *   que está no ecrã para não repetir (`jaSugeridas`).
 * - **Aperta-se e, se não chegar, alarga-se** (`TENTATIVAS_SEM_REPETIR`): quem
 *   ouve poucos artistas tem poucos vizinhos, e excluir um mês inteiro deixava-o
 *   com a prateleira vazia. Uma prateleira repetida é melhor do que nenhuma.
 * - **Só se regista a lista que ficou**: refrescar três vezes no mesmo dia não
 *   pode tirar noventa faixas aos dias seguintes -- a entrada do dia é
 *   SUBSTITUÍDA, não somada.
 *
 * Sem imports de runtime: testado em Node puro (scripts/test-descobertas-mostradas.ts).
 */

/** Um mês de memória. Era `SEMANAS_SEM_REPETIR = 4`, o mesmo tempo. */
export const DIAS_SEM_REPETIR = 28;

/** Das mais apertadas para as mais largas; a última (0) não exclui nada. */
export const TENTATIVAS_SEM_REPETIR = [DIAS_SEM_REPETIR, 7, 0] as const;

/** Teto por dia: uma prateleira são umas dezenas de faixas, e cada uma leva o
 * upload e as chaves da música (umas quatro). Isto vive numa linha da cache. */
export const CHAVES_POR_DIA = 200;

export type HistoricoDeDescobertas = { dia: number; chaves: string[] }[];

/** Aceita o que vier da cache e devolve só o que tem a forma certa. */
export function lerHistorico(valor: unknown): HistoricoDeDescobertas {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((s): s is { dia: number; chaves: unknown[] } =>
      !!s && typeof s.dia === 'number' && Array.isArray(s.chaves))
    .map((s) => ({ dia: s.dia, chaves: s.chaves.filter((k): k is string => typeof k === 'string' && !!k) }));
}

/** As chaves mostradas nos `dias` anteriores ao atual (o atual não conta). */
export function aEvitar(historico: HistoricoDeDescobertas, diaAtual: number, dias: number): Set<string> {
  const evitar = new Set<string>();
  for (const d of historico) {
    if (d.dia < diaAtual && d.dia >= diaAtual - dias) {
      for (const k of d.chaves) evitar.add(k);
    }
  }
  return evitar;
}

/** Chegam para uma prateleira? Metade do pedido já é uma prateleira. */
export function chegam(obtidas: number, pedidas: number): boolean {
  return obtidas >= Math.ceil(pedidas / 2);
}

/**
 * O histórico com a lista de hoje. Substitui a do mesmo dia (é a lista que
 * ficou) e esquece o que já saiu da janela.
 */
export function registarDia(
  historico: HistoricoDeDescobertas,
  dia: number,
  chaves: readonly string[],
): HistoricoDeDescobertas {
  const deHoje = { dia, chaves: [...new Set(chaves.filter(Boolean))].slice(0, CHAVES_POR_DIA) };
  return [deHoje, ...historico.filter((d) => d.dia !== dia && d.dia >= dia - DIAS_SEM_REPETIR)]
    .sort((a, b) => b.dia - a.dia);
}
