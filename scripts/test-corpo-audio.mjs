// Leitura do corpo isolada do leitor, do YouTube e do disco. Inclui streams
// reais de Node e um reader que ignora cancelamento, com relógio virtual.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const fonte = ts.transpileModule(readFileSync(new URL('../src/lib/lerCorpoDoAudio.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const esvaziar = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
const observar = (p) => {
  const r = { estado: 'pendente' };
  p.then(v => Object.assign(r, { estado: 'ok', valor: v }), e => Object.assign(r, { estado: 'erro', erro: e }));
  return r;
};
function ambiente() {
  let agora = 0, id = 0, ativa = true;
  const timers = new Map(), ouvintes = new Set();
  const exports = {};
  new vm.Script(fonte).runInContext(vm.createContext({
    exports, Uint8Array, Error,
    setTimeout: (fn, ms) => { const n = ++id; timers.set(n, { fn, em: agora + ms }); return n; },
    clearTimeout: n => timers.delete(n),
  }));
  return {
    ...exports, timers, ouvintes,
    opcoes: { observarAtividade: fn => { ouvintes.add(fn); fn(ativa); return () => ouvintes.delete(fn); } },
    atividade(valor) { ativa = valor; for (const fn of ouvintes) fn(valor); },
    async avancar(ms) {
      await esvaziar();
      const fim = agora + ms;
      for (;;) {
        const proximo = [...timers].filter(([, t]) => t.em <= fim).sort((a, b) => a[1].em - b[1].em)[0];
        if (!proximo) break;
        agora = proximo[1].em; timers.delete(proximo[0]); proximo[1].fn(); await esvaziar();
      }
      agora = fim; await esvaziar();
    },
  };
}
function corpo() {
  let controlador, cancelamentos = 0;
  const stream = new ReadableStream({ start(c) { controlador = c; }, cancel() { cancelamentos++; } });
  return {
    resposta: { body: stream, arrayBuffer: () => { throw new Error('não deve ler o corpo duas vezes'); } },
    enviar: (...bytes) => controlador.enqueue(Uint8Array.from(bytes)),
    fechar: () => controlador.close(),
    falhar: () => controlador.error(new Error('ligacao perdida')),
    cancelamentos: () => cancelamentos,
    stream,
  };
}
function limpo(a, c) {
  assert.equal(a.timers.size, 0, 'não deixa relógios');
  assert.equal(a.ouvintes.size, 0, 'não deixa ouvintes de atividade');
  if (c) assert.equal(c.stream.locked, false, 'liberta o reader');
}

// Uma transferência lenta com progresso contínuo não é confundida com paragem.
{
  const a = ambiente(), c = corpo(), pedido = new AbortController();
  const r = observar(a.lerCorpoDoAudio(c.resposta, 4, pedido, a.opcoes));
  c.enviar(1);
  for (const byte of [2, 3, 4]) { await a.avancar(8_000); c.enviar(byte); }
  c.fechar(); await esvaziar();
  assert.equal(r.estado, 'ok');
  assert.deepEqual(r.valor, Uint8Array.from([1, 2, 3, 4]));
  assert.equal(pedido.signal.aborted, false);
  assert.equal(c.cancelamentos(), 0);
  limpo(a, c);
}

// O prazo mede a ausência de bytes, incluindo antes do primeiro fragmento;
// fragmentos vazios não o prolongam.
for (const primeiro of [false, true]) {
  const a = ambiente(), c = corpo(), pedido = new AbortController();
  const r = observar(a.lerCorpoDoAudio(c.resposta, 4, pedido, a.opcoes));
  if (primeiro) c.enviar(1);
  await a.avancar(9_000); c.enviar();
  await a.avancar(999); assert.equal(r.estado, 'pendente');
  await a.avancar(1);
  assert.equal(r.erro?.message, a.CORPO_SEM_PROGRESSO);
  assert.equal(pedido.signal.aborted, true);
  assert.equal(c.cancelamentos(), 1);
  limpo(a, c);
}

// read() e cancel() que nunca assentam não prendem a conclusão nem a limpeza.
{
  const a = ambiente(), pedido = new AbortController();
  let cancelar = 0, libertar = 0, responder;
  const resposta = { body: { getReader: () => ({
    read: () => new Promise(r => { responder = r; }),
    cancel: () => { cancelar++; return new Promise(() => {}); },
    releaseLock: () => { libertar++; },
  }) } };
  const r = observar(a.lerCorpoDoAudio(resposta, 4, pedido, a.opcoes));
  await a.avancar(10_000);
  assert.equal(r.estado, 'erro');
  assert.equal(cancelar, 1); assert.equal(libertar, 1);
  responder({ done: false, value: Uint8Array.from([1, 2, 3, 4]) });
  await esvaziar(); assert.equal(r.estado, 'erro', 'bytes tardios não fazem reviver uma leitura falhada');
  limpo(a);
}

// O cancelamento do pedido termina a espera imediatamente, antes do watchdog.
{
  const a = ambiente(), c = corpo(), pedido = new AbortController();
  const r = observar(a.lerCorpoDoAudio(c.resposta, 4, pedido, a.opcoes));
  await a.avancar(20); pedido.abort(); await esvaziar();
  assert.equal(r.estado, 'erro'); assert.equal(c.cancelamentos(), 1);
  limpo(a, c);
}

// Sem JS ativo não se conclui que a rede parou. No regresso há uma janela
// inteira, mesmo que o timeout antigo estivesse quase a vencer.
{
  const a = ambiente(), c = corpo(), pedido = new AbortController();
  const r = observar(a.lerCorpoDoAudio(c.resposta, 2, pedido, a.opcoes));
  c.enviar(1); await a.avancar(9_000);
  a.atividade(false); await a.avancar(60_000);
  assert.equal(r.estado, 'pendente');
  a.atividade(true); await a.avancar(9_000);
  assert.equal(r.estado, 'pendente');
  c.enviar(2); c.fechar(); await esvaziar();
  assert.equal(r.estado, 'ok'); limpo(a, c);
}

for (const caso of ['curto', 'excesso', 'rede']) {
  const a = ambiente(), c = corpo(), pedido = new AbortController();
  const r = observar(a.lerCorpoDoAudio(c.resposta, 2, pedido, a.opcoes));
  if (caso === 'rede') c.falhar();
  else { c.enviar(...(caso === 'curto' ? [1] : [1, 2, 3])); c.fechar(); }
  await esvaziar();
  assert.equal(r.estado, 'erro', caso);
  assert.equal(pedido.signal.aborted, true);
  limpo(a, c);
}

// Builds/respostas sem reader preservam o caminho anterior.
{
  const a = ambiente();
  const r = await a.lerCorpoDoAudio({ arrayBuffer: async () => Uint8Array.from([1, 2]).buffer }, 2, new AbortController(), a.opcoes);
  assert.deepEqual(r, Uint8Array.from([1, 2])); limpo(a);
}

console.log('Corpo do áudio: bytes exatos, progresso lento, paragem, cancelamento, resposta tardia, suspensão, integridade e recurso sem reader passaram.');
