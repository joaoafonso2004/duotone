/**
 * Os casos do `teste-download.swift`, tirados do JavaScript: o que o JS devolve
 * é o que o Swift tem de devolver (o WebM → MP4 do Opus e a validação de um
 * bocado, `modules/duotone-download/ios/Puro/`). O Windows não compila Swift;
 * quem corre isto é o CI (`.github/workflows/swift-puro.yml`), em Linux.
 *
 * Escreve na pasta pedida:
 *  - `casos.json`: cada caso diz o WebM (um ficheiro), um corte e bytes
 *    mudados (opcionais), o `kbps`, e o que o JS deu -- o MP4 inteiro (para os
 *    casos de base), ou o tamanho + FNV-1a e os segundos, ou a frase do erro;
 *  - `bocados.json`: respostas HTTP e a frase do `validarRespostaParcial`.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/swift/gerar-casos-download.ts <pasta>
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { converterWebmParaMp4 } from '../../src/lib/converterOpus.ts';
import { validarRespostaParcial } from '../../src/lib/audioRange.ts';

const pasta = process.argv[2];
if (!pasta) throw new Error('falta a pasta de saída');
mkdirSync(pasta, { recursive: true });

// ---- WebMs montados à mão (as mesmas peças do test-webm-opus.ts) ---------------
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

// Um gerador com semente: os mesmos casos em cada corrida.
let semente = 0x2f6b9a1d;
const aleatorio = () => {
  semente ^= semente << 13; semente >>>= 0;
  semente ^= semente >>> 17;
  semente ^= semente << 5; semente >>>= 0;
  return semente / 2 ** 32;
};
const ate = (n: number) => Math.floor(aleatorio() * n);

/** Um WebM comprido: ~700 pacotes (três fragmentos), todas as formas de lacing. */
function comprido(): Uint8Array {
  const clusters: number[] = [];
  const configs = [31, 30, 29, 28, 27, 13, 15, 0, 1, 3, 16, 19];
  for (let c = 0; c < 18; c++) {
    const filhos: number[] = [...el(0xe7, vint(c * 1000).slice(-2))];
    for (let b = 0; b < 10; b++) {
      const cfg = configs[ate(configs.length)];
      const p = () => pacote(cfg, ate(3), 2 + ate(40));
      const forma = ate(5);
      if (forma === 0) filhos.push(...el(0xa3, bloco(0x80, p())));
      else if (forma === 1) { // Xiph
        const ps = [p(), p(), p(), pacote(cfg, 0, 270 + ate(30))];
        const tam = (n: number) => { const o: number[] = []; while (n >= 255) { o.push(255); n -= 255; } o.push(n); return o; };
        filhos.push(...el(0xa3, bloco(0x82, [ps.length - 1, ...ps.slice(0, -1).flatMap((x) => tam(x.length)), ...ps.flat()])));
      } else if (forma === 2) { // EBML
        const a = p(), b2 = p(), c2 = p();
        const dif = b2.length - a.length;
        filhos.push(...el(0xa3, bloco(0x86, [2, ...vint(a.length), 0x80 | (dif + 63), ...a, ...b2, ...c2])));
      } else if (forma === 3) { // fixo
        const n = 3 + ate(20);
        filhos.push(...el(0xa3, bloco(0x84, [2, pacote(cfg, 0, n), pacote(cfg, 0, n), pacote(cfg, 0, n)].flat())));
      } else { // BlockGroup, e às vezes um bloco de outra pista
        filhos.push(...el(0xa0, el(0xa1, bloco(0x00, p()))));
        if (ate(3) === 0) filhos.push(...el(0xa3, bloco(0x80, p(), 2)));
      }
    }
    clusters.push(...(c % 4 === 3 ? elDesconhecido(0x1f43b675, filhos) : el(0x1f43b675, filhos)));
  }
  return webmCom(clusters, opusHead(2, 0), true);
}

// ---- os casos ------------------------------------------------------------------
type Esperado = { mp4: string; segundos: number } | { tamanho: number; fnv: number; segundos: number } | { erro: string };
type Caso = { nome: string; webm: string; corte?: number; mutacoes?: [number, number][]; kbps: number; esperado: Esperado };

function fnv1a(b: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

const casos: Caso[] = [];
const ficheiros = new Map<string, Uint8Array>();
function base(nome: string, webm: Uint8Array): void { ficheiros.set(nome, webm); writeFileSync(path.join(pasta, nome), webm); }

function caso(nome: string, webmNome: string, opcoes: { corte?: number; mutacoes?: [number, number][]; kbps?: number; inteiro?: boolean } = {}): void {
  let b = ficheiros.get(webmNome)!.slice();
  if (opcoes.corte !== undefined) b = b.slice(0, opcoes.corte);
  for (const [pos, val] of opcoes.mutacoes ?? []) if (pos < b.length) b[pos] = val;
  const kbps = opcoes.kbps ?? 0;
  let esperado: Esperado;
  try {
    const r = converterWebmParaMp4(b, kbps);
    if (opcoes.inteiro) {
      const nomeMp4 = `${nome}.mp4`;
      writeFileSync(path.join(pasta, nomeMp4), r.mp4);
      esperado = { mp4: nomeMp4, segundos: r.segundos };
    } else esperado = { tamanho: r.mp4.length, fnv: fnv1a(r.mp4), segundos: r.segundos };
  } catch (e) {
    esperado = { erro: (e as Error).message };
  }
  casos.push({ nome, webm: webmNome, corte: opcoes.corte, mutacoes: opcoes.mutacoes, kbps, esperado });
}

const raiz = path.dirname(path.dirname(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))));
base('opus-4s.webm', new Uint8Array(readFileSync(path.join(raiz, 'scripts/fixtures/opus-4s.webm'))));
base('comprido.webm', comprido());
const p1 = pacote(31, 0, 5), p2 = pacote(31, 0, 9), p3 = pacote(31, 0, 3);
base('lacing.webm', webmCom([
  ...elDesconhecido(0x1f43b675, [
    ...el(0xe7, [0]),
    ...el(0xa3, bloco(0x80, p1)),
    ...el(0xa3, bloco(0x80, pacote(31, 0, 2), 2)),
    ...el(0xa0, el(0xa1, bloco(0x00, p2))),
    ...el(0xa3, bloco(0x82, [2, 255, 45, p2.length, ...pacote(31, 0, 299), ...p2, ...p3])),
    ...el(0xa3, bloco(0x86, [2, ...vint(p1.length), 0x80 | (4 + 63), ...p1, ...p2, ...p3])),
    ...el(0xa3, bloco(0x84, [1, ...pacote(31, 0, 4), ...pacote(30, 0, 4)])),
  ]),
  ...el(0x1f43b675, [...el(0xe7, [0x10]), ...el(0xa3, bloco(0x80, pacote(31, 3, 2, [3])))]),
], undefined, true));
base('seis-canais.webm', webmCom(el(0x1f43b675, [...el(0xe7, [0]), ...el(0xa3, bloco(0x80, p1))]), opusHead(6, 1)));
base('sem-pacotes.webm', webmCom([], opusHead()));
base('nao-ebml.webm', new Uint8Array([0, 0, 0, 0, 1, 2, 3]));
base('180ms.webm', webmCom(el(0x1f43b675, [...el(0xe7, [0]), ...el(0xa3, bloco(0x80, pacote(3, 3, 2, [3])))])));

// Um bloco com lacing que acaba no último byte do ficheiro, sem a contagem: o JS
// lê `undefined` e falha; o Swift, sem cuidado, lia fora do array.
for (const [nome, flags] of [['fim-xiph', 0x82], ['fim-fixo', 0x84], ['fim-ebml', 0x86]] as const) {
  base(`${nome}.webm`, webmCom(elDesconhecido(0x1f43b675, [...el(0xe7, [0]), ...el(0xa3, bloco(0x80, p1)), ...el(0xa3, bloco(flags, []))]), undefined, true));
}

// Os casos de base: o MP4 inteiro, byte a byte.
caso('ffmpeg', 'opus-4s.webm', { inteiro: true });
caso('ffmpeg-com-kbps', 'opus-4s.webm', { inteiro: true, kbps: 139.6 });
caso('comprido', 'comprido.webm', { inteiro: true });
caso('lacing', 'lacing.webm', { inteiro: true });
for (const n of ['seis-canais', 'sem-pacotes', 'nao-ebml', '180ms', 'fim-xiph', 'fim-fixo', 'fim-ebml']) caso(n, `${n}.webm`);

// Cortes e bytes trocados ao acaso: o JS ou converte ou atira, e o Swift tem de
// fazer o mesmo -- sem rebentar (um índice fora do array é um crash no iPhone).
const real = ficheiros.get('opus-4s.webm')!;
const longo = ficheiros.get('comprido.webm')!;
for (const corte of [0, 1, 3, 4, 10, 40, 100, 200, 400, 1000, 5000, 20_000, real.length - 1]) caso(`corte-${corte}`, 'opus-4s.webm', { corte });
for (let i = 0; i < 40; i++) caso(`corte-longo-${i}`, 'comprido.webm', { corte: ate(longo.length) });
for (let i = 0; i < 300; i++) {
  const nome = i % 3 === 0 ? 'comprido.webm' : 'opus-4s.webm';
  const alvo = ficheiros.get(nome)!;
  const zona = i % 2 === 0 ? Math.min(alvo.length, 700) : alvo.length; // metade na cabeça
  const n = 1 + ate(4);
  const mutacoes: [number, number][] = Array.from({ length: n }, () => [ate(zona), [0, 0xff, 0x80, 0x01, ate(256)][ate(5)]]);
  caso(`mudado-${i}`, nome, { mutacoes });
}
writeFileSync(path.join(pasta, 'casos.json'), JSON.stringify(casos));

// ---- a validação de um bocado ----------------------------------------------------
type Bocado = { status: number; contentLength: string | null; contentRange: string | null; inicio: number; fim: number; total: number; esperado: string | null };
const bocados: Bocado[] = [];
const T = 3_800_123;
const comprimentos = (i: number, f: number) => [null, String(f - i + 1), String(f - i), String(f - i + 2), '', ' 12', '1e3', '-1', '00' + String(f - i + 1), '99999999999999999999999'];
const intervalos = (i: number, f: number, t: number) => [null, `bytes ${i}-${f}/${t}`, `bytes ${i}-${f}/${t + 1}`, `bytes ${i + 1}-${f}/${t}`, `bytes ${i}-${f}/*`, `bytes=${i}-${f}/${t}`, `bytes ${i}-${f}/${t} `, `bytes 0${i}-${f}/${t}`, 'bytes -/', `bytes ${i}-${f}`, `bytes ${i}-${f}/99999999999999999999999`];
const pedidos: [number, number, number][] = [[0, 999_999, T], [1_000_000, 1_999_999, T], [3_000_000, T - 1, T], [0, T - 1, T], [5, 4, T], [0, T, T], [-1, 10, T], [10, 10, T]];
for (const [inicio, fim, total] of pedidos) {
  for (const status of [200, 206, 204, 304, 403, 500]) {
    for (const cl of comprimentos(inicio, fim)) {
      for (const cr of intervalos(inicio, fim, total)) {
        const cabecalhos: Record<string, string | null> = { 'content-length': cl, 'content-range': cr };
        let esperado: string | null = null;
        try { validarRespostaParcial({ status, headers: { get: (n) => cabecalhos[n.toLowerCase()] ?? null } }, inicio, fim, total); }
        catch (e) { esperado = (e as Error).message; }
        bocados.push({ status, contentLength: cl, contentRange: cr, inicio, fim, total, esperado });
      }
    }
  }
}
writeFileSync(path.join(pasta, 'bocados.json'), JSON.stringify(bocados));

const erros = casos.filter((c) => 'erro' in c.esperado);
const estranhos = erros.filter((c) => !(c.esperado as { erro: string }).erro.startsWith('WebM/Opus inválido'));
console.log(`${casos.length} casos de conversão (${erros.length} com erro) e ${bocados.length} bocados em ${pasta}`);
if (estranhos.length) {
  // O JS só pode falhar com OPUS_INVALIDO: outra frase é um erro que quem chama
  // não reconhece, e a faixa não voltava ao AAC.
  for (const c of estranhos.slice(0, 5)) console.error(`  ${c.nome}: ${(c.esperado as { erro: string }).erro}`);
  process.exit(1);
}
