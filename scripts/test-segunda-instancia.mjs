// Abrir o Duotone com ele já aberto (Windows, 11/10): a segunda instância sai
// logo e não arranca nada. Era `app.quit()`, que antes do `ready` não travava o
// `whenReady`: ela tentava abrir o servidor na porta da primeira e mostrava
// "A porta 18081 esta a ser usada por outro programa".
// Correr: node scripts/test-segunda-instancia.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

/** Um duplo que aceita tudo: qualquer propriedade e qualquer chamada dão outro igual. */
function tudo() {
  const alvo = function () {};
  return new Proxy(alvo, {
    get: (_a, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : tudo()),
    apply: () => tudo(),
    construct: () => tudo(),
  });
}

function arrancar(primeira) {
  const r = { saidas: [], quits: 0, servidores: 0, caixas: [], janelas: 0, pronto: null, segunda: null };
  const electron = new Proxy({}, {
    get: (_o, k) => {
      if (k === 'app') {
        return new Proxy({}, {
          get: (_a, m) => {
            if (m === 'requestSingleInstanceLock') return () => primeira;
            if (m === 'exit') return (codigo) => { r.saidas.push(codigo); };
            if (m === 'quit') return () => { r.quits++; };
            if (m === 'whenReady') return () => ({ then: (fn) => { r.pronto = fn; } });
            if (m === 'isPackaged') return true;
            if (m === 'on') return (evento, fn) => { if (evento === 'second-instance') r.segunda = fn; };
            return tudo();
          },
        });
      }
      if (k === 'dialog') return { showErrorBox: (...a) => r.caixas.push(a), showMessageBox: async () => ({ response: 0 }) };
      if (k === 'BrowserWindow') return new Proxy(function () { r.janelas++; return tudo(); }, { get: () => tudo() });
      return tudo();
    },
  });
  const contexto = vm.createContext({
    require: (id) => {
      if (id === 'electron') return electron;
      if (id === 'node:http') return { createServer: () => { r.servidores++; return tudo(); } };
      if (id === 'node:path' || id === 'node:url') return require(id);
      return tudo();
    },
    __dirname: new URL('../electron/', import.meta.url).pathname,
    console: { log() {}, warn() {}, error() {} },
    process: { platform: 'win32', execPath: 'C:/Duotone/Duotone.exe', argv: ['C:/Duotone/Duotone.exe'], env: {}, on() {}, versions: {} },
    URL, AbortController, setTimeout, clearTimeout, setInterval, clearInterval, Buffer,
  });
  vm.runInContext(fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8'), contexto);
  return r;
}

// A segunda: sai já, com 0, e mesmo que o `ready` chegue não abre servidor, janela nem caixa de erro.
const segunda = arrancar(false);
assert.deepEqual(segunda.saidas, [0], 'sai logo, sem erro');
assert.ok(segunda.pronto, 'o main.cjs regista o whenReady');
await segunda.pronto();
assert.equal(segunda.servidores, 0, 'não tenta a porta da primeira');
assert.equal(segunda.janelas, 0, 'nem abre janela');
assert.deepEqual(segunda.caixas, [], 'nem mostra "A porta 18081 esta a ser usada"');

// A primeira não sai, e é ela que recebe a segunda (mostra a janela).
const primeira = arrancar(true);
assert.deepEqual(primeira.saidas, [], 'a primeira fica');
assert.equal(primeira.quits, 0);
assert.equal(typeof primeira.segunda, 'function', 'a primeira ouve o second-instance');

const main = fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
assert.doesNotMatch(main, /requestSingleInstanceLock\(\)\) app\.quit\(\)/, 'o quit antes do ready não trava o whenReady');
console.log('Segunda instância do Windows: sai já, sem servidor, janela nem caixa de erro; a primeira fica.');
