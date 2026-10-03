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

/**
 * O que o iOS diz do aparelho (`ProcessInfo`: `thermalState` e
 * `isLowPowerModeEnabled`). `null` quando não se sabe -- PC, ou um binário
 * anterior a 2/10 --, e aí tudo fica como sempre.
 */
export type EnergiaDoAparelho = {
  termico: 'nominal' | 'fair' | 'serious' | 'critical' | 'unknown';
  poupanca: boolean;
} | null;

/**
 * Quanto poupar nos downloads que ninguém pediu (2/10). A Apple pede menos
 * trabalho em segundo plano a partir de `fair`, e o mínimo em `serious` e
 * `critical`; o modo de poupança é o próprio utilizador a pedir o mesmo.
 *
 * - `nada`: como sempre.
 * - `algum` (quente, `fair`): adianta-se uma faixa a menos e a Daily mix não
 *   descarrega.
 * - `tudo` (`serious`, `critical` ou modo de poupança): só a SEGUINTE -- é a
 *   que se ouve a seguir, e o crossfade depende dela.
 */
export function quantoPoupar(e: EnergiaDoAparelho): 'nada' | 'algum' | 'tudo' {
  if (!e) return 'nada';
  if (e.poupanca || e.termico === 'serious' || e.termico === 'critical') return 'tudo';
  return e.termico === 'fair' ? 'algum' : 'nada';
}

/**
 * Com a app ESCONDIDA (3/10), só a seguinte. O relatório da 4.4.0 mostrou 19%
 * de um núcleo a tocar com o ecrã desligado, metade no JavaScript, e os três
 * downloads desse tempo eram todos com a app escondida -- o download e o Opus
 * correm no JavaScript. A seguinte fica (é a que se ouve, e o crossfade
 * depende dela); as outras esperam que se volte à app.
 */
export function quantasAdiantar(dadosMoveis: boolean, energia: EnergiaDoAparelho = null, aFrente = true): number {
  if (!aFrente) return 1;
  const normal = dadosMoveis ? ADIANTAR_EM_DADOS_MOVEIS : ADIANTAR_EM_WIFI;
  const poupar = quantoPoupar(energia);
  if (poupar === 'tudo') return 1;
  return poupar === 'algum' ? Math.max(1, normal - 1) : normal;
}

/** Os downloads opcionais (a Daily mix) só correm sem nada a poupar, e com a app à frente. */
export function podeDescarregarOpcionais(energia: EnergiaDoAparelho, aFrente = true): boolean {
  return aFrente && quantoPoupar(energia) === 'nada';
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
