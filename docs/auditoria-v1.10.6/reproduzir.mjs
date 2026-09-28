// Reproduções de auditoria, não testes de uma correção. Sem rede/disco de utilizador.
// Executar da raiz: node docs/auditoria-v1.10.6/reproduzir.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function carregar(file, imports = {}, globals = {}) {
  const code = ts.transpileModule(readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, require: name => {
      if (!(name in imports)) throw Error(`Import não simulado: ${name}`);
      return imports[name];
    },
    console, Uint8Array, AbortController, setTimeout, clearTimeout, setInterval, clearInterval,
    ...globals,
  }, { filename: file });
  return exports;
}

const mp4 = carregar('src/lib/mp4Fixer.ts');
const u32 = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const box = (name, data = []) => [...u32(8 + data.length), ...Buffer.from(name), ...data];
// mvhd de 9 bytes, seguido de mdat. O campo duration que falta no mvhd
// aponta para dentro do payload do irmão: o fixer não valida o limite do box.
const bad = new Uint8Array(box('moov', [...box('mvhd', [0]), ...box('mdat', Array(32).fill(0x7f))]));
const before = bad.slice();
mp4.fixMp4Duration(bad, null);
const changed = [...bad.keys()].filter(i => before[i] !== bad[i]);
assert.deepEqual(changed, [32, 33, 34, 35]);
console.log('REPRODUZIDO A03: mvhd truncado altera 4 bytes do mdat irmão:', changed.join(','));

function cacheHarness(fetchImpl) {
  const files = new Map();
  let failWrite = false;
  class File {
    constructor(_directory, name) {
      if (files.has(name)) return files.get(name);
      this.name = name; this.uri = `mock:/${name}`; this.exists = false;
      this.size = 0; this.modificationTime = 1; files.set(name, this);
    }
    create() { this.exists = true; }
    write(data) {
      if (failWrite) { this.size = 1; throw Error('ENOSPC simulado'); }
      this.size = data.byteLength;
    }
    delete() { this.exists = false; this.size = 0; }
  }
  const dir = { list: () => [...files.values()].filter(f => f.exists) };
  let state = { revision: 0 };
  const api = carregar('src/lib/youtubeCache.ts', {
    zustand: { create: () => ({ setState: fn => { state = { ...state, ...fn(state) }; } }) },
    'react-native': { Platform: { OS: 'ios' } },
    '@react-native-async-storage/async-storage': { default: { getItem: async () => null, setItem: async () => {} } },
    'expo-file-system': { File, Paths: { document: dir, cache: dir } },
    './mp4Fixer': mp4,
  }, { fetch: fetchImpl });
  return { api, File, files, breakWrites: () => { failWrite = true; } };
}
const response = (status, bytes, range) => ({
  status, headers: { get: key => key === 'content-range' ? range : key === 'content-length' ? String(bytes.length) : null },
  arrayBuffer: async () => new Uint8Array(bytes).buffer,
});

let calls = 0;
const c = cacheHarness(async () => { calls++; return response(206, [1, 2, 3, 4], 'bytes 0-3/8'); });
const wrong = await c.api.fetchChunkWithRetry('https://fixture.invalid', 4, 7);
assert.deepEqual([...wrong.bytes], [1, 2, 3, 4]);
console.log('REPRODUZIDO A02: pedido 4-7 aceita Content-Range 0-3/8.');

c.breakWrites();
await assert.rejects(c.api.downloadProgressiveAudio('abcdefghijk', 'https://fixture.invalid', 4, null), /ENOSPC/);
const priorCalls = calls;
const cached = await c.api.downloadProgressiveAudio('abcdefghijk', 'https://fixture.invalid', 4, null);
assert.equal(cached, 'mock:/yt-audio-abcdefghijk.m4a');
assert.equal(calls, priorCalls);
assert.equal(c.files.get('yt-audio-abcdefghijk.m4a').size, 1);
console.log('REPRODUZIDO A04: escrita interrompida deixa 1 byte; tentativa seguinte aceita o ficheiro sem rede.');

// A operação explícita não grava qualquer pin: este ficheiro é indistinguível
// do pré-cache. O LRU pode apagá-lo no arranque online se não estiver na fila.
const old = new c.File(null, 'yt-audio-oldDownload.m4a');
old.exists = true; old.size = 400 * 1024 * 1024; old.modificationTime = 1;
const recent = new c.File(null, 'yt-audio-newPrefetch.m4a');
recent.exists = true; recent.size = 200 * 1024 * 1024; recent.modificationTime = 2;
c.api.pruneAudioCacheLRU([]);
assert.equal(old.exists, false);
console.log('REPRODUZIDO A04: LRU não distingue download explícito de cache preditivo.');

const machine = carregar('src/lib/playbackMachine.ts');
const afterPause = machine.transicao({ intencao: 'tocar', fase: 'pronto' }, { tipo: 'em-pausa' });
assert.equal(machine.derivados(afterPause).isPlaying, true);
console.log('REPRODUZIDO A05 (lógica): confirmação em-pausa preserva intenção; mudança de rota precisa de evento próprio.');

console.log('5 reproduções confirmadas. Não demonstram exploração remota nem medições em hardware.');
