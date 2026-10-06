/**
 * O Radio da sala num Jam (6/10, supabase/radio-no-jam.sql), do lado da app:
 * quem o pode ligar, quem enche a fila, e que enche DEPOIS do que as pessoas
 * puseram, com o Radio de sempre (api/radio.ts).
 *
 * Correr: node scripts/test-radio-no-jam.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const { createStore } = require('zustand/vanilla');

const carregar = (nome, mocks = {}) => {
  const modulo = { exports: {} };
  const ficheiro = path.resolve(__dirname, '..', nome);
  const codigo = ts.transpileModule(fs.readFileSync(ficheiro, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(codigo, { module: modulo, exports: modulo.exports,
    require: (n) => { if (!(n in mocks)) throw Error(`${nome}: ${n}`); return mocks[n]; },
    clearInterval, clearTimeout, setTimeout, setInterval, Date, console, Promise,
  }, { filename: ficheiro });
  return modulo.exports;
};
const esperar = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const faixa = (id, artist = 'Isak') => ({ source: 'youtube', sourceId: id, title: id, artist });

const c = { radio: 0, contextos: [], juntadas: [], definir: [], descoberta: 0, lidas: 0 };
let ponte = null, sessaoNoServidor = null, aoMudarSessao = null;
const mocks = {
  './player': { registarOuvirJuntos: (fn) => { ponte = fn; }, usePlayer: { getState: () => ({ positionMs: 0, upcomingQueue: () => [] }) } },
  zustand: { create: createStore }, 'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } },
  '../api/ouvirJuntos': {
    lerSessao: async () => { c.lidas++; return sessaoNoServidor; }, lerFila: async () => [], lerMembros: async () => [],
    definirRadioDoJam: async (id, v) => { c.definir.push([id, v]); sessaoNoServidor = { ...sessaoNoServidor, radio: v }; },
    juntarMuitasAFila: async (_id, tracks) => { c.juntadas.push([...tracks].map((t) => t.sourceId)); return tracks.length; },
    retratoDaSessao: async () => new Map(), fecharJamsAbandonadas: async () => {}, minhasSessoesAbertas: async () => [{ id: 'jam', sessao: sessaoNoServidor, entrouEm: 1 }],
    relogioActualizado: async () => null, continuoNaSessao: async () => {},
    sessaoDaLinha: (r) => r, membroDaLinha: (r) => r, itemDaLinha: (r) => r,
  },
  '../lib/relogioPartilhado': {}, '../lib/sincronizacao': {}, '../lib/appVisibility': { appEstaVisivel: () => true },
  '../lib/supabase': { supabase: { channel: () => {
    const canal = { on: (_t, filtro, fn) => { if (filtro.table === 'listening_sessions') aoMudarSessao = fn; return canal; }, subscribe: () => canal };
    return canal;
  }, removeChannel: async () => {} } },
  '../api/descoberta': { candidatasParaDescoberta: async () => { c.descoberta++; return [faixa('descoberta')]; } },
  '../lib/artistName': { chaveDeArtista: (n) => String(n).toLowerCase(), displayArtist: (t) => t.artist },
  '../api/radio': { fetchRadioTracks: async (sementes, excluir) => {
    c.radio++; c.contextos.push([...sementes].map((t) => t.sourceId));
    return [faixa('r1', 'Bispo'), faixa('na-fila', 'X'), faixa('r2', 'Holly Hood')].filter((t) => !excluir.some((e) => e.sourceId === t.sourceId));
  } },
  '../lib/radio': { espalharArtistas: (lista) => lista },
  '../lib/jam': carregar('src/lib/jam.ts'),
  '../lib/prefs': { getJamAutoFila: async () => false, setJamAutoFila: async () => {} },
  '../lib/shuffle': carregar('src/lib/shuffle.ts'),
  '../lib/eventos': { registar() {} },
};
const { useOuvirJuntos } = carregar('src/state/ouvirJuntos.ts', mocks);
const loja = useOuvirJuntos;
const sala = (o = {}) => ({ id: 'jam', hostId: 'host', track: faixa('agora'), comecouEmServidor: 0, aTocar: true, pausadaEmMs: 0,
  convidadosControlam: false, auxDe: null, radio: false, acabouEm: null, ...o });
const repor = (o, eu = 'host', fila = []) => {
  for (const k of Object.keys(c)) c[k] = Array.isArray(c[k]) ? [] : 0;
  sessaoNoServidor = sala(o);
  loja.setState({ sessao: sessaoNoServidor, euId: eu, fila, autoFila: false, aviso: null });
};

async function main() {
  // O anfitrião, com o Radio da sala ligado e a fila a acabar: enche pelo Radio.
  repor({ radio: true }, 'host', [{ id: 'i1', posicao: 1, track: faixa('na-fila', 'X') }]);
  await loja.getState().encherSeSecar();
  assert.equal(c.radio, 1, 'o Radio de sempre');
  assert.equal(c.descoberta, 0, 'e não a descoberta do enchimento antigo');
  assert.deepEqual(c.contextos[0], ['agora'], 'a partir do que a sala está a ouvir');
  assert.deepEqual(c.juntadas, [['r1', 'r2']], 'depois do que lá está, sem repetir o que já está na fila');

  // Com a fila cheia não se mexe (o que as pessoas puseram vem primeiro).
  repor({ radio: true }, 'host', [1, 2, 3].map((n) => ({ id: `i${n}`, posicao: n, track: faixa(`p${n}`) })));
  await loja.getState().encherSeSecar();
  assert.equal(c.radio, 0, 'com três ou mais na fila, nada');

  // Um convidado não enche (é o anfitrião quem enche).
  repor({ radio: true }, 'convidado');
  await loja.getState().encherSeSecar();
  assert.equal(c.radio, 0);

  // Sem Radio e com o "Queue the whole list" desligado: nada entra sozinho.
  repor({ radio: false }, 'host');
  await loja.getState().encherSeSecar();
  assert.deepEqual([c.radio, c.descoberta], [0, 0]);

  // Ligar: o anfitrião liga, a sessão relê-se e a fila enche-se logo.
  repor({ radio: false }, 'host');
  await loja.getState().ligarRadio(true);
  await esperar(5);
  assert.deepEqual(c.definir, [['jam', true]]);
  assert.equal(loja.getState().sessao.radio, true, 'a sessão relida diz que está ligado');
  assert.equal(c.radio, 1, 'e enche já');

  // Um convidado sem controlo não liga; com controlo, liga.
  repor({ radio: false }, 'convidado');
  await loja.getState().ligarRadio(true);
  assert.deepEqual(c.definir, [], 'sem controlo não se chama o servidor');
  repor({ radio: false, convidadosControlam: true }, 'convidado');
  await loja.getState().ligarRadio(true);
  assert.deepEqual(c.definir, [['jam', true]]);
  assert.equal(c.radio, 0, 'quem enche é o anfitrião, não o convidado');

  // Sem a migração (a sessão não traz o Radio) não se tenta.
  repor({ radio: null }, 'host');
  await loja.getState().ligarRadio(true);
  assert.deepEqual(c.definir, []);

  // O realtime: outra pessoa liga o Radio, e o anfitrião enche.
  repor({ radio: false }, 'host');
  await loja.getState().ligar('host', 'jam');
  await esperar(5);
  for (const k of Object.keys(c)) c[k] = Array.isArray(c[k]) ? [] : 0;
  sessaoNoServidor = sala({ radio: true });
  aoMudarSessao({ new: sala({ radio: true }) });
  await esperar(5);
  assert.equal(c.radio, 1, 'ligado por outra pessoa: o anfitrião enche');
  aoMudarSessao({ new: sala({ radio: true }) });
  await esperar(5);
  assert.equal(c.radio, 1, 'uma atualização sem mudança no Radio não volta a encher');

  // A ponte para o leitor: o Radio com o estado da sala, ou nada sem a migração.
  loja.setState({ sessao: sala({ radio: true }), euId: 'host' });
  assert.equal(ponte().radio.ligado, true);
  loja.setState({ sessao: sala({ radio: null }) });
  assert.equal(ponte().radio, null);
  loja.getState().desligar();

  console.log('Radio no Jam (app): passou.');
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
