import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),ts=require('typescript');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function environment(stubs){
  const modules=new Map();
  function load(name){
    name=name.replaceAll('\\','/');
    if(stubs[name])return stubs[name];
    if(modules.has(name))return modules.get(name).exports;
    const module={exports:{}};modules.set(name,module);
    const file=path.join(root,name);
    const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(code,{module,exports:module.exports,console,setTimeout,clearTimeout,require:request=>{
      if(stubs[request])return stubs[request];
      if(!request.startsWith('.'))return require(request);
      return load(path.relative(root,path.resolve(path.dirname(file),request))+'.ts');
    }},{filename:file});
    return module.exports;
  }
  return load;
}
const memory=new Map();
let storageRead=null;
const storage={getItem:async k=>storageRead?storageRead(k):memory.get(k)??null,setItem:async(k,v)=>{memory.set(k,v);},removeItem:async k=>{memory.delete(k);}};
let connectionListener,foregroundListener,refreshes=0,unsubscribed=0;
const net={configure:()=>{},addEventListener:fn=>{connectionListener=fn;return()=>{unsubscribed++;};},refresh:async()=>{refreshes++;return {isConnected:false,isInternetReachable:false};}};
const native={Platform:{OS:'ios'},AppState:{addEventListener:(_event,fn)=>{foregroundListener=fn;return {remove:()=>{unsubscribed++;}};}}};
const base={'react-native':native,'@react-native-community/netinfo':{default:net},'@react-native-async-storage/async-storage':storage};
const load=environment(base);
const connectivity=load('src/state/connectivity.ts');
const stop=connectivity.startConnectivity();
await new Promise(r=>setTimeout(r,0));
assert.equal(connectivity.useConnectivity.getState().offline,true);
connectionListener({type:'wifi',isConnected:true,isInternetReachable:false});
assert.equal(connectivity.useConnectivity.getState().offline,true,'Wi-Fi sem internet é offline');
connectionListener({type:'cellular',isConnected:true,isInternetReachable:true});
assert.equal(connectivity.useConnectivity.getState().offline,false,'dados móveis permitem funcionamento normal');
assert.equal(connectivity.useConnectivity.getState().revision,1);
connectionListener({type:'wifi',isConnected:true,isInternetReachable:true});
assert.equal(connectivity.useConnectivity.getState().revision,1,'mudar de transporte sem perda de rede não reinicia');
foregroundListener('active');await new Promise(r=>setTimeout(r,0));assert.equal(refreshes,2);
stop();assert.equal(unsubscribed,2);
const windows=environment({...base,'react-native':{...native,Platform:{OS:'web'}}})('src/state/connectivity.ts');
windows.startConnectivity();assert.equal(windows.useConnectivity.getState().offline,false);assert.equal(refreshes,2,'Windows não instala o observador nativo');

const cache=load('src/lib/likedSongsCache.ts');
const track=(id,artist='Artista')=>({id,source:'youtube',sourceId:id,title:`Música ${id}`,artist,album:null,artworkUrl:null,durationSeconds:100});
await cache.cacheLikedSongs('A',[track('one'),track('two')],0);
assert.equal((await cache.readLikedSongsCache('B')).length,0,'não mistura contas');
assert.equal((await cache.readLikedSongsCache('A')).length,2);
const oldRevision=cache.likedCacheRevision('A');
await cache.changeCachedLikes('A',old=>old.filter(t=>t.id!=='one'));
await cache.cacheLikedSongs('A',[track('one'),track('two')],oldRevision);
assert.equal((await cache.readLikedSongsCache('A')).length,1,'uma resposta anterior ao unlike não ressuscita a faixa');
const afterRestart=environment(base)('src/lib/likedSongsCache.ts');
assert.equal((await afterRestart.readLikedSongsCache('A'))[0].id,'two','metadata disponível no arranque seguinte, sem rede');

let databaseRows=Array.from({length:1005},(_,i)=>({tracks:{id:`id${i}`,source:'youtube',source_id:`id${i}`,title:`Faixa ${i}`}}));
let pageCount=0;
const library=environment({...base,
  'src/api/artistNames.ts':{confirmarArtistasEmSegundoPlano:()=>{}},
  'src/lib/supabase.ts':{supabase:{auth:{getUser:async()=>({data:{user:{id:'C'}}})},from:()=>{
    let start=0,end=999;const query={select:()=>query,eq:()=>query,order:()=>query,range:(a,b)=>{start=a;end=b;return query;},then:fn=>{pageCount++;return Promise.resolve(fn({data:databaseRows.slice(start,end+1),error:null}));}};return query;
  }}},
})('src/api/library.ts');
assert.equal((await library.getLikedSongs()).length,1005);
assert.equal(pageCount,2,'uma biblioteca grande não é cortada em mil músicas');
assert.equal((await afterRestart.readLikedSongsCache('C')).length,1005);

// Arranque offline com token expirado: abre apenas a identidade/cache local;
// não inventa uma sessão e sair da conta invalida respostas pendentes.
let authListener;
const sessionRequest=deferred();
memory.set('offline:last-user','A');
const auth=environment({...base,
  'src/lib/supabase.ts':{supabase:{auth:{getSession:()=>sessionRequest.promise,onAuthStateChange:fn=>{authListener=fn;return {data:{subscription:{unsubscribe:()=>{}}}};}}}},
  'src/lib/sessionSync.ts':{endSession:async()=>{}},'src/lib/presenceSync.ts':{terminarPresenca:async()=>{}},
})('src/state/auth.ts');
auth.useAuth.getState().init();await new Promise(r=>setTimeout(r,0));
assert.equal(auth.useAuth.getState().offlineUserId,'A');assert.equal(auth.useAuth.getState().session,null);assert.equal(auth.useAuth.getState().initialized,true);
authListener('SIGNED_OUT',null);
sessionRequest.resolve({data:{session:{user:{id:'A'}}},error:null});await new Promise(r=>setTimeout(r,0));
assert.equal(auth.useAuth.getState().offlineUserId,null,'a sessão atrasada não anula o logout');

const logic=load('src/lib/recommendationFeedback.ts');
const suggestions=[track('a'),track('b'),track('c','Outro'),track('d')];
const prefs=[{kind:'track',key:'c',label:'C'},{kind:'artist',key:'Artista',label:'Artista'}];
const adjusted=logic.ajustarSugestoes(suggestions,prefs,t=>t.id,t=>t.artist);
assert.equal(adjusted.length,1);assert.equal(adjusted[0].id,'a');assert.equal(suggestions.length,4,'a fila manual não é alterada');
assert.equal(logic.ajustarSugestoes(adjusted,prefs,t=>t.id,t=>t.artist).length,1,'o filtro é idempotente');

let feedbackRows=[],failWrite=false;
const feedbackLoad=environment({...base,'src/lib/supabase.ts':{supabase:{from:()=>{
  let operation='read',payload,match;
  const query={select:()=>query,eq:()=>query,order:()=>query,range:()=>query,upsert:p=>{operation='save';payload=p;return query;},delete:()=>{operation='delete';return query;},match:p=>{match=p;return query;},then:fn=>{
    if(operation!=='read'&&failWrite)return Promise.resolve(fn({error:Error('sem rede')}));
    if(operation==='save')feedbackRows.push(payload);
    if(operation==='delete')feedbackRows=feedbackRows.filter(p=>p.key!==match.key||p.kind!==match.kind);
    return Promise.resolve(fn({data:feedbackRows,error:null}));
  }};return query;
}}}});
const feedback=feedbackLoad('src/state/recommendationFeedback.ts');
await feedback.loadRecommendationFeedback('A');
const preference={kind:'track',key:'youtube:one',label:'One'};
await feedback.setRecommendationFeedback(preference,true);
assert.equal(feedback.filterSuggestions([track('one'),track('two')]).length,1);
failWrite=true;await assert.rejects(feedback.setRecommendationFeedback(preference,false));
assert.equal(feedback.filterSuggestions([track('one')]).length,0,'uma gravação falhada não mostra um falso sucesso');
failWrite=false;await feedback.setRecommendationFeedback(preference,false);
assert.equal(feedback.filterSuggestions([track('one')]).length,1);
feedback.aprenderComSaltoDeRecomendacao(track('s1','Aurora Azul'));
feedback.aprenderComSaltoDeRecomendacao(track('s2','Aurora Azul'));
assert.equal(feedback.artistWeight('Aurora Azul'),1,'dois skips não bastam para aprender aversão');
feedback.aprenderComSaltoDeRecomendacao(track('s3','Aurora Azul'));
assert.equal(feedback.artistWeight('Aurora Azul'),.5,'três músicas distintas reduzem gradualmente o artista');
assert.equal(feedback.filterSuggestions([track('a','Aurora Azul'),track('b','Outro')]).map(t=>t.id).join(','),'b,a',
  'uma alternativa sem rejeições passa à frente');
await feedback.loadRecommendationFeedback('B');
assert.equal(feedback.artistWeight('Aurora Azul'),1,'a aprendizagem não atravessa contas');
await feedback.loadRecommendationFeedback('A');
assert.equal(feedback.artistWeight('Aurora Azul'),.5,'a aprendizagem sobrevive ao reinício da conta');
feedback.aprenderComEscutaDeRecomendacao(track('ouvida','Aurora Azul'));
assert.equal(feedback.artistWeight('Aurora Azul'),1,'uma escuta substancial alivia o sinal implícito');
await feedback.loadRecommendationFeedback(null);assert.equal(feedback.useRecommendationFeedback.getState().items.length,0);

// Dois aparelhos com a mesma conta: o que um aprende com os skips chega ao
// outro pela conta, e o perdão de uma escuta não é desfeito ao juntar.
{
  // A `yt_cache` tem RLS por pessoa: o duplo separa as linhas pela conta.
  const naConta=new Map();let offline=false,escritas=0,conta='A';
  const aparelho=()=>{
    const disco=new Map();
    const load=environment({
      'react-native':native,'@react-native-community/netinfo':{default:net},
      '@react-native-async-storage/async-storage':{getItem:async k=>disco.get(k)??null,setItem:async(k,v)=>{disco.set(k,v);},removeItem:async k=>{disco.delete(k);}},
      'src/lib/supabase.ts':{supabase:{from:()=>{const q={select:()=>q,eq:()=>q,order:()=>q,range:()=>q,then:fn=>Promise.resolve(fn({data:[],error:null}))};return q;}}},
      'src/state/connectivity.ts':{useConnectivity:{getState:()=>({offline})}},
      'src/api/cache.ts':{cacheGet:async k=>naConta.has(`${conta}:${k}`)?JSON.parse(naConta.get(`${conta}:${k}`)):null,cacheSet:async(k,v)=>{escritas++;naConta.set(`${conta}:${k}`,JSON.stringify(v));}},
    });
    return {estado:load('src/state/recommendationFeedback.ts'),disco};
  };
  const esperar=()=>new Promise(r=>setTimeout(r,0));
  const iphone=aparelho(),pc=aparelho();
  await iphone.estado.loadRecommendationFeedback('A');
  for(const id of ['s1','s2','s3'])iphone.estado.aprenderComSaltoDeRecomendacao(track(id,'Aurora Azul'));
  await iphone.estado.aprendizagemEnviada();
  assert.equal(iphone.estado.artistWeight('Aurora Azul'),.5);
  assert.ok(naConta.size===1,'a aprendizagem foi para a conta');

  await pc.estado.loadRecommendationFeedback('A');
  await esperar();await esperar();
  assert.equal(pc.estado.artistWeight('Aurora Azul'),.5,'os skips do iPhone ensinam o PC');

  pc.estado.aprenderComEscutaDeRecomendacao(track('ouvida','Aurora Azul'));
  await pc.estado.aprendizagemEnviada();
  assert.equal(pc.estado.artistWeight('Aurora Azul'),1);
  await iphone.estado.loadRecommendationFeedback('A');
  await esperar();await esperar();
  assert.equal(iphone.estado.artistWeight('Aurora Azul'),1,'a escuta no PC perdoa também no iPhone');
  iphone.estado.aprenderComSaltoDeRecomendacao(track('s4','Outro Artista'));
  await iphone.estado.aprendizagemEnviada();
  assert.equal(pc.estado.artistWeight('Aurora Azul'),1,'e nenhuma junção ressuscita a faixa perdoada');
  assert.equal(iphone.estado.artistWeight('Aurora Azul'),1);

  offline=true;const antes=escritas;
  iphone.estado.aprenderComSaltoDeRecomendacao(track('s5','Outro Artista'));
  await iphone.estado.aprendizagemEnviada();
  assert.equal(escritas,antes,'sem rede fica no aparelho');
  offline=false;
  iphone.estado.aprenderComSaltoDeRecomendacao(track('s6','Outro Artista'));
  await iphone.estado.aprendizagemEnviada();
  await pc.estado.loadRecommendationFeedback('A');await esperar();await esperar();
  assert.equal(pc.estado.artistWeight('Outro Artista'),.5,'o que ficou sem rede segue no envio seguinte');
  conta='B';
  await pc.estado.loadRecommendationFeedback('B');await esperar();await esperar();
  assert.equal(pc.estado.artistWeight('Outro Artista'),1,'outra conta não herda a aprendizagem');
}
console.log('Offline e personalização: reconexão, dados móveis, conta local, paginação, cache após logout/unlike, preferências e aprendizagem entre aparelhos passaram.');
