// Real radio pipeline; only network, account state and external discovery are mocked.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={}){
  const module={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`)(id=>{
    if(id in mocks)return mocks[id];
    if(id.startsWith('.')&&(id.includes('/lib/')||file.startsWith('src/lib/')))
      return load(path.join(path.dirname(file),id).replaceAll('\\','/')+'.ts');
    throw Error('Missing mock '+id);
  },module,module.exports);return module.exports;
}
const t=(id,title,artist='Isak Zigarro')=>({source:'youtube',sourceId:id,title,artist,durationSeconds:180,artworkUrl:null,album:null});
const identity=load('src/lib/identidadeDaMusica.ts');
let library=[],discovered=[],page=[],songRadio=[],flowCalls=0;const radioCalls=[];
const {fetchRadioTracks}=load('src/api/radio.ts',{
  '../state/connectivity':{useConnectivity:{getState:()=>({offline:false})}},
  '../state/recommendationFeedback':{feedbackReady:async()=>{},filterSuggestions:ts=>ts},
  './library':{getLibrary:async()=>library},'../lib/cacheDaBiblioteca':{lerFaixas:fn=>fn()},
  './plays':{getFlowMix:async()=>{flowCalls++;return [t('bruno','Unrelated','Bruno Mars')];}},
  './albunsDoArtista':{paginaDoArtista:async()=>({musicas:page})},
  './perfilDeRecomendacoes':{lerPerfilDeRecomendacoes:async()=>({escutas:new Map(),externos:new Map()})},
  './descoberta':{candidatasParaDescoberta:async()=>discovered},
  './ytMusic':{lerRadioPeloYtMusic:async(mix)=>{radioCalls.push(mix.playlistId);return songRadio;}},
});
(async()=>{
  const current=t('current','Anchor'),heard=t('old-upload','Repeated song','Related artist');
  const blocked=new Set(identity.chavesDaMusica(heard));
  page=[{...heard,sourceId:'another-upload',title:'Repeated song (Official Audio)'}];
  assert.deepEqual(await fetchRadioTracks([current],[current],10,blocked,'session'),[],
    'catalog exhaustion does not reintroduce a recent song under another upload');
  assert.equal(flowCalls,0,'no global taste fallback for Smart/session continuation');
  discovered=[t('fresh','Fresh related song','Related artist'),page[0]];
  let result=await fetchRadioTracks([current],[current],10,blocked,'session');
  assert.deepEqual(result.map(t=>t.sourceId),['fresh'],'a short relevant batch beats padding with repetitions');
  const duplicate={...discovered[0],sourceId:'second-fresh-upload'};
  page=[duplicate];
  result=await fetchRadioTracks([current],[current,discovered[0]],10,new Set(),'session');
  assert.ok(!result.some(t=>t.sourceId==='second-fresh-upload'),'queue identity excludes alternate uploads too');
  discovered=[];page=[];
  assert.deepEqual(await fetchRadioTracks([current],[current],10,new Set(),'session'),[]);
  assert.equal(flowCalls,0,'missing related music stays empty instead of switching to Bruno Mars');
  // With a real video id, the song's own YouTube Music radio fills what the catalog could not (10/10).
  const video=t('sOevdW_9DHk','Fuera Del Planeta','Eloy Ft.Randy');
  songRadio=[video,t('zion-fantas','Fantasma','Zion'),t('jowell-shor','Shorty','Jowell & Randy')];
  result=await fetchRadioTracks([video],[video],10,new Set(),'session');
  assert.equal(radioCalls.at(-1),'RDAMVMsOevdW_9DHk','asks for the radio of that exact song');
  assert.deepEqual(result.map(t=>t.sourceId).sort(),['jowell-shor','zion-fantas'],'related songs, never the one playing');
  assert.equal(flowCalls,0,'still no global taste fallback');
  // The end-of-queue autoplay (15/10): the Flow filled whatever the related batch lacked,
  // and that is how Isak turned into Katy Perry. Related only, repeats as the last resort.
  songRadio=[];discovered=[];page=[];
  assert.deepEqual(await fetchRadioTracks([current],[current],10,new Set()),[],'automatic: nothing related, nothing at all');
  assert.equal(flowCalls,0,'automatic never asks the Flow either');
  discovered=[t('rel-1','Related one','Related artist'),t('rel-2','Related two','Other related')];
  const remembered=new Set(identity.chavesDaMusica(discovered[1]));
  result=await fetchRadioTracks([current],[current],10,remembered);
  assert.deepEqual(result.map(t=>t.sourceId).sort(),['rel-1','rel-2'],'automatic: a short related batch, a remembered related one before any other genre');
  assert.equal(flowCalls,0);
  console.log('Smart continuation: strict context, no repeated uploads, short batches and no global fallback passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
