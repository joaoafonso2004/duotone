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
const all=node=>!node||typeof node!=='object'?[]:[node,...(node.props.children??[]).flat(Infinity).flatMap(all)];
let focused=true, cleanup, social={conversation:null}, backs=0;
const navigation={goBack:()=>backs++,navigate(){}};
const target={kind:'friend',id:'friend-a'};
const {ConversaScreen}=load('src/screens/ConversaScreen.tsx',{
  react:{...React,useCallback:fn=>fn},'react-native':{KeyboardAvoidingView:'Keyboard',Platform:{OS:'ios'}},
  '@react-navigation/native':{useIsFocused:()=>focused,useFocusEffect:fn=>{cleanup=fn();}},
  'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:59,bottom:34})},
  '../components/SocialHub':{SocialHub:'Hub'},'../components/socialTokens':{colors:{bg:'#000'}},
  '../state/social':{useSocial:{getState:()=>social,setState:patch=>Object.assign(social,patch)}},
});
const screen=ConversaScreen({route:{params:target},navigation});
const hub=all(screen).find(n=>n.type==='Hub');
assert.equal(social.conversation,target);
assert.equal(hub.props.conversationTarget,target);
hub.props.onCloseConversation();assert.equal(backs,1,'back uses a single native pop');
cleanup();assert.equal(social.conversation,null,'blur releases the notification context');
assert.equal(hub.props.conversationTarget,target,'closing preserves the rendered chat during the transition');
ConversaScreen({route:{params:target},navigation});
social.conversation={kind:'group',id:'new'};cleanup();
assert.equal(social.conversation.id,'new','an old screen cannot clear a newly opened conversation');
const rootSource=fs.readFileSync(path.join(__dirname,'../src/navigation/RootNavigator.tsx'),'utf8');
const root=ts.createSourceFile('root.tsx',rootSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let options;
function visit(n){if(ts.isJsxSelfClosingElement(n)&&n.attributes.properties.some(p=>p.name?.getText(root)==='name'&&p.initializer?.text==='Conversa')){
  const attribute=n.attributes.properties.find(p=>p.name?.getText(root)==='options');
  options=vm.runInNewContext('('+attribute.initializer.expression.getText(root)+')');
}ts.forEachChild(n,visit);}
visit(root);assert.equal(options.fullScreenGestureEnabled,true,'the gesture can start anywhere');
assert.equal(options.gestureDirection,'horizontal');assert.notEqual(options.presentation,'modal','no second vertical modal animation');
const doca=load('src/lib/doca.ts',{});
assert.equal(doca.modoDaDoca(['Conversa']),'escondida','the dock cannot cover the chat composer');

// Exercise the desktop dialog itself: outside, X and Escape all dismiss it.
const uiSource=fs.readFileSync(path.join(__dirname,'../src/desktop/ui.web.tsx'),'utf8');
const uiAst=ts.createSourceFile('ui.tsx',uiSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const dialogNode=uiAst.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='Dialog');
const code=ts.transpileModule(dialogNode.getText(uiAst),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
let keydown, remove, closes=0;
const scope={exports:{},React,useEffect:fn=>{remove=fn();},window:{addEventListener:(_k,fn)=>keydown=fn,removeEventListener:()=>keydown=null},
  View:'View',P:'Pressable',Text:'Text',IconButton:'IconButton',StyleSheet:{absoluteFill:{}},ui:{},marcar:()=>({})};
vm.runInNewContext(code,scope);
const dialog=scope.exports.Dialog({open:true,title:'Share track',children:'recipients',onClose:()=>closes++});
all(dialog).find(n=>n.type==='Pressable').props.onPress();assert.equal(closes,1);
all(dialog).find(n=>n.type==='IconButton').props.onPress();assert.equal(closes,2);
keydown({key:'Enter'});assert.equal(closes,2);keydown({key:'Escape'});assert.equal(closes,3);
remove();assert.equal(keydown,null);
// No PC, todas as folhas partilhadas (Share, Add to playlist...) são este Dialog (5/10).
const {BottomSheet}=load('src/components/BottomSheet.web.tsx',{
  react:React,'react-native':{View:'View',ScrollView:'ScrollView',FlatList:'FlatList'},'react-dom':{createPortal:(child,container)=>({child,container})},
  '../desktop/ui.web':{Dialog:'Dialog'},'../hooks/useNotificationOverlay':{useNotificationOverlay(){}},
});
// load runs without document by default: hidden or server rendered stays empty.
assert.equal(BottomSheet({visible:false,titulo:'Share',onClose(){},children:null}),null);

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
  console.log('UX: cache do artista, Mix publicado/fallback/cancelamento, rota de conversa, gesto de ecrã inteiro e fecho da partilha passaram.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
