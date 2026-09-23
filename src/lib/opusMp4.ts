/**
 * Escrever os pacotes Opus num MP4 fragmentado -- entrega 3 do
 * docs/PLANO-AUDIO-IOS-CACHE-OPUS.md. O outro lado é o `lib/webmOpus.ts`.
 *
 * O layout copia o do muxer do ffmpeg (`-movflags
 * +frag_keyframe+empty_moov+default_base_moof`), que é o do ficheiro de ensaio
 * `assets/ensaio-opus/opus-fmp4.m4a`: `ftyp`, um `moov` sem amostras, e
 * fragmentos `moof` + `mdat`. Duas diferenças de propósito:
 *
 * - **mvhd/tkhd/mdhd com a duração a ZERO**, e sem `mehd`. É a lição do
 *   `lib/mp4Fixer.ts`: o AVPlayer soma a duração do `moov` à dos fragmentos, e
 *   o ecrã bloqueado mostrava o dobro. A duração vem só dos fragmentos.
 * - **Vários fragmentos** (`PACOTES_POR_FRAGMENTO`), e não um só: um `trun`
 *   de uma música inteira são dezenas de KB antes do primeiro byte de áudio.
 *
 * Não se passa isto pelo `mp4Fixer`: ele neutraliza o `edts`, e aqui não se
 * escreve nenhum -- o pre-skip vai no `dOps`, como faz o ffmpeg.
 *
 * Sem imports de runtime (só tipos): testado em Node puro.
 */
import type { CabecalhoOpus, PacoteOpus } from './webmOpus';

export const TAXA_OPUS = 48_000;
/** ~5 s de áudio a 20 ms por pacote. */
export const PACOTES_POR_FRAGMENTO = 250;

class Escritor {
  private partes: Uint8Array[] = [];
  tamanho = 0;
  bytes(b: Uint8Array | number[]) {
    const u = b instanceof Uint8Array ? b : Uint8Array.from(b);
    this.partes.push(u);
    this.tamanho += u.length;
  }
  u8(v: number) { this.bytes([v & 0xff]); }
  u16(v: number) { this.bytes([(v >> 8) & 0xff, v & 0xff]); }
  u32(v: number) { this.bytes([(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]); }
  u64(v: number) {
    if (!Number.isSafeInteger(v) || v < 0) throw new Error('u64 fora do intervalo');
    this.u32(Math.floor(v / 2 ** 32));
    this.u32(v % 2 ** 32);
  }
  texto(s: string) { this.bytes(Array.from(s, (c) => c.charCodeAt(0))); }
  zeros(n: number) { this.bytes(new Uint8Array(n)); }
  juntar(): Uint8Array {
    const out = new Uint8Array(this.tamanho);
    let o = 0;
    for (const p of this.partes) { out.set(p, o); o += p.length; }
    return out;
  }
}

/** Uma caixa: tamanho + tipo + o que o corpo escrever. */
function caixa(tipo: string, corpo: (e: Escritor) => void): Uint8Array {
  const dentro = new Escritor();
  corpo(dentro);
  const e = new Escritor();
  e.u32(8 + dentro.tamanho);
  e.texto(tipo);
  e.bytes(dentro.juntar());
  return e.juntar();
}

/** Caixa "full" (versão + flags). */
function caixaFull(tipo: string, versao: number, flags: number, corpo: (e: Escritor) => void): Uint8Array {
  return caixa(tipo, (e) => {
    e.u8(versao);
    e.bytes([(flags >> 16) & 0xff, (flags >> 8) & 0xff, flags & 0xff]);
    corpo(e);
  });
}

const MATRIZ = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000];

/** O `dOps` (Opus in ISOBMFF, §4.3.2): o OpusHead em big-endian, sem a magia. */
function dOps(c: CabecalhoOpus): Uint8Array {
  return caixa('dOps', (e) => {
    e.u8(0); // Version
    e.u8(c.canais);
    e.u16(c.preSkip);
    e.u32(c.taxaDeEntrada);
    e.u16(c.ganhoDeSaida & 0xffff);
    e.u8(0); // ChannelMappingFamily: só a 0 (ver lerOpusHead)
  });
}

function inicio(c: CabecalhoOpus, kbps: number): Uint8Array {
  const ftyp = caixa('ftyp', (e) => { e.texto('iso5'); e.u32(512); e.texto('iso5iso6mp41'); });
  const mvhd = caixaFull('mvhd', 0, 0, (e) => {
    e.u32(0); e.u32(0); // criação, modificação
    e.u32(1000); // timescale
    e.u32(0); // duração: ZERO, de propósito (ver o topo)
    e.u32(0x00010000); e.u16(0x0100); e.zeros(10);
    for (const m of MATRIZ) e.u32(m);
    e.zeros(24);
    e.u32(2); // próximo track id
  });
  const tkhd = caixaFull('tkhd', 0, 3, (e) => {
    e.u32(0); e.u32(0); e.u32(1); e.u32(0);
    e.u32(0); // duração: ZERO
    e.zeros(8); e.u16(0); e.u16(0); e.u16(0x0100); e.u16(0);
    for (const m of MATRIZ) e.u32(m);
    e.u32(0); e.u32(0);
  });
  const mdhd = caixaFull('mdhd', 0, 0, (e) => {
    e.u32(0); e.u32(0); e.u32(TAXA_OPUS);
    e.u32(0); // duração: ZERO
    e.u16(0x55c4); // 'und'
    e.u16(0);
  });
  const hdlr = caixaFull('hdlr', 0, 0, (e) => { e.u32(0); e.texto('soun'); e.zeros(12); e.texto('SoundHandler'); e.u8(0); });
  const smhd = caixaFull('smhd', 0, 0, (e) => { e.u16(0); e.u16(0); });
  const dinf = caixa('dinf', (e) => e.bytes(caixaFull('dref', 0, 0, (d) => { d.u32(1); d.bytes(caixaFull('url ', 0, 1, () => {})); })));
  const bitrate = Math.max(0, Math.round(kbps * 1000));
  const entrada = caixa('Opus', (e) => {
    e.zeros(6); e.u16(1); // reservado + data reference index
    e.zeros(8);
    e.u16(c.canais); e.u16(16); e.u16(0); e.u16(0);
    e.u32(TAXA_OPUS * 65536);
    e.bytes(dOps(c));
    e.bytes(caixa('btrt', (b) => { b.u32(0); b.u32(bitrate); b.u32(bitrate); }));
  });
  const stsd = caixaFull('stsd', 0, 0, (e) => { e.u32(1); e.bytes(entrada); });
  const vazia = (tipo: string) => caixaFull(tipo, 0, 0, (e) => e.u32(0));
  const stbl = caixa('stbl', (e) => {
    e.bytes(stsd); e.bytes(vazia('stts')); e.bytes(vazia('stsc'));
    e.bytes(caixaFull('stsz', 0, 0, (s) => { s.u32(0); s.u32(0); }));
    e.bytes(vazia('stco'));
  });
  const minf = caixa('minf', (e) => { e.bytes(smhd); e.bytes(dinf); e.bytes(stbl); });
  const mdia = caixa('mdia', (e) => { e.bytes(mdhd); e.bytes(hdlr); e.bytes(minf); });
  const trak = caixa('trak', (e) => { e.bytes(tkhd); e.bytes(mdia); });
  const mvex = caixa('mvex', (e) => e.bytes(caixaFull('trex', 0, 0, (t) => { t.u32(1); t.u32(1); t.u32(0); t.u32(0); t.u32(0); })));
  const moov = caixa('moov', (e) => { e.bytes(mvhd); e.bytes(trak); e.bytes(mvex); });
  const e = new Escritor();
  e.bytes(ftyp);
  e.bytes(moov);
  return e.juntar();
}

/** O `moof` de um fragmento; o `mdat` que o segue escreve-se à parte, direto no ficheiro final. */
function moofDoFragmento(sequencia: number, inicioEmAmostras: number, pacotes: readonly PacoteOpus[]): Uint8Array {
  const moofCom = (offset: number) => caixa('moof', (e) => {
    e.bytes(caixaFull('mfhd', 0, 0, (m) => m.u32(sequencia)));
    e.bytes(caixa('traf', (t) => {
      // default-base-is-moof + default-sample-flags (todas as amostras de áudio são "sync").
      t.bytes(caixaFull('tfhd', 0, 0x020020, (h) => { h.u32(1); h.u32(0x02000000); }));
      t.bytes(caixaFull('tfdt', 1, 0, (d) => d.u64(inicioEmAmostras)));
      // data-offset + sample-duration + sample-size
      t.bytes(caixaFull('trun', 0, 0x000301, (r) => {
        r.u32(pacotes.length);
        r.u32(offset);
        for (const p of pacotes) { r.u32(p.amostras); r.u32(p.dados.length); }
      }));
    }));
  });
  // O offset é do início do moof ao primeiro byte de áudio: o moof inteiro
  // mais o cabeçalho do mdat. O tamanho do moof não depende do valor do offset.
  const moof = moofCom(0);
  return moofCom(moof.length + 8);
}

/**
 * O MP4 inteiro. `kbps` só vai para o `btrt` (informativo).
 *
 * O áudio é copiado UMA vez, direto para o ficheiro final: os tamanhos saem
 * todos antes (os moof são pequenos), e só depois se escreve. Juntar
 * fragmentos já montados dava três cópias do áudio em memória ao mesmo tempo
 * -- numa mistura de uma hora, o WebM, os fragmentos e o ficheiro final.
 */
export function escreverOpusMp4(
  cabecalho: CabecalhoOpus,
  pacotes: readonly PacoteOpus[],
  kbps = 0,
  porFragmento: number = PACOTES_POR_FRAGMENTO,
): Uint8Array {
  if (pacotes.length === 0) throw new Error('Sem pacotes Opus');
  const cabeca = inicio(cabecalho, kbps);
  const fragmentos: { moof: Uint8Array; de: number; ate: number; dados: number }[] = [];
  let decorrido = 0;
  let sequencia = 1;
  let total = cabeca.length;
  for (let i = 0; i < pacotes.length; i += porFragmento) {
    const ate = Math.min(pacotes.length, i + porFragmento);
    const lote = pacotes.slice(i, ate);
    const moof = moofDoFragmento(sequencia++, decorrido, lote);
    let dados = 0;
    for (const p of lote) { decorrido += p.amostras; dados += p.dados.length; }
    fragmentos.push({ moof, de: i, ate, dados });
    total += moof.length + 8 + dados;
  }
  const out = new Uint8Array(total);
  out.set(cabeca, 0);
  let o = cabeca.length;
  for (const f of fragmentos) {
    out.set(f.moof, o);
    o += f.moof.length;
    const tam = 8 + f.dados;
    out[o] = (tam >>> 24) & 0xff; out[o + 1] = (tam >>> 16) & 0xff; out[o + 2] = (tam >>> 8) & 0xff; out[o + 3] = tam & 0xff;
    out[o + 4] = 0x6d; out[o + 5] = 0x64; out[o + 6] = 0x61; out[o + 7] = 0x74; // 'mdat'
    o += 8;
    for (let k = f.de; k < f.ate; k++) { out.set(pacotes[k].dados, o); o += pacotes[k].dados.length; }
  }
  return out;
}
