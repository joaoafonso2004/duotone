/**
 * O refrão primeiro (25/10, pedido do João, maquete docs/refrao-primeiro-maquete.html):
 * nos cartões das descobertas, um auscultador pequeno toca 15 s do refrão, com
 * a música que estava a tocar mais baixa por baixo. Carregar no resto do
 * cartão toca a música normal.
 *
 * O refrão é o ponto mais repetido da música: a curva de "Most replayed" que o
 * YouTube devolve no `next` (100 marcadores com a intensidade de cada bocado).
 * O mais repetido de TODOS costuma ser o início -- quem abre uma música começa
 * por lá --, por isso ignora-se a descida do começo e procura-se o pico depois
 * dela. Sem curva (uma música com poucas visualizações), um terço da música.
 *
 * Sem imports de runtime: corre em Node puro (`scripts/test-refrao.ts`).
 */

/** Quanto dura a pré-escuta. */
export const PRE_ESCUTA_S = 15;
/** A música que estava a tocar fica a este volume enquanto a pré-escuta soa. */
export const ABAFO = 0.2;
/** Começa um pouco antes do pico: entra-se no refrão, não a meio dele. */
const ANTES_DO_PICO_S = 1;
/** Sem curva: um terço da música, que é onde um refrão costuma já ter chegado. */
const SEM_CURVA = 1 / 3;

export type Marcador = { inicioS: number; duracaoS: number; intensidade: number };

/** Os marcadores da curva "Most replayed" de uma resposta do `next`, ou `null`. */
export function marcadoresDaResposta(resposta: unknown): Marcador[] | null {
  const mutacoes = (resposta as any)?.frameworkUpdates?.entityBatchUpdate?.mutations;
  if (!Array.isArray(mutacoes)) return null;
  for (const m of mutacoes) {
    const lista = m?.payload?.macroMarkersListEntity?.markersList;
    if (lista?.markerType !== 'MARKER_TYPE_HEATMAP' || !Array.isArray(lista.markers)) continue;
    const marcadores = lista.markers
      .map((x: any) => ({
        inicioS: Number(x?.startMillis) / 1000,
        duracaoS: Number(x?.durationMillis) / 1000,
        intensidade: Number(x?.intensityScoreNormalized),
      }))
      .filter((x: Marcador) => Number.isFinite(x.inicioS) && Number.isFinite(x.duracaoS) && Number.isFinite(x.intensidade));
    return marcadores.length >= 10 ? marcadores : null;
  }
  return null;
}

/** Onde o refrão começa, sem curva: um terço, sem deixar a pré-escuta passar do fim. */
export function estimativaDoRefrao(duracaoS: number | null | undefined): number {
  const d = duracaoS && Number.isFinite(duracaoS) && duracaoS > 0 ? duracaoS : 180;
  return Math.max(0, Math.min(d * SEM_CURVA, d - PRE_ESCUTA_S));
}

/**
 * Onde o refrão começa, pela curva. `null` quando ela não diz nada (lisa,
 * ou curta de mais) -- quem chama fica com a `estimativaDoRefrao`.
 */
export function refraoDaCurva(marcadores: readonly Marcador[], duracaoS?: number | null): number | null {
  const n = marcadores.length;
  if (n < 10) return null;
  const fim = marcadores[n - 1].inicioS + marcadores[n - 1].duracaoS;
  const duracao = duracaoS && duracaoS > 0 ? duracaoS : fim;
  // Alisada a três: um marcador sozinho alto é ruído.
  const v = marcadores.map((_, i) => {
    const vizinhos = marcadores.slice(Math.max(0, i - 1), Math.min(n, i + 2));
    return vizinhos.reduce((s, m) => s + m.intensidade, 0) / vizinhos.length;
  });
  // O começo: a descida do início até ao primeiro vale (no primeiro terço), e
  // nunca antes dos 12 s.
  let desde = marcadores.findIndex((m) => m.inicioS >= 12);
  if (desde < 0) return null;
  const terco = Math.floor(n / 3);
  for (let i = desde; i < terco; i++) {
    if (v[i] <= v[i - 1] && v[i] <= v[i + 1]) { desde = i; break; }
  }
  // O pico, com espaço para a pré-escuta inteira antes do fim.
  let pico = -1;
  for (let i = desde; i < n; i++) {
    if (marcadores[i].inicioS > duracao - PRE_ESCUTA_S) break;
    if (pico < 0 || v[i] > v[pico]) pico = i;
  }
  if (pico < 0) return null;
  const media = v.slice(desde).reduce((s, x) => s + x, 0) / Math.max(1, n - desde);
  // Uma curva lisa não aponta para sítio nenhum.
  if (!(v[pico] > media * 1.15)) return null;
  // Recua enquanto ainda é quase o pico: o refrão começa onde a subida acaba.
  let inicio = pico;
  while (inicio > desde && v[inicio - 1] >= v[pico] * 0.9) inicio--;
  return Math.max(0, Math.min(marcadores[inicio].inicioS - ANTES_DO_PICO_S, duracao - PRE_ESCUTA_S));
}

/** O refrão de uma resposta do `next`, ou a estimativa. */
export function refraoDaResposta(resposta: unknown, duracaoS: number | null | undefined): { inicioS: number; daCurva: boolean } {
  const marcadores = marcadoresDaResposta(resposta);
  const daCurva = marcadores ? refraoDaCurva(marcadores, duracaoS) : null;
  return daCurva != null ? { inicioS: daCurva, daCurva: true } : { inicioS: estimativaDoRefrao(duracaoS), daCurva: false };
}
