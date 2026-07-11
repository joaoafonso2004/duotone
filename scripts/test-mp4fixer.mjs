// Testes do mp4Fixer — corre com `npm test` (Node puro, sem dependências).
//
// Constrói um fMP4 sintético com a mesma estrutura dos m4a do YouTube
// (moov com duração TOTAL declarada + sidx + moof/mdat) e verifica que o
// fixer produz o layout CMAF canónico: moov a 0, sidx/edts neutralizados,
// mehd (quando existe) com a duração real. É exatamente a transformação que
// corrige o Lock Screen a mostrar 2x a duração (AVPlayer soma moov+fragmentos).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ---- carrega o fixMp4Duration REAL (strip trivial das anotações de tipo) ----
const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ts = readFileSync(path.join(projectRoot, 'src', 'lib', 'mp4Fixer.ts'), 'utf8');
const js = ts
  .replace(/export function/g, 'function')
  .replace(/: Uint8Array/g, '')
  .replace(/: number \| null/g, '')
  .replace(/: number/g, '')
  .replace(/: void/g, '');
const { fixMp4Duration } = new Function(js + '\nreturn { fixMp4Duration };')();

// ---- helpers de construção de boxes -----------------------------------------
const TIMESCALE = 44100;
const REAL_DURATION_S = 213;
const DUR_TICKS = REAL_DURATION_S * TIMESCALE;

function u32(v) {
  return [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
}
function box(type, ...payloads) {
  const payload = payloads.flat();
  const size = 8 + payload.length;
  return [...u32(size), ...[...type].map((c) => c.charCodeAt(0)), ...payload];
}
const pad = (n) => new Array(n).fill(0);

// mvhd v0: ver/flags + creation + modification + timescale + duration + resto
const mvhd = box('mvhd', pad(4), pad(8), u32(TIMESCALE), u32(DUR_TICKS), pad(80));
// tkhd v0: ver/flags + creation + modification + trackId + reserved + duration
const tkhd = box('tkhd', pad(4), pad(8), u32(1), pad(4), u32(DUR_TICKS), pad(60));
// mdhd v0: ver/flags + creation + modification + timescale + duration + lang
const mdhd = box('mdhd', pad(4), pad(8), u32(TIMESCALE), u32(DUR_TICKS), pad(4));
// mehd v0: ver/flags + fragment_duration
const mehd = box('mehd', pad(4), u32(DUR_TICKS));
const trex = box('trex', pad(4), u32(1), u32(1), u32(0), u32(0), u32(0));
// edts > elst com 1 entrada (encoder delay típico)
const elst = box('elst', pad(4), u32(1), u32(DUR_TICKS), u32(1024), u32(0x00010000));
const edts = box('edts', elst);
const mdia = box('mdia', mdhd);
const trak = box('trak', tkhd, edts, mdia);
const mvex = box('mvex', mehd, trex);
const moov = box('moov', mvhd, mvex, trak);
const ftyp = box('ftyp', [...'dash'].map((c) => c.charCodeAt(0)), pad(8));
const sidx = box('sidx', pad(4), u32(1), u32(TIMESCALE), u32(0), u32(0), u32(0x00010001), u32(1000), u32(DUR_TICKS), u32(0x90000000));
const moof = box('moof', box('mfhd', pad(4), u32(1)));
const mdat = box('mdat', [1, 2, 3, 4, 5, 6, 7, 8]);

function buildFile() {
  return new Uint8Array([...ftyp, ...moov, ...sidx, ...moof, ...mdat]);
}

function r32(b, o) {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}
function boxType(b, o) {
  return String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
}
// offsets absolutos calculados a partir do layout acima
function findBox(buf, type, from = 0) {
  for (let o = from; o + 8 <= buf.length; o++) {
    if (boxType(buf, o) === type && r32(buf, o) > 8 && r32(buf, o) < buf.length) return o;
  }
  return -1;
}

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ok - ${name}`);
  } catch (e) {
    failures++;
    console.error(`  FALHOU - ${name}: ${e.message}`);
  }
}

// ---- teste 1: com duração conhecida -----------------------------------------
{
  const buf = buildFile();
  const original = buildFile();
  fixMp4Duration(buf, REAL_DURATION_S);

  console.log('fixMp4Duration(buf, duração real):');
  check('mvhd.duration = 0', () => {
    const o = findBox(buf, 'mvhd');
    assert.equal(r32(buf, o + 8 + 16), 0);
  });
  check('mvhd.timescale intacto', () => {
    const o = findBox(buf, 'mvhd');
    assert.equal(r32(buf, o + 8 + 12), TIMESCALE);
  });
  check('tkhd.duration = 0', () => {
    const o = findBox(buf, 'tkhd');
    assert.equal(r32(buf, o + 8 + 20), 0);
  });
  check('mdhd.duration = 0', () => {
    const o = findBox(buf, 'mdhd');
    assert.equal(r32(buf, o + 8 + 16), 0);
  });
  check('mehd.fragment_duration = duração real', () => {
    const o = findBox(buf, 'mehd');
    assert.equal(r32(buf, o + 8 + 4), DUR_TICKS);
  });
  check('edts neutralizado para free', () => {
    assert.equal(findBox(buf, 'edts'), -1);
  });
  check('sidx neutralizado para free', () => {
    assert.equal(findBox(buf, 'sidx'), -1);
  });
  check('moof/mdat intocados', () => {
    const oMoof = findBox(original, 'moof');
    assert.deepEqual(buf.slice(oMoof), original.slice(oMoof));
  });
}

// ---- teste 2: sem duração conhecida (null) ----------------------------------
{
  const buf = buildFile();
  fixMp4Duration(buf, null);

  console.log('fixMp4Duration(buf, null):');
  check('mvhd.duration = 0 mesmo sem duração conhecida', () => {
    const o = findBox(buf, 'mvhd');
    assert.equal(r32(buf, o + 8 + 16), 0);
  });
  check('mehd neutralizado (sem duração para lá escrever)', () => {
    assert.equal(findBox(buf, 'mehd'), -1);
  });
  check('sidx neutralizado', () => {
    assert.equal(findBox(buf, 'sidx'), -1);
  });
}

// ---- teste 3: buffer arbitrário não rebenta ----------------------------------
{
  console.log('robustez:');
  check('não lança em lixo aleatório', () => {
    const junk = new Uint8Array(64).fill(0xab);
    fixMp4Duration(junk, 100); // não deve lançar
  });
  check('não lança em buffer vazio', () => {
    fixMp4Duration(new Uint8Array(0), 100);
  });
}

if (failures > 0) {
  console.error(`\n${failures} teste(s) falharam`);
  process.exit(1);
}
console.log('\nTodos os testes passaram.');
