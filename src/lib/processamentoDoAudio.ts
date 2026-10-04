/**
 * Quanto tempo o processamento de um download prende o JavaScript (3/10).
 *
 * No iPhone cada música chega aos bocados a um `Uint8Array` em JavaScript e,
 * no fim, é convertida (Opus: WebM -> MP4), corrigida (AAC: o `mp4Fixer`) e
 * escrita no disco -- tudo síncrono, na mesma thread que trata os toques e os
 * gestos. A auditoria de 3/10 desconfiou que isto coincide com o skip e é
 * parte dos "trava e dá snap". Antes de passar seja o que for para nativo,
 * mede-se: cada fase é síncrona, por isso o tempo dela É o tempo em que a app
 * não respondeu.
 *
 * Os tempos comparam-se, pela hora, com os travões da secção "JavaScript
 * stalls" do mesmo relatório (`lib/folegoDoJs.ts`).
 *
 * Sem imports: `scripts/test-processamento-do-audio.ts`.
 */

/** As fases síncronas, em milissegundos. */
export type Processamento = {
  /** Copiar cada bocado para o buffer final (somado ao longo do download). */
  juntarMs: number;
  /** WebM -> MP4 (só Opus). */
  converterMs: number;
  /** O `mp4Fixer` (só AAC). */
  corrigirMs: number;
  /** Criar, escrever e promover o ficheiro. */
  escreverMs: number;
  /**
   * Feito pelo módulo nativo (4/10, `modules/duotone-download`): os bytes não
   * passaram pelo JavaScript, e a conversão do Opus correu no Swift. Os campos
   * de cima continuam a ser só o tempo em que o JavaScript esteve preso.
   */
  nativo?: boolean;
  /** O que correu fora do JavaScript (a conversão no Swift), em ms. */
  foraMs?: number;
};

export function processamentoVazio(): Processamento {
  return { juntarMs: 0, converterMs: 0, corrigirMs: 0, escreverMs: 0 };
}

/**
 * O que prende de uma vez. O juntar fica de fora: são muitas cópias pequenas
 * (uma por bocado de ~1 MB), espalhadas pelo download, e nenhuma é um travão.
 */
export function maiorBloqueio(p: Processamento): number {
  return p.converterMs + p.corrigirMs + p.escreverMs;
}

/** Uma linha do relatório. */
export type MedidaDoProcessamento = Processamento & {
  em: number;
  bytes: number;
  formato: 'aac' | 'opus';
  prioridade: string;
  /** A app estava à frente: com ela escondida não há toques para atrasar. */
  aFrente: boolean;
};

export const MAXIMO_DE_MEDIDAS = 20;

/** Sem mudar a lista que recebe; as mais antigas saem primeiro. */
export function juntarMedida(
  lista: readonly MedidaDoProcessamento[], nova: MedidaDoProcessamento,
): MedidaDoProcessamento[] {
  return [...lista, nova].slice(-MAXIMO_DE_MEDIDAS);
}

/** Acima disto um toque já se sente atrasado (o mesmo de `TRAVAO_MINIMO_MS`). */
export const BLOQUEIO_QUE_SE_SENTE_MS = 100;

const ms = (n: number) => `${Math.round(n)} ms`;
const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;
const hora = (em: number) => new Date(em).toISOString().slice(11, 19);

function mediana(valores: number[]): number {
  const v = [...valores].sort((a, b) => a - b);
  if (!v.length) return 0;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

export function textoDoProcessamento(lista: readonly MedidaDoProcessamento[]): string {
  const titulo = '--- audio processing on the JavaScript thread (taps and gestures wait), oldest first ---';
  if (!lista.length) return `${titulo}\nNo downloads finished this session.`;
  const linhas = lista.map((m) => {
    const fases = [
      m.formato === 'opus' ? `convert ${ms(m.converterMs)}` : `fix ${ms(m.corrigirMs)}`,
      `write ${ms(m.escreverMs)}`,
      `join ${ms(m.juntarMs)}`,
      ...(m.nativo ? [`native ${ms(m.foraMs ?? 0)} off the JS thread`] : []),
    ].join(' · ');
    const onde = `${m.prioridade}${m.aFrente ? '' : ', app hidden'}${m.nativo ? ', native' : ''}`;
    return `[${hora(m.em)}] ${mb(m.bytes)} ${m.formato} (${onde}): ${fases} -> blocked ${ms(maiorBloqueio(m))}`;
  });
  const aFrente = lista.filter((m) => m.aFrente);
  const blocos = aFrente.map(maiorBloqueio);
  const pior = aFrente.reduce<MedidaDoProcessamento | null>(
    (a, m) => (!a || maiorBloqueio(m) > maiorBloqueio(a) ? m : a), null);
  const sentidos = blocos.filter((b) => b >= BLOQUEIO_QUE_SE_SENTE_MS).length;
  const resumo = pior
    ? `With the app open: ${aFrente.length} downloads, median ${ms(mediana(blocos))}, worst ${ms(maiorBloqueio(pior))}`
      + ` (${mb(pior.bytes)} ${pior.formato}); ${sentidos} of ${aFrente.length} at ${BLOQUEIO_QUE_SE_SENTE_MS} ms or more.`
    : 'All downloads finished with the app hidden.';
  return [titulo, ...linhas, resumo].join('\n');
}
