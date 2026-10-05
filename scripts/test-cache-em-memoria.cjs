// A camada em memória do `yt_cache` (src/api/cache.ts, 2/10): o que vem de fora
// (catálogo, YouTube) não volta ao Supabase dentro da mesma sessão, e o que é
// da conta continua a ler sempre o servidor. Cada pedido é uma linha de log.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function load(file, mocks) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, console, Date, Symbol, Map, Promise,
    require: (name) => { if (!(name in mocks)) throw Error(`Import não simulado: ${name}`); return mocks[name]; },
  }, { filename: file });
  return module.exports;
}

// Um Supabase de mentira: guarda as linhas e conta as leituras.
const linhas = new Map();
let leituras = 0, escritas = 0;
let atrasar = null;
const supabase = {
  from: () => ({
    select: () => ({
      eq: (_coluna, chave) => ({
        maybeSingle: async () => {
          leituras++;
          if (atrasar) await atrasar;
          return { data: linhas.get(chave) ?? null };
        },
      }),
    }),
    upsert: async (linha) => { escritas++; linhas.set(linha.cache_key, linha); return { error: null }; },
  }),
};
const cache = load('src/api/cache.ts', { '../lib/supabase': { supabase },
  '../lib/cacheExternaLocal': { lerCacheExternaLocal: async () => null, guardarCacheExternaLocal: async () => {} },
  '../lib/trabalhoDeMetadados': { contarCache: () => {} },
});
const HORA = 60 * 60 * 1000;
let falhas = 0;
async function caso(nome, f) {
  cache.esquecerCacheEmMemoria(); linhas.clear(); leituras = 0; escritas = 0; atrasar = null;
  try { await f(); console.log(`  ok - ${nome}`); } catch (e) { falhas++; console.error(`  FALHOU - ${nome}: ${e.message}`); }
}

(async () => {
  await caso('com memória, a segunda leitura da mesma chave não vai ao servidor', async () => {
    linhas.set('a', { payload: { x: 1 }, fetched_at: new Date().toISOString() });
    assert.equal((await cache.cacheGet('a', HORA, { memoria: true })).x, 1);
    assert.equal((await cache.cacheGet('a', HORA, { memoria: true })).x, 1);
    assert.equal(leituras, 1);
  });
  await caso('sem memória (o que é da conta), lê sempre o servidor', async () => {
    linhas.set('conta', { payload: 1, fetched_at: new Date().toISOString() });
    await cache.cacheGet('conta', HORA);
    await cache.cacheGet('conta', HORA);
    assert.equal(leituras, 2);
  });
  await caso('uma falta também fica lembrada, e o cacheSet a seguir substitui-a', async () => {
    assert.equal(await cache.cacheGet('b', HORA, { memoria: true }), null);
    assert.equal(await cache.cacheGet('b', HORA, { memoria: true }), null);
    assert.equal(leituras, 1, 'a falta não volta ao servidor logo a seguir');
    await cache.cacheSet('b', { novo: true });
    assert.equal((await cache.cacheGet('b', HORA, { memoria: true })).novo, true);
    assert.equal(leituras, 1);
    assert.equal(escritas, 1, 'o cacheSet continua a escrever no servidor');
  });
  await caso('o que caducou não serve, nem da memória', async () => {
    const velho = new Date(Date.now() - 2 * HORA).toISOString();
    linhas.set('c', { payload: 1, fetched_at: velho });
    assert.equal(await cache.cacheGet('c', HORA, { memoria: true }), null);
    // Com uma validade maior a mesma chave serve -- mas a falta lembrada manda.
    assert.equal(await cache.cacheGet('c', 3 * HORA, { memoria: true }), null);
  });
  await caso('pedidos iguais ao mesmo tempo partilham o mesmo', async () => {
    let soltar; atrasar = new Promise((r) => { soltar = r; });
    linhas.set('d', { payload: 7, fetched_at: new Date().toISOString() });
    const um = cache.cacheGet('d', HORA, { memoria: true });
    const dois = cache.cacheGet('d', HORA, { memoria: true });
    soltar();
    assert.deepEqual([await um, await dois], [7, 7]);
    assert.equal(leituras, 1);
  });
  await caso('o catálogo e o YouTube leem com memória', async () => {
    for (const f of ['src/api/catalogo.ts', 'src/api/youtube.ts']) {
      const fonte = fs.readFileSync(path.join(root, f), 'utf8');
      const todas = fonte.match(/cacheGet</g) ?? [];
      const comMemoria = fonte.match(/cacheGet<[\s\S]*?\{ memoria: true \}\)/g) ?? [];
      assert.ok(todas.length > 0 && comMemoria.length === todas.length, `${f}: ${comMemoria.length} de ${todas.length}`);
    }
  });
  await caso('o que é da conta não lê com memória', async () => {
    for (const f of ['src/state/player.ts', 'src/state/recommendationFeedback.ts', 'src/api/descoberta.ts']) {
      const fonte = fs.readFileSync(path.join(root, f), 'utf8');
      assert.doesNotMatch(fonte, /memoria: true/, f);
    }
  });
  if (falhas) { console.error(`\n${falhas} caso(s) falharam`); process.exit(1); }
  console.log('\nCache em memória: o que vem de fora não volta ao servidor; o da conta volta sempre.');
})();
