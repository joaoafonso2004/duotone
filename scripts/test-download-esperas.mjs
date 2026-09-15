// Exercita o downloader e a fila REAIS em Node, com a plataforma iOS e rede/disco
// controlados. O relógio virtual torna um fetch que ignora abort uma falha finita
// de teste: nunca esperamos 30 s / 4 min reais, nem substituímos o código testado.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const nativeRequire = createRequire(import.meta.url);
const drain = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const observe = (promise) => {
  const result = { state: 'pending', value: undefined, error: undefined };
  promise.then((value) => { result.state = 'fulfilled'; result.value = value; },
    (error) => { result.state = 'rejected'; result.error = error; });
  return result;
};

function clock() {
  let now = 100_000;
  let nextId = 1;
  const timers = new Map();
  const add = (fn, delay, interval) => {
    const id = nextId++;
    timers.set(id, { fn, at: now + Math.max(0, delay ?? 0), interval });
    return id;
  };
  return {
    Date: class extends Date { static now() { return now; } },
    setTimeout: (fn, delay) => add(fn, delay, null),
    setInterval: (fn, delay) => add(fn, delay, Math.max(1, delay)),
    clearTimeout: (id) => timers.delete(id),
    clearInterval: (id) => timers.delete(id),
    pending: () => timers.size,
    async advance(ms) {
      const end = now + ms;
      await drain();
      for (let steps = 0; ; steps++) {
        assert.ok(steps < 20_000, 'o relógio entrou num ciclo infinito');
        const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [id, timer] = next;
        now = timer.at;
        if (timer.interval === null) timers.delete(id);
        else timer.at += timer.interval;
        timer.fn();
        await drain();
      }
      now = end;
      await drain();
    },
  };
}

// Uma box mdat completa basta para passar pelo fixer verdadeiro sem depender
// de codecs. PublicarAudio, tamanho e publicação .part continuam todos reais.
const audio = Uint8Array.from([0, 0, 0, 16, 109, 100, 97, 116, 1, 2, 3, 4, 5, 6, 7, 8]);
function response({ status = 206, body = async () => audio.slice().buffer, start = 0, end = audio.length - 1, total = audio.length } = {}) {
  return { status, headers: { get: (name) => ({
    'content-range': `bytes ${start}-${end}/${total}`,
    'content-length': String(end - start + 1),
  })[name.toLowerCase()] ?? null }, arrayBuffer: body };
}

function harness(fetchImpl) {
  const time = clock();
  const disk = new Map();
  class File {
    constructor(dir, name) { this.uri = `${dir.uri}/${name}`; }
    get name() { return this.uri.split('/').at(-1); }
    get exists() { return disk.has(this.uri); }
    get size() { return disk.get(this.uri)?.length ?? 0; }
    create() { disk.set(this.uri, new Uint8Array()); }
    write(data) { disk.set(this.uri, Uint8Array.from(data)); }
    delete() { disk.delete(this.uri); }
    moveSync(dest) { disk.set(dest.uri, disk.get(this.uri)); disk.delete(this.uri); this.uri = dest.uri; }
  }
  const dir = (uri) => ({ uri, list: () => [...disk.keys()].filter((key) => key.startsWith(`${uri}/`)).map((key) => new File({ uri }, key.slice(uri.length + 1))) });
  const stubs = {
    'react-native': { Platform: { OS: 'ios' } },
    '@react-native-async-storage/async-storage': { getItem: async () => null, setItem: async () => {} },
    'expo-file-system': { File, Paths: { document: dir('file:///document'), cache: dir('file:///cache') } },
    zustand: { create: (init) => {
      let state = init();
      const store = (select = (value) => value) => select(state);
      store.setState = (value) => { state = { ...state, ...(typeof value === 'function' ? value(state) : value) }; };
      store.getState = () => state;
      return store;
    } },
  };
  const context = vm.createContext({
    console, AbortController, Uint8Array, ArrayBuffer, DataView, Error,
    ...time, fetch: (...args) => fetchImpl(...args),
  });
  const modules = new Map();
  const load = (filename) => {
    filename = path.resolve(filename);
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const require = (name) => {
      if (Object.hasOwn(stubs, name)) return stubs[name];
      if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), name.endsWith('.ts') ? name : `${name}.ts`));
      return nativeRequire(name);
    };
    new vm.Script(`(function(require, module, exports) {\n${source}\n})`, { filename }).runInContext(context)(require, module, module.exports);
    return module.exports;
  };
  const cache = load(path.join(root, 'src/lib/youtubeCache.ts'));
  const queue = load(path.join(root, 'src/lib/filaDeDownloads.ts'));
  const cover = load(path.join(root, 'src/lib/montagemDaCapa.ts'));
  const download = (id, opts = {}) => cache.downloadProgressiveAudio(id, `https://audio.test/${id}`, audio.length, null, opts);
  return { cache, queue, cover, download, time, disk };
}

function rejectedAsAbort(result, cache, message) {
  assert.equal(result.state, 'rejected', message);
  assert.equal(result.error?.message, cache.DOWNLOAD_ABORTED);
}

let failures = 0;
async function check(name, fn) {
  try { await fn(); console.log(`  ok - ${name}`); }
  catch (error) { failures++; console.error(`  FALHOU - ${name}: ${error.message}`); }
}

console.log('Esperas do downloader iOS (código real, relógio virtual):');

for (const blockedAt of ['fetch', 'arrayBuffer']) {
  await check(`adiantamento preso em ${blockedAt} liberta a reprodução ao cancelar`, async () => {
    const never = deferred();
    const calls = [];
    let aborted = false;
    const h = harness((url, opts) => {
      calls.push({ url, signal: opts.signal });
      if (url.endsWith('/fundo')) return blockedAt === 'fetch' ? never.promise : Promise.resolve(response({ body: () => never.promise }));
      return Promise.resolve(response());
    });
    const background = observe(h.download('fundo', { prioridade: 'adiantar', shouldAbort: () => aborted }));
    await drain();
    const playback = observe(h.download('actual', { prioridade: 'reproducao' }));
    await drain();
    assert.equal(h.queue.estadoDaFila().aDescarregar, 1);
    assert.equal(h.queue.estadoDaFila().emEspera, 1);
    const download = h.cache.estadoDoDownload('actual');
    assert.equal(download.fase, 'na-fila');
    assert.equal(h.cover.estadoPreso({
      fase: h.cover.faseDoArranque({ emDiscoAoComecar: false, pronta: false, download }),
      agora: download.pedidoEm + 8_000, pedidoEm: download.pedidoEm, download,
    }), 'nao-comecou');
    aborted = true;
    h.cache.verificarCancelamentos();
    await drain();
    assert.equal(calls[0].signal.aborted, true, 'o AbortController nem sequer foi avisado');
    rejectedAsAbort(background, h.cache, `${blockedAt} ignorou abort e reteve a única vaga; reprodução ainda ${playback.state}`);
    assert.equal(playback.state, 'fulfilled', 'a reprodução ficou à espera da recuperação aos quatro minutos');
    assert.equal(h.queue.estadoDaFila().aDescarregar, 0);
    assert.equal(h.time.pending(), 0, 'ficaram timers de espera depois do cancelamento');
  });
}

await check('sonda de tamanho tem prazo mesmo quando fetch ignora AbortSignal', async () => {
  const calls = [];
  const h = harness((_url, opts) => { calls.push(opts.signal); return new Promise(() => {}); });
  const result = observe(h.cache.discoverContentLength('https://audio.test/tamanho'));
  await h.time.advance(30_001);
  assert.equal(calls[0].aborted, true);
  assert.equal(result.state, 'rejected', 'o prazo só fez abort(): a Promise da sonda continua pendurada');
  assert.equal(h.time.pending(), 0);
});

for (const blockedAt of ['fetch', 'arrayBuffer']) {
  await check(`bocado tem prazo mesmo quando ${blockedAt} ignora AbortSignal`, async () => {
    const calls = [];
    const h = harness((_url, opts) => {
      calls.push(opts.signal);
      return blockedAt === 'fetch' ? new Promise(() => {}) : Promise.resolve(response({ body: () => new Promise(() => {}) }));
    });
    const result = observe(h.cache.fetchChunkWithRetry('https://audio.test/bocado', 0, audio.length - 1, undefined, undefined, audio.length));
    await h.time.advance(150_000); // quatro tentativas de 30s + backoff, ainda antes de 4min
    assert.equal(result.state, 'rejected', `${blockedAt} continua pendurado depois dos prazos de todas as tentativas`);
    assert.ok(calls.length <= 4, 'o número de tentativas deixou de ser limitado');
    assert.ok(calls.every((signal) => signal.aborted));
    assert.equal(h.time.pending(), 0);
  });
}

await check('403 com renewUrl pendurado cancela já, sem esperar os 30s', async () => {
  let aborted = false;
  let renewals = 0;
  const h = harness(async () => response({ status: 403 }));
  const result = observe(h.cache.fetchChunkWithRetry('https://audio.test/403', 0, audio.length - 1,
    () => { renewals++; return new Promise(() => {}); }, () => aborted, audio.length));
  await drain();
  assert.equal(renewals, 1);
  aborted = true;
  h.cache.verificarCancelamentos();
  await drain();
  rejectedAsAbort(result, h.cache, 'renewUrl continuou pendurado depois de verificarCancelamentos');
  assert.equal(h.time.pending(), 0, 'o timer perdedor da renovação não foi limpo');
});

await check('quem espera emCurso cancela sem abortar o dono do mesmo áudio', async () => {
  const body = deferred();
  let followerAborted = false;
  let calls = 0;
  let ownerSignal;
  const h = harness(async (_url, opts) => { calls++; ownerSignal = opts.signal; return response({ body: () => body.promise }); });
  const owner = observe(h.download('mesma', { prioridade: 'explicito' }));
  await drain();
  const follower = observe(h.download('mesma', { prioridade: 'reproducao', shouldAbort: () => followerAborted }));
  await drain();
  followerAborted = true;
  h.cache.verificarCancelamentos();
  await drain();
  rejectedAsAbort(follower, h.cache, 'o caller cancelado ficou dependente do download de outro caller');
  assert.equal(owner.state, 'pending');
  assert.equal(ownerSignal.aborted, false, 'cancelar o seguidor abortou um download explícito');
  assert.equal(calls, 1);
  body.resolve(audio.slice().buffer);
  await drain();
  assert.equal(owner.state, 'fulfilled');
  assert.equal(h.queue.estadoDaFila().aDescarregar, 0);
  assert.equal(h.time.pending(), 0);
});

await check('skip cancelado sai da fila imediatamente e não ocupa uma vaga futura', async () => {
  const body = deferred();
  let skipped = false;
  const calls = [];
  const h = harness(async (url) => {
    calls.push(url);
    return url.endsWith('/dono') ? response({ body: () => body.promise }) : response();
  });
  const owner = observe(h.download('dono', { prioridade: 'explicito' }));
  await drain();
  const abandoned = observe(h.download('saltada', { prioridade: 'reproducao', shouldAbort: () => skipped }));
  await drain();
  assert.equal(h.queue.estadoDaFila().emEspera, 1);
  skipped = true;
  h.cache.verificarCancelamentos();
  await drain();
  rejectedAsAbort(abandoned, h.cache, 'o pedido saltado só descobre o cancelamento quando recebe a vaga');
  assert.equal(h.queue.estadoDaFila().emEspera, 0, 'o waiter cancelado ficou guardado na fila');
  assert.equal(h.cache.estadoDoDownload('saltada'), null);
  const current = observe(h.download('actual', { prioridade: 'reproducao' }));
  body.resolve(audio.slice().buffer);
  await drain();
  assert.equal(owner.state, 'fulfilled');
  assert.equal(current.state, 'fulfilled');
  assert.ok(calls.every((url) => !url.endsWith('/saltada')));
  assert.equal(h.queue.estadoDaFila().aDescarregar, 0);
  assert.equal(h.time.pending(), 0);
});

await check('cancelamento do dono permite ao seguidor ainda interessado assumir o áudio', async () => {
  let ownerAborted = false;
  let calls = 0;
  const h = harness(async () => {
    calls++;
    return calls === 1 ? response({ body: () => new Promise(() => {}) }) : response();
  });
  const owner = observe(h.download('mesma', { prioridade: 'adiantar', shouldAbort: () => ownerAborted }));
  await drain();
  const follower = observe(h.download('mesma', { prioridade: 'reproducao' }));
  await drain();
  ownerAborted = true;
  h.cache.verificarCancelamentos();
  await drain();
  rejectedAsAbort(owner, h.cache, 'o dono cancelado não deixou o seguidor assumir');
  assert.equal(follower.state, 'fulfilled');
  assert.equal(calls, 2);
  assert.equal(h.queue.estadoDaFila().aDescarregar, 0);
  assert.equal(h.disk.size, 1);
  assert.equal(h.time.pending(), 0);
});

await check('resposta tardia do cancelado não publica áudio nem larga a vaga do novo dono', async () => {
  const oldBody = deferred();
  const newBody = deferred();
  let oldAborted = false;
  const h = harness(async (url) => response({ body: () => url.endsWith('/antiga') ? oldBody.promise : newBody.promise }));
  const old = observe(h.download('antiga', { prioridade: 'adiantar', shouldAbort: () => oldAborted }));
  await drain();
  const current = observe(h.download('actual', { prioridade: 'reproducao' }));
  await drain();
  oldAborted = true;
  h.cache.verificarCancelamentos();
  await drain();
  rejectedAsAbort(old, h.cache, 'o download antigo não terminou ao cancelar');
  assert.equal(h.queue.estadoDaFila().aDescarregar, 1);
  assert.equal(h.cache.estadoDoDownload('actual').fase, 'a-descarregar');
  oldBody.resolve(audio.slice().buffer); // a rede nativa ignorou abort e respondeu tarde
  await drain();
  assert.equal(current.state, 'pending');
  assert.equal(h.queue.estadoDaFila().aDescarregar, 1, 'o callback tardio libertou uma vaga que não lhe pertence');
  assert.equal(h.disk.size, 0, 'o download cancelado publicou o resultado tardio');
  newBody.resolve(audio.slice().buffer);
  await drain();
  assert.equal(current.state, 'fulfilled');
  assert.equal(h.disk.size, 1);
  assert.equal(h.queue.estadoDaFila().aDescarregar, 0);
  assert.equal(h.time.pending(), 0);
});

await check('a verificação periódica também cancela uma espera sem aviso explícito', async () => {
  let aborted = false;
  const h = harness(() => new Promise(() => {}));
  const result = observe(h.cache.discoverContentLength('https://audio.test/tamanho', () => aborted));
  await drain();
  aborted = true;
  await h.time.advance(1_001);
  rejectedAsAbort(result, h.cache, 'a rede de segurança periódica também depende de fetch respeitar abort');
  assert.equal(h.time.pending(), 0);
});

await check('downloads normais continuam a ocupar apenas uma vaga e publicam áudio completo', async () => {
  const firstBody = deferred();
  const calls = [];
  const h = harness(async (url) => { calls.push(url); return url.endsWith('/primeira') ? response({ body: () => firstBody.promise }) : response(); });
  const first = observe(h.download('primeira', { prioridade: 'adiantar' }));
  await drain();
  const second = observe(h.download('segunda', { prioridade: 'reproducao' }));
  await drain();
  assert.equal(calls.length, 1);
  assert.equal(h.queue.estadoDaFila().aDescarregar, 1);
  assert.equal(h.queue.estadoDaFila().emEspera, 1);
  firstBody.resolve(audio.slice().buffer);
  await drain();
  assert.equal(first.state, 'fulfilled');
  assert.equal(second.state, 'fulfilled');
  assert.equal(calls.length, 2);
  assert.equal(h.queue.estadoDaFila().aDescarregar, 0);
  assert.equal(h.disk.size, 2);
  for (const [uri, bytes] of h.disk) {
    assert.ok(uri.endsWith('.m4a'), 'ficou um .part publicado');
    assert.deepEqual(bytes, audio);
  }
  assert.equal(h.time.pending(), 0);
});

for (const ordem of ['antes', 'depois']) {
  await check(`cancelar ${ordem} de receber a vaga no mesmo turno não perde bilhetes`, async () => {
    let aborted = false;
    const calls = [];
    const h = harness(async (url) => { calls.push(url); return response(); });
    const ticket = await h.queue.pedirVez('explicito');
    const skipped = observe(h.download('saltada', { prioridade: 'reproducao', shouldAbort: () => aborted }));
    await drain();
    const cancel = () => { aborted = true; h.cache.verificarCancelamentos(); };
    if (ordem === 'antes') cancel();
    h.queue.largarVez(ticket);
    if (ordem === 'depois') cancel();
    await drain();
    rejectedAsAbort(skipped, h.cache, 'o cancelamento coincidente com a vaga perdeu-se');
    assert.equal(h.queue.estadoDaFila().aDescarregar, 0, 'a vaga foi concedida mas ninguém a largou');
    assert.equal(h.queue.estadoDaFila().emEspera, 0);
    assert.equal(calls.length, 0, 'a faixa saltada ainda pediu bytes');
    assert.equal(h.time.pending(), 0);
  });
}

await check('403 a meio recupera com URL novo e conserva o mesmo Range', async () => {
  const calls = [];
  const h = harness(async (url, opts) => {
    calls.push({ url, range: opts.headers.Range });
    return response({ status: url.endsWith('/velho') ? 403 : 206, start: 8, body: async () => audio.slice(8).buffer });
  });
  const result = observe(h.cache.fetchChunkWithRetry('https://audio.test/velho', 8, audio.length - 1,
    async () => 'https://audio.test/novo', undefined, audio.length));
  await h.time.advance(800);
  assert.equal(result.state, 'fulfilled');
  assert.deepEqual(calls, [
    { url: 'https://audio.test/velho', range: 'bytes=8-15' },
    { url: 'https://audio.test/novo', range: 'bytes=8-15' },
  ]);
  assert.deepEqual(result.value.bytes, audio.slice(8));
  assert.equal(h.time.pending(), 0, 'a renovação resolveu mas deixou o timeout de 30s vivo');
});

if (failures) {
  console.error(`\n${failures} teste(s) de esperas falharam (sem aguardar relógios reais).`);
  process.exitCode = 1;
} else console.log('\nEsperas do downloader: todos os casos passaram.');
