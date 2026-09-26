const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
function load(file,mocks={},globals={}){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;vm.runInNewContext(code,{module,exports:module.exports,...globals,require:id=>{if(id in mocks)return mocks[id];throw Error(id);}},{filename:file});return module.exports;}
let hooks=[],index=0,effects=[],timers=[],frames=[],listeners={},moves=[],plays=[];
const react={createElement:(type,props,...children)=>({type,props:props??{},children}),useState:init=>{const i=index++;if(!(i in hooks))hooks[i]=typeof init==='function'?init():init;return [hooks[i],v=>hooks[i]=typeof v==='function'?v(hooks[i]):v];},useRef:init=>{const i=index++;return hooks[i]??(hooks[i]={current:init});},useCallback:fn=>{index++;return fn;},useEffect:fn=>{index++;effects.push(fn);}};react.default=react;
const {FilaArrastavel}=load('src/desktop/FilaArrastavel.web.tsx',{
 react,'react-native':{Text:'text',View:'view'},'@expo/vector-icons/Ionicons':()=>null,
 '../lib/reorder':load('src/lib/reorder.ts'),'../lib/arrastarFila':load('src/lib/arrastarFila.ts'),
 './estilos.web':{styles:{}},'./tokens.web':{COR:{},ESP:{}},'./ui.web':{Artwork:'art',formatTime:()=>'',ui:{}},
 '../lib/artistName':{displayArtist:t=>t.artist,tituloDaFaixa:t=>t.title},'../components/BrilhoInteligente':{EstrelaInteligente:()=>null},
 '../lib/shuffle':{trackKey:t=>t.sourceId},'../state/player':{usePlayer:f=>f({sugeridas:[]})},
},{window:{addEventListener:(e,f)=>listeners[e]=f,removeEventListener:e=>delete listeners[e]},setTimeout:f=>(timers.push(f),timers.length),clearTimeout:()=>{},requestAnimationFrame:f=>(frames.push(f),frames.length),cancelAnimationFrame:()=>{}});
const original=['a','b','c','d'].map(sourceId=>({sourceId,source:'youtube',title:sourceId}));let tracks=[...original],rows;
function render(){index=0;effects=[];const tree=FilaArrastavel({entradas:tracks.map((track,index)=>({track,index})),podeArrastar:true,aoTocar:t=>plays.push(t.sourceId),aoMenu:()=>{},aoMover:(a,b)=>{moves.push([a,b]);tracks.splice(b,0,tracks.splice(a,1)[0]);}});rows=tree.children[0];effects.forEach(f=>f());}
const event=y=>({button:0,pointerId:1,clientY:y,currentTarget:{offsetHeight:56,setPointerCapture(){},releasePointerCapture(){}}});
render();const originalKey=rows[0].props.key;
rows[0].props.onPointerDown(event(100));render();rows[0].props.onPointerMove(event(235));render();
assert.equal(rows[0].props.style.transition,'none','drag follows pointer');
rows[0].props.onPointerUp(event(235));render();
assert.equal(moves.length,0,'store does not reorder before landing');assert.equal(rows[0].props.style.transform,'translateY(112px)');assert.match(rows[0].props.style.transition,/160ms/);
rows[0].props.onClick();assert.equal(plays.length,0,'drop must not play');
timers.shift()();render();assert.equal(moves.length,1);assert.equal(tracks[2].sourceId,'a');assert.equal(rows[2].props.key,originalKey,'row identity survives changed real indices');
for(const row of rows){assert.equal(row.props.style.transform,undefined);assert.equal(row.props.style.transition,'none','commit removes transforms without another animation');}
while(frames.length)frames.shift()();render();
rows[0].props.onPointerDown(event(100));render();rows[0].props.onPointerMove(event(180));render();rows[0].props.onPointerUp(event(180));render();listeners.keydown({key:'Escape'});render();timers.shift()();assert.equal(moves.length,1,'escape cancels a pending landing');
rows[0].props.onPointerDown(event(100));render();rows[0].props.onPointerMove(event(180));render();rows[0].props.onPointerUp(event(180));render();tracks=tracks.slice(1);render();timers.shift()();assert.equal(moves.length,1,'queue change during landing cancels stale reorder');
console.log('Queue drop: landing before commit, stable nodes, no second transition, click suppression, Escape and external queue changes passed.');
