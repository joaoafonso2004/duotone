/**
 * O mínimo de leitura de MP4 e CAF para o ensaio do Opus: o gerador usa-o para
 * pôr as durações a zero, o teste para conferir o que ficou escrito. Não é o
 * `mp4Fixer` da app de propósito -- ele neutraliza o `edts`, e no Opus a
 * edit list pode ser o que diz ao motor quantas amostras de pre-skip saltar
 * (ver o plano, secção 3).
 */

const CONTENTORES = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'mvex', 'moof', 'traf', 'edts', 'dinf']);

const u32 = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const tipo = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

/** Todas as caixas, em profundidade, com o caminho (`moov/trak/tkhd`). */
export function caixas(b, inicio = 0, fim = b.length, pai = '') {
  const out = [];
  let o = inicio;
  while (o + 8 <= fim) {
    let tam = u32(b, o);
    const t = tipo(b, o + 4);
    let cab = 8;
    if (tam === 1) { tam = Number((BigInt(u32(b, o + 8)) << 32n) + BigInt(u32(b, o + 12))); cab = 16; }
    if (tam === 0) tam = fim - o;
    if (tam < cab || o + tam > fim) throw new Error(`caixa ${t} fora do ficheiro em ${o}`);
    const caminho = pai ? `${pai}/${t}` : t;
    out.push({ tipo: t, caminho, inicio: o, cabecalho: cab, fim: o + tam });
    if (CONTENTORES.has(t)) out.push(...caixas(b, o + cab, o + tam, caminho));
    if (t === 'stsd') {
      // stsd: versão/flags (4) + contagem (4), depois as entradas.
      const entradas = caixas(b, o + cab + 8, o + tam, caminho);
      for (const e of entradas) {
        out.push(e);
        // Entrada de áudio: 28 bytes de campos antes das caixas-filhas (dOps, esds).
        out.push(...caixas(b, e.inicio + 8 + 28, e.fim, e.caminho));
      }
    }
    o += tam;
  }
  return out;
}

/** Onde vive a duração em cada uma, e com quantos bytes. */
function campoDaDuracao(b, c) {
  const versao = b[c.inicio + c.cabecalho];
  const corpo = c.inicio + c.cabecalho + 4;
  if (c.tipo === 'mvhd' || c.tipo === 'mdhd') return versao === 1 ? { o: corpo + 20, n: 8 } : { o: corpo + 12, n: 4 };
  if (c.tipo === 'tkhd') return versao === 1 ? { o: corpo + 24, n: 8 } : { o: corpo + 16, n: 4 };
  return null;
}

export function duracoes(b) {
  const out = {};
  for (const c of caixas(b)) {
    const campo = campoDaDuracao(b, c);
    if (!campo) continue;
    let v = 0;
    for (let i = 0; i < campo.n; i++) v = v * 256 + b[campo.o + i];
    out[c.tipo] = v;
  }
  return out;
}

/** mvhd/tkhd/mdhd a zero: a duração passa a vir só dos fragmentos. */
export function zerarDuracoes(b) {
  for (const c of caixas(b)) {
    const campo = campoDaDuracao(b, c);
    if (campo) b.fill(0, campo.o, campo.o + campo.n);
  }
}

/** As secções de um CAF (`desc`, `pakt`, `data`...), por ordem. */
export function seccoesCaf(b) {
  if (tipo(b, 0) !== 'caff') throw new Error('não é CAF');
  const out = [];
  let o = 8;
  while (o + 12 <= b.length) {
    const t = tipo(b, o);
    const alto = u32(b, o + 4);
    const baixo = u32(b, o + 8);
    let tam = alto * 2 ** 32 + baixo;
    if (alto === 0xffffffff && baixo === 0xffffffff) tam = b.length - o - 12;
    out.push({ tipo: t, inicio: o + 12, fim: o + 12 + tam });
    o += 12 + tam;
  }
  return out;
}

/** O formato do CAF: `mFormatID` da secção `desc`. */
export function formatoCaf(b) {
  const desc = seccoesCaf(b).find((s) => s.tipo === 'desc');
  return desc ? tipo(b, desc.inicio + 8) : null;
}
