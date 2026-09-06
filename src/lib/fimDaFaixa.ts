/**
 * Onde é que a música acaba mesmo, que raramente é onde o ficheiro acaba.
 *
 * O crossfade de hoje conta para trás a partir do fim do ficheiro. Numa faixa
 * que termina com três segundos de silêncio, ou com um fade gravado, isso
 * cruza a faixa seguinte com o nada -- ouve-se um buraco onde devia haver
 * passagem.
 *
 * O que a pesquisa deu, e que decidiu este desenho:
 *
 * - O `silencedetect` do ffmpeg compara amostra a amostra contra -60 dBFS, em
 *   PICO. Aqui não serve: o nosso áudio é AAC do YouTube, e em compressão com
 *   perdas o silêncio não é zero -- tem ruído de codificação. Um limiar assim
 *   pode nunca disparar. Por isso medimos RMS em blocos, não picos.
 * - A EBU R128 usa DOIS portões: um absoluto, para matar ruído de fundo, e um
 *   RELATIVO à loudness do próprio programa. É esse o que interessa: a app já
 *   mede e guarda a loudness de cada faixa, por isso não temos de adivinhar um
 *   limiar absoluto que sirva para uma faixa esmagada e para uma gravação
 *   antiga ao mesmo tempo.
 *
 * O portão relativo é também o que apanha um FADE GRAVADO -- que não é
 * silêncio, mas já não é música. Um limiar absoluto deixa-o passar inteiro.
 *
 * Funções puras -- ver scripts/test-fim-da-faixa.ts.
 */

/** Ruído de codificação vive por baixo disto. Abaixo é sempre "nada". */
const CHAO_ABSOLUTO_DBFS = -55;

/**
 * Quanto abaixo da loudness da faixa deixa de ser música.
 *
 * A R128 usa -10 LU para EXCLUIR blocos de uma medição, o que é agressivo de
 * mais para dizer "acabou": passagens calmas dentro de uma música andam nessa
 * zona. -20 dB é o ponto onde já não se está a ouvir a canção.
 */
const ABAIXO_DA_LOUDNESS_DB = 20;

/** Silêncio a sério tem de durar: um intervalo entre frases não conta. */
const BLOCOS_VAZIOS_MINIMOS = 2;

/** Menos do que isto no fim não vale a pena tratar como cauda morta. */
const CAUDA_MINIMA_SEGUNDOS = 1;

export interface CaudaDaFaixa {
  /** Níveis RMS em dBFS, por ordem, todos da mesma duração. */
  blocos: readonly number[];
  segundosPorBloco: number;
  /** Onde o primeiro bloco começa, em segundos desde o início da faixa. */
  inicioSegundos: number;
  /** Loudness medida da faixa, em dB. Sem ela fica só o portão absoluto. */
  loudnessDb: number | null;
  duracaoSegundos: number;
}

/** O limiar efectivo: o mais exigente dos dois portões. */
export function limiarDeSilencio(loudnessDb: number | null): number {
  if (loudnessDb === null || !Number.isFinite(loudnessDb)) return CHAO_ABSOLUTO_DBFS;
  return Math.max(CHAO_ABSOLUTO_DBFS, loudnessDb - ABAIXO_DA_LOUDNESS_DB);
}

/**
 * O instante em que a música acaba, ou `null` para "usa o fim do ficheiro".
 *
 * Devolve null de propósito em tudo o que for duvidoso: sem cauda morta que
 * chegue, com a cauda toda vazia (medição em que não se confia), ou sem
 * blocos. Um crossfade que começa cedo de mais corta a música; o
 * comportamento de hoje, que é contar do fim, nunca é pior do que isso.
 */
export function fimMusicalDaFaixa(cauda: CaudaDaFaixa): number | null {
  const { blocos, segundosPorBloco, inicioSegundos, duracaoSegundos } = cauda;
  if (!blocos.length || !(segundosPorBloco > 0)) return null;

  const limiar = limiarDeSilencio(cauda.loudnessDb);
  const vazio = (n: number) => !Number.isFinite(n) || n < limiar;

  // Quantos blocos vazios seguidos há no fim.
  let vaziosNoFim = 0;
  for (let i = blocos.length - 1; i >= 0 && vazio(blocos[i]!); i--) vaziosNoFim++;

  if (vaziosNoFim < BLOCOS_VAZIOS_MINIMOS) return null;
  // Cauda toda vazia: ou a faixa é silêncio, ou a medição falhou. Não se
  // adivinha em cima de uma medição que não se percebe.
  if (vaziosNoFim === blocos.length) return null;

  const fim = inicioSegundos + (blocos.length - vaziosNoFim) * segundosPorBloco;
  if (!(duracaoSegundos - fim >= CAUDA_MINIMA_SEGUNDOS)) return null;
  // Nunca antes do início da cauda nem depois do fim do ficheiro.
  return Math.min(Math.max(fim, inicioSegundos), duracaoSegundos);
}
