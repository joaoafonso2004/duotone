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
const mocks = {
  react: React, 'react-native': native, './LinhaArrastavel': {LinhaArrastavel:'DragRow'},
  '../lib/arrastarFila': {destinoDoArrasto:(de,dy,h,n)=>Math.max(0,Math.min(n-1,de+Math.round(dy/h))),velocidadeDoDeslize:()=>0},
  './TrackRow': {TrackRow:'TrackRow',TRACK_ROW_HEIGHT:68}, '@expo/vector-icons/Ionicons':'Icon',
  '../state/player': {usePlayer}, '../state/ouvirJuntos':{useOuvirJuntos},
  '../theme':{colors:{},spacing:{},type:{},radii:{}}, './BottomSheet':{BottomSheet:'BottomSheet'},
  './BrilhoInteligente':{EstrelaInteligente:'Star'}, '../lib/shuffle':{trackKey:t=>t.sourceId},
  '../lib/haptics':{hapticSelection(){}}, '../lib/artistName':{tituloDaFaixa:t=>t.title},
  '../hooks/useOfflineMode':{useOfflineMode:()=>offline},
  './PlayerActionsSheet':{PlayerActionsContent:'Actions'}, './AddToPlaylistSheet':{AddToPlaylistSheet:'Playlist'},
  './ShareFriendSheet':{ShareFriendSheet:'Share'},
};
const code = ts.transpileModule(fs.readFileSync(root+'/src/components/QueueSheet.tsx','utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
const exportsObject = {};
vm.runInNewContext(code, {exports:exportsObject,require:name=>{
  assert.ok(name in mocks, 'Import sem duplo: '+name);return mocks[name];
},setTimeout,clearTimeout,setInterval,clearInterval});
const render = () => {cursor=0;return exportsObject.QueueSheet({visible:true,onClose(){},onOpenSession(){calls.push(['manage']);}});};
function nodes(node) { if(!node || typeof node!=='object')return [];return [node,...(node.props?.children||[]).flat(Infinity).flatMap(nodes)]; }
const find = (tree,type,predicate=()=>true) => nodes(tree).find(n=>n.type===type&&predicate(n.props));
const entry = (tree,index=0) => {const list=find(tree,'FlatList'); return list.props.renderItem({item:list.props.data[index],index});};
function openEntry() { const row=entry(render());find(row,'Pressable').props.onPress();return render(); }
function action(tree,label) { return find(tree,'Actions').props.actions.find(a=>a.label===label); }
function reset(){state.length=0;calls=[];session=null;offline=false;store.queue=[a,b,c];store.queueIndex=0;}

reset();
let tree=openEntry();
assert.equal(calls.length,0,'Os três pontos não tocam nem removem');
assert.equal(find(tree,'Actions').props.title,'B');
action(tree,'Add to playlist').onPress();tree=render();
assert.equal(find(tree,'Playlist').props.track,b,'A playlist recebe a faixa da linha, não a atual');
assert.equal(find(tree,'Playlist').props.visible,true);
find(tree,'Playlist').props.onClose();tree=render();
action(tree,'Partilhar com um amigo').onPress();tree=render();
assert.equal(find(tree,'Share').props.item,b);
assert.equal(find(tree,'Share').props.visible,true);

reset();tree=openEntry();action(tree,'Remove from queue').onPress();
assert.deepEqual(calls,[['remove',1]]);

reset();tree=openEntry();store.queue=[a,c,b];action(tree,'Remove from queue').onPress();
assert.equal(calls.length,0,'Uma fila substituída não remove por índice antigo');
assert.equal(action(render(),'Remove from queue').disabled,true);

reset();tree=openEntry();store.queueIndex=1;action(tree,'Remove from queue').onPress();
assert.equal(calls.length,0,'A entrada que entretanto começou a tocar não é removida');

reset();tree=openEntry();session={id:'jam'};action(tree,'Remove from queue').onPress();
assert.equal(calls.length,0,'Entrar num Jam revoga a remoção local pendente');
assert.equal(action(render(),'Remove from queue'),undefined);
action(render(),'Manage Jam queue').onPress();assert.deepEqual(calls,[['manage']]);

reset();offline=true;tree=openEntry();action(tree,'Add to playlist').onPress();
assert.equal(calls[0][0],'alert');assert.equal(find(render(),'Playlist').props.visible,false);

reset();let row=entry(render());find(row,'TrackRow').props.onPress();
assert.equal(calls[0][0],'play');assert.equal(calls[0][1],b);
find(row,'TrackRow').props.onLongPress();row=entry(render());
assert.equal(find(row,'DragRow').props.arrastarIndex,0);
find(row,'DragRow').props.aoLargar(68);
assert.deepEqual(calls.at(-1),['reorder',0,1],'O menu mantém o gesto de arrasto');
console.log('QueueSheet: opções, seleção, playlist/partilha, offline, remoção concorrente, Jam e arrasto passaram.');
