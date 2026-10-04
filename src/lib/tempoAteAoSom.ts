/**
 * Quanto tempo passa entre pedir uma música e ouvi-la, e ONDE se perde (27/9).
 *
 * A primeira de quatro melhorias para competir com o Spotify: "nenhum skip
 * espera". Antes de mexer no motor, mede-se -- o `primeira_nota` já ia para a
 * analítica, mas só com o total e a origem, e não se via no aparelho. Aqui
 * guardam-se as últimas faixas com as fases:
 *
 * - `resolver`: pedir ao YouTube o endereço do áudio;
 * - `fila`: esperar pela vaga de download (só há uma: ver `filaDeDownloads`);
 * - `download`: descarregar o ficheiro inteiro;
 * - o resto até ao total é o motor a abrir o ficheiro e a começar.
 *
 * `cache` quer dizer que a faixa já estava no telemóvel: foi o Smart Cache (ou
 * um download antigo) que a deixou pronta, e o skip foi instantâneo.
 *
 * Sem imports: `scripts/test-tempo-ate-ao-som.ts`.
 */

/** Até aqui conta como instantâneo: o polegar ainda está a sair do ecrã. */
export const INSTANTANEO_MS = 700;
/** Quantas faixas se guardam para o relatório. */
export const ULTIMAS = 25;

export type Arranque = {
  titulo: string;
  origem: string;
  totalMs: number;
  resolverMs: number | null;
  filaMs: number | null;
  downloadMs: number | null;
  mb: number | null;
  /** O download foi começado pelo Smart Cache antes de a faixa ser pedida. */
  comecadaAntes?: boolean;
  em: number;
};

/** Junta à frente e corta às `ULTIMAS`. */
export function juntarArranque(lista: readonly Arranque[], novo: Arranque): Arranque[] {
  return [novo, ...lista].slice(0, ULTIMAS);
}

function percentil(valores: readonly number[], p: number): number {
  if (!valores.length) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const i = Math.min(ordenados.length - 1, Math.max(0, Math.ceil((p / 100) * ordenados.length) - 1));
  return ordenados[i];
}

export type Resumo = {
  faixas: number;
  medianaMs: number;
  p90Ms: number;
  instantaneas: number;
  /** A fase que, somada, mais tempo levou nas faixas que não vieram da cache. */
  faseMaisLenta: 'resolver' | 'fila' | 'download' | 'motor' | null;
};

export function resumir(lista: readonly Arranque[]): Resumo {
  const totais = lista.map((a) => a.totalMs);
  const lentas = lista.filter((a) => a.origem !== 'cache');
  const soma = { resolver: 0, fila: 0, download: 0, motor: 0 };
  for (const a of lentas) {
    const r = a.resolverMs ?? 0, f = a.filaMs ?? 0, d = a.downloadMs ?? 0;
    soma.resolver += r;
    soma.fila += f;
    soma.download += d;
    soma.motor += Math.max(0, a.totalMs - r - f - d);
  }
  const fases = Object.entries(soma).sort((x, y) => y[1] - x[1]);
  return {
    faixas: lista.length,
    medianaMs: percentil(totais, 50),
    p90Ms: percentil(totais, 90),
    instantaneas: totais.filter((t) => t <= INSTANTANEO_MS).length,
    faseMaisLenta: lentas.length && fases[0][1] > 0 ? (fases[0][0] as Resumo['faseMaisLenta']) : null,
  };
}

const s = (ms: number | null) => (ms === null ? '-' : `${(ms / 1000).toFixed(1)}s`);

/** A secção do relatório de reprodução. */
export function textoDoTempoAteAoSom(lista: readonly Arranque[]): string {
  // Medido no primeiro avanço da posição, que chega de segundo a segundo:
  // cada tempo pode passar do real até 1 s (revisão do Codex). Os que
  // falharam e as passagens do crossfade não entram.
  const linhas = ['== time to first sound ==', '(from the engine position at its first update, so the time between updates does not count; failed starts and crossfades are not included)'];
  if (!lista.length) {
    linhas.push('no songs measured yet (play and skip a few songs, then save the report)');
    return linhas.join('\n');
  }
  const r = resumir(lista);
  linhas.push(`last ${r.faixas}: median ${s(r.medianaMs)}, 90% under ${s(r.p90Ms)}, instant (<=${INSTANTANEO_MS} ms) ${r.instantaneas}/${r.faixas}`);
  if (r.faseMaisLenta) linhas.push(`slowest part when not ready: ${r.faseMaisLenta}`);
  for (const a of lista) {
    const quando = new Date(a.em).toISOString().slice(11, 19);
    const partes = a.origem === 'cache'
      ? 'already on the phone'
      : `resolve ${s(a.resolverMs)}, queue ${s(a.filaMs)}, download ${s(a.downloadMs)}${a.mb !== null ? ` (${a.mb} MB)` : ''}${a.comecadaAntes ? ', started early by Smart Cache' : ''}`;
    linhas.push(`  ${quando} ${s(a.totalMs)} [${a.origem}] ${a.titulo.slice(0, 40)} -- ${partes}`);
  }
  return linhas.join('\n');
}
