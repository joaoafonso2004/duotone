const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { createStore } = require('zustand/vanilla');
let entregar;
const mocks = {
  './player': { registarOuvirJuntos: () => {}, usePlayer: {} },
  zustand: { create: createStore }, 'react-native': { AppState: {} },
  '../api/ouvirJuntos': { lerSessao: () => new Promise(r => { entregar = r; }), lerFila: async () => [] },
  '../lib/relogioPartilhado': {}, '../lib/sincronizacao': {}, '../lib/appVisibility': {},
  '../lib/supabase': {}, '../api/descoberta': {}, '../lib/artistName': {},
  '../lib/jam': { passouParaMim: () => false, percursoDaSessao: p => p },
  '../lib/prefs': { getJamAutoFila: async () => false }, '../lib/shuffle': {}, '../lib/eventos': {},
};
const moduleOfStore = { exports: {} };
const file = require('node:path').resolve(__dirname, '../src/state/ouvirJuntos.ts');
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { module: moduleOfStore, exports: moduleOfStore.exports,
  require: n => { if (!(n in mocks)) throw Error(n); return mocks[n]; },
  clearInterval, clearTimeout, setTimeout, setInterval, Date, console,
}, { filename: file });
const store = moduleOfStore.exports.useOuvirJuntos;
async function main() {
  const antiga = { id: 'sala', track: null, aTocar: false, acabouEm: null };
  const confirmada = { ...antiga, track: { source: 'youtube', sourceId: 'nova' }, aTocar: true };
  store.setState({ sessao: antiga });
  const pedido = store.getState().actualizar();
  // O callback realtime aplica a confirmação enquanto a leitura antiga está em voo.
  store.setState({ sessao: confirmada });
  entregar(antiga); await pedido;
  assert.equal(store.getState().sessao, confirmada, 'a leitura antiga não repõe a pausa por cima do realtime');
  const normal = store.getState().actualizar();
  const novaPausa = { ...confirmada, aTocar: false };
  entregar(novaPausa); await normal;
  assert.equal(store.getState().sessao, novaPausa, 'uma leitura sem evento concorrente continua a atualizar');
  const filaEmVoo = store.getState().actualizar();
  const filaConfirmada = [{ id: 'nova-na-fila', posicao: 0, track: { source: 'youtube', sourceId: 'adicionada' } }];
  store.setState({ fila: filaConfirmada });
  entregar(novaPausa); await filaEmVoo;
  assert.equal(store.getState().fila, filaConfirmada, 'leitura antiga não apaga uma adição realtime à fila');
  const fim = store.getState().actualizar();
  store.getState().desligar(); entregar(confirmada); await fim;
  assert.equal(store.getState().sessao, null, 'respostas tardias não reabrem a Jam depois de sair');
  const api=mocks['../api/ouvirJuntos'];let filas=0,membros=0,aoEstado;
  api.fecharJamsAbandonadas=async()=>{};api.minhasSessoesAbertas=async()=>[];
  api.lerFila=async()=>{filas++;return [];};api.lerMembros=async()=>{membros++;return [];};api.relogioActualizado=async()=>null;
  api.itemDaLinha=r=>({id:r.id,posicao:r.posicao,track:r.track,postoPor:r.added_by});
  api.membroDaLinha=r=>({userId:r.user_id,pronta:r.ready,percentagem:r.download_pct,vistoEm:Date.parse(r.last_seen)});
  mocks['../lib/jam'].escolherSessao=()=>({escolhida:{sessao:confirmada},sobras:[]});
  mocks['../lib/jam'].semOApagado=(f,id)=>f.some(i=>i.id===id)?f.filter(i=>i.id!==id):f;
  mocks['../lib/appVisibility'].appEstaVisivel=()=>true;
  mocks['react-native'].AppState.addEventListener=(_n,fn)=>{aoEstado=fn;return {remove:()=>{}};};
  const callbacks=[];const channel={on:(_t,options,fn)=>{callbacks.push({options,fn});return channel;},subscribe:fn=>{fn('SUBSCRIBED');return channel;}};
  mocks['../lib/supabase'].supabase={channel:()=>channel,removeChannel:async()=>{}};
  await store.getState().ligar('guest');await new Promise(r=>setTimeout(r,125));filas=0;membros=0;
  const queueEvent=callbacks.find(c=>c.options.table==='listening_queue'&&c.options.event==='*').fn;
  const memberEvent=callbacks.find(c=>c.options.table==='listening_members'&&c.options.event==='*').fn;
  for(let i=11;i>=0;i--)queueEvent({new:{id:'item'+i,session_id:'sala',posicao:i,track:{source:'youtube',sourceId:'song'+i},added_by:'host'}});
  assert.equal(store.getState().fila.length,12);assert.equal(store.getState().fila[0].track.sourceId,'song0');
  memberEvent({new:{session_id:'sala',user_id:'host',ready:true,download_pct:100,last_seen:new Date().toISOString()}});
  assert.equal(store.getState().membros[0].pronta,true);assert.equal(filas,0);assert.equal(membros,0,'eventos completos não releem a lista');
  callbacks.find(c=>c.options.table==='listening_queue'&&c.options.event==='DELETE').fn({old:{id:'item0'}});
  assert.equal(store.getState().fila.length,11);
  const memberDelete=callbacks.find(c=>c.options.table==='listening_members'&&c.options.event==='DELETE').fn;
  memberDelete({old:{session_id:'outra',user_id:'host'}});assert.equal(store.getState().membros.length,1);
  memberDelete({old:{session_id:'sala',user_id:'host'}});assert.equal(store.getState().membros.length,0);
  for(let i=0;i<12;i++)queueEvent({new:{}});
  await new Promise(r=>setTimeout(r,125));assert.equal(filas,1,'doze eventos incompletos partilham uma recuperação');
  filas=0;aoEstado('inactive');aoEstado('active');await new Promise(r=>setTimeout(r,5));assert.equal(filas,0,'Centro de Controlo não faz nova leitura completa');
  store.getState().desligar();
  console.log('ok - Jam: leitura em voo não sobrescreve confirmação realtime nem reabre uma sala abandonada');
  console.log('ok - Realtime: 12 inserções e batimento de membro sem GETs, deletes isolados, recuperação agrupada e retomada estável');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
