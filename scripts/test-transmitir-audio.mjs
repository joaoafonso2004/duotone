// Tocar enquanto descarrega (transmitirAudio, em src/lib/youtubeCache.ts), com o
// downloader, a fila e a correção do mp4 REAIS em Node. A rede, o disco e o
// módulo nativo são de mentira; o relógio é virtual.
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
    pending: () => timers.size,
    now: () => now,
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

// ---- um m4a do YouTube com 1,5 MB: três pedidos (256 KB, 1 MB, o resto) ------
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
const TOTAL = original.length;

function harness({ ficheiro = original, portao, falhar } = {}) {
  const time = clock();
  const disk = new Map();
  const pedidos = [];
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
      assert.equal(mode, 'w');
      assert.ok(disk.has(this.uri), 'abrir um ficheiro que não existe');
      const uri = this.uri;
      let aberto = true;
      return {
        writeBytes(b) {
          assert.ok(aberto, 'escrever num ficheiro fechado');
          const a = disk.get(uri) ?? new Uint8Array();
          const c = new Uint8Array(a.length + b.length);
          c.set(a); c.set(b, a.length);
          disk.set(uri, c);
        },
        close() { aberto = false; },
      };
    }
  }
  const dir = (uri) => ({ uri, list: () => [...disk.keys()].filter((key) => key.startsWith(`${uri}/`)).map((key) => new File({ uri }, key.slice(uri.length + 1))) });
  const fetchFalso = async (url, opts) => {
    const [, a, b] = /bytes=(\d+)-(\d+)/.exec(opts.headers.Range);
    const inicio = Number(a), fim = Number(b);
    pedidos.push({ url, inicio, fim });
    if (portao) await portao(pedidos.length, inicio);
    if (falhar?.(pedidos.length, inicio)) return { status: 500, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) };
    return {
      status: 206,
      headers: { get: (n) => ({ 'content-range': `bytes ${inicio}-${fim}/${ficheiro.length}`, 'content-length': String(fim - inicio + 1) })[n.toLowerCase()] ?? null },
      arrayBuffer: async () => ficheiro.slice(inicio, fim + 1).buffer,
    };
  };
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

  // As violações ficam registadas em vez de lançadas: o código engole os
  // erros do módulo nativo (de propósito), e com eles uma asserção daqui.
  const motor = { chamadas: [], sessoes: new Map(), recusar: false, erros: [] };
  const ligacao = {
    abrir(sessao, caminho, total) {
      motor.chamadas.push(['abrir', sessao]);
      if (motor.recusar) throw new Error('sem módulo');
      assert.ok(disk.has(caminho), 'a sessão abre um ficheiro que já existe');
      motor.sessoes.set(sessao, { caminho, total, disponiveis: 0, concluida: false, fechada: false });
      return `duotone-stream://audio/${sessao}.m4a`;
    },
    cresceu(sessao, n) {
      const s = motor.sessoes.get(sessao);
      if (n < s.disponiveis) motor.erros.push('o disponível andou para trás');
      s.disponiveis = n;
      // O que o motor diz ter tem de estar mesmo no disco -- é isso que ele vai ler.
      if ((disk.get(s.caminho)?.length ?? 0) < n) motor.erros.push('avisou antes de escrever');
    },
    concluir(sessao) { motor.sessoes.get(sessao).concluida = true; },
    fechar(sessao) { motor.chamadas.push(['fechar', sessao]); const s = motor.sessoes.get(sessao); if (s) s.fechada = true; },
  };
  const classico = (f) => { const c = f.slice(); fixMp4Duration(c, 213); return c; };
  const transmitir = (id, opts = {}) => cache.transmitirAudio(id, `https://audio.test/${id}`, ficheiro.length, 213, ligacao, opts);
  const partes = () => [...disk.keys()].filter((k) => k.endsWith('.part'));
  const andar = async (vezes = 20) => { for (let i = 0; i < vezes; i++) await time.advance(0); };
  atual = { motor };
  return { cache, queue, time, disk, pedidos, motor, ligacao, classico, transmitir, partes, andar };
}

let failures = 0;
let atual = null;
async function check(name, fn) {
  try {
    await fn();
    assert.deepEqual(atual?.motor.erros ?? [], [], 'o módulo nativo foi mal avisado');
    console.log(`  ok - ${name}`);
  }
  catch (error) { failures++; console.error(`  FALHOU - ${name}: ${error.stack}`); }
}

console.log('Tocar enquanto descarrega (código real, relógio virtual):');

await check('entrega o stream depois do primeiro bocado e publica o ficheiro igual ao antigo', async () => {
  const segundo = deferred();
  const h = harness({ portao: (n) => (n === 2 ? segundo.promise : undefined) });
  const fins = [];
  h.cache.ouvirFimDosDownloads((f) => fins.push(f));
  const t = observe(h.transmitir('abc'));
  await h.andar();
  assert.equal(t.state, 'fulfilled', 'o som tinha de poder começar com o primeiro bocado');
  assert.equal(t.value.tipo, 'stream');
  assert.equal(h.pedidos.length, 2, 'só o primeiro bocado tinha chegado');
  assert.equal(h.pedidos[0].fim, 262_143, 'o primeiro pedido é pequeno');
  const s = h.motor.sessoes.get(t.value.sessao);
  assert.equal(t.value.uri, `duotone-stream://audio/${t.value.sessao}.m4a`);
  assert.equal(s.total, TOTAL);
  assert.equal(s.disponiveis, 262_144);
  const esperado = h.classico(original);
  assert.deepEqual(h.disk.get(s.caminho), esperado.slice(0, 262_144), 'a cabeça já foi corrigida antes de o motor a ler');
  assert.equal(h.cache.estadoDoDownload('abc').fase, 'a-descarregar');
  assert.equal(h.queue.estadoDaFila().aDescarregar, 1, 'o download segue com a vaga');

  const ficheiro = observe(t.value.ficheiro);
  segundo.resolve();
  await h.andar();
  assert.equal(ficheiro.state, 'fulfilled');
  assert.equal(ficheiro.value, 'file:///document/yt-audio-abc.m4a');
  assert.deepEqual(h.disk.get(ficheiro.value), esperado, 'o ficheiro publicado é o do caminho antigo');
  assert.equal(s.disponiveis, TOTAL);
  assert.equal(s.concluida, true);
  assert.equal(s.fechada, false, 'quem fecha é quem toca');
  assert.deepEqual(h.partes(), []);
  assert.equal(h.cache.estadoDoDownload('abc'), null);
  assert.equal(h.queue.estadoDaFila().aDescarregar, 0);
  assert.equal(h.cache.isAudioCached('abc'), true);
  assert.equal(fins.length, 1, 'um download, um aviso de fim');
  assert.equal(fins[0].resultado, 'ok');
  assert.equal(fins[0].modo, 'stream');
  assert.equal(fins[0].prioridade, 'reproducao');
  assert.equal(fins[0].bocados, 3);
  assert.equal(fins[0].bytes, TOTAL);
  assert.equal(Object.keys(fins[0]).includes('videoId'), false, 'sem o id da faixa');
  t.value.fechar();
  t.value.fechar();
  assert.equal(h.motor.chamadas.filter(([c]) => c === 'fechar').length, 1);
  assert.equal(h.time.pending(), 0);
});

await check('já descarregada: devolve o ficheiro sem pedir nada', async () => {
  const h = harness();
  h.disk.set('file:///document/yt-audio-abc.m4a', new Uint8Array([1]));
  const t = await h.transmitir('abc');
  assert.equal(t.tipo, 'ficheiro');
  assert.equal(t.uri, 'file:///document/yt-audio-abc.m4a');
  assert.equal(h.pedidos.length, 0);
  assert.deepEqual(h.motor.chamadas, []);
});

await check('o Smart Cache já a descarregava: espera por ele, sem outro download', async () => {
  const h = harness();
  const adiantado = observe(h.cache.downloadProgressiveAudio('abc', 'https://audio.test/abc', TOTAL, 213, { prioridade: 'seguinte' }));
  await drain();
  const t = observe(h.transmitir('abc'));
  await h.andar();
  assert.equal(adiantado.state, 'fulfilled');
  assert.equal(t.state, 'fulfilled');
  assert.equal(t.value.tipo, 'ficheiro');
  assert.equal(h.pedidos.length, 2, 'só os bocados do adiantamento (1 MB + o resto)');
  assert.deepEqual(h.motor.chamadas, []);
});

await check('quem pede a mesma faixa a meio espera pelo stream', async () => {
  const segundo = deferred();
  const h = harness({ portao: (n) => (n === 2 ? segundo.promise : undefined) });
  const t = observe(h.transmitir('abc'));
  await h.andar();
  const explicito = observe(h.cache.downloadProgressiveAudio('abc', 'https://audio.test/abc', TOTAL, 213, { prioridade: 'explicito' }));
  await h.andar();
  assert.equal(explicito.state, 'pending');
  segundo.resolve();
  await h.andar();
  assert.equal(explicito.state, 'fulfilled');
  assert.equal(explicito.value, 'file:///document/yt-audio-abc.m4a');
  assert.equal(h.pedidos.length, 3, 'nenhum pedido a mais');
  assert.equal(t.value.tipo, 'stream');
});

await check('falha antes do primeiro byte: rejeita, fecha a sessão e não deixa lixo', async () => {
  const h = harness({ falhar: () => true });
  const fins = [];
  h.cache.ouvirFimDosDownloads((f) => fins.push(f.resultado));
  const t = observe(h.transmitir('abc'));
  await h.andar(10);
  await h.time.advance(60_000);
  assert.equal(t.state, 'rejected');
  assert.match(t.error.message, /HTTP 500/);
  assert.deepEqual(fins, ['falhou']);
  assert.deepEqual(h.motor.chamadas.map(([c]) => c), ['abrir', 'fechar']);
  assert.deepEqual(h.partes(), []);
  assert.equal(h.queue.estadoDaFila().aDescarregar, 0);
  assert.equal(h.cache.estadoDoDownload('abc'), null);
  assert.equal(h.time.pending(), 0);
});

await check('falha a meio: o som já começou, o ficheiro rejeita e a vaga fica livre', async () => {
  const h = harness({ falhar: (n, inicio) => inicio > 0 });
  const t = observe(h.transmitir('abc'));
  await h.andar();
  assert.equal(t.state, 'fulfilled');
  assert.equal(t.value.tipo, 'stream');
  const ficheiro = observe(t.value.ficheiro);
  await h.time.advance(60_000);
  assert.equal(ficheiro.state, 'rejected');
  assert.deepEqual(h.partes(), [], 'o .part sai do disco (o motor mantém o que abriu)');
  assert.equal(h.disk.has('file:///document/yt-audio-abc.m4a'), false);
  assert.equal(h.motor.chamadas.filter(([c]) => c === 'fechar').length, 0, 'fechar é de quem toca');
  assert.equal(h.queue.estadoDaFila().aDescarregar, 0);
  assert.equal(h.time.pending(), 0);
});

await check('depois de uma falha a meio, quem reage começa um download novo (não se junta ao falhado)', async () => {
  let rede = true;
  const h = harness({ falhar: (n, inicio) => !rede && inicio > 0 });
  rede = false;
  const t = observe(h.transmitir('abc'));
  // O primeiro bocado passa (início 0); os seguintes falham.
  await h.andar();
  assert.equal(t.value.tipo, 'stream');
  let depois = null;
  // É o que a rede de segurança do leitor faz, no mesmo instante.
  t.value.ficheiro.catch(() => {
    rede = true;
    depois = observe(h.cache.downloadProgressiveAudio('abc', 'https://audio.test/abc', TOTAL, 213, {}));
  });
  await h.time.advance(60_000);
  await h.andar();
  assert.ok(depois, 'o download do stream devia ter falhado');
  assert.equal(depois.state, 'fulfilled', `juntou-se ao que falhou: ${depois.error?.message}`);
  assert.deepEqual(h.disk.get(depois.value), h.classico(original));
  assert.equal(h.time.pending(), 0);
});

await check('trocar de faixa a meio cancela o download e não publica', async () => {
  const segundo = deferred();
  let saltou = false;
  const h = harness({ portao: (n) => (n === 2 ? segundo.promise : undefined) });
  const fins = [];
  h.cache.ouvirFimDosDownloads((f) => fins.push(f.resultado));
  const t = observe(h.transmitir('abc', { shouldAbort: () => saltou }));
  await h.andar();
  const ficheiro = observe(t.value.ficheiro);
  saltou = true;
  h.cache.verificarCancelamentos();
  await h.andar();
  assert.equal(ficheiro.state, 'rejected');
  assert.equal(ficheiro.error.message, h.cache.DOWNLOAD_ABORTED);
  assert.deepEqual(fins, ['cancelado']);
  assert.deepEqual(h.partes(), []);
  assert.equal(h.queue.estadoDaFila().aDescarregar, 0);
  segundo.resolve();
  await h.andar();
  assert.equal(h.disk.size, 0, 'a resposta tardia não publicou nada');
  assert.equal(h.time.pending(), 0);
});

await check('sem módulo nativo: descarrega na mesma e entrega o ficheiro', async () => {
  const h = harness();
  h.motor.recusar = true;
  const t = observe(h.transmitir('abc'));
  await h.andar();
  assert.equal(t.state, 'fulfilled');
  assert.equal(t.value.tipo, 'ficheiro');
  assert.equal(t.value.uri, 'file:///document/yt-audio-abc.m4a');
  assert.deepEqual(h.disk.get(t.value.uri), h.classico(original));
  assert.equal(h.pedidos.length, 3, 'um download só');
});

// Um ficheiro em que a correção ao vivo não garante o resultado antigo (aqui,
// lixo depois do último fragmento): toca-se, mas não entra na cache.
const comLixo = new Uint8Array([...original, 1, 2, 3]);

await check('ficheiro que não fica igual ao antigo: toca, mas não se publica', async () => {
  const h = harness({ ficheiro: comLixo });
  const fins = [];
  h.cache.ouvirFimDosDownloads((f) => fins.push(`${f.modo}:${f.resultado}`));
  const t = observe(h.transmitir('abc'));
  await h.andar();
  assert.equal(t.value.tipo, 'stream');
  const s = h.motor.sessoes.get(t.value.sessao);
  const ficheiro = observe(t.value.ficheiro);
  await h.andar();
  assert.equal(ficheiro.state, 'fulfilled');
  assert.equal(ficheiro.value, null);
  assert.equal(s.concluida, true, 'o motor recebe o ficheiro todo na mesma');
  assert.equal(h.disk.size, 0, 'nem .m4a nem .part');
  // Quem pedir a faixa depois descarrega-a pelo caminho antigo.
  const depois = observe(h.cache.downloadProgressiveAudio('abc', 'https://audio.test/abc', comLixo.length, 213, {}));
  await h.andar();
  assert.equal(depois.state, 'fulfilled');
  assert.deepEqual(h.disk.get(depois.value), h.classico(comLixo));
  assert.deepEqual(fins, ['stream:nao-publicado', 'ficheiro:ok']);
});

await check('quem se juntou a um que não se publicou descarrega pelo caminho antigo', async () => {
  const segundo = deferred();
  const h = harness({ ficheiro: comLixo, portao: (n) => (n === 2 ? segundo.promise : undefined) });
  const t = observe(h.transmitir('abc'));
  await h.andar();
  const explicito = observe(h.cache.downloadProgressiveAudio('abc', 'https://audio.test/abc', comLixo.length, 213, { prioridade: 'explicito' }));
  await h.andar();
  segundo.resolve();
  await h.andar();
  assert.equal(explicito.state, 'fulfilled');
  assert.deepEqual(h.disk.get(explicito.value), h.classico(comLixo));
  assert.equal(t.value.tipo, 'stream');
});

await check('sem módulo e sem ficheiro publicável: cai no caminho antigo', async () => {
  const h = harness({ ficheiro: comLixo });
  h.motor.recusar = true;
  const t = observe(h.transmitir('abc'));
  await h.andar(40);
  assert.equal(t.state, 'fulfilled');
  assert.equal(t.value.tipo, 'ficheiro');
  assert.deepEqual(h.disk.get(t.value.uri), h.classico(comLixo));
});

await check('os .part esquecidos saem; os recentes e os .m4a ficam', async () => {
  const h = harness();
  const agora = h.time.now();
  const doc = 'file:///document/';
  h.disk.set(`${doc}yt-audio-a-b-${agora - 31 * 60_000}-x1.part`, new Uint8Array(1));
  h.disk.set(`${doc}yt-audio-c-${agora - 60_000}-x2.part`, new Uint8Array(1));
  h.disk.set(`${doc}yt-audio-d.part`, new Uint8Array(1));
  h.disk.set(`${doc}yt-audio-e.m4a`, new Uint8Array(1));
  h.disk.set(`${doc}outro-${agora - 99 * 60_000}-x3.part`, new Uint8Array(1));
  h.cache.limparParciaisEsquecidos(agora);
  assert.deepEqual([...h.disk.keys()].sort(), [
    `${doc}outro-${agora - 99 * 60_000}-x3.part`,
    `${doc}yt-audio-c-${agora - 60_000}-x2.part`,
    `${doc}yt-audio-e.m4a`,
  ]);
});

// ---- Opus (entrega 3 do plano de áudio) ------------------------------------
// O itag 251 chega em WebM; a cache converte-o para MP4 e guarda-o com o
// prefixo `yt-opus-v1-`, ao lado do AAC de sempre (`yt-audio-`).
const webm = new Uint8Array(readFileSync(path.join(root, 'scripts/fixtures/opus-4s.webm')));
const DOC = 'file:///document/';

await check('um WebM descarregado vira MP4 com o prefixo do Opus, e o AAC não é tocado', async () => {
  const h = harness({ ficheiro: webm });
  const d = observe(h.cache.downloadProgressiveAudio('abc', 'https://audio.test/abc', webm.length, 4, {}));
  await h.andar(40);
  assert.equal(d.state, 'fulfilled', String(d.error));
  assert.equal(d.value, `${DOC}yt-opus-v1-abc.m4a`);
  assert.ok(!h.disk.has(`${DOC}yt-audio-abc.m4a`));
  const mp4 = h.disk.get(d.value);
  assert.equal(String.fromCharCode(...mp4.slice(4, 8)), 'ftyp', 'o que ficou em disco é um MP4');
  assert.deepEqual(h.partes(), [], 'sem .part esquecido');
  assert.equal(h.cache.isAudioCached('abc'), true);
  assert.equal(h.cache.temOpusEmDisco('abc'), true);
  assert.equal(h.cache.cachedAudioFile('abc').uri, d.value);
});

await check('um WebM que não se converte atira OPUS_INVALIDO e não publica nada', async () => {
  const estragado = webm.slice();
  estragado.fill(0xff, 200, 400); // parte a cabeça (as Tracks)
  const h = harness({ ficheiro: estragado });
  const d = observe(h.cache.downloadProgressiveAudio('abc', 'https://audio.test/abc', estragado.length, 4, {}));
  await h.andar(40);
  assert.equal(d.state, 'rejected');
  assert.match(String(d.error?.message), /WebM\/Opus inválido/);
  assert.deepEqual([...h.disk.keys()].filter((k) => k.endsWith('.m4a')), []);
  assert.deepEqual(h.partes(), []);
});

await check('as duas versões da mesma faixa: uma linha, o AAC primeiro, e sair é sair das duas', async () => {
  const h = harness();
  h.disk.set(`${DOC}yt-audio-a.m4a`, new Uint8Array(10));
  h.disk.set(`${DOC}yt-opus-v1-a.m4a`, new Uint8Array(5));
  h.disk.set(`${DOC}yt-opus-v1-b.m4a`, new Uint8Array(7));
  h.cache.loadCachedAudioIndex();
  const lista = h.cache.listarDescarregados().sort((x, y) => x.id.localeCompare(y.id));
  // JSON: os arrays vêm do contexto do vm, e o deepEqual estrito compara os protótipos.
  assert.deepEqual(JSON.parse(JSON.stringify(lista.map((f) => [f.id, f.bytes]))), [['a', 15], ['b', 7]]);
  assert.equal(h.cache.getAudioCacheBytes(), 22);
  assert.equal(h.cache.cachedAudioFile('a').uri, `${DOC}yt-audio-a.m4a`, 'com as duas, toca o AAC');
  assert.equal(h.cache.temOpusEmDisco('a'), false);
  assert.equal(h.cache.temOpusEmDisco('b'), true);
  h.cache.removerOpusDaFaixa('b');
  assert.equal(h.cache.isAudioCached('b'), false, 'recusado o Opus, a faixa deixa de estar em disco');
  h.cache.removeDownloadedAudio('a');
  assert.deepEqual([...h.disk.keys()], []);
});

await check('a limpeza e o "Clear cache" veem as duas versões', async () => {
  const h = harness();
  h.disk.set(`${DOC}yt-audio-a.m4a`, new Uint8Array(10));
  h.disk.set(`${DOC}yt-opus-v1-a.m4a`, new Uint8Array(10));
  h.disk.set(`${DOC}yt-opus-v1-b.m4a`, new Uint8Array(10));
  h.cache.pruneAudioCacheLRU(['b']);
  // 30 bytes cabem nos 500 MB: nada sai. Com o teto a sério não se chega aqui
  // num teste, por isso o que se prova é que o "Clear cache" as leva todas.
  assert.equal(h.disk.size, 3);
  h.disk.set(`${DOC}yt-opus-v1-c-123-x.part`, new Uint8Array(1));
  h.cache.clearDownloadedAudioCache();
  assert.deepEqual([...h.disk.keys()], []);
});

if (failures) {
  console.error(`\n${failures} caso(s) do tocar enquanto descarrega falharam.`);
  process.exitCode = 1;
} else console.log('\nTocar enquanto descarrega: todos os casos passaram.');
