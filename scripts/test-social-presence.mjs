import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function carregar(path,extras={}){
  const module={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{module,exports:module.exports,...extras});return module.exports;
}
const {estadoDaPresenca,ultimaAtividade}=carregar('../src/lib/socialPresence.ts');
const now=Date.now(),iso=n=>new Date(now+n).toISOString();
const p={last_seen_at:iso(-60000),online_until:iso(5000),playing_until:iso(1000),currently_playing:{title:'Teste'}};
assert.equal(estadoDaPresenca(p,now).track.title,'Teste');
assert.equal(estadoDaPresenca(p,now+2000).track,null);
assert.equal(estadoDaPresenca(p,now+2000).online,true);
assert.equal(estadoDaPresenca(p,now+6000).online,false);
assert.equal(estadoDaPresenca({...p,online_until:'inválido'},now).online,false);
assert.equal(ultimaAtividade(undefined,now),'Last seen unknown');
assert.match(ultimaAtividade(iso(-120000),now),/2 min/);
const {imageCrop}=carregar('../src/lib/profileImageCrop.ts');
const top=imageCrop(100,400,1,0.5,0),bottom=imageCrop(100,400,1,0.5,1);
assert.equal(top.originY,0);assert.equal(bottom.originY,300);assert.equal(bottom.height,100);
assert.equal(imageCrop(1600,1200,8/3,0.5,1).originY,600);
assert.throws(()=>imageCrop(0,2,1));
let time=0,tick,closed=0;
const volumes=[];
let state={current:{id:'a'},closing:false,closeGain:1,volume:37,_yt:{setVolume:v=>volumes.push(v)},close:async()=>{closed++;state={...state,current:null,closing:false,closeGain:1};}};
const store={getState:()=>state,setState:s=>{state={...state,...s};}};
const {closePlayerSmoothly,confirmaSwipe}=carregar('../src/lib/closePlayer.ts',{
  require:()=>({usePlayer:store}),Date:{now:()=>time},setInterval:f=>(tick=f,1),clearInterval:()=>{tick=null;},
});
assert.equal(confirmaSwipe(-200,0,2,300),false);
assert.equal(confirmaSwipe(15,0,2,300),false);
assert.equal(confirmaSwipe(150,180,1,300),false);
assert.equal(confirmaSwipe(120,3,0.2,300),true);
assert.equal(confirmaSwipe(40,0,1,300),true);
const closing=closePlayerSmoothly();assert.equal(closePlayerSmoothly(),closing);
time=150;tick();assert.equal(state.closeGain,0.5);assert.equal(volumes.at(-1),18.5);assert.equal(closed,0);
time=301;tick();await closing;assert.equal(volumes.at(-1),0);assert.equal(closed,1);assert.equal(state.volume,37);
state={...state,current:{id:'b'},volume:0};time=400;
const muted=closePlayerSmoothly();time=550;tick();assert.equal(volumes.at(-1),0);time=701;tick();await muted;
state={...state,current:{id:'c'},volume:64};time=800;
const cancel=closePlayerSmoothly();time=900;tick();state={...state,current:{id:'d'},closing:false,closeGain:1};tick();await cancel;
assert.equal(state.current.id,'d');assert.equal(volumes.at(-1),64);assert.equal(closed,2);
console.log('Presença, expiração, recorte, direção do gesto, fade, mute e cancelamento passaram.');
