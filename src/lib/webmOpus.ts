/**
 * Ler o Opus de dentro de um WebM (o itag 251 do YouTube) -- entrega 3 do
 * docs/PLANO-AUDIO-IOS-CACHE-OPUS.md.
 *
 * O AVPlayer não abre WebM. O que se quer é tirar de lá os pacotes Opus TAL
 * COMO ESTÃO (sem descodificar nem recodificar) para os pôr num MP4 -- ver
 * `lib/opusMp4.ts`. Aqui só se lê: o cabeçalho do Opus (o `OpusHead` que o
 * Matroska guarda no CodecPrivate) e os pacotes, pela ordem, com o número de
 * amostras de cada um.
 *
 * O que se aceita, e o que se recusa (atirando -- quem chama volta ao AAC):
 * - uma só faixa de áudio `A_OPUS`, mono ou estéreo, mapping family 0;
 * - SimpleBlock e BlockGroup/Block, com lacing nenhum, Xiph, fixo ou EBML;
 * - elementos com tamanho desconhecido (Segment e Cluster).
 * A duração de cada pacote sai do TOC do próprio pacote (RFC 6716, §3.1), e
 * não se assume 20 ms: o YouTube usa 20 ms, mas nada o garante.
 *
 * Sem imports de runtime: testado em Node puro (`scripts/test-webm-opus.ts`).
 */

const ID = {
  EBML: 0x1a45dfa3,
  Segment: 0x18538067,
  Info: 0x1549a966,
  TimestampScale: 0x2ad7b1,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackNumber: 0xd7,
  TrackType: 0x83,
  CodecID: 0x86,
  CodecPrivate: 0x63a2,
  CodecDelay: 0x56aa,
  Audio: 0xe1,
  Channels: 0x9f,
  Cluster: 0x1f43b675,
  Timestamp: 0xe7,
  SimpleBlock: 0xa3,
  BlockGroup: 0xa0,
  Block: 0xa1,
} as const;

/** Os filhos directos do Segment: um Cluster de tamanho desconhecido acaba no primeiro destes. */
const DO_SEGMENTO = new Set([0x114d9b74, ID.Info, ID.Tracks, ID.Cluster, 0x1c53bb6b, 0x1941a469, 0x1043a770, 0x1254c367]);

const TAMANHO_DESCONHECIDO = -1;
/** Um pacote Opus nunca passa de 120 ms; mais do que isto é um ficheiro estragado. */
const MAX_AMOSTRAS_POR_PACOTE = 5760;

export const OPUS_INVALIDO = 'WebM/Opus inválido';

export interface CabecalhoOpus {
  canais: number;
  /** Amostras a 48 kHz a deitar fora no início (o "pre-skip" do encoder). */
  preSkip: number;
  taxaDeEntrada: number;
  /** Q7.8 em dB, como vem no OpusHead. */
  ganhoDeSaida: number;
}

export interface PacoteOpus {
  /** Uma vista sobre o ficheiro original, sem cópia. */
  dados: Uint8Array;
  amostras: number;
}

export interface OpusDoWebm {
  cabecalho: CabecalhoOpus;
  pacotes: PacoteOpus[];
  /** Soma das amostras de todos os pacotes (com o pre-skip). */
  amostras: number;
}

function falhar(motivo: string): never {
  throw new Error(`${OPUS_INVALIDO}: ${motivo}`);
}

/** Um VINT (RFC 8794): o ID fica com o marcador, o tamanho sem ele. */
function lerVint(b: Uint8Array, o: number, comMarcador: boolean): { valor: number; bytes: number } {
  if (o >= b.length) falhar('fim inesperado');
  const primeiro = b[o];
  let n = 1;
  while (n <= 8 && !(primeiro & (0x80 >> (n - 1)))) n++;
  if (n > 8) falhar('VINT sem marcador');
  if (o + n > b.length) falhar('VINT cortado');
  let valor = comMarcador ? primeiro : primeiro & (0xff >> n);
  let tudoUns = (primeiro & (0xff >> n)) === 0xff >> n;
  for (let i = 1; i < n; i++) {
    valor = valor * 256 + b[o + i];
    if (b[o + i] !== 0xff) tudoUns = false;
  }
  if (!comMarcador && tudoUns) return { valor: TAMANHO_DESCONHECIDO, bytes: n };
  if (!Number.isSafeInteger(valor)) falhar('VINT demasiado grande');
  return { valor, bytes: n };
}

interface Elemento {
  id: number;
  dados: number;
  /** Onde acaba; `TAMANHO_DESCONHECIDO` fica resolvido pelo chamador. */
  fim: number;
  desconhecido: boolean;
}

function lerElemento(b: Uint8Array, o: number, limite: number): Elemento {
  const id = lerVint(b, o, true);
  const tam = lerVint(b, o + id.bytes, false);
  const dados = o + id.bytes + tam.bytes;
  if (tam.valor === TAMANHO_DESCONHECIDO) return { id: id.valor, dados, fim: limite, desconhecido: true };
  const fim = dados + tam.valor;
  if (fim > limite) falhar(`elemento 0x${id.valor.toString(16)} passa do fim`);
  return { id: id.valor, dados, fim, desconhecido: false };
}

function lerUint(b: Uint8Array, de: number, ate: number): number {
  if (ate - de > 7) falhar('inteiro demasiado grande');
  let v = 0;
  for (let i = de; i < ate; i++) v = v * 256 + b[i];
  return v;
}

/** Amostras (a 48 kHz) de um pacote, pelo TOC. RFC 6716, §3.1. */
export function amostrasDoPacote(p: Uint8Array): number {
  if (p.length < 1) falhar('pacote vazio');
  const toc = p[0];
  const config = toc >> 3;
  let porTrama: number;
  if (config < 12) porTrama = [480, 960, 1920, 2880][config & 3];
  else if (config < 16) porTrama = [480, 960][config & 1];
  else porTrama = [120, 240, 480, 960][config & 3];
  const codigo = toc & 3;
  let tramas: number;
  if (codigo === 0) tramas = 1;
  else if (codigo === 1 || codigo === 2) tramas = 2;
  else {
    if (p.length < 2) falhar('pacote de código 3 sem contagem');
    tramas = p[1] & 0x3f;
    if (tramas === 0) falhar('pacote sem tramas');
  }
  const total = porTrama * tramas;
  if (total > MAX_AMOSTRAS_POR_PACOTE) falhar('pacote com mais de 120 ms');
  return total;
}

/** Os pacotes de um bloco, desfeito o lacing. */
export function pacotesDoBloco(b: Uint8Array, de: number, ate: number): { pista: number; pacotes: Uint8Array[] } {
  const pista = lerVint(b, de, false);
  let o = de + pista.bytes + 2; // + timestamp relativo (int16)
  if (o >= ate) falhar('bloco cortado');
  const flags = b[o++];
  const lacing = (flags >> 1) & 3;
  if (lacing === 0) return { pista: pista.valor, pacotes: [b.subarray(o, ate)] };

  const quantos = b[o++] + 1;
  const tamanhos: number[] = [];
  if (lacing === 1) {
    // Xiph: cada tamanho é uma soma de bytes até um que não seja 255.
    for (let i = 0; i < quantos - 1; i++) {
      let t = 0;
      for (;;) {
        if (o >= ate) falhar('lacing Xiph cortado');
        const v = b[o++];
        t += v;
        if (v !== 255) break;
      }
      tamanhos.push(t);
    }
  } else if (lacing === 3) {
    // EBML: o primeiro por inteiro, os outros como diferença com sinal.
    const primeiro = lerVint(b, o, false);
    o += primeiro.bytes;
    tamanhos.push(primeiro.valor);
    for (let i = 1; i < quantos - 1; i++) {
      const d = lerVint(b, o, false);
      o += d.bytes;
      const meio = 2 ** (7 * d.bytes - 1) - 1;
      const t = tamanhos[i - 1] + (d.valor - meio);
      if (t < 0) falhar('lacing EBML negativo');
      tamanhos.push(t);
    }
  } else {
    // Fixo: todos iguais.
    const resto = ate - o;
    if (resto % quantos !== 0) falhar('lacing fixo desigual');
    for (let i = 0; i < quantos - 1; i++) tamanhos.push(resto / quantos);
  }
  const pacotes: Uint8Array[] = [];
  for (const t of tamanhos) {
    if (o + t > ate) falhar('lacing passa do bloco');
    pacotes.push(b.subarray(o, o + t));
    o += t;
  }
  if (o > ate) falhar('lacing passa do bloco');
  pacotes.push(b.subarray(o, ate));
  return { pista: pista.valor, pacotes };
}

/** O `OpusHead` do CodecPrivate. Só mapping family 0 (mono/estéreo). */
export function lerOpusHead(p: Uint8Array): CabecalhoOpus {
  if (p.length < 19) falhar('OpusHead curto');
  const magia = String.fromCharCode(...p.subarray(0, 8));
  if (magia !== 'OpusHead') falhar('sem OpusHead');
  if ((p[8] & 0xf0) !== 0) falhar(`OpusHead versão ${p[8]}`);
  const canais = p[9];
  const familia = p[18];
  if (familia !== 0 || canais < 1 || canais > 2) falhar(`mapping family ${familia} com ${canais} canais`);
  const ganho = p[16] | (p[17] << 8);
  return {
    canais,
    preSkip: p[10] | (p[11] << 8),
    taxaDeEntrada: (p[12] | (p[13] << 8) | (p[14] << 16) | (p[15] << 24)) >>> 0,
    ganhoDeSaida: ganho >= 0x8000 ? ganho - 0x10000 : ganho,
  };
}

/** Lê o ficheiro inteiro. Atira `OPUS_INVALIDO` se não for o que se aceita. */
export function lerWebmOpus(b: Uint8Array): OpusDoWebm {
  if (!pareceWebm(b)) falhar('não é EBML');
  let o = 0;
  const ebml = lerElemento(b, o, b.length);
  if (ebml.id !== ID.EBML) falhar('não é EBML');
  o = ebml.fim;
  // Pode haver lixo (Void) entre o cabeçalho e o Segment.
  let segmento: Elemento | null = null;
  while (o < b.length) {
    const e = lerElemento(b, o, b.length);
    if (e.id === ID.Segment) { segmento = e; break; }
    o = e.fim;
  }
  if (!segmento) falhar('sem Segment');

  let cabecalho: CabecalhoOpus | null = null;
  let pistaOpus: number | null = null;
  const pacotes: PacoteOpus[] = [];
  let amostras = 0;

  const guardarBloco = (de: number, ate: number) => {
    if (pistaOpus === null) falhar('bloco antes das Tracks');
    const { pista, pacotes: ps } = pacotesDoBloco(b, de, ate);
    if (pista !== pistaOpus) return;
    for (const dados of ps) {
      const n = amostrasDoPacote(dados);
      pacotes.push({ dados, amostras: n });
      amostras += n;
    }
  };

  const lerTracks = (de: number, ate: number) => {
    for (let p = de; p < ate;) {
      const e = lerElemento(b, p, ate);
      if (e.id === ID.TrackEntry) {
        let numero: number | null = null;
        let codec = '';
        let privado: Uint8Array | null = null;
        for (let q = e.dados; q < e.fim;) {
          const f = lerElemento(b, q, e.fim);
          if (f.id === ID.TrackNumber) numero = lerUint(b, f.dados, f.fim);
          else if (f.id === ID.CodecID) codec = String.fromCharCode(...b.subarray(f.dados, f.fim)).replace(/\0+$/, '');
          else if (f.id === ID.CodecPrivate) privado = b.subarray(f.dados, f.fim);
          q = f.fim;
        }
        if (codec === 'A_OPUS') {
          if (pistaOpus !== null) falhar('mais do que uma faixa Opus');
          if (numero === null || !privado) falhar('faixa Opus sem número ou sem OpusHead');
          pistaOpus = numero;
          cabecalho = lerOpusHead(privado);
        }
      }
      p = e.fim;
    }
  };

  const lerCluster = (de: number, limite: number, desconhecido: boolean): number => {
    let p = de;
    while (p < limite) {
      const e = lerElemento(b, p, limite);
      if (desconhecido && DO_SEGMENTO.has(e.id)) return p;
      if (e.desconhecido) falhar('filho de Cluster com tamanho desconhecido');
      if (e.id === ID.SimpleBlock) guardarBloco(e.dados, e.fim);
      else if (e.id === ID.BlockGroup) {
        for (let q = e.dados; q < e.fim;) {
          const f = lerElemento(b, q, e.fim);
          if (f.id === ID.Block) guardarBloco(f.dados, f.fim);
          q = f.fim;
        }
      }
      p = e.fim;
    }
    return p;
  };

  const fimDoSegmento = segmento.fim;
  for (let p = segmento.dados; p < fimDoSegmento;) {
    const e = lerElemento(b, p, fimDoSegmento);
    if (e.id === ID.Tracks) lerTracks(e.dados, e.fim);
    if (e.id === ID.Cluster) {
      p = e.desconhecido ? lerCluster(e.dados, fimDoSegmento, true) : (lerCluster(e.dados, e.fim, false), e.fim);
      continue;
    }
    if (e.desconhecido) falhar(`0x${e.id.toString(16)} com tamanho desconhecido`);
    p = e.fim;
  }

  if (!cabecalho || pacotes.length === 0) falhar('sem faixa Opus ou sem pacotes');
  return { cabecalho, pacotes, amostras };
}

/** Os primeiros bytes são um cabeçalho EBML (WebM), e não um MP4? */
export function pareceWebm(b: Uint8Array): boolean {
  return b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
}
