// A correção do mp4 à medida que chega (src/lib/mp4AoVivo.ts) tem de dar o
// MESMO ficheiro do fixMp4Duration sobre o ficheiro inteiro -- ou dizer que não
// deu (`exato: false`). Compara-se byte a byte, com bocados de todos os
// tamanhos e com ficheiros gerados ao acaso.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const modulos = new Map();
function carregar(ficheiro) {
  if (modulos.has(ficheiro)) return modulos.get(ficheiro).exports;
  const module = { exports: {} };
  modulos.set(ficheiro, module);
  const js = ts.transpileModule(readFileSync(ficheiro, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const requerer = (nome) => carregar(path.resolve(path.dirname(ficheiro), `${nome}.ts`));
  new Function('require', 'module', 'exports', js)(requerer, module, module.exports);
  return module.exports;
}
const { criarMp4AoVivo } = carregar(path.join(root, 'src/lib/mp4AoVivo.ts'));
const { fixMp4Duration } = carregar(path.join(root, 'src/lib/mp4Fixer.ts'));

// ---- boxes (as mesmas do test-mp4fixer.mjs) ---------------------------------
const TIMESCALE = 44100;
const DUR = 213 * TIMESCALE;
const u32 = (v) => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
const bytes = (s) => [...s].map((c) => c.charCodeAt(0));
const pad = (n, v = 0) => new Array(n).fill(v);
const box = (tipo, ...p) => { const c = p.flat(); return [...u32(8 + c.length), ...bytes(tipo), ...c]; };
const grande = (tipo, ...p) => { const c = p.flat(); return [...u32(1), ...bytes(tipo), ...u32(0), ...u32(16 + c.length), ...c]; };
const ateAoFim = (tipo, ...p) => [...u32(0), ...bytes(tipo), ...p.flat()];

const mvhd = box('mvhd', pad(4), pad(8), u32(TIMESCALE), u32(DUR), pad(80));
const tkhd = box('tkhd', pad(4), pad(8), u32(1), pad(4), u32(DUR), pad(60));
const mdhd = box('mdhd', pad(4), pad(8), u32(TIMESCALE), u32(DUR), pad(4));
const mehd = box('mehd', pad(4), u32(DUR));
const trex = box('trex', pad(4), u32(1), u32(1), u32(0), u32(0), u32(0));
const edts = box('edts', box('elst', pad(4), u32(1), u32(DUR), u32(1024), u32(0x10000)));
const moov = box('moov', mvhd, box('mvex', mehd, trex), box('trak', tkhd, edts, box('mdia', mdhd)));
const ftyp = box('ftyp', bytes('dash'), pad(8));
const sidx = box('sidx', pad(4), u32(1), u32(TIMESCALE), pad(12), u32(0x10001), u32(1000), u32(DUR), u32(0x90000000));
// O conteúdo do mdat imita cabeçalhos de boxes: o fixer não olha lá para dentro.
const mdat = (n) => box('mdat', ...Array.from({ length: n }, () => [...u32(16), ...bytes('sidx'), ...bytes('mvhd')]));
const moof = (i) => box('moof', box('mfhd', pad(4), u32(i)), box('traf', box('tfhd', pad(8))));
const fragmentos = (n) => Array.from({ length: n }, (_, i) => [...moof(i + 1), ...mdat(i + 2)]).flat();

const ficheiro = (...partes) => new Uint8Array(partes.flat());
const classico = (f, d) => { const c = f.slice(); fixMp4Duration(c, d); return c; };

function aoVivo(f, d, cortes) {
  const r = criarMp4AoVivo(d);
  const saidas = [];
  let o = 0;
  for (const n of cortes) {
    saidas.push(r.receber(f.slice(o, o + n)));
    o += n;
  }
  const { resto, exato } = r.acabar();
  saidas.push(resto);
  const tudo = new Uint8Array(saidas.reduce((s, x) => s + x.length, 0));
  let p = 0;
  for (const s of saidas) { tudo.set(s, p); p += s.length; }
  assert.equal(o, f.length, 'os cortes cobrem o ficheiro');
  assert.equal(r.libertados, f.length);
  return { tudo, exato };
}

const cortesIguais = (total, n) => { const c = []; for (let o = 0; o < total; o += n) c.push(Math.min(n, total - o)); return c; };
let semente = 20260917;
const acaso = () => { semente = (semente * 1103515245 + 12345) % 2 ** 31; return semente / 2 ** 31; };
const cortesAoAcaso = (total) => { const c = []; for (let o = 0; o < total;) { const n = Math.min(total - o, 1 + Math.floor(acaso() * 64)); c.push(n); o += n; } return c; };

let casos = 0;
function igualAoClassico(nome, f, d = 213) {
  const esperado = classico(f, d);
  const tentativas = [[f.length], ...[1, 2, 3, 7, 8, 9, 15, 16, 17, 64, 100].map((n) => cortesIguais(f.length, n))];
  for (let i = 0; i < 20; i++) tentativas.push(cortesAoAcaso(f.length));
  for (const cortes of tentativas) {
    const { tudo, exato } = aoVivo(f, d, cortes);
    assert.equal(exato, true, `${nome}: devia ser exato`);
    assert.deepEqual(tudo, esperado, `${nome}: difere do fixMp4Duration (cortes ${cortes.slice(0, 5)}...)`);
    casos++;
  }
}

function naoExato(nome, f, d = 213) {
  for (const cortes of [[f.length], cortesIguais(f.length, 1), cortesIguais(f.length, 13)]) {
    const { tudo, exato } = aoVivo(f, d, cortes);
    assert.equal(exato, false, `${nome}: devia dizer que não é exato`);
    assert.equal(tudo.length, f.length);
    casos++;
  }
}

// O m4a do YouTube: ftyp, moov, sidx, e os fragmentos.
const youtube = ficheiro(ftyp, moov, sidx, fragmentos(5));
igualAoClassico('m4a do YouTube', youtube);
igualAoClassico('sem duração conhecida (o mehd é neutralizado)', youtube, null);
{
  const esperado = classico(youtube, 213);
  assert.notDeepEqual(esperado, youtube, 'o fixer mexe mesmo neste ficheiro');
}

// A cabeça sai assim que chega o cabeçalho do primeiro moof -- é isto que
// deixa o som começar antes do ficheiro todo.
{
  const cabeca = ftyp.length + moov.length + sidx.length;
  const r = criarMp4AoVivo(213);
  assert.equal(r.receber(youtube.slice(0, cabeca + 7)).length, 0, 'sem o cabeçalho do moof ainda não se sabe onde a cabeça acaba');
  const saiu = r.receber(youtube.slice(cabeca + 7, cabeca + 8));
  assert.ok(saiu.length >= cabeca, `a cabeça saiu (${saiu.length} de ${cabeca})`);
  const esperado = classico(youtube, 213);
  assert.deepEqual(saiu.slice(0, cabeca), esperado.slice(0, cabeca), 'já corrigida');
  // O mdat nunca é retido: vai todo à medida que chega.
  assert.equal(saiu.length, cabeca + 8);
  r.receber(youtube.slice(cabeca + 8, cabeca + 30));
  assert.equal(r.libertados, cabeca + 30);
}

igualAoClassico('sidx e edts de topo entre fragmentos', ficheiro(ftyp, moov, fragmentos(2), sidx, box('ssix', pad(12)), fragmentos(1), edts, fragmentos(1)));
igualAoClassico('começa logo no mdat', ficheiro(mdat(3), sidx, fragmentos(2)));
igualAoClassico('sem fragmentos: a cabeça nunca fecha', ficheiro(ftyp, moov, sidx));
igualAoClassico('mdat com tamanho 0 no fim', ficheiro(ftyp, moov, sidx, moof(1), ateAoFim('mdat', pad(40, 7))));
igualAoClassico('sidx com tamanho 0 no fim', ficheiro(ftyp, moov, fragmentos(1), ateAoFim('sidx', pad(20))));
igualAoClassico('mdat com largesize', ficheiro(ftyp, moov, moof(1), grande('mdat', pad(50, 3)), fragmentos(1)));
igualAoClassico('largesize na cabeça', ficheiro(ftyp, grande('free', pad(9)), moov, fragmentos(2)));
igualAoClassico('box com tamanho 0 na cabeça: retém tudo', ficheiro(ftyp, ateAoFim('free', moov, fragmentos(1))));
// A cabeça não passa no validador (mvhd curto de mais): o fixer inteiro não
// toca em nada, e o ao vivo também não pode tocar -- nem no sidx do corpo.
const mvhdCurto = box('mvhd', pad(4), pad(8));
igualAoClassico('cabeça inválida: nada é tocado', ficheiro(ftyp, box('moov', mvhdCurto, box('trak', tkhd)), sidx, fragmentos(2), sidx));
{
  const f = ficheiro(ftyp, box('moov', mvhdCurto, box('trak', tkhd)), sidx, fragmentos(2), sidx);
  assert.deepEqual(classico(f, 213), f, 'confirmação: o fixer não tocou');
}

// Onde não se garante o mesmo resultado, diz-se.
naoExato('ficheiro cortado a meio de um mdat', youtube.slice(0, youtube.length - 5));
naoExato('ficheiro cortado a meio de um cabeçalho', youtube.slice(0, youtube.length - mdat(6).length + 3));
naoExato('lixo depois do último fragmento', ficheiro([...youtube], [1, 2, 3]));
naoExato('mvhd de topo depois dos fragmentos', ficheiro(ftyp, moov, fragmentos(1), mvhd, fragmentos(1)));
naoExato('moov de topo depois dos fragmentos', ficheiro(ftyp, moov, fragmentos(1), moov));
naoExato('box com tamanho impossível no corpo', ficheiro(ftyp, moov, fragmentos(1), u32(4), bytes('free')));
naoExato('largesize acima de 4 GiB no corpo', ficheiro(ftyp, moov, fragmentos(1), u32(1), bytes('mdat'), u32(1), u32(0)));

// O teto de boxes do validador (200 000) conta a cabeça e o corpo juntos.
{
  const muitas = (n) => {
    const inicio = [...ftyp, ...moov, ...mdat(1)];
    const f = new Uint8Array(inicio.length + n * 8);
    f.set(inicio);
    for (let i = 0, o = inicio.length; i < n; i++, o += 8) f.set([0, 0, 0, 8, ...bytes('free')], o);
    return f;
  };
  // A cabeça tem 11 boxes e o mdat é mais uma.
  const abaixo = muitas(200_000 - 12);
  const r1 = aoVivo(abaixo, 213, cortesIguais(abaixo.length, 65_536));
  assert.equal(r1.exato, true, 'no teto ainda é exato');
  assert.deepEqual(r1.tudo, classico(abaixo, 213));
  const acima = muitas(200_000 - 11);
  assert.deepEqual(classico(acima, 213), acima, 'acima do teto o fixer não toca');
  assert.equal(aoVivo(acima, 213, cortesIguais(acima.length, 65_536)).exato, false, 'e o ao vivo diz que não é exato');
  casos += 2;
}

// Ao acaso: sequências de boxes válidas e inválidas, cortes ao acaso. Quando
// diz exato, tem de ser igual; diga o que disser, o tamanho não muda.
const vocabulario = [
  () => ftyp, () => moov, () => sidx, () => box('ssix', pad(4)), () => edts, () => moof(1), () => mdat(1 + Math.floor(acaso() * 4)),
  () => box('free', pad(Math.floor(acaso() * 30))), () => mvhd, () => mehd, () => grande('mdat', pad(5)),
  () => [...u32(Math.floor(acaso() * 12)), ...bytes('junk')], () => [Math.floor(acaso() * 256)],
];
let exatos = 0;
for (let i = 0; i < 1500; i++) {
  const n = 1 + Math.floor(acaso() * 8);
  const f = ficheiro(...Array.from({ length: n }, () => vocabulario[Math.floor(acaso() * vocabulario.length)]()));
  const d = acaso() < 0.3 ? null : 90 + Math.floor(acaso() * 300);
  const { tudo, exato } = aoVivo(f, d, cortesAoAcaso(f.length));
  assert.equal(tudo.length, f.length);
  if (exato) {
    exatos++;
    assert.deepEqual(tudo, classico(f, d), `ao acaso #${i}: disse exato e difere`);
  }
  casos++;
}
assert.ok(exatos > 300, `o gerador tem de dar muitos casos exatos (${exatos})`);

console.log(`mp4 ao vivo: igual ao fixMp4Duration em ${casos} cortes (${exatos} ficheiros ao acaso exatos), e diz quando não é.`);
