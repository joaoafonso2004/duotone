/**
 * Quantas músicas ficam prontas antes de chegar a vez delas, e quais.
 *
 * No iPhone cada faixa é descarregada inteira antes de tocar (ver o topo do
 * YouTubePlayerView), e só a SEGUINTE era adiantada. Saltar duas de seguida, ou
 * a primeira música de uma lista que acabou de chegar, era esperar pelo
 * download à frente de toda a gente -- "não quero ter de fazer download", nas
 * palavras de quem desistiu da app por isso (13/9).
 *
 * - **Três em Wi-Fi, duas em dados móveis.** Uma faixa são uns 3 a 5 MB; três
 *   de cada vez numa rede paga já é pedir por conta de quem não pediu.
 * - **A primeira é sempre a `proximaFaixa`**, a mesma decisão da reprodução (e
 *   do crossfade, que depende dela). As outras são o que vem a seguir por essa
 *   ordem; se a fila mudar, o Smart Cache larga as que deixaram de servir.
 * - **Só YouTube**: é o único caminho que descarrega.
 *
 * Sem imports de runtime: testado em Node puro (scripts/test-adiantar-faixas.ts).
 */

export const ADIANTAR_EM_WIFI = 3;
export const ADIANTAR_EM_DADOS_MOVEIS = 2;

export function quantasAdiantar(dadosMoveis: boolean): number {
  return dadosMoveis ? ADIANTAR_EM_DADOS_MOVEIS : ADIANTAR_EM_WIFI;
}

type Faixa = { source: string; sourceId: string };

/**
 * As faixas a ter prontas, pela ordem em que vão tocar.
 *
 * Sem `proxima` não há nada: é o repeat "one" ou um shuffle ainda sem percurso,
 * e aí qualquer palpite sobre o que vem a seguir descarregava a faixa errada.
 */
export function faixasParaAdiantar<T extends Faixa>(
  proxima: T | null,
  seguintes: readonly T[],
  atualId: string | null,
  quantas: number,
): T[] {
  if (!proxima || quantas <= 0) return [];
  const vistas = new Set<string>();
  if (atualId) vistas.add(atualId);
  const saida: T[] = [];
  for (const faixa of [proxima, ...seguintes]) {
    if (saida.length >= quantas) break;
    if (faixa.source !== 'youtube' || vistas.has(faixa.sourceId)) continue;
    vistas.add(faixa.sourceId);
    saida.push(faixa);
  }
  return saida;
}
