/**
 * O fôlego do JavaScript (1/10): quanto tempo a app fica sem responder, e o
 * que estava a crescer quando ficou.
 *
 * Nasceu de o João dizer que, ao fim de algum tempo, carregar em pausa demora 1
 * a 2 s a parar a música E a mudar o botão -- e que acabada de abrir não. O
 * botão muda no mesmo instante em que o estado muda (`togglePlay` é síncrono),
 * por isso um atraso no botão quer dizer o JavaScript ocupado com outra coisa.
 * O MetricKit (modules/duotone-diagnostico) só vê a thread principal do iOS;
 * isto vê a do JavaScript.
 *
 * Como se mede: um temporizador pede para acordar daqui a meio segundo, e o
 * atraso com que acorda é o tempo em que o JavaScript esteve preso. Junta-se o
 * que pode estar a crescer -- há quanto tempo a app está aberta, o tamanho da
 * fila, quanto custa uma mudança no leitor chegar a todos, quantas linhas de
 * lista estão montadas, a memória e as recolhas de lixo do Hermes -- para o
 * relatório dizer o quê.
 *
 * Sem imports: `scripts/test-folego-do-js.ts`.
 */

/** Um travão: o JavaScript acordou este tempo depois do que devia. */
export type Travao = { em: number; ms: number; visivel: boolean };

/** Abaixo disto não se guarda: um fotograma perdido não é um travão. */
export const TRAVAO_MINIMO_MS = 100;
/** A partir disto sente-se num toque (o João: "1 ou 2 segundos"). */
export const TRAVAO_SENTIDO_MS = 500;
/** Os travões guardam-se durante isto, e no máximo `MAXIMO_DE_TRAVOES`. */
export const JANELA_MS = 15 * 60_000;
export const MAXIMO_DE_TRAVOES = 200;

/**
 * Junta um travão à lista (se o for), largando os velhos. Não muda a lista que
 * recebe, e sem nada a mudar devolve-a a ela: isto corre a cada meio segundo,
 * e não pode ser ele a fazer lixo para o Hermes recolher.
 */
export function registarTravao(lista: readonly Travao[], novo: Travao): readonly Travao[] {
  // A lista está por ordem: só há velhos se o primeiro o for.
  const recentes = lista.length && novo.em - lista[0].em > JANELA_MS
    ? lista.filter((t) => novo.em - t.em <= JANELA_MS)
    : lista;
  if (novo.ms < TRAVAO_MINIMO_MS) return recentes;
  return [...recentes, novo].slice(-MAXIMO_DE_TRAVOES);
}

export type ResumoDoFolego = {
  /** Travões na janela, com a app à frente. */
  travoes: number;
  /** Os que se sentem num toque. */
  sentidos: number;
  maiorMs: number;
  /** A soma do tempo preso, com a app à frente. */
  presoMs: number;
};

export function resumoDoFolego(lista: readonly Travao[]): ResumoDoFolego {
  const aFrente = lista.filter((t) => t.visivel);
  return {
    travoes: aFrente.length,
    sentidos: aFrente.filter((t) => t.ms >= TRAVAO_SENTIDO_MS).length,
    maiorMs: aFrente.reduce((m, t) => Math.max(m, t.ms), 0),
    presoMs: aFrente.reduce((s, t) => s + t.ms, 0),
  };
}

/** O que pode estar a crescer, lido na hora. `null` quando não se sabe. */
export type Contexto = {
  abertaHaMin: number;
  fila: number;
  /**
   * Quanto custa uma mudança no leitor chegar a todos os que o ouvem (uma
   * mudança vazia, medida na hora). Cada ecrã, linha e efeito que lê o leitor
   * corre o seu seletor a cada mudança -- e a posição muda várias vezes por
   * segundo. Se isto cresce com o tempo, há ouvintes a acumular.
   */
  avisoDoLeitorMs: number | null;
  linhasMontadas: number | null;
  heapMB: number | null;
  recolhas: number | null;
  recolhasMs: number | null;
};

/**
 * As estatísticas do Hermes, quando as há (`HermesInternal.getInstrumentedStats`).
 * Os nomes são os do Hermes; tudo o que não for número fica `null`.
 */
export function lerHermes(stats: unknown): Pick<Contexto, 'heapMB' | 'recolhas' | 'recolhasMs'> {
  const s = (stats ?? {}) as Record<string, unknown>;
  const n = (k: string) => (typeof s[k] === 'number' && Number.isFinite(s[k]) ? (s[k] as number) : null);
  const heap = n('js_heapSize');
  const gcTempo = n('js_gcTime');
  return {
    heapMB: heap === null ? null : Math.round(heap / 1_048_576),
    recolhas: n('js_numGCs'),
    // O Hermes dá o tempo de recolha em segundos.
    recolhasMs: gcTempo === null ? null : Math.round(gcTempo * 1000),
  };
}

const ou = (v: number | null, sufixo = '') => (v === null ? 'unknown' : `${v}${sufixo}`);

/** A secção do relatório de reprodução. Em inglês, como o resto do relatório. */
export function textoDoFolego(lista: readonly Travao[], c: Contexto, agora: number): string {
  const r = resumoDoFolego(lista);
  const linhas = ['== responsiveness (JavaScript, last 15 min with the app open) =='];
  linhas.push(`stalls: ${r.travoes} over ${TRAVAO_MINIMO_MS} ms, ${r.sentidos} over ${TRAVAO_SENTIDO_MS} ms, longest ${r.maiorMs} ms, ${r.presoMs} ms stuck in total`);
  linhas.push(`app open for ${c.abertaHaMin} min · queue ${c.fila} songs · list rows mounted ${ou(c.linhasMontadas)} · one player update reaches everyone in ${ou(c.avisoDoLeitorMs, ' ms')}`);
  linhas.push(`memory ${ou(c.heapMB, ' MB')} · garbage collections ${ou(c.recolhas)} (${ou(c.recolhasMs, ' ms')} in total)`);
  const piores = [...lista].filter((t) => t.ms >= TRAVAO_SENTIDO_MS).sort((a, b) => b.em - a.em).slice(0, 10);
  for (const t of piores) {
    const ha = Math.max(0, Math.round((agora - t.em) / 1000));
    linhas.push(`  ${t.ms} ms, ${ha} s ago${t.visivel ? '' : ' (in the background)'}`);
  }
  return linhas.join('\n');
}

/** Os números do evento `js_lento`: só números, como os outros eventos. */
export function dadosDoEventoLento(ms: number, c: Contexto): Record<string, number> {
  const d: Record<string, number> = { ms: Math.round(ms), aberta_min: c.abertaHaMin, fila: c.fila };
  if (c.avisoDoLeitorMs !== null) d.aviso_ms = c.avisoDoLeitorMs;
  if (c.linhasMontadas !== null) d.linhas = c.linhasMontadas;
  if (c.heapMB !== null) d.heap_mb = c.heapMB;
  if (c.recolhas !== null) d.gcs = c.recolhas;
  if (c.recolhasMs !== null) d.gc_ms = c.recolhasMs;
  return d;
}
