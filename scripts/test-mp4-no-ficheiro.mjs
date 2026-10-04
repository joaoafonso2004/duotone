// A correção do mp4 no próprio ficheiro (src/lib/mp4NoFicheiro.ts), que o
// download nativo usa: só lê a cabeça e os cabeçalhos das boxes de topo, e tem
// de dar o MESMO ficheiro do fixMp4Duration sobre ele inteiro -- ou dizer que
// não dá (`exato: false`) SEM ter escrito nada. As mesmas boxes do
// test-mp4-ao-vivo.mjs, e 1500 ficheiros ao acaso.
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
const { corrigirMp4NoFicheiro } = carregar(path.join(root, 'src/lib/mp4NoFicheiro.ts'));
const { fixMp4Duration } = carregar(path.join(root, 'src/lib/mp4Fixer.ts'));

// ---- boxes (as mesmas do test-mp4-ao-vivo.mjs) ------------------------------
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
const mdat = (n) => box('mdat', ...Array.from({ length: n }, () => [...u32(16), ...bytes('sidx'), ...bytes('mvhd')]));
const moof = (i) => box('moof', box('mfhd', pad(4), u32(i)), box('traf', box('tfhd', pad(8))));
const fragmentos = (n) => Array.from({ length: n }, (_, i) => [...moof(i + 1), ...mdat(i + 2)]).flat();
const ficheiro = (...partes) => new Uint8Array(partes.flat());
const classico = (f, d) => { const c = f.slice(); fixMp4Duration(c, d); return c; };

/** Corre no sítio sobre uma cópia; conta o que leu e o que escreveu. */
function noFicheiro(f, d) {
  const disco = f.slice();
  let lidos = 0;
  let escritas = 0;
  const acesso = {
    ler(posicao, quantos) {
      assert.ok(posicao >= 0 && quantos >= 0 && posicao + quantos <= disco.length, `leitura fora do ficheiro (${posicao}+${quantos})`);
      lidos += quantos;
      return disco.slice(posicao, posicao + quantos);
    },
    escrever(posicao, b) {
      assert.ok(posicao >= 0 && posicao + b.length <= disco.length, 'escrita fora do ficheiro');
      escritas++;
      disco.set(b, posicao);
    },
  };
  const { exato } = corrigirMp4NoFicheiro(acesso, disco.length, d);
  return { disco, exato, lidos, escritas };
}

let casos = 0;
function igual(nome, f, d = 213) {
  const { disco, exato } = noFicheiro(f, d);
  assert.equal(exato, true, `${nome}: devia ser exato`);
  assert.deepEqual(disco, classico(f, d), `${nome}: difere do fixMp4Duration`);
  casos++;
}
/** Não dá para garantir: diz que não, e o ficheiro fica como estava. */
function naoExato(nome, f, d = 213) {
  const { disco, exato, escritas } = noFicheiro(f, d);
  assert.equal(exato, false, `${nome}: devia dizer que não é exato`);
  assert.equal(escritas, 0, `${nome}: escreveu sem ter a certeza`);
  assert.deepEqual(disco, f);
  casos++;
}

const youtube = ficheiro(ftyp, moov, sidx, fragmentos(5));
igual('m4a do YouTube', youtube);
igual('sem duração conhecida', youtube, null);
assert.notDeepEqual(classico(youtube, 213), youtube, 'o fixer mexe mesmo neste ficheiro');

// O ponto disto: o áudio (os mdat) não é lido.
{
  const grandeMdat = ficheiro(ftyp, moov, sidx, moof(1), box('mdat', pad(2_000_000, 9)), moof(2), box('mdat', pad(2_000_000, 7)));
  const { lidos, exato } = noFicheiro(grandeMdat, 213);
  assert.equal(exato, true);
  const cabeca = ftyp.length + moov.length + sidx.length;
  assert.ok(lidos < cabeca + 16 * 10, `leu ${lidos} bytes de ${grandeMdat.length}: só a cabeça e os cabeçalhos`);
  casos++;
}

igual('sidx e edts de topo entre fragmentos', ficheiro(ftyp, moov, fragmentos(2), sidx, box('ssix', pad(12)), fragmentos(1), edts, fragmentos(1)));
igual('começa logo no mdat', ficheiro(mdat(3), sidx, fragmentos(2)));
igual('mdat com tamanho 0 no fim', ficheiro(ftyp, moov, sidx, moof(1), ateAoFim('mdat', pad(40, 7))));
igual('sidx com tamanho 0 no fim', ficheiro(ftyp, moov, fragmentos(1), ateAoFim('sidx', pad(20))));
igual('mdat com largesize', ficheiro(ftyp, moov, moof(1), grande('mdat', pad(50, 3)), fragmentos(1)));
igual('largesize na cabeça', ficheiro(ftyp, grande('free', pad(9)), moov, fragmentos(2)));
const mvhdCurto = box('mvhd', pad(4), pad(8));
igual('cabeça inválida: nada é tocado', ficheiro(ftyp, box('moov', mvhdCurto, box('trak', tkhd)), sidx, fragmentos(2), sidx));

// A cabeça não fecha: quem chama corre o fixer inteiro.
naoExato('sem fragmentos', ficheiro(ftyp, moov, sidx));
naoExato('box com tamanho 0 na cabeça', ficheiro(ftyp, ateAoFim('free', moov, fragmentos(1))));
// Onde não se garante o mesmo resultado.
naoExato('ficheiro cortado a meio de um mdat', youtube.slice(0, youtube.length - 5));
naoExato('cortado a meio de um cabeçalho', youtube.slice(0, youtube.length - mdat(6).length + 3));
naoExato('lixo depois do último fragmento', ficheiro([...youtube], [1, 2, 3]));
naoExato('mvhd de topo depois dos fragmentos', ficheiro(ftyp, moov, fragmentos(1), mvhd, fragmentos(1)));
naoExato('moov de topo depois dos fragmentos', ficheiro(ftyp, moov, fragmentos(1), moov));
naoExato('box com tamanho impossível no corpo', ficheiro(ftyp, moov, fragmentos(1), u32(4), bytes('free')));
naoExato('largesize acima de 4 GiB no corpo', ficheiro(ftyp, moov, fragmentos(1), u32(1), bytes('mdat'), u32(1), u32(0)));

// O teto de boxes conta a cabeça e o corpo juntos, como no validador.
{
  const muitas = (n) => {
    const inicio = [...ftyp, ...moov, ...mdat(1)];
    const f = new Uint8Array(inicio.length + n * 8);
    f.set(inicio);
    for (let i = 0, o = inicio.length; i < n; i++, o += 8) f.set([0, 0, 0, 8, ...bytes('free')], o);
    return f;
  };
  igual('no teto de boxes', muitas(200_000 - 12));
  const acima = muitas(200_000 - 11);
  assert.deepEqual(classico(acima, 213), acima, 'acima do teto o fixer não toca');
  naoExato('acima do teto de boxes', acima);
}

// Ao acaso: quando diz exato, é igual; quando não, não escreveu nada -- e o
// fixer inteiro (o que quem chama corre a seguir) dá o resultado certo.
let semente = 20261004;
const acaso = () => { semente = (semente * 1103515245 + 12345) % 2 ** 31; return semente / 2 ** 31; };
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
  const { disco, exato, escritas } = noFicheiro(f, d);
  if (exato) {
    exatos++;
    assert.deepEqual(disco, classico(f, d), `ao acaso #${i}: disse exato e difere`);
  } else {
    assert.equal(escritas, 0, `ao acaso #${i}: escreveu sem ter a certeza`);
  }
  casos++;
}
// Menos do que no ao vivo: sem cabeça que feche, aqui diz-se "não" e quem chama corre o fixer.
assert.ok(exatos > 250, `o gerador tem de dar muitos casos exatos (${exatos})`);

console.log(`mp4 no ficheiro: igual ao fixMp4Duration em ${casos} casos (${exatos} ao acaso exatos), sem ler o áudio e sem escrever quando não tem a certeza.`);
