/**
 * A presença ao vivo não se perde numa quebra da ligação (26/11).
 *
 * O João: o amigo "já está a ouvir outra música há bué mas eu ainda não vejo"
 * no PC (no iPhone via-a). O realtime-js chama CHANNEL_ERROR também à ligação
 * que cai, em todos os canais, e o `presencaAoVivo.ts` tratava-a como a recusa
 * do servidor: largava os canais dos amigos e esperava meia hora. O PC só
 * voltava a entrar ao reler os amigos, e até lá via a tabela (escrita de 10 em
 * 10 min por quem ouve).
 *
 * Corre o módulo verdadeiro com um Supabase a fingir; os erros da ligação vêm
 * do `normalizeChannelError` verdadeiro do realtime-js.
 *
 * Correr: node scripts/test-presenca-ao-vivo-religa.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { normalizeChannelError } = require('@supabase/realtime-js/dist/main/lib/normalizeChannelError');

const raiz = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8').replace(/\r\n/g, '\n');
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
let falhas = 0;
async function caso(nome, fn) {
  try { await fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${e.stack || e.message}`); }
}

/** Como chegam os erros da ligação: pelo `_onError` do canal, com o que o phoenix passa. */
class CloseEventDeTeste { constructor(code) { this.code = code; this.reason = ''; } }
class EventDeTeste { constructor(type) { this.type = type; } }
const QUEBRAS = {
  'batimento sem resposta': normalizeChannelError(new Error('heartbeat timeout')),
  'socket fechado (1006)': normalizeChannelError(new CloseEventDeTeste(1006)),
  'erro do transporte': normalizeChannelError(new EventDeTeste('error')),
  'ligação perdida (sem razão)': normalizeChannelError(undefined),
};
/** Como chega a recusa: a resposta do servidor à entrada (`.receive('error')` do RealtimeChannel). */
const recusa = (() => {
  const resposta = JSON.parse('{"reason":"Unauthorized: You do not have permissions to read from this Channel topic: presenca:x"}');
  return new Error(Object.values(resposta).join(', ') || 'error', { cause: resposta });
})();

function ambiente() {
  let agora = 1_000_000_000_000;
  let proximo = 0;
  const prazos = new Map();
  const canais = [];
  const removidos = [];
  class DataDeTeste extends Date { static now() { return agora; } }
  const supabase = {
    channel(topico, opcoes) {
      const c = {
        topico, opcoes, estado: null, aoMudarPresenca: null, presenca: {}, enviados: [], respostaDoTrack: 'ok',
        on(tipo, filtro, fn) { if (tipo === 'presence' && filtro.event === 'sync') c.aoMudarPresenca = fn; return c; },
        subscribe(fn) { c.estado = fn; return c; },
        presenceState() { return c.presenca; },
        track(p) { c.enviados.push(p); return Promise.resolve(c.respostaDoTrack); },
        untrack() { return Promise.resolve('ok'); },
      };
      canais.push(c);
      return c;
    },
    removeChannel(c) { removidos.push(c); return Promise.resolve('ok'); },
  };
  const globals = {
    Date: DataDeTeste, console, Promise, JSON, Object, Array, Set, Map, Math, Number, Error,
    setTimeout: (fn, ms) => { const id = ++proximo; prazos.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => prazos.delete(id),
  };
  function carregar(nome, mocks = {}) {
    const module = { exports: {} };
    const code = ts.transpileModule(ler(nome), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, { ...globals, module, exports: module.exports, require: (id) => {
      if (id in mocks) return mocks[id];
      throw Error('Import inesperado: ' + id);
    } }, { filename: nome });
    return module.exports;
  }
  const estado = carregar('src/lib/estadoDaPresencaAoVivo.ts');
  const m = carregar('src/lib/presencaAoVivo.ts', { './supabase': { supabase }, './estadoDaPresencaAoVivo': estado });
  return {
    m, canais, removidos, prazos,
    avancar(ms) { agora += ms; },
    /** Corre os prazos que já venceram (pela ordem em que foram marcados). */
    correrPrazos(ateMs) {
      for (const [id, p] of [...prazos]) if (p.ms <= ateMs) { prazos.delete(id); p.fn(); }
    },
  };
}

const ESTADO = (titulo, ativo = false) => ({
  v: 1, ativo, em: 1_000_000_000_000,
  faixa: { source: 'youtube', sourceId: titulo.toLowerCase(), title: titulo, artist: 'A', artworkUrl: null, durationSeconds: 200, positionMs: 0, rate: 1, aSeguir: [] },
});

(async () => {
  await caso('a ligação que cai não é uma recusa; a resposta do servidor é', () => {
    const { m } = ambiente();
    for (const [nome, erro] of Object.entries(QUEBRAS)) assert.equal(m.eRecusaDoServidor(erro), false, nome);
    assert.equal(m.eRecusaDoServidor(recusa), true);
    assert.equal(m.eRecusaDoServidor(undefined), false);
  });

  for (const [nome, erro] of Object.entries(QUEBRAS)) {
    await caso(`quem lê: "${nome}" não larga os canais dos amigos, e a música nova chega ao voltar`, () => {
      const a = ambiente();
      const recebidos = [];
      const ouvir = a.m.ouvirPresencasAoVivo((id, e) => recebidos.push([id, e && e.faixa && e.faixa.title]));
      ouvir.atualizar(['amigo', 'outro']);
      assert.equal(a.canais.length, 2);
      const [c] = a.canais;
      c.estado('SUBSCRIBED');
      c.presenca = { s1: [ESTADO('Primeira')] };
      c.aoMudarPresenca();
      // A ligação cai: todos os canais recebem CHANNEL_ERROR.
      for (const k of a.canais) k.estado('CHANNEL_ERROR', erro);
      assert.equal(a.removidos.length, 0, 'nenhum canal largado');
      assert.equal(a.m.presencaAoVivoDisponivel(), true, 'sem a meia hora de espera');
      assert.equal(ouvir.canaisLigados(), 2);
      // O phoenix volta a entrar sozinho; o estado de agora chega.
      c.estado('SUBSCRIBED');
      c.presenca = { s1: [ESTADO('Segunda')] };
      c.aoMudarPresenca();
      assert.deepEqual(recebidos.at(-1), ['amigo', 'Segunda']);
      assert.equal(a.canais.length, 2, 'os mesmos canais, sem outros abertos');
    });
  }

  await caso('quem lê: uma recusa larga tudo, espera meia hora e volta a entrar sozinho (o PC não tem o regresso à app)', () => {
    const a = ambiente();
    const ouvir = a.m.ouvirPresencasAoVivo(() => {});
    ouvir.atualizar(['amigo', 'outro']);
    a.canais[0].estado('CHANNEL_ERROR', recusa);
    assert.equal(a.removidos.length, 2, 'os dois largados');
    assert.equal(ouvir.canaisLigados(), 0);
    assert.equal(a.m.presencaAoVivoDisponivel(), false);
    // Os CLOSED dos canais que largámos não contam.
    for (const k of a.canais) k.estado('CLOSED');
    const prazo = [...a.prazos.values()].find((p) => p.ms >= 30 * 60_000);
    assert.ok(prazo, 'um prazo para o fim da espera');
    a.avancar(prazo.ms);
    a.correrPrazos(prazo.ms);
    assert.equal(ouvir.canaisLigados(), 2, 'de volta aos canais, sem esperar pelo `atualizar`');
    assert.equal(a.canais.length, 4);
  });

  await caso('quem lê: um canal que o servidor fechou volta a abrir-se ao fim de um minuto', () => {
    const a = ambiente();
    const ouvir = a.m.ouvirPresencasAoVivo(() => {});
    ouvir.atualizar(['amigo']);
    a.canais[0].estado('SUBSCRIBED');
    a.canais[0].estado('CLOSED');
    assert.equal(ouvir.canaisLigados(), 0);
    a.correrPrazos(60_000);
    assert.equal(ouvir.canaisLigados(), 1);
    assert.equal(a.canais.length, 2);
    assert.equal(a.canais[1].topico, 'presenca:amigo');
  });

  await caso('quem lê: sair da conta cancela o regresso marcado', () => {
    const a = ambiente();
    const ouvir = a.m.ouvirPresencasAoVivo(() => {});
    ouvir.atualizar(['amigo']);
    a.canais[0].estado('CLOSED');
    ouvir.parar();
    a.correrPrazos(60_000);
    assert.equal(a.canais.length, 1, 'nenhum canal novo depois de parar');
  });

  await caso('quem declara: na quebra vai pela tabela (`aoVivo` falso) e, ao voltar, declara outra vez no mesmo canal', async () => {
    const a = ambiente();
    const d = a.m.declararPresencaAoVivo('eu', 'sessao-1');
    const [c] = a.canais;
    c.estado('SUBSCRIBED');
    d.declarar(ESTADO('Primeira', true));
    await flush();
    assert.equal(d.aoVivo(), true);
    c.estado('CHANNEL_ERROR', QUEBRAS['batimento sem resposta']);
    assert.equal(d.aoVivo(), false, 'fora do canal: quem chama escreve na tabela');
    assert.equal(a.removidos.length, 0);
    assert.equal(a.m.presencaAoVivoDisponivel(), true);
    d.declarar(ESTADO('Segunda', true));
    assert.equal(c.enviados.length, 1, 'fora do canal não se envia');
    c.estado('SUBSCRIBED');
    assert.equal(d.aoVivo(), true);
    assert.equal(c.enviados.at(-1).faixa.title, 'Segunda', 'a música de agora, ao voltar');
    assert.equal(a.canais.length, 1);
  });

  await caso('quem declara: uma recusa larga o canal e espera; um canal fechado abre outro no próximo declarar', () => {
    const a = ambiente();
    const d = a.m.declararPresencaAoVivo('eu', 'sessao-1');
    a.canais[0].estado('CHANNEL_ERROR', recusa);
    assert.equal(a.removidos.length, 1);
    assert.equal(a.m.presencaAoVivoDisponivel(), false);
    d.declarar(ESTADO('X'));
    assert.equal(a.canais.length, 1, 'durante a espera não abre outro');

    const b = ambiente();
    const d2 = b.m.declararPresencaAoVivo('eu', 'sessao-1');
    b.canais[0].estado('SUBSCRIBED');
    b.canais[0].estado('CLOSED');
    assert.equal(d2.aoVivo(), false);
    assert.equal(b.m.presencaAoVivoDisponivel(), true, 'fechar não é uma recusa');
    d2.declarar(ESTADO('Y'));
    assert.equal(b.canais.length, 2, 'outro canal');
  });

  await caso('quem declara: um track que não foi aceite volta a enviar-se no próximo declarar, mesmo igual', async () => {
    const a = ambiente();
    const d = a.m.declararPresencaAoVivo('eu', 'sessao-1');
    const [c] = a.canais;
    c.estado('SUBSCRIBED');
    c.respostaDoTrack = 'timed out';
    const e = ESTADO('Igual', true);
    d.declarar(e);
    await flush();
    c.respostaDoTrack = 'ok';
    d.declarar(e);
    assert.equal(c.enviados.length, 2);
  });

  if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
  console.log('\nTodos os casos passaram.');
})();
