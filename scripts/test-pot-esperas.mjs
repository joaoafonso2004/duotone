import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const raiz = path.resolve(import.meta.dirname, '..');
const pendurar = () => new Promise(() => {});
const esvaziar = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

// Módulos reais, relógio virtual e só as fronteiras nativas/rede substituídas.
// Uma promessa pendurada nunca resolve, nem sequer quando se aborta o fetch:
// o prazo tem de terminar a espera independentemente do transporte.
function ambiente(fetch = pendurar, substituicoes = {}) {
  let agora = 0, id = 0;
  const temporizadores = new Map(), modulos = new Map();
  const setTimeout = (fn, ms = 0) => {
    const chave = ++id;
    temporizadores.set(chave, { fn, quando: agora + ms });
    return chave;
  };
  const clearTimeout = chave => temporizadores.delete(chave);
  class Relogio extends Date { static now() { return agora; } }
  function carregar(nome) {
    nome = nome.replaceAll('\\', '/');
    if (substituicoes[nome]) return substituicoes[nome];
    if (modulos.has(nome)) return modulos.get(nome).exports;
    const ficheiro = path.join(raiz, nome), module = { exports: {} };
    modulos.set(nome, module);
    const codigo = ts.transpileModule(fs.readFileSync(ficheiro, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(codigo, {
      module, exports: module.exports, fetch, console, setTimeout, clearTimeout, AbortController, URL, Date: Relogio,
      require: pedido => {
        if (substituicoes[pedido]) return substituicoes[pedido];
        if (!pedido.startsWith('.')) return require(pedido);
        const relativo = path.relative(raiz, path.resolve(path.dirname(ficheiro), pedido));
        return carregar(relativo.endsWith('.ts') ? relativo : `${relativo}.ts`);
      },
    }, { filename: ficheiro });
    return module.exports;
  }
  async function avancar(ms) {
    await esvaziar();
    const ate = agora + ms;
    while (true) {
      const proximo = [...temporizadores].filter(([, t]) => t.quando <= ate).sort((a, b) => a[1].quando - b[1].quando)[0];
      if (!proximo) break;
      agora = proximo[1].quando;
      temporizadores.delete(proximo[0]);
      proximo[1].fn();
      await esvaziar();
    }
    agora = ate;
    await esvaziar();
  }
  return { carregar, avancar, temporizadores };
}
function observar(promessa) {
  const resultado = { estado: 'pendente', valor: undefined };
  promessa.then(valor => { resultado.estado = 'resolvido'; resultado.valor = valor; }, erro => {
    resultado.estado = 'rejeitado'; resultado.valor = erro;
  });
  return resultado;
}
function terminouSemToken(resultado, mensagem) {
  assert.equal(resultado.estado, 'resolvido', mensagem);
  assert.equal(resultado.valor, null, mensagem);
}

// A WebView silenciosa já tinha limites: eliminar a hipótese de espera infinita
// no próprio bridge sem mudar a política nem o tempo de cunhagem.
{
  const a = ambiente();
  const bridge = a.carregar('src/lib/botguardBridge.ts');
  bridge.registerBotGuardWebView({ current: { injectJavaScript: () => {} } });
  const pronta = observar(bridge.mintPoTokenOnDevice('visitor'));
  await a.avancar(12000);
  terminouSemToken(pronta, 'Sem __ready__, a espera acaba aos 12 s');
  bridge.handleBotGuardMessage(JSON.stringify({ id: '__ready__' }));
  const cunhagem = observar(bridge.mintPoTokenOnDevice('visitor'));
  await a.avancar(15000);
  terminouSemToken(cunhagem, 'Sem resposta ao mint, a espera acaba aos 15 s');
  assert.equal(a.temporizadores.size, 0);
}

// O aquecimento e as faixas partilham o token. Um servidor/storage que nunca
// responde tem de libertar a entrada aCunhar, inclusive se parar no corpo JSON.
for (const onde of ['preferencias', 'fetch', 'json']) {
  let parado = true, cunhagens = 0, pedidos = 0, sinal;
  const a = ambiente(async (_url, opcoes) => {
    pedidos++;
    sinal = opcoes.signal;
    if (parado && onde === 'fetch') return pendurar();
    return { ok: true, json: () => parado && onde === 'json' ? pendurar() : Promise.resolve({ poToken: 'token-novo' }) };
  }, {
    'src/lib/botguardBridge.ts': { mintPoTokenOnDevice: async () => { cunhagens++; return null; } },
    'src/lib/prefs.ts': { getPoTokenServerUrl: () => parado && onde === 'preferencias' ? pendurar() : Promise.resolve('https://pot.test') },
  });
  const provider = a.carregar('src/api/potProvider.ts');
  const aquecimento = observar(provider.fetchGvsPoToken('visitor'));
  const faixa = observar(provider.fetchGvsPoToken('visitor'));
  await a.avancar(9999);
  assert.equal(aquecimento.estado, 'pendente');
  assert.equal(faixa.estado, 'pendente');
  assert.equal(cunhagens, 1, 'O aquecimento e a faixa partilham a cunhagem');
  assert.equal(pedidos, onde === 'preferencias' ? 0 : 1);
  await a.avancar(1);
  terminouSemToken(aquecimento, `O prazo externo de 10 s termina a espera em ${onde}`);
  terminouSemToken(faixa, `A faixa que partilha ${onde} também é libertada`);
  if (onde !== 'preferencias') assert.equal(sinal?.aborted, true, 'O prazo cancela o transporte que pode ser cancelado');
  assert.equal(a.temporizadores.size, 0, 'A espera acabada não deixa temporizadores');

  parado = false;
  assert.equal(await provider.fetchGvsPoToken('visitor'), 'token-novo', 'A promessa presa saiu de aCunhar e permite nova tentativa');
  assert.equal(cunhagens, 2);
  assert.equal(await provider.fetchGvsPoToken('visitor'), 'token-novo', 'O token válido continua em memória');
  assert.equal(cunhagens, 2);
  assert.equal(a.temporizadores.size, 0, 'O sucesso também limpa o prazo');
}

// Mesmo que o JSON antigo chegue depois de um retry, só o pedido que acabou
// dentro do prazo pode publicar o token na memória partilhada.
{
  let chegarTarde, pedidos = 0;
  const a = ambiente(async () => {
    pedidos++;
    return {
      ok: true,
      json: pedidos === 1 ? () => new Promise(r => { chegarTarde = r; }) : async () => ({ poToken: 'token-novo' }),
    };
  }, {
    'src/lib/botguardBridge.ts': { mintPoTokenOnDevice: async () => null },
    'src/lib/prefs.ts': { getPoTokenServerUrl: async () => 'https://pot.test' },
  });
  const provider = a.carregar('src/api/potProvider.ts');
  const antigo = observar(provider.fetchGvsPoToken('visitor'));
  await a.avancar(10000);
  terminouSemToken(antigo, 'O JSON antigo expirou');
  assert.equal(await provider.fetchGvsPoToken('visitor'), 'token-novo');
  chegarTarde({ poToken: 'token-antigo' });
  await esvaziar();
  assert.equal(await provider.fetchGvsPoToken('visitor'), 'token-novo', 'A resposta tardia não substitui o token novo');
  assert.equal(pedidos, 2);
  assert.equal(a.temporizadores.size, 0);
}

// Uma cunhagem on-device longa mas válida preserva o token e nunca usa o servidor.
{
  let completar, cunhagens = 0, preferencias = 0;
  const a = ambiente(pendurar, {
    'src/lib/botguardBridge.ts': { mintPoTokenOnDevice: () => { cunhagens++; return new Promise(r => { completar = r; }); } },
    'src/lib/prefs.ts': { getPoTokenServerUrl: async () => { preferencias++; return 'https://pot.test'; } },
  });
  const provider = a.carregar('src/api/potProvider.ts');
  const aquecimento = observar(provider.fetchGvsPoToken('visitor'));
  const faixa = observar(provider.fetchGvsPoToken('visitor'));
  await a.avancar(26000);
  assert.equal(aquecimento.estado, 'pendente', 'O prazo externo não corta a cunhagem on-device');
  assert.equal(faixa.estado, 'pendente');
  completar('token-on-device');
  await esvaziar();
  assert.equal(aquecimento.valor, 'token-on-device');
  assert.equal(faixa.valor, 'token-on-device');
  assert.equal(cunhagens, 1);
  assert.equal(preferencias, 0);
  assert.equal(a.temporizadores.size, 0);
}
console.log('PO Token: limites ready/mint, prazo do fallback, partilha, cancelamento e recuperação passaram.');
