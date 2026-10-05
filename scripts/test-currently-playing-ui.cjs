// Executa os handlers do QueueSheet real, com hooks e superfícies nativas
// substituídos. Não testa gestos nativos, layout nem apresentação de Modals.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const root = require('node:path').resolve(__dirname, '..');
const ts = require(root + '/node_modules/typescript');
const state = [];
let cursor = 0, calls = [], offline = false, session = null;
const track = id => ({ source: 'youtube', sourceId: id, title: id, artist: 'Artist' });
const a = track('A'), b = track('B'), c = track('C');
const store = {
  current: a, queue: [a, b, c], queueIndex: 0, shuffle: false, shuffleOrder: [], sugeridas: [],
  upcomingQueue() { return this.queue.slice(this.queueIndex + 1).map((track, i) => ({track, index: this.queueIndex + i + 1})); },
  playTrack(track, queue) { calls.push(['play', track, queue]); },
  removeFromQueue(index) { calls.push(['remove', index]); },
  fotografiaDaFila() { return { queue: this.queue, queueIndex: this.queueIndex, shuffleOrder: [], atual: 'A' }; },
  reporFila() { calls.push(['repor']); return true; },
  reordenarProximas(from, to) { calls.push(['reorder', from, to]); },
};
const usePlayer = selector => selector(store);
usePlayer.getState = () => store;
const jam = { fila: [{track: c}] };
Object.defineProperty(jam, 'sessao', {get: () => session});
const useOuvirJuntos = selector => selector(jam);
useOuvirJuntos.getState = () => jam;
const hook = initialize => { const i = cursor++; if (!(i in state)) state[i] = initialize(); return i; };
const React = {
  createElement(type, props, ...children) { return { type, props: {...props, children} }; },
  useState(initial) { const i = hook(() => initial); return [state[i], value => {state[i] = typeof value === 'function' ? value(state[i]) : value;}]; },
  useRef(value) { const i = hook(() => ({current: value})); return state[i]; },
  useMemo(fn) { return fn(); }, useCallback(fn) { return fn; }, useEffect() {},
};
const native = {
  Animated: {Value: class {setValue() {}}}, FlatList:'FlatList', View:'View', Text:'Text', Pressable:'Pressable',
  Alert: {alert: (...args) => calls.push(['alert', ...args])}, StyleSheet: {create: s=>s, hairlineWidth:1},
};
// Os módulos puros entram a sério (o menu e o arrasto são o que se testa aqui).
const carregar = (ficheiro, duplos = {}) => {
  const code = ts.transpileModule(fs.readFileSync(root + '/' + ficheiro, 'utf8'),
    {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
  const exp = {};
  vm.runInNewContext(code, {exports:exp,require:name=>{assert.ok(name in duplos, ficheiro+': import sem duplo: '+name);return duplos[name];},setTimeout,clearTimeout,setInterval,clearInterval});
  return exp;
};
const arrastarFila = carregar('src/lib/arrastarFila.ts');
const menuDaFaixa = carregar('src/lib/menuDaFaixa.ts');
const seguir = { seguindo: null, aSeguir: [] };
const useSeguirAmigo = selector => selector(seguir);
// O arrasto é o hook partilhado com a edição de uma playlist, e entra a sério.
const useArrastarLista = carregar('src/hooks/useArrastarLista.ts', {
  react: React, 'react-native': native, '../lib/arrastarFila': arrastarFila,
  '../components/TrackRow': {TRACK_ROW_HEIGHT:68}, '../lib/haptics': {hapticSelection(){}},
  '../state/fluidez': {segurarFluidez:()=>()=>{}},
});
const mocks = {
  react: React, 'react-native': native, './LinhaArrastavel': {LinhaArrastavel:'DragRow'},
  '../hooks/useArrastarLista': useArrastarLista,
  './DeslizarParaTirar': {DeslizarParaTirar:'Swipe'},
  '../lib/arrastarFila': arrastarFila, '../lib/menuDaFaixa': menuDaFaixa,
  '../lib/icones': carregar('src/lib/icones.ts'),
  './TrackRow': {TrackRow:'TrackRow',TRACK_ROW_HEIGHT:68}, '@expo/vector-icons/Ionicons':'Icon',
  '../state/player': {usePlayer}, '../state/ouvirJuntos':{useOuvirJuntos}, '../state/seguirAmigo':{useSeguirAmigo},
  '../theme':{colors:{},spacing:{},type:{},radii:{}}, './BottomSheet':{BottomSheet:'BottomSheet',BottomSheetFlatList:'FlatList'},
  './BrilhoInteligente':{EstrelaInteligente:'Star'}, '../lib/shuffle':{trackKey:t=>t.sourceId},
  '../lib/haptics':{hapticSelection(){},hapticNotification(){}}, '../lib/artistName':{tituloDaFaixa:t=>t.title,displayArtist:t=>t.artist},
  '../hooks/useOfflineMode':{useOfflineMode:()=>offline},
  './PlayerActionsSheet':{PlayerActionsContent:'Actions',accoesDoMenu:(menu,fazer)=>menu.map(a=>({label:a.rotulo,motivo:a.indisponivel,onPress:()=>fazer(a.id)}))},
  './AddToPlaylistSheet':{AddToPlaylistSheet:'Playlist'}, './ShareFriendSheet':{ShareFriendSheet:'Share'},
  './RecommendationPreferences':{RecommendationPreferences:'Recs'},
  './RadioQueueControl':{RadioQueueControl:'RadioQueueControl',ErroDoRadio:'ErroDoRadio'},
  '../lib/descarregarFaixa':{alternarDownload(){},downloadNoMenuDe:()=>null,podeDescarregar:()=>false,tocaSemRede:()=>true,useRevisaoDosDownloads:()=>0},
  '../lib/guardarFaixa':{alternarGuardada:async()=>{},garantirGuardadas(){}},
  '../state/saved':{savedKey:t=>t.source+':'+t.sourceId,useSaved:sel=>sel({loaded:true,keys:new Set()})},
  // O aviso com "Undo" (3/10) entra a sério: é puro.
  '../lib/avisoDeRemocao': carregar('src/lib/avisoDeRemocao.ts'),
  // A frase de um erro (3/10, 6.1), também pura.
  '../lib/mensagemDeErro': carregar('src/lib/mensagemDeErro.ts'),
};
const code = ts.transpileModule(fs.readFileSync(root+'/src/components/QueueSheet.tsx','utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
const exportsObject = {};
vm.runInNewContext(code, {exports:exportsObject,require:name=>{
  assert.ok(name in mocks, 'Import sem duplo: '+name);return mocks[name];
},setTimeout,clearTimeout,setInterval,clearInterval});
const render = () => {cursor=0;return exportsObject.QueueSheet({visible:true,onClose(){},onOpenSession(){calls.push(['manage']);}});};
// Um filho que é função (a pega do `LinhaArrastavel`) desenha-se com a pega vazia.
function nodes(node) { if(typeof node==='function')return nodes(node(undefined));if(!node || typeof node!=='object')return [];return [node,...(node.props?.children||[]).flat(Infinity).flatMap(nodes)]; }
const find = (tree,type,predicate=()=>true) => nodes(tree).find(n=>n.type===type&&predicate(n.props));
const entry = (tree,index=0) => {const list=find(tree,'FlatList'); return list.props.renderItem({item:list.props.data[index],index});};
function openEntry() { const row=entry(render());find(row,'Pressable').props.onPress();return render(); }
function action(tree,label) { return find(tree,'Actions').props.actions.find(a=>a.label===label); }
function reset(){state.length=0;calls=[];session=null;offline=false;store.queue=[a,b,c];store.queueIndex=0;}

reset();
let tree=openEntry();
assert.equal(calls.length,0,'Os três pontos não tocam nem removem');
assert.equal(find(tree,'Actions').props.title,'B');
action(tree,'Add to playlist…').onPress();tree=render();
assert.equal(find(tree,'Playlist').props.track,b,'A playlist recebe a faixa da linha, não a atual');
assert.equal(find(tree,'Playlist').props.visible,true);
find(tree,'Playlist').props.onClose();tree=render();
action(tree,'Share with friends or groups…').onPress();tree=render();
assert.equal(find(tree,'Share').props.item,b);
assert.equal(find(tree,'Share').props.visible,true);

reset();tree=openEntry();action(tree,'Remove from queue').onPress();
assert.deepEqual(calls,[['remove',1]]);
// Tirar da fila mostra o aviso, e o "Undo" repõe a fila (3/10).
const avisoDaFila = mocks['../lib/avisoDeRemocao'].avisos.atual();
assert.equal(avisoDaFila?.texto,'Removed from queue');
void mocks['../lib/avisoDeRemocao'].avisos.desfazer(avisoDaFila.id); // o desfazer corre já, antes do primeiro await
assert.deepEqual(calls,[['remove',1],['repor']]);

reset();tree=openEntry();store.queue=[a,c,b];action(tree,'Remove from queue').onPress();
assert.equal(calls.length,0,'Uma fila substituída não remove por índice antigo');
assert.ok(action(render(),'Remove from queue').motivo,'fica à vista, apagada, a dizer porquê');

reset();tree=openEntry();store.queueIndex=1;action(tree,'Remove from queue').onPress();
assert.equal(calls.length,0,'A entrada que entretanto começou a tocar não é removida');

reset();tree=openEntry();session={id:'jam'};action(tree,'Remove from queue').onPress();
assert.equal(calls.length,0,'Entrar num Jam revoga a remoção local pendente');
assert.ok(action(render(),'Remove from queue').motivo,'num Jam fica apagada, com o motivo');
action(render(),'Manage Jam queue').onPress();assert.deepEqual(calls,[['manage']]);

reset();offline=true;tree=openEntry();
assert.ok(action(tree,'Add to playlist…').motivo,'sem rede fica apagada, a dizer porquê');

reset();let row=entry(render());find(row,'TrackRow').props.onPress();
assert.equal(calls[0][0],'play');assert.equal(calls[0][1],b);
// O toque longo que pega é da própria linha (Gesture Handler, 3/10): ela chama o aoComecar.
find(row,'DragRow').props.aoComecar(0);row=entry(render());
assert.equal(find(row,'DragRow').props.arrastarIndex,0);
find(row,'DragRow').props.aoLargar(68);
assert.deepEqual(calls.at(-1),['reorder',0,1],'O menu mantém o gesto de arrasto');
console.log('QueueSheet: opções, seleção, playlist/partilha, offline, remoção concorrente, Jam e arrasto passaram.');

// Executa também os handlers reais do Rádio. Uma troca de conta ou edição
// entre render e toque não pode restaurar uma fotografia antiga da fila.
async function testRadioControl(){
  const auth={session:{user:{id:'owner-a'}},offlineUserId:null};
  const useAuth=selector=>selector(auth);useAuth.getState=()=>auth;
  const useConnectivity=selector=>selector({offline:false});
  usePlayer.getState=()=>({...store}); // Zustand devolve um snapshot que a atualização seguinte não modifica.
  usePlayer.setState=patch=>Object.assign(store,patch);
  const radio=carregar('src/components/RadioQueueControl.tsx',{
    react:React,'react-native':{...native,Switch:'Switch',ActivityIndicator:'Spinner'},
    '@expo/vector-icons/Ionicons':'Icon','../state/player':{usePlayer},
    '../state/connectivity':{useConnectivity},'../state/auth':{useAuth},
    '../theme':{colors:{},spacing:{},type:{},radii:{}},'../lib/artistName':{displayArtist:t=>t.artist},
  });
  const draw=()=>{cursor=0;return radio.RadioQueueControl({});};
  const original=[a,b,c],generated=[a,track('radio')];
  function setup(){
    state.length=0;auth.session={user:{id:'owner-a'}};
    Object.assign(store,{current:a,queue:original,queueIndex:0,positionMs:84_000,
      radioMode:'off',radioContext:[],radioOwner:null,radioStopped:false,
      radioActive:false,doRadio:[],radioError:null,shuffle:true,repeatMode:'all',
      startRadio:async()=>{store.queue=generated;store.radioMode='on';return true;},
      stopRadio:()=>{store.radioMode='off';store.radioStopped=true;},
    });
  }
  async function activate(){
    // A pastilha do cabeçalho (5/10) liga com um toque, como o interruptor ligava.
    find(draw(),'Pressable',p=>p.accessibilityLabel==='Radio').props.onPress();
    assert.equal(store.queue,generated,'a pastilha ativa diretamente mesmo com músicas na fila');
    assert.ok(!nodes(draw()).some(n=>n.type==='Text'&&n.props.children.includes('Start Radio')),'não pede confirmação');
    await new Promise(resolve=>setImmediate(resolve));
    return find(draw(),'Pressable',p=>p.accessibilityLabel==='Undo Radio and restore previous queue');
  }
  setup();let undo=await activate();assert.ok(undo);
  undo.props.onPress();assert.equal(store.queue,original);
  assert.equal(store.current,a);assert.equal(store.positionMs,84_000);
  assert.equal(store.shuffle,true);assert.equal(store.repeatMode,'all');

  setup();undo=await activate();auth.session={user:{id:'owner-b'}};
  undo.props.onPress();assert.equal(store.queue,generated,'Undo não restaura a fila de outra conta, mesmo antes do render seguinte');

  setup();undo=await activate();const manual=[a,track('manual')];store.queue=manual;
  undo.props.onPress();assert.equal(store.queue,manual,'Undo não apaga uma edição posterior');

  // Ligado, a mesma pastilha desliga; desligado não volta a pedir nada.
  setup();await activate();
  const ligada=find(draw(),'Pressable',p=>p.accessibilityLabel==='Radio');
  assert.equal(ligada.props.accessibilityState.checked,true,'ligado diz-se ao VoiceOver');
  ligada.props.onPress();assert.equal(store.radioMode,'off');assert.equal(store.radioStopped,true);
  assert.ok(!nodes(draw()).some(n=>n.props?.accessibilityLabel==='Undo Radio and restore previous queue'),'desligar tira o Undo');
  console.log('RadioQueueControl: pastilha liga e desliga, Undo sem alterar áudio, conta e edição concorrente passaram.');
}
testRadioControl().catch(error=>{console.error(error);process.exitCode=1;});
