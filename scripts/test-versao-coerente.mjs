/**
 * A versão é a mesma nos quatro sítios onde vive, e o package-lock.json é JSON
 * válido (7/10). A subida para a 4.7.0 cortou as vírgulas do lock e as builds
 * do iPhone e do Windows morreram no `npm ci`, aos 25 s, sem ninguém dar por
 * isso -- os testes não liam o lock.
 *
 * Correr: node scripts/test-versao-coerente.mjs
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ler = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const json = (f) => {
  try { return JSON.parse(ler(f)); }
  catch (e) { throw new Error(`${f} não é JSON válido (o npm ci da build recusa-o): ${e.message}`); }
};

const pacote = json('package.json');
const app = json('app.json');
const lock = json('package-lock.json');
const buildInfo = /APP_VERSION = '([^']+)'/.exec(ler('src/lib/buildInfo.ts'))?.[1];

const v = pacote.version;
assert.match(v, /^\d+\.\d+\.\d+$/, 'package.json tem uma versão x.y.z');
assert.equal(app.expo?.version, v, 'app.json (expo.version)');
assert.equal(buildInfo, v, 'src/lib/buildInfo.ts (APP_VERSION)');
assert.equal(lock.version, v, 'package-lock.json (topo)');
assert.equal(lock.packages?.['']?.version, v, 'package-lock.json (packages[""])');
assert.ok(lock.lockfileVersion >= 1, 'o lock tem lockfileVersion');
// O npm 11 desta máquina descarta esta entrada opcional, e o npm 10 do CI recusa
// o lock sem ela ("Missing: typescript@5.9.3"): as builds do iPhone e do Windows
// morrem no `npm ci`. Já aconteceu três vezes (0065114, 5eecd48, d2c9ba6), e
// por isso fica aqui, antes do push. Para repor: ver o diff do d2c9ba6.
if (lock.packages?.['node_modules/@bacons/apple-targets']) {
  assert.ok(lock.packages['node_modules/@bacons/apple-targets/node_modules/typescript'],
    'o lock perdeu o typescript opcional do @bacons/apple-targets (o npm 11 tira-o; o npm ci do CI exige-o)');
}

console.log(`Versão ${v} igual nos quatro sítios, e o lock é válido.`);
