import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const here = path.dirname(fileURLToPath(import.meta.url));
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(path.join(here, 'correcoes-candidatas.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, DataView, Uint8Array, Promise });
const { validarEstruturaMp4, validarRespostaParcial, criarStorageMigrado } = exports;
const u32 = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const box = (t, data = []) => [...u32(8 + data.length), ...Buffer.from(t), ...data];
const bad = new Uint8Array(box('moov', [...box('mvhd', [0]), ...box('mdat', Array(32).fill(127))]));
const before = bad.slice();
assert.throws(() => validarEstruturaMp4(bad), /truncado/);
assert.deepEqual(bad, before);
validarEstruturaMp4(new Uint8Array(box('moov', box('mvhd', Array(20).fill(0)))));
for (const data of [[0,0,0,1,109,111,111,118], [0,0,0,7,102,114,101,101], [...u32(0x80000000), ...Buffer.from('free')]]) {
  assert.throws(() => validarEstruturaMp4(new Uint8Array(data)));
}
let nested = box('free');
for (let i = 0; i < 34; i++) nested = box('moov', nested);
assert.throws(() => validarEstruturaMp4(new Uint8Array(nested)), /nesting/);

const response = (status, range, length = '4') => ({ status, headers: { get: k => k === 'content-range' ? range : length } });
validarRespostaParcial(response(206, 'bytes 4-7/8'), 4, 7, 8);
validarRespostaParcial(response(200, null), 0, 3, 4);
for (const r of [response(206, 'bytes 0-3/8'), response(206, 'bytes 4-7/12'), response(200, null), response(206, 'bytes 4-7/8', '100')]) {
  assert.throws(() => validarRespostaParcial(r, 4, 7, 8));
}
const memory = () => {
  const map = new Map();
  return { map, getItem: async k => map.get(k) ?? null, setItem: async (k,v) => {map.set(k,v);}, removeItem: async k => {map.delete(k);} };
};
const secure = memory(), legacy = memory();
legacy.map.set('session', 'fixture-token');
const storage = criarStorageMigrado(secure, legacy);
assert.equal(await storage.getItem('session'), 'fixture-token');
assert.equal(legacy.map.size, 0);
await Promise.all([storage.setItem('session', 'new'), storage.removeItem('session')]);
assert.equal(await storage.getItem('session'), null);
legacy.map.set('session', 'preserve-on-failure');
const unavailable = criarStorageMigrado({ ...secure, setItem: async () => {throw Error('cofre indisponível');} }, legacy);
await assert.rejects(unavailable.getItem('session'), /cofre/);
assert.equal(legacy.map.get('session'), 'preserve-on-failure');

// Executa a bateria histórica do fixer, acrescentando o preflight ao código
// real em memória. Não escreve em src nem transforma fixtures em media real.
const root = path.resolve(here, '../..');
const real = readFileSync(path.join(root, 'src/lib/mp4Fixer.ts'), 'utf8').replace(
  'export function fixMp4Duration(buffer: Uint8Array, durationSeconds: number | null): void {',
  'export function fixMp4Duration(buffer: Uint8Array, durationSeconds: number | null): void { try { validarEstruturaMp4(buffer); } catch { return; }',
);
const test = readFileSync(path.join(root, 'scripts/test-mp4fixer.mjs'), 'utf8')
  .replace("import { readFileSync } from 'node:fs';", 'const readFileSync = globalThis.__auditRead;')
  .replace("fileURLToPath(import.meta.url)", JSON.stringify(path.join(root, 'scripts/test-mp4fixer.mjs')))
  .replace("new Function(js +", "new Function('validarEstruturaMp4', js +")
  .replace("return { fixMp4Duration };')();", "return { fixMp4Duration };')(globalThis.__auditValidate);");
globalThis.__auditRead = () => real;
globalThis.__auditValidate = validarEstruturaMp4;
try { await import(`data:text/javascript;base64,${Buffer.from(test).toString('base64')}`); }
finally { delete globalThis.__auditRead; delete globalThis.__auditValidate; }
console.log('Candidatas: ranges, parser, preservação de bytes e migração/logout passaram em isolamento. Integração nativa pendente.');
