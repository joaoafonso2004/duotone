// O download pelo módulo nativo (auditoria 4.1, `modules/duotone-download`):
// o `downloadProgressiveAudio` REAL, com a fila, os retries, a renovação e o
// cancelamento de sempre, mas com um descarregador de mentira que escreve os
// bocados direto no disco falso -- como o URLSession escreve no `.part`. A
// conversão do Opus "nativa" é o conversor JS (o Swift é comparado com ele no
// CI, `scripts/swift/`). O que se prova: o ficheiro publicado é byte a byte o
// do caminho de sempre, e nada fica para trás.
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
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
};
const observe = (promise) => {
  const result = { state: 'pending', value: undefined, error: undefined };
  promise.then((value) => { result.state = 'fulfilled'; result.value = value; },
    (error) => { result.state = 'rejected'; result.error = error; });
  return result;
};

function clock() {
  let now = 1_800_000_000_000;
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

// ---- um m4a do YouTube com 1,5 MB (dois bocados: 1 000 000 e o resto) ---------------------
const u32 = (v) => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
const bytes = (s) => [...s].map((c) => c.charCodeAt(0));
const pad = (n) => new Array(n).fill(0);
const box = (tipo, ...p) => { const c = p.flat(); return [...u32(8 + c.length), ...bytes(tipo), ...c]; };
const DUR = 213 * 44100;
const moov = box('moov', box('mvhd', pad(12), u32(44100), u32(DUR), pad(80)),
  box('mvex', box('mehd', pad(4), u32(DUR))), box('trak', box('tkhd', pad(20), u32(DUR), pad(60))));
const cabeca = [...box('ftyp', bytes('dash'), pad(8)), ...moov, ...box('sidx', pad(28))];
function m4a(mdats) {
  const partes = [cabeca];
  mdats.forEach((n, i) => {
    partes.push(box('moof', box('mfhd', pad(4), u32(i + 1))));
    const conteudo = new Uint8Array(n);
    for (let k = 0; k < n; k++) conteudo[k] = (k * 31 + i) & 0xff;
    partes.push([...u32(8 + n), ...bytes('mdat')], [...conteudo]);
  });
  return new Uint8Array(partes.flat());
}
const original = m4a([700_000, 800_000]);
const webm = new Uint8Array(readFileSync(path.join(root, 'scripts/fixtures/opus-4s.webm')));
const DOC = 'file:///document/';

function harness({ ficheiro = original, status, falharBocado, portao, converter } = {}) {
  const time = clock();
  const disk = new Map();
  const pedidos = [];
  const cancelados = [];
  const fetches = [];
  class File {
    constructor(dir, name) { this.uri = `${dir.uri}/${name}`; }
    get name() { return this.uri.split('/').at(-1); }
    get exists() { return disk.has(this.uri); }
    get size() { return disk.get(this.uri)?.length ?? 0; }
    create() { disk.set(this.uri, new Uint8Array()); }
    write(data) { disk.set(this.uri, Uint8Array.from(data)); }
    delete() { disk.delete(this.uri); }
    moveSync(dest) { disk.set(dest.uri, disk.get(this.uri)); disk.delete(this.uri); this.uri = dest.uri; }
    open(mode) {
      assert.equal(mode, 'rw', 'o .part abre-se para ler e escrever');
      assert.ok(disk.has(this.uri), 'abrir um ficheiro que não existe');
      const uri = this.uri;
      let aberto = true;
      return {
        offset: 0,
        readBytes(n) {
          assert.ok(aberto, 'ler um ficheiro fechado');
          const a = disk.get(uri);
          const r = a.slice(this.offset, this.offset + n);
          this.offset += r.length;
          return r;
        },
        writeBytes(b) {
          assert.ok(aberto, 'escrever num ficheiro fechado');
          const a = disk.get(uri);
          const fim = Math.max(a.length, this.offset + b.length);
          const c = new Uint8Array(fim);
          c.set(a); c.set(b, this.offset);
          disk.set(uri, c);
          this.offset += b.length;
        },
        close() { aberto = false; },
      };
    }
  }
  const dir = (uri) => ({ uri, list: () => [...disk.keys()].filter((key) => key.startsWith(`${uri}/`)).map((key) => new File({ uri }, key.slice(uri.length + 1))) });

  // O URLSession de mentira: escreve [inicio, fim] no ficheiro, na posição `inicio`.
  const nativo = {
    async bocado(p) {
      pedidos.push({ ...p });
      assert.ok(disk.has(p.caminho), 'o bocado escreve num .part que já existe');
      assert.equal(p.total, ficheiro.length);
      assert.equal(p.prazoRespostaMs, 8000);
      assert.equal(p.prazoSemBytesMs, 10_000);
      assert.equal(p.prazoTotalMs, 30_000);
      if (portao) await portao(pedidos.length, p);
      if (cancelados.includes(p.id)) throw new Error('download aborted');
      const s = status?.(pedidos.length, p) ?? 206;
      if (s !== 206) return { status: s, escritos: 0 };
      if (falharBocado?.(pedidos.length, p)) throw new Error('Call to function \'DuotoneDownload.bocado\' has been rejected.\n→ Caused by: The network connection was lost.');
      const a = disk.get(p.caminho);
      const c = new Uint8Array(Math.max(a.length, p.fim + 1));
      c.set(a); c.set(ficheiro.subarray(p.inicio, p.fim + 1), p.inicio);
      disk.set(p.caminho, c);
      return { status: 206, escritos: p.fim - p.inicio + 1 };
    },
    cancelar(id) { cancelados.push(id); },
    async converterOpus(origem, destino) {
      const entrada = disk.get(origem);
      assert.ok(entrada, 'converte um ficheiro que existe');
      if (converter) return converter(origem, destino, disk);
      try {
        const { mp4, segundos } = opus.converterWebmParaMp4(entrada);
        disk.set(destino, mp4);
        return { bytes: mp4.length, segundos, ms: 41 };
      } catch (e) {
        // Como chega do Expo: a frase do Swift embrulhada na da chamada.
        throw new Error(`Call to function 'DuotoneDownload.converterOpus' has been rejected.\n→ Caused by: ${e.message}`);
      }
    },
  };
  const stubs = {
    'react-native': { Platform: { OS: 'ios' }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
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
  const fetchFalso = async (url, opts) => {
    fetches.push(url);
    const [, a, b] = /bytes=(\d+)-(\d+)/.exec(opts.headers.Range);
    const inicio = Number(a), fim = Number(b);
    return {
      status: 206,
      headers: { get: (n) => ({ 'content-range': `bytes ${inicio}-${fim}/${ficheiro.length}`, 'content-length': String(fim - inicio + 1) })[n.toLowerCase()] ?? null },
      arrayBuffer: async () => ficheiro.slice(inicio, fim + 1).buffer,
    };
  };
  const context = vm.createContext({ console, AbortController, Uint8Array, ArrayBuffer, DataView, Error, ...time, fetch: fetchFalso });
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
  const { fixMp4Duration } = load(path.join(root, 'src/lib/mp4Fixer.ts'));
  const opus = load(path.join(root, 'src/lib/converterOpus.ts'));
  cache.definirDescarregadorNativo(nativo);

  const classico = (f) => { const c = f.slice(); fixMp4Duration(c, 213); return c; };
  const descarregar = (id, opts = {}, dur = 213) => observe(cache.downloadProgressiveAudio(id, `https://audio.test/${id}`, ficheiro.length, dur, opts));
  const partes = () => [...disk.keys()].filter((k) => k.endsWith('.part'));
  const andar = async (vezes = 40) => { for (let i = 0; i < vezes; i++) await time.advance(0); };
  return { cache, queue, time, disk, pedidos, cancelados, fetches, nativo, opus, classico, descarregar, partes, andar };
}

let failures = 0;
async function check(name, fn) {
  try { await fn(); console.log(`  ok - ${name}`); }
  catch (error) { failures++; console.error(`  FALHOU - ${name}: ${error.stack}`); }
}

console.log('Download pelo módulo nativo (código real, URLSession de mentira):');

await check('AAC: os bocados vão pelo nativo e o ficheiro publicado é o do caminho de sempre', async () => {
  const h = harness();
  const fins = [];
  h.cache.ouvirFimDosDownloads((f) => fins.push(f));
  const d = h.descarregar('abc');
  await h.andar();
  assert.equal(d.state, 'fulfilled', String(d.error?.stack));
  assert.equal(d.value, `${DOC}yt-audio-abc.m4a`);
  assert.deepEqual(h.disk.get(d.value), h.classico(original), 'igual byte a byte ao fixer sobre o ficheiro inteiro');
  assert.equal(h.fetches.length, 0, 'nenhum bocado passou pelo fetch do JavaScript');
  assert.deepEqual(h.pedidos.map((p) => [p.inicio, p.fim]), [[0, 999_999], [1_000_000, original.length - 1]]);
  assert.equal(new Set(h.pedidos.map((p) => p.caminho)).size, 1, 'todos os bocados para o mesmo .part');
  assert.match(h.pedidos[0].caminho, /\.part$/);
  assert.deepEqual(h.partes(), []);
  assert.equal(h.cache.isAudioCached('abc'), true);
  assert.equal(h.queue.estadoDaFila().aDescarregar, 0);
  assert.equal(fins.length, 1);
  assert.equal(fins[0].resultado, 'ok');
  assert.equal(fins[0].bocados, 2);
});

await check('AAC que a correção no sítio não garante: o fixer sobre o ficheiro inteiro, o mesmo resultado', async () => {
  const comLixo = new Uint8Array([...original, 1, 2, 3]);
  const h = harness({ ficheiro: comLixo });
  const d = h.descarregar('abc');
  await h.andar();
  assert.equal(d.state, 'fulfilled', String(d.error?.stack));
  assert.deepEqual(h.disk.get(d.value), h.classico(comLixo));
  assert.deepEqual(h.partes(), []);
});

await check('Opus: o WebM vira MP4 no "Swift", com o prefixo do Opus, e o WebM sai do disco', async () => {
  const h = harness({ ficheiro: webm });
  const d = h.descarregar('abc', {}, 4);
  await h.andar();
  assert.equal(d.state, 'fulfilled', String(d.error?.stack));
  assert.equal(d.value, `${DOC}yt-opus-v1-abc.m4a`);
  assert.deepEqual(h.disk.get(d.value), h.opus.converterWebmParaMp4(webm).mp4);
  assert.ok(!h.disk.has(`${DOC}yt-audio-abc.m4a`));
  assert.deepEqual(h.partes(), [], 'nem o WebM nem o temporário ficam');
  assert.equal(h.disk.size, 1);
  assert.equal(h.cache.temOpusEmDisco('abc'), true);
});

await check('Opus que não se converte: atira OPUS_INVALIDO (quem pediu volta ao AAC) e não deixa nada', async () => {
  const estragado = webm.slice();
  estragado.fill(0xff, 200, 400);
  const h = harness({ ficheiro: estragado });
  const d = h.descarregar('abc', {}, 4);
  await h.andar();
  assert.equal(d.state, 'rejected');
  assert.match(String(d.error?.message), /^WebM\/Opus inválido: /, 'a frase começa por OPUS_INVALIDO, sem o embrulho do Expo');
  assert.doesNotMatch(String(d.error?.message), /Call to function/);
  assert.equal(h.disk.size, 0);
});

await check('Opus convertido com menos bytes do que o Swift diz: não publica', async () => {
  const h = harness({
    ficheiro: webm,
    converter: (origem, destino, disk) => { disk.set(destino, new Uint8Array(10)); return { bytes: 11, segundos: 4, ms: 3 }; },
  });
  const d = h.descarregar('abc', {}, 4);
  await h.andar();
  assert.equal(d.state, 'rejected');
  assert.equal(h.disk.size, 0);
});

await check('403: renova o URL e continua no mesmo .part, com o URL novo', async () => {
  let renovacoes = 0;
  const h = harness({ status: (n, p) => (p.url.includes('velho') ? 403 : 206) });
  const d = observe(h.cache.downloadProgressiveAudio('abc', 'https://audio.test/velho', original.length, 213, {
    renewUrl: async () => { renovacoes++; return 'https://audio.test/novo'; },
  }));
  await h.andar();
  await h.time.advance(1000); // a tentativa com o URL novo espera como as outras
  await h.andar();
  assert.equal(d.state, 'fulfilled', String(d.error?.stack));
  assert.equal(renovacoes, 1);
  assert.deepEqual(h.pedidos.map((p) => p.url), ['https://audio.test/velho', 'https://audio.test/novo', 'https://audio.test/novo']);
  assert.deepEqual(h.disk.get(d.value), h.classico(original));
});

await check('um bocado que falha na rede tenta outra vez, com o mesmo intervalo', async () => {
  const h = harness({ falharBocado: (n) => n === 2 });
  const d = h.descarregar('abc');
  await h.andar();
  await h.time.advance(1000); // a espera antes da segunda tentativa
  await h.andar();
  assert.equal(d.state, 'fulfilled', String(d.error?.stack));
  assert.deepEqual(h.pedidos.map((p) => p.inicio), [0, 1_000_000, 1_000_000]);
  assert.deepEqual(h.disk.get(d.value), h.classico(original));
});

await check('trocar de faixa a meio cancela o bocado no nativo e não deixa nada', async () => {
  const segundo = deferred();
  let parar = false;
  const h = harness({ portao: (n) => (n === 2 ? segundo.promise : undefined) });
  const d = h.descarregar('abc', { shouldAbort: () => parar });
  await h.andar();
  assert.equal(h.pedidos.length, 2);
  parar = true;
  h.cache.verificarCancelamentos();
  await h.andar();
  assert.equal(d.state, 'rejected');
  assert.equal(String(d.error?.message), 'download aborted');
  assert.deepEqual(h.cancelados, [h.pedidos[1].id], 'o pedido em curso é cancelado no URLSession');
  segundo.resolve(); // o nativo acaba depois (já cancelado): não muda nada
  await h.andar();
  assert.equal(h.disk.size, 0, 'nem .part nem .m4a');
  assert.equal(h.queue.estadoDaFila().aDescarregar, 0, 'a vaga fica livre');
});

await check('sem módulo nativo: o caminho de sempre, pelo fetch', async () => {
  const h = harness();
  h.cache.definirDescarregadorNativo(null);
  const d = h.descarregar('abc');
  await h.andar();
  assert.equal(d.state, 'fulfilled', String(d.error?.stack));
  assert.equal(h.pedidos.length, 0);
  assert.equal(h.fetches.length, 2);
  assert.deepEqual(h.disk.get(d.value), h.classico(original));
});

await check('o relatório diz que foi nativo e quanto correu fora do JavaScript', async () => {
  const h = harness({ ficheiro: webm });
  const fins = [];
  h.cache.ouvirFimDosDownloads((f) => fins.push(f));
  const d = h.descarregar('abc', {}, 4);
  await h.andar();
  assert.equal(d.state, 'fulfilled');
  const p = fins[0]?.processamento;
  assert.ok(p, 'o fim do download leva o processamento');
  assert.equal(p.nativo, true);
  assert.equal(p.foraMs, 41);
  assert.equal(p.formato, 'opus');
  assert.equal(p.juntarMs, 0, 'nada juntado no JavaScript');
  assert.equal(p.converterMs, 0, 'a conversão não correu no JavaScript');
});

if (failures) {
  console.error(`\n${failures} caso(s) do download nativo falharam.`);
  process.exitCode = 1;
} else console.log('\nDownload nativo: todos os casos passaram.');
