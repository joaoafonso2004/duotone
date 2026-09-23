/**
 * O conversor WebM/Opus → MP4 (src/lib/webmOpus.ts + src/lib/opusMp4.ts).
 *
 * Não basta o escritor ler o que ele próprio escreveu. A referência é o
 * ffmpeg, independente: `scripts/fixtures/opus-4s.webm` (libopus) e
 * `opus-4s-ffmpeg.mp4`, o MESMO WebM copiado para fMP4 pelo muxer do ffmpeg
 * (`-c copy`). Os pacotes e o `dOps` têm de bater byte a byte com os dele.
 * As durações NÃO: o ffmpeg tira-as dos timestamps do WebM, que estão ao
 * milissegundo (o primeiro pacote sai com 1008 amostras em vez de 960); aqui
 * saem do TOC de cada pacote, que é exato. Só o total tem de bater, com a
 * folga de um pacote.
 * Os casos de lacing e de tamanhos desconhecidos usam WebMs montados aqui.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-webm-opus.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { caixas, duracoes } from './ensaio-opus-caixas.mjs';
import { converterWebmParaMp4 } from '../src/lib/converterOpus.ts';
import { escreverOpusMp4 } from '../src/lib/opusMp4.ts';
import {
  amostrasDoPacote, lerOpusHead, lerWebmOpus, OPUS_INVALIDO, pacotesDoBloco, pareceWebm,
} from '../src/lib/webmOpus.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).stack}`); }
}

const ler = (f: string) => new Uint8Array(fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url)));
const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const caixa = (b: Uint8Array, caminho: string) => {
  const c = caixas(b).find((x: any) => x.caminho === caminho);
  if (!c) throw new Error(`sem ${caminho}`);
  return c;
};
const juntar = (partes: Uint8Array[]) => {
  const out = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of partes) { out.set(p, o); o += p.length; }
  return out;
};

/** O que o NOSSO MP4 diz: amostras de todos os trun, bytes de todos os mdat. */
function lerFragmentos(b: Uint8Array) {
  const cx = caixas(b);
  const tamanhos: number[] = [];
  const duracoesPorAmostra: number[] = [];
  const inicios: number[] = [];
  const audio: Uint8Array[] = [];
  for (const moof of cx.filter((c: any) => c.tipo === 'moof')) {
    const dentro = cx.filter((c: any) => c.inicio > moof.inicio && c.fim <= moof.fim);
    const tfdt = dentro.find((c: any) => c.tipo === 'tfdt');
    inicios.push(u32(b, tfdt.inicio + 12) * 2 ** 32 + u32(b, tfdt.inicio + 16));
    const trun = dentro.find((c: any) => c.tipo === 'trun');
    const n = u32(b, trun.inicio + 12);
    const offset = u32(b, trun.inicio + 16);
    let dados = 0;
    for (let i = 0; i < n; i++) {
      duracoesPorAmostra.push(u32(b, trun.inicio + 20 + 8 * i));
      const t = u32(b, trun.inicio + 24 + 8 * i);
      tamanhos.push(t);
      dados += t;
    }
    // O data-offset aponta mesmo para o primeiro byte do mdat que vem a seguir.
    const mdat = cx.find((c: any) => c.tipo === 'mdat' && c.inicio === moof.fim);
    assert.ok(mdat, 'cada moof leva o seu mdat logo a seguir');
    assert.equal(moof.inicio + offset, mdat.inicio + mdat.cabecalho, 'data-offset');
    assert.equal(mdat.fim - mdat.inicio - mdat.cabecalho, dados, 'mdat do tamanho do trun');
    audio.push(b.subarray(mdat.inicio + mdat.cabecalho, mdat.fim));
  }
  return { tamanhos, duracoesPorAmostra, inicios, audio: juntar(audio) };
}

console.log('\ncontra o ffmpeg (a referência)');
const webm = ler('opus-4s.webm');
const mp4DoFfmpeg = ler('opus-4s-ffmpeg.mp4');
const ref = lerFragmentos(mp4DoFfmpeg);
const dOpsDoFfmpeg = (() => {
  const c = caixa(mp4DoFfmpeg, 'moov/trak/mdia/minf/stbl/stsd/Opus/dOps');
  return Buffer.from(mp4DoFfmpeg.subarray(c.inicio, c.fim)).toString('hex');
})();
const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const lido = lerWebmOpus(webm);

caso('lê os mesmos pacotes que o ffmpeg, pela mesma ordem e com os mesmos bytes', () => {
  assert.deepEqual(lido.pacotes.map((p) => p.dados.length), ref.tamanhos);
  assert.deepEqual(juntar(lido.pacotes.map((p) => p.dados)), ref.audio);
});
caso('a duração de cada pacote sai do TOC (20 ms) e o total bate com o do ffmpeg', () => {
  assert.ok(lido.pacotes.every((p) => p.amostras === 960));
  assert.ok(Math.abs(soma(ref.duracoesPorAmostra) - lido.amostras) <= 960, `${soma(ref.duracoesPorAmostra)} vs ${lido.amostras}`);
});
caso('o cabeçalho: estéreo, pre-skip 312, 48 kHz de entrada', () => {
  assert.deepEqual(lido.cabecalho, { canais: 2, preSkip: 312, taxaDeEntrada: 48_000, ganhoDeSaida: 0 });
});

const { mp4, segundos } = converterWebmParaMp4(webm, 96);
caso('o dOps escrito é byte a byte o do ffmpeg', () => {
  const nosso = caixa(mp4, 'moov/trak/mdia/minf/stbl/stsd/Opus/dOps');
  assert.equal(Buffer.from(mp4.subarray(nosso.inicio, nosso.fim)).toString('hex'), dOpsDoFfmpeg);
});
caso('os fragmentos levam os pacotes do ffmpeg, intactos, com a duração do TOC', () => {
  const f = lerFragmentos(mp4);
  assert.deepEqual(f.tamanhos, ref.tamanhos);
  assert.deepEqual(f.duracoesPorAmostra, lido.pacotes.map((p) => p.amostras));
  assert.deepEqual(f.audio, ref.audio);
});
caso('a duração fica só nos fragmentos: mvhd/tkhd/mdhd a zero e sem mehd (o 2x do ecrã bloqueado)', () => {
  assert.deepEqual(duracoes(mp4), { mvhd: 0, tkhd: 0, mdhd: 0 });
  assert.ok(!caixas(mp4).some((c: any) => c.tipo === 'mehd' || c.tipo === 'edts'));
});
caso('cada fragmento começa onde o anterior acabou (tfdt)', () => {
  const pequeno = escreverOpusMp4(lido.cabecalho, lido.pacotes, 96, 50);
  const f = lerFragmentos(pequeno);
  assert.ok(f.inicios.length > 3);
  let esperado = 0;
  for (let i = 0; i < f.inicios.length; i++) {
    assert.equal(f.inicios[i], esperado, `fragmento ${i}`);
    esperado += lido.pacotes.slice(i * 50, i * 50 + 50).reduce((s, p) => s + p.amostras, 0);
  }
  assert.deepEqual(f.audio, ref.audio);
});
caso('a duração devolvida é a dos pacotes (com o pre-skip)', () => {
  assert.equal(segundos, lido.amostras / 48_000);
  assert.ok(Math.abs(segundos - 4.0065) < 0.03, String(segundos));
});
caso('um WebM reconhece-se pelos primeiros bytes, e um MP4 não passa por um', () => {
  assert.equal(pareceWebm(webm), true);
  assert.equal(pareceWebm(mp4), false);
});

// ---------------------------------------------------------------------------
// WebMs montados à mão, para o que o ffmpeg não escreve.

function vint(n: number): number[] {
  for (let bytes = 1; bytes <= 8; bytes++) {
    if (n < 2 ** (7 * bytes) - 1) {
      const out: number[] = [];
      let v = n;
      for (let i = bytes - 1; i >= 0; i--) { out[i] = v & 0xff; v = Math.floor(v / 256); }
      out[0] |= 0x80 >> (bytes - 1);
      return out;
    }
  }
  throw new Error('grande demais');
}
const idBytes = (id: number) => { const o: number[] = []; let v = id; while (v > 0) { o.unshift(v & 0xff); v = Math.floor(v / 256); } return o; };
const el = (id: number, corpo: number[]) => [...idBytes(id), ...vint(corpo.length), ...corpo];
const elDesconhecido = (id: number, corpo: number[]) => [...idBytes(id), 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, ...corpo];
const txt = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const opusHead = (canais = 2, familia = 0) => [...txt('OpusHead'), 1, canais, 0x38, 0x01, 0x80, 0xbb, 0, 0, 0, 0, familia];
const pacote = (config: number, codigo: number, n: number, extra: number[] = []) => [(config << 3) | codigo, ...extra, ...Array.from({ length: n }, (_, i) => (i * 7 + config) & 0xff)];
const tracks = (head = opusHead()) => el(0x1654ae6b, el(0xae, [...el(0xd7, [1]), ...el(0x86, txt('A_OPUS')), ...el(0x63a2, head)]));
const bloco = (flags: number, corpo: number[], pista = 1) => [...vint(pista), 0, 0, flags, ...corpo];
const webmCom = (clusters: number[], head?: number[], desconhecido = false) => {
  const ebml = el(0x1a45dfa3, el(0x4282, txt('webm')));
  const seg = [...tracks(head), ...clusters];
  return new Uint8Array([...ebml, ...(desconhecido ? elDesconhecido(0x18538067, seg) : el(0x18538067, seg))]);
};

console.log('\nlacing, tamanhos desconhecidos e o que se recusa');
const p1 = pacote(31, 0, 5); // CELT 20 ms
const p2 = pacote(31, 0, 9);
const p3 = pacote(31, 0, 3);
caso('bloco sem lacing', () => {
  const r = pacotesDoBloco(new Uint8Array(bloco(0x80, p1)), 0, bloco(0x80, p1).length);
  assert.deepEqual(r.pacotes.map((p) => [...p]), [p1]);
});
caso('lacing Xiph, com um tamanho acima de 255', () => {
  const grande = pacote(31, 0, 299); // 300 bytes com o TOC: 255 + 45
  const corpo = [2, 255, 45, p2.length, ...grande, ...p2, ...p3]; // 3 pacotes
  const b = new Uint8Array(bloco(0x82, corpo));
  assert.deepEqual(pacotesDoBloco(b, 0, b.length).pacotes.map((p) => [...p]), [grande, p2, p3]);
});
caso('lacing EBML (diferenças com sinal)', () => {
  // tamanhos 6, 10, (resto 4): primeiro VINT 6, depois diferença +4 → 4 + 63 = 67 num byte (0x80|67).
  const corpo = [2, ...vint(p1.length), 0x80 | (4 + 63), ...p1, ...p2, ...p3];
  const b = new Uint8Array(bloco(0x86, corpo));
  assert.deepEqual(pacotesDoBloco(b, 0, b.length).pacotes.map((p) => [...p]), [p1, p2, p3]);
});
caso('lacing fixo', () => {
  const a = pacote(31, 0, 4); const c = pacote(30, 0, 4);
  const b = new Uint8Array(bloco(0x84, [1, ...a, ...c]));
  assert.deepEqual(pacotesDoBloco(b, 0, b.length).pacotes.map((p) => [...p]), [a, c]);
});
caso('Segment e Cluster de tamanho desconhecido, BlockGroup, e blocos de outra pista ignorados', () => {
  const cluster1 = elDesconhecido(0x1f43b675, [
    ...el(0xe7, [0]),
    ...el(0xa3, bloco(0x80, p1)),
    ...el(0xa3, bloco(0x80, pacote(31, 0, 2), 2)), // outra pista
    ...el(0xa0, el(0xa1, bloco(0x00, p2))),
  ]);
  const cluster2 = el(0x1f43b675, [...el(0xe7, [0x10]), ...el(0xa3, bloco(0x80, p3))]);
  const r = lerWebmOpus(webmCom([...cluster1, ...cluster2], undefined, true));
  assert.deepEqual(r.pacotes.map((p) => [...p.dados]), [p1, p2, p3]);
  assert.equal(r.amostras, 3 * 960);
});
caso('o TOC decide a duração: 10/20/40/60 ms, 2,5 ms, 2 tramas e código 3', () => {
  assert.equal(amostrasDoPacote(new Uint8Array(pacote(0, 0, 1))), 480); // SILK 10 ms
  assert.equal(amostrasDoPacote(new Uint8Array(pacote(3, 0, 1))), 2880); // SILK 60 ms
  assert.equal(amostrasDoPacote(new Uint8Array(pacote(13, 0, 1))), 960); // híbrido 20 ms
  assert.equal(amostrasDoPacote(new Uint8Array(pacote(16, 0, 1))), 120); // CELT 2,5 ms
  assert.equal(amostrasDoPacote(new Uint8Array(pacote(31, 1, 2))), 1920); // 2 tramas
  assert.equal(amostrasDoPacote(new Uint8Array(pacote(31, 3, 2, [3]))), 2880); // código 3, 3 tramas
  assert.throws(() => amostrasDoPacote(new Uint8Array(pacote(3, 3, 2, [3]))), /120 ms/); // 180 ms
});
caso('recusa o que não sabe converter (e quem chama volta ao AAC)', () => {
  assert.throws(() => lerOpusHead(new Uint8Array(opusHead(6, 1))), new RegExp(OPUS_INVALIDO));
  assert.throws(() => lerWebmOpus(webmCom([], opusHead())), /sem faixa Opus ou sem pacotes/);
  assert.throws(() => lerWebmOpus(new Uint8Array([0, 0, 0, 0])), /não é EBML/);
  const cortado = webm.subarray(0, Math.floor(webm.length / 2));
  assert.throws(() => lerWebmOpus(cortado), new RegExp(OPUS_INVALIDO));
});
caso('lixo em qualquer corte do ficheiro verdadeiro atira, nunca devolve meia música calada', () => {
  for (const corte of [10, 100, 1000, 5000, 20_000, webm.length - 1]) {
    assert.throws(() => lerWebmOpus(webm.subarray(0, corte)), new RegExp(OPUS_INVALIDO), `corte ${corte}`);
  }
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');
