// Executa os componentes/ações reais sem rede, áudio ou um simulador iOS.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks) {
  const module = {exports:{}};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'), {compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true,
  }}).outputText;
  vm.runInNewContext(code,{module,exports:module.exports,require:id=>{
    assert.ok(id in mocks,'Import sem duplo: '+id);return mocks[id];
  }});
  return module.exports;
}
const track = id => ({source:'youtube',sourceId:id,title:id,artist:'Isak'});
const seeds=[track('saved-a'),track('saved-b')], generated=[track('radio-a')];
let version=0, grouping=0;
const groups = load('src/state/gruposDaBiblioteca.ts',{
  './catalogoDeFaixas':{comCatalogo:t=>({...t,title:t.title+' resolved'}),useCatalogoDeFaixas:{getState:()=>({versao:version})}},
  '../lib/artistName':{agruparPorArtista:tracks=>{grouping++;return [{chave:'isak',faixas:tracks}];}},
}).gruposDaBiblioteca;
const initial=groups(seeds);
assert.equal(groups(seeds),initial,'o detalhe reutiliza o agrupamento da lista');
assert.equal(grouping,1);
version++;assert.notEqual(groups(seeds),initial,'metadados novos invalidam o agrupamento');
assert.notEqual(groups([...seeds]),groups(seeds),'bibliotecas distintas não partilham os resultados');
assert.equal(seeds[0].title,'saved-a','não altera a biblioteca original');

const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),
  useRef:current=>({current}),useMemo:fn=>fn(),useEffect:fn=>fn()};
const animations=[];
class Value {interpolate(config){return config;} stopAnimation(){} }
const Animated={Value,View:'AnimatedView',event:(_events,opts)=>{assert.equal(opts.useNativeDriver,true);return ()=>{};},
  timing:(_v,opts)=>({start:fn=>{animations.push(opts);fn?.({finished:true});}}),
  spring:(_v,opts)=>({start:()=>animations.push(opts)}),
};
const states={END:5,CANCELLED:3,FAILED:1};
const {DeslizarParaVoltar} = load('src/components/DeslizarParaVoltar.tsx',{
  react:{...React,useEffect:()=>{}},'react-native':{Animated,StyleSheet:{create:x=>x},useWindowDimensions:()=>({width:390})},
  'react-native-gesture-handler':{PanGestureHandler:'Pan',State:states},'../hooks/useReducedMotion':{useReducedMotion:()=>false},
});
let closes=0;
function gesture(state,x,v=0){const tree=DeslizarParaVoltar({aoVoltar:()=>closes++,children:'chat'});
  assert.equal(tree.props.activeOffsetX,16);assert.deepEqual(Array.from(tree.props.failOffsetY),[-12,12]);
  assert.equal(tree.props.hitSlop.width,32,'só inicia na margem: não rouba o gesto de responder à mensagem');
  tree.props.onHandlerStateChange({nativeEvent:{state,translationX:x,velocityX:v}});
}
gesture(states.END,40);assert.equal(closes,0,'arrasto curto volta ao sítio');
gesture(states.CANCELLED,130);assert.equal(closes,0,'cancelar não sai do chat');
gesture(states.END,80);assert.equal(closes,1,'arrasto completo sai');
gesture(states.END,25,700);assert.equal(closes,2,'flick para a direita sai');
gesture(states.END,-80,700);assert.equal(closes,2,'gesto para a esquerda não sai');
assert.ok(animations.every(a=>a.useNativeDriver));

const {SocialModal}=load('src/components/socialUI.tsx',{
  react:React,'react-native':{Platform:{OS:'ios'},Modal:'Modal',View:'View',Text:'Text',Pressable:'Pressable',
    KeyboardAvoidingView:'Keyboard',StyleSheet:{create:x=>x},useWindowDimensions:()=>({height:844})},
  'react-native-gesture-handler':{GestureHandlerRootView:'GestureRoot'},'./DeslizarParaVoltar':{DeslizarParaVoltar:'SwipeBack'},
  'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:59,bottom:34})},'@expo/vector-icons/Ionicons':'Icon',
  './FriendAvatar':{FriendAvatar:'Avatar'},'expo-linear-gradient':{LinearGradient:'Gradient'},
  '../state/theme':{useTheme:()=>({})},'../lib/haptics':{hapticSelection(){}},'../theme':{spacing:{}},
  './socialTokens':{colors:{},radii:{},type:{},SOCIAL_GUTTER:20},
  './dentroDeUmModal':{DentroDeUmModal:{Provider:'Provider'},useModalDoRNAberto(){}},
  '../hooks/useNotificationOverlay':{useNotificationOverlay:()=>{}},
});
const all=node=>!node||typeof node!=='object'?[]:[node,...(node.props.children??[]).flat(Infinity).flatMap(all)];
const chat=SocialModal({visible:true,title:'Chat',onClose(){},fullScreen:true,header:'chat-header',children:'messages'});
assert.ok(all(chat).some(n=>n.type==='GestureRoot'),'o reconhecedor tem uma raiz dentro do modal nativo');
const swipe=all(chat).find(n=>n.type==='SwipeBack');assert.ok(swipe);
assert.ok(all(swipe).some(n=>n.props.children.includes('chat-header')),'o cabeçalho acompanha o gesto');
assert.ok(!all(SocialModal({visible:true,title:'Sheet',onClose(){},children:'sheet'})).some(n=>n.type==='SwipeBack'),'as folhas mantêm o seu gesto próprio');

async function main(){
  const choice=load('src/lib/ultimaEscolha.ts',{});
  const calls=[];let page={mix:null,musicas:seeds},pending=null;
  const {tocarMixDoArtista}=load('src/state/mixDoArtista.ts',{
    '../api/albunsDoArtista':{mixDoArtista:async()=>page.mix,paginaDoArtista:async()=>pending??page},
    '../api/ytMusic':{lerRadioPeloYtMusic:async()=>generated},
    '../api/radio':{fetchRadioTracks:async(...args)=>{calls.push(['radio',...args]);return generated;}},
    '../api/library':{getLibrary:async()=>seeds},'../lib/cacheDaBiblioteca':{lerFaixas:fn=>fn()},
    '../lib/artistName':{chaveDeArtista:x=>x.toLowerCase(),displayArtist:t=>t.artist},
    '../lib/ultimaEscolha':choice,'./gruposDaBiblioteca':{gruposDaBiblioteca:()=>[{chave:'isak',faixas:seeds}]},
    './player':{usePlayer:{getState:()=>({tocarLista:async(...args)=>calls.push(['play',...args])})}},
  });
  assert.equal(await tocarMixDoArtista('Isak',{faixas:seeds}),true,'artista sem Mix usa música relacionada');
  const radio=calls.find(c=>c[0]==='radio');assert.equal(radio[5],'session','não usa gosto global/Flow');
  assert.deepEqual(Array.from(radio[1],t=>t.sourceId),['saved-a','saved-b']);
  page={mix:{playlistId:'published',videoId:'seed'},musicas:seeds};calls.length=0;
  assert.equal(await tocarMixDoArtista('Isak',{faixas:[]}),true,'funciona antes da biblioteca da página estar carregada');
  assert.equal(calls[0][0],'play','prefere o Mix publicado');
  let resolve;pending=new Promise(r=>resolve=r);calls.length=0;
  const delayed=tocarMixDoArtista('Isak',{faixas:seeds});
  choice.novaEscolha();resolve(page);await delayed;
  assert.equal(calls.length,0,'uma escolha posterior impede o Mix atrasado de começar');
  console.log('UX: cache do artista, Mix publicado/fallback/cancelamento, raiz do modal e gesto nativo passaram.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
