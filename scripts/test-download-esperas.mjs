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
    'react-native': {
      Platform: { OS: 'ios' },
      AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    },
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

await check('corpo lido por fragmentos publica exatamente o áudio de vários pedidos Range', async () => {
  const original = new Uint8Array(1_000_017);
  new DataView(original.buffer).setUint32(0, original.length);
  original.set([109, 100, 97, 116], 4); // mdat, preservado pelo fixer
  for (let i = 8; i < original.length; i++) original[i] = i % 251;
  const ranges = [];
  let libertacoes = 0;
  const h = harness(async (url, opts) => {
    const [, de, ate] = /bytes=(\d+)-(\d+)/.exec(opts.headers.Range);
    const start = Number(de), end = Number(ate);
    ranges.push([start, end]);
    let posicao = start;
    return { ...response({ start, end, total: original.length }), body: { getReader: () => ({
      read: async () => {
        if (posicao > end) return { done: true };
        const fim = Math.min(end + 1, posicao + 65_537);
        const value = original.slice(posicao, fim);
        posicao = fim;
        return { done: false, value };
      },
      cancel: async () => { assert.fail('não deve cancelar uma leitura completa'); },
      releaseLock: () => { libertacoes++; },
    }) } };
  });
  const pedido = observe(h.cache.downloadProgressiveAudio('inteira', 'https://audio.test/inteira', original.length, null));
  // Entre dois Range o downloader cede um turno (sleep(0)). Deixar também
  // esse turno correr depois das microtarefas de todos os fragmentos.
  for (let passo = 0; passo < 20 && pedido.state === 'pending'; passo++) await h.time.advance(1);
  assert.equal(pedido.state, 'fulfilled');
  assert.deepEqual(ranges, [[0, 999_999], [1_000_000, 1_000_016]]);
  assert.deepEqual(h.disk.get(pedido.value), original);
  assert.equal(libertacoes, 2);
  assert.equal(h.time.pending(), 0);
});

// 27/9: a música escolhida já não espera pelo fim do ficheiro de outra. Um
// download explícito a meio cede a vaga ENTRE BOCADOS, fica com o que tem, e
// continua do mesmo sítio quando a música acaba de descarregar.
await check('a reprodução passa à frente de um download explícito entre bocados', async () => {
  const original = new Uint8Array(2_500_000);
  new DataView(original.buffer).setUint32(0, original.length);
  original.set([109, 100, 97, 116], 4);
  for (let i = 8; i < original.length; i++) original[i] = i % 241;
  const pedidos = [];
  const h = harness(async (url, opts) => {
    const [, de, ate] = /bytes=(\d+)-(\d+)/.exec(opts.headers.Range);
    const start = Number(de), end = Number(ate);
    const id = url.split('/').at(-1);
    pedidos.push(`${id}@${start}`);
    if (id === 'grande') {
      return response({ start, end, total: original.length, body: async () => original.slice(start, end + 1).buffer });
    }
    return response();
  });
  const explicito = observe(h.cache.downloadProgressiveAudio('grande', 'https://audio.test/grande', original.length, null, { prioridade: 'explicito' }));
  await drain();
  assert.deepEqual(pedidos, ['grande@0'], 'o explícito já vai no primeiro bocado');
  const musica = observe(h.download('escolhida', { prioridade: 'reproducao' }));
  await drain();
  assert.equal(h.queue.estadoDaFila().emEspera, 1, 'a música escolhida está à espera da vaga');
  for (let passo = 0; passo < 40 && (explicito.state === 'pending' || musica.state === 'pending'); passo++) await h.time.advance(1);
  assert.equal(musica.state, 'fulfilled', 'a música escolhida descarregou');
  assert.equal(explicito.state, 'fulfilled', 'e o explícito acabou depois dela');
  assert.deepEqual(pedidos, ['grande@0', 'escolhida@0', 'grande@1000000', 'grande@2000000'],
    'a música entrou entre dois bocados do explícito, que continuou do mesmo sítio');
  assert.deepEqual(h.disk.get(explicito.value), original, 'o ficheiro do explícito está inteiro');
  assert.equal(h.queue.estadoDaFila().aDescarregar, 0);
  assert.equal(h.time.pending(), 0);
});

await check('corpo parado cancela o pedido e repete o mesmo Range sem publicar bytes parciais', async () => {
  const calls = [];
  let tarde, cancelamentos = 0, libertacoes = 0;
  const h = harness(async (url, opts) => {
    calls.push({ range: opts.headers.Range, signal: opts.signal });
    if (calls.length > 1) return response();
    let leituras = 0;
    return { ...response(), body: { getReader: () => ({
      read: () => ++leituras === 1
        ? Promise.resolve({ done: false, value: audio.slice(0, 4) })
        : new Promise(r => { tarde = r; }),
      cancel: () => { cancelamentos++; return new Promise(() => {}); },
      releaseLock: () => { libertacoes++; },
    }) } };
  });
  const pedido = observe(h.download('corpo-parado', { prioridade: 'reproducao' }));
  await h.time.advance(9999);
  assert.equal(pedido.state, 'pending');
  assert.equal(h.disk.size, 0);
  await h.time.advance(1);
  assert.equal(calls[0].signal.aborted, true);
  assert.equal(cancelamentos, 1);
  assert.equal(libertacoes, 1);
  await h.time.advance(800);
  assert.equal(pedido.state, 'fulfilled');
  assert.deepEqual(calls.map(c => c.range), ['bytes=0-15', 'bytes=0-15']);
  assert.deepEqual(h.disk.get(pedido.value), audio);
  tarde({ done: false, value: Uint8Array.from([99, 99]) });
  await drain();
  assert.deepEqual(h.disk.get(pedido.value), audio, 'a resposta tardia não altera o ficheiro');
  assert.equal(h.queue.estadoDaFila().aDescarregar, 0);
  assert.equal(h.time.pending(), 0);
});

await check('skip durante read pendurado liberta já a vaga para outro áudio', async () => {
  let cancelar = false, sinal, cancelamentos = 0;
  const h = harness(async (url, opts) => {
    if (url.endsWith('/nova')) return response();
    sinal = opts.signal;
    return { ...response(), body: { getReader: () => ({
      read: () => new Promise(() => {}),
      cancel: async () => { cancelamentos++; },
      releaseLock: () => {},
    }) } };
  });
  const velha = observe(h.download('velha', { prioridade: 'seguinte', shouldAbort: () => cancelar }));
  await drain();
  const nova = observe(h.download('nova', { prioridade: 'reproducao' }));
  cancelar = true;
  h.cache.verificarCancelamentos();
  await drain();
  rejectedAsAbort(velha, h.cache);
  assert.equal(sinal.aborted, true);
  assert.equal(cancelamentos, 1);
  assert.equal(nova.state, 'fulfilled');
  assert.equal(h.disk.size, 1, 'só a nova faixa é publicada');
  assert.equal(h.queue.estadoDaFila().aDescarregar, 0);
  assert.equal(h.time.pending(), 0);
});

await check('bytes a chegar não prolongam o prazo total de 30 s da tentativa', async () => {
  let chamadas = 0, sinal;
  const leituras = [];
  const h = harness(async (url, opts) => {
    if (++chamadas > 1) return response();
    sinal = opts.signal;
    return { ...response(), body: { getReader: () => ({
      read: () => new Promise(r => leituras.push(r)),
      cancel: async () => {}, releaseLock: () => {},
    }) } };
  });
  const pedido = observe(h.download('lenta'));
  for (let i = 0; i < 3; i++) {
    await h.time.advance(9000);
    leituras[i]({ done: false, value: audio.slice(i * 4, i * 4 + 4) });
  }
  await h.time.advance(2999);
  assert.equal(sinal.aborted, false);
  await h.time.advance(1);
  assert.equal(sinal.aborted, true);
  await h.time.advance(800);
  assert.equal(pedido.state, 'fulfilled');
  assert.equal(chamadas, 2);
  assert.equal(h.time.pending(), 0);
});

// Skips seguidos (27/9, João: "dava skips seguidos e a app não descarregava a
// música e ficava presa, só reiniciando"). A sequência que um utilizador faz a
// passar músicas, com o Smart Cache a adiantar as três seguintes 1 s depois de
// cada uma ficar pronta, e uma rede má: pedidos que nunca respondem (nem ao
// abort), corpos pendurados e respostas lentas. Cada faixa tem 2,5 MB, em
// vários bocados, e a resposta respeita o Range.
//
// Duas variantes. Com a rede a melhorar depois dos skips, a música em que se
// parou tem de tocar depressa (um pedido sem resposta desiste aos 8 s). Com a
// rede SEMPRE má, tem de acabar em tempo limitado -- a tocar, ou a falhar para
// o leitor cair no HLS/embed --, e nunca ficar pendurada: é isso o "só
// reiniciando". A primeira versão deste teste (apanhada na revisão do Codex)
// agendava o adiantamento quando a faixa já tinha mudado e nunca o exercitava;
// agora conta-se, e tem de acontecer.
function aleatorio(semente) {
  let a = semente >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const GRANDE = (() => {
  const n = 2_500_000;
  const b = new Uint8Array(n);
  new DataView(b.buffer).setUint32(0, n);
  b.set([109, 100, 97, 116], 4); // 'mdat'
  return b;
})();
function respostaDoIntervalo(range) {
  const m = /bytes=(\d+)-(\d+)/.exec(range ?? '');
  const start = m ? Number(m[1]) : 0;
  const end = m ? Math.min(Number(m[2]), GRANDE.length - 1) : GRANDE.length - 1;
  return response({ start, end, total: GRANDE.length, body: async () => GRANDE.slice(start, end + 1).buffer });
}
async function tempestade(semente, { redeMelhora }) {
  const r = aleatorio(semente);
  let redeBoa = false;
  let H;
  const h = H = harness((url, opts) => {
    const x = redeBoa ? 1 : r();
    if (x < 0.06) { tempestade.penduradas++; return new Promise(() => {}); } // nunca responde, nem ao abort
    if (x < 0.12) { tempestade.penduradas++; return Promise.resolve(response({ body: () => new Promise(() => {}) })); } // corpo pendurado
    const atraso = redeBoa ? 300 : 200 + Math.floor(r() * 4000);
    return new Promise((ok) => H.time.setTimeout(() => ok(respostaDoIntervalo(opts.headers?.Range)), atraso));
  });
  const N = 24;
  const id = (i) => `t${i}`;
  const descarregar = (i, opts) => h.cache.downloadProgressiveAudio(id(i), `https://audio.test/${id(i)}`, GRANDE.length, null, opts);
  let atual = 0;
  const adiantar = new Map();
  const smartCache = (i) => {
    const servem = new Set([i, i + 1, i + 2, i + 3].filter((k) => k < N).map(id));
    for (const [k, p] of adiantar) p.abandonado = !servem.has(k);
    h.cache.verificarCancelamentos();
  };
  // 1 s depois de a atual ficar pronta adianta as seguintes, uma de cada vez,
  // enquanto ela for a atual.
  const aoFicarPronta = (i) => h.time.setTimeout(async () => {
    for (let k = i + 1; k <= i + 3 && k < N; k++) {
      if (atual !== i) return;
      if (h.cache.isAudioCached(id(k)) || adiantar.has(id(k))) continue;
      const p = { abandonado: false };
      adiantar.set(id(k), p);
      tempestade.adiantamentos++;
      try { await descarregar(k, { prioridade: k === i + 1 ? 'seguinte' : 'adiantar', shouldAbort: () => p.abandonado }); }
      catch { /* falhar a adiantar é só não ganhar tempo */ }
      finally { if (adiantar.get(id(k)) === p) adiantar.delete(id(k)); }
    }
  }, 1000);
  const tocar = (i) => {
    const promessa = descarregar(i, { prioridade: 'reproducao', shouldAbort: () => atual !== i });
    promessa.then(() => { if (atual === i) aoFicarPronta(i); }, () => {});
    return observe(promessa);
  };
  let pedido = tocar(0);
  smartCache(0);
  const passos = 6 + Math.floor(r() * 10);
  for (let s = 0; s < passos; s++) {
    // Umas vezes salta-se logo, outras fica-se a ouvir o suficiente para o
    // Smart Cache começar -- e o salto seguinte cai numa faixa a meio de ser
    // adiantada, que é onde a reprodução se junta ao download de outro.
    await h.time.advance(r() < 0.3 ? 6000 + Math.floor(r() * 9000) : 300 + Math.floor(r() * 4700));
    atual++;
    h.cache.verificarCancelamentos(); // o leitor, ao trocar de faixa
    pedido = tocar(atual);
    smartCache(atual);
  }
  // O pedido da que fica sai ainda com a rede má.
  await h.time.advance(500);
  if (redeMelhora) redeBoa = true;
  let espera = 0;
  for (; espera < 400 && pedido.state === 'pending'; espera++) await h.time.advance(1000);
  return { estado: pedido.state, espera };
}
for (const redeMelhora of [true, false]) {
  const nome = redeMelhora
    ? 'skips seguidos, a rede melhora: a música em que se parou toca depressa'
    : 'skips seguidos, a rede fica sempre má: a música final acaba em tempo limitado, nunca pendurada';
  await check(nome, async () => {
    tempestade.penduradas = 0;
    tempestade.adiantamentos = 0;
    const esperas = [];
    const pendentes = [];
    let tocaram = 0;
    for (let semente = 1; semente <= 150; semente++) {
      const res = await tempestade(semente, { redeMelhora });
      esperas.push(res.espera);
      if (res.estado === 'pending') pendentes.push(semente);
      if (res.estado === 'fulfilled') tocaram++;
    }
    esperas.sort((a, b) => a - b);
    if (process.env.DIAG) console.log(`    adiantamentos: ${tempestade.adiantamentos}, penduradas: ${tempestade.penduradas}, tocaram ${tocaram}/150, espera mediana ${esperas[75]} s, p95 ${esperas[142]} s, max ${esperas.at(-1)} s`);
    assert.ok(tempestade.adiantamentos > 50, `o Smart Cache quase não adiantou nada (${tempestade.adiantamentos}): o teste não prova a convivência com os skips`);
    assert.deepEqual(pendentes.slice(0, 5), [], `${pendentes.length}/150 ficaram pendurados`);
    if (redeMelhora) {
      assert.equal(tocaram, 150, 'com a rede boa, a música final tem de tocar');
      assert.ok(esperas.at(-1) <= 45, `a pior espera foi ${esperas.at(-1)} s`);
    } else {
      // 4 tentativas de 8 s (mais o backoff) por bocado, sem encolher numa rede
      // que não responde: nunca os ~113 s de antes.
      assert.ok(esperas.at(-1) <= 90, `a pior espera foi ${esperas.at(-1)} s`);
    }
  });
}

if (failures) {
  console.error(`\n${failures} teste(s) de esperas falharam (sem aguardar relógios reais).`);
  process.exitCode = 1;
} else console.log('\nEsperas do downloader: todos os casos passaram.');
