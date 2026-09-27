// O resolvedor e o caminho do Smart Cache reais, com rede e relógio controlados.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const esvaziar = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
const observar = (p) => {
  const estado = { resultado: 'pendente' };
  p.then(v => Object.assign(estado, { resultado: 'ok', valor: v }), e => Object.assign(estado, { resultado: 'erro', erro: e }));
  return estado;
};
const resposta = (url) => ({
  ok: true,
  json: async () => ({
    playabilityStatus: { status: 'OK' },
    streamingData: { adaptiveFormats: [{ url, mimeType: 'audio/mp4', contentLength: '16', bitrate: 128000 }] },
  }),
});

function ambiente() {
  let agora = 100_000, proximo = 0;
  const timers = new Map(), pedidos = [], downloads = [];
  const duplos = {
    '@react-native-async-storage/async-storage': {
      getItem: async () => JSON.stringify({ value: 'visitor', expiresAt: 1e12 }),
      setItem: async () => {}, removeItem: async () => {},
    },
    'src/api/potProvider.ts': { fetchGvsPoToken: async () => null },
    'src/lib/loudness.ts': { readLoudnessDb: () => null },
    'src/lib/playbackDiagnostics.ts': { classificar: () => 'rede', consolidar: () => 'rede', sinalDoErro: e => e },
    'src/lib/codecDeAudio.ts': { codecPreferido: () => 'aac', evitarOpusPara: () => {} },
    'src/lib/converterOpus.ts': { OPUS_INVALIDO: 'opus invalido' },
    'src/lib/youtubeCache.ts': {
      DOWNLOAD_ABORTED: 'download aborted',
      downloadProgressiveAudio: async (id) => { downloads.push(id); return `file:///${id}`; },
    },
  };
  const contexte = vm.createContext({
    console, Error,
    Date: class extends Date { static now() { return agora; } },
    setTimeout: (fn, ms) => { const id = ++proximo; timers.set(id, { fn, em: agora + ms }); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: (url, opts) => {
      if (!url.includes('/player')) return Promise.resolve({ status: 206 });
      return new Promise((resolve, reject) => pedidos.push({ corpo: JSON.parse(opts.body), resolve, reject }));
    },
  });
  const modulos = new Map();
  const carregar = (nome) => {
    if (duplos[nome]) return duplos[nome];
    if (modulos.has(nome)) return modulos.get(nome).exports;
    const modulo = { exports: {} };
    modulos.set(nome, modulo);
    const fonte = ts.transpileModule(readFileSync(path.join(raiz, nome), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const require = dep => carregar(dep.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(nome), `${dep}.ts`)) : dep);
    new vm.Script(`(function(require,module,exports){${fonte}\n})`, { filename: nome }).runInContext(contexte)(require, modulo, modulo.exports);
    return modulo.exports;
  };
  return {
    api: carregar('src/api/ytstream.ts'), smart: carregar('src/lib/resolverEDescarregar.ts'), pedidos, downloads, timers,
    async avancar(ms) {
      await esvaziar();
      const fim = agora + ms;
      for (;;) {
        const seguinte = [...timers].filter(([, t]) => t.em <= fim).sort((a, b) => a[1].em - b[1].em)[0];
        if (!seguinte) break;
        agora = seguinte[1].em;
        timers.delete(seguinte[0]); seguinte[1].fn(); await esvaziar();
      }
      agora = fim; await esvaziar();
    },
  };
}

// Um skip abandona o adiantamento, mas não o resultado que o leitor adotou.
{
  const a = ambiente();
  let abandonada = false;
  const smart = observar(a.smart.resolverEDescarregar('b', 'high', null, { shouldAbort: () => abandonada }));
  await esvaziar();
  const leitor = observar(a.api.resolveYouTubeStream('b', 'high'));
  abandonada = true;
  await esvaziar();
  assert.equal(a.pedidos.length, 1, 'Smart Cache e leitor devem partilhar o /player');
  a.pedidos[0].resolve(resposta('https://audio.test/b'));
  await esvaziar();
  assert.equal(smart.erro?.message, 'download aborted');
  assert.equal(leitor.valor.url, 'https://audio.test/b');
  assert.deepEqual(a.downloads, [], 'o adiantamento abandonado não descarrega');
  assert.equal((await a.api.resolveYouTubeStream('b')).url, leitor.valor.url);
  assert.equal(a.pedidos.length, 1, 'o resultado concluído continua em cache');
  assert.equal(a.timers.size, 0);
}

// O prazo de 30 s do Smart Cache não encurta o trabalho partilhado do leitor.
{
  const a = ambiente();
  const smart = observar(a.smart.resolverEDescarregar('b', 'high', null, {}));
  await a.avancar(20_000);
  const leitor = observar(a.api.resolveYouTubeStream('b'));
  await a.avancar(10_000);
  assert.equal(smart.resultado, 'erro');
  assert.equal(leitor.resultado, 'pendente');
  await a.avancar(5_000);
  a.pedidos[0].resolve(resposta('https://audio.test/b'));
  await esvaziar();
  assert.equal(leitor.resultado, 'ok');
  assert.equal(a.pedidos.length, 1);
  assert.equal(a.timers.size, 0);
}

// Qualidades, codecs e faixas diferentes não partilham; o codec implícito e
// o mesmo codec explícito partilham.
{
  const a = ambiente();
  const pedidos = [
    a.api.resolveYouTubeStream('b'), a.api.resolveYouTubeStream('b', 'high', false, 'aac'),
    a.api.resolveYouTubeStream('b', 'saver'), a.api.resolveYouTubeStream('b', 'high', false, 'opus'),
    a.api.resolveYouTubeStream('c'),
  ];
  await esvaziar();
  assert.equal(a.pedidos.length, 4);
  a.pedidos.forEach((p, i) => p.resolve(resposta(`https://audio.test/${i}`)));
  const resultados = await Promise.all(pedidos);
  assert.equal(resultados[0], resultados[1]);
  assert.notEqual(resultados[0], resultados[2]);
  assert.equal(a.timers.size, 0);
}

// A renovação não adota o URL antigo; um resultado tardio não apaga o pedido
// novo nem substitui a cache. A limpeza tem a mesma proteção.
for (const operacao of ['renovar', 'limpar', 'expirar']) {
  const a = ambiente();
  const antigo = observar(a.api.resolveYouTubeStream('b'));
  await esvaziar();
  if (operacao === 'limpar') a.api.clearStreamMemo();
  if (operacao === 'expirar') {
    await a.avancar(40_000);
    assert.equal(antigo.erro?.message, 'resolucao sem resposta');
  }
  const novo = observar(a.api.resolveYouTubeStream('b', 'high', operacao === 'renovar'));
  await esvaziar();
  assert.equal(a.pedidos.length, 2);
  a.pedidos[0].resolve(resposta('https://audio.test/antigo'));
  await esvaziar();
  const seguidor = observar(a.api.resolveYouTubeStream('b'));
  await esvaziar();
  assert.equal(a.pedidos.length, 2, 'a conclusão antiga não elimina o novo trabalho');
  a.pedidos[1].resolve(resposta('https://audio.test/novo'));
  await esvaziar();
  assert.equal(novo.valor.url, 'https://audio.test/novo');
  assert.equal(seguidor.valor.url, novo.valor.url);
  assert.equal((await a.api.resolveYouTubeStream('b')).url, novo.valor.url);
  assert.equal(a.timers.size, 0);
}

// Se a cascata inteira falhar, os dois consumidores recebem a falha e a
// tentativa seguinte pode recomeçar, sem uma rejeição guardada no mapa.
{
  const a = ambiente();
  const um = observar(a.api.resolveYouTubeStream('b'));
  const dois = observar(a.api.resolveYouTubeStream('b'));
  for (let i = 0; i < 5; i++) {
    await esvaziar();
    a.pedidos[i].reject(new Error('rede indisponivel'));
  }
  await esvaziar();
  assert.equal(um.resultado, 'erro');
  assert.equal(dois.erro, um.erro);
  const seguinte = observar(a.api.resolveYouTubeStream('b'));
  await esvaziar();
  a.pedidos[5].resolve(resposta('https://audio.test/recuperado'));
  await esvaziar();
  assert.equal(seguinte.resultado, 'ok');
  assert.equal(a.timers.size, 0);
}

console.log('Resolução partilhada: adoção, abandono, prazos, chaves, renovação, limpeza, resposta tardia e recuperação passaram.');
