const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(file,mocks={}){
 const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
 const module={exports:{}};
 vm.runInThisContext(`(function(require,module,exports){${code}\n})`,{filename:file})(name=>{
  if(!(name in mocks))throw Error('Missing mock: '+name);return mocks[name];
 },module,module.exports);return module.exports;
}
const rate=load('src/lib/playbackRate.ts');
const motor=load('src/lib/velocidadeDoMotor.ts',{'./playbackRate':rate});
function fakePlayer(initial=1,playing=true){
 let value=initial;const calls=[];
 return {calls,playing,get playbackRate(){return value;},set playbackRate(v){value=v;this.playing=true;calls.push(['rate',v]);},play(){this.playing=true;calls.push(['play',value]);}};
}
let p=fakePlayer(1,false);
motor.atualizarVelocidadeDoMotor(p,0.8,()=>false);
assert.equal(p.playing,false);assert.deepEqual(p.calls,[],'old binary must not unpause on rate change');
motor.tocarNaVelocidade(p,0.8);
assert.deepEqual(p.calls,[['rate',0.8],['play',0.8]],'resume starts at the chosen rate');
p=fakePlayer(0.9,false);motor.tocarNaVelocidade(p,0.9);
assert.deepEqual(p.calls,[['rate',0.9],['play',0.9]],'from a stop it writes even an equal value (defaultRate may differ)');
p=fakePlayer(0.899999976);
motor.atualizarVelocidadeDoMotor(p,0.9,()=>false);assert.deepEqual(p.calls,[],'native Float tolerance');
motor.tocarNaVelocidade(p,0.9);assert.deepEqual(p.calls,[['play',0.899999976]]);
p=fakePlayer();let received;
motor.atualizarVelocidadeDoMotor(p,0.85,(player,value)=>{received={player,value};return true;});
assert.equal(received.player,p);assert.equal(received.value,0.85);
// expo-video's own property is written too: its watcher adopts any
// defaultRate it does not hold, and it ships precompiled, so the rule cannot be
// patched out (see the model below).
assert.deepEqual(p.calls,[['rate',0.85]],'native path keeps expo-video in step');
p=fakePlayer(0.85);
motor.atualizarVelocidadeDoMotor(p,0.85,()=>true);
assert.deepEqual(p.calls,[],'and writes nothing when it is already in step');
p=fakePlayer(1,false);
motor.atualizarVelocidadeDoMotor(p,0.85,()=>true);
assert.deepEqual(p.calls,[],'a paused player is never written to: that setter plays');

// The real thing this protects, modelled on the iPhone, driven through the
// REAL src/lib/velocidadeDoMotor.ts:
//  - the native module (modules/duotone-audio, aplicarVelocidade) applies the
//    change synchronously, on the JS thread, BEFORE the JS looks at expo-video:
//    buffer wait off, `defaultRate`, then `playImmediately`. Paused, only
//    `defaultRate` is written. Until 30/9 it queued a block for the main
//    thread instead (`sincrono:false` keeps that model, to reproduce the old
//    bugs): with the player playing the live rate changed first and
//    `defaultRate` AFTER, and JS writes to expo-video landed before the block.
//  - expo-video's watcher (node_modules/expo-video/ios/VideoPlayer.swift,
//    onRateChanged) ADOPTS `defaultRate` when it differs from the value it
//    holds, and writes it into the player -- a rate other than zero is playing.
//    It only fires when the rate really changes. expo-video comes PRECOMPILED
//    in SDK 57, so the plugin patch that would remove this never ships: the
//    model runs with adoption ON, which is the phone, and OFF, in case it ever
//    builds from source.
//  - a plain `rate = x` on a PLAYING AVPlayer, with the buffer wait on,
//    re-evaluates the buffer and goes silent meanwhile: that is the one-second
//    gap (`cortes`). `playImmediately`, or any write with the wait off, is not.
//    The native module turns the wait back on once the player stops playing.
function leitorComoNoIPhone({adota=true,blocoUsaOUltimo=true,sincrono=true}={}){
 const e={taxa:1,defaultRate:1,expo:1,pausado:false,espera:true,cortes:0};
 const fila=[];let pedida=1;
 const escreverTaxa=(v,imediato)=>{
  if(e.taxa===v)return;
  if(!imediato&&e.espera&&e.taxa!==0)e.cortes++;
  e.taxa=v;e.pausado=false;kvo();
 };
 const setter=v=>{e.expo=v;e.defaultRate=v;escreverTaxa(v,false);}; // expo-video's setter as shipped
 const kvo=()=>{if(adota&&e.defaultRate!==e.expo)setter(e.defaultRate);};
 const aplicar=nova=>{
  if(e.taxa===0){e.defaultRate=nova;return;}
  e.espera=false;
  e.defaultRate=nova;
  escreverTaxa(nova,true);
 };
 const aplicarNoBloco=nova=>{ // before 30/9
  if(e.taxa===0){e.defaultRate=nova;return;}
  if(e.taxa!==nova)escreverTaxa(nova,true);
  e.defaultRate=nova;
 };
 const nativo=(_p,v)=>{
  if(sincrono){aplicar(v);return true;}
  pedida=v;const minha=v;fila.push(()=>aplicarNoBloco(blocoUsaOUltimo?pedida:minha));return true;
 };
 const player={get playbackRate(){return e.expo;},set playbackRate(v){setter(v);},
  get playing(){return !e.pausado;},
  play(){e.pausado=false;if(e.taxa===0){e.taxa=e.defaultRate;kvo();}}};
 const pausar=()=>{e.pausado=true;if(e.taxa!==0){e.taxa=0;kvo();}e.espera=true;};
 const correrFila=()=>{while(fila.length)fila.shift()();};
 return {e,player,nativo,pausar,correrFila,fila};
}

// The model reproduces both things João saw.
{
 // 22/9 code: two writers, but each queued block applied its OWN value.
 const l=leitorComoNoIPhone({blocoUsaOUltimo:false,sincrono:false});
 motor.atualizarVelocidadeDoMotor(l.player,0.9,l.nativo);
 motor.atualizarVelocidadeDoMotor(l.player,1.1,l.nativo);
 l.correrFila();
 assert.equal(l.e.taxa,0.9,'reproduces "one click behind" (asked 1.1, got 0.9)');
 l.pausar();
 assert.equal(l.e.pausado,false,'and "pause keeps playing"');
}
{
 // Build 69c03bf (23/9): one writer, relying on a patch that never shipped.
 const l=leitorComoNoIPhone({sincrono:false});
 const soNativo=v=>l.nativo(l.player,v);
 soNativo(0.9);l.correrFila();
 soNativo(1.1);l.correrFila();
 assert.equal(l.e.taxa,0.9,'reproduces "the second change keeps the previous speed"');
}
{
 // 30/9, the gap: with the native block queued, expo-video's plain `rate = x`
 // always got to the player first, on every change while playing.
 const velho=leitorComoNoIPhone({sincrono:false});
 for(const v of [1.25,0.8])motor.atualizarVelocidadeDoMotor(velho.player,v,velho.nativo);
 velho.correrFila();
 assert.equal(velho.e.cortes,2,'reproduces the one-second gap on each change');
 const l=leitorComoNoIPhone();
 for(const v of [1.25,0.8,2,1]){
  motor.atualizarVelocidadeDoMotor(l.player,v,l.nativo);
  assert.equal(l.e.taxa,v,'each change lands at once');
  assert.equal(l.e.expo,v,'and expo-video adopts it inside the change');
 }
 assert.equal(l.e.cortes,0,'no change while playing takes the waiting path');
 l.pausar();
 assert.equal(l.e.espera,true,'the buffer wait is back once paused');
 motor.tocarNaVelocidade(l.player,1,l.nativo);
 motor.atualizarVelocidadeDoMotor(l.player,1.5,l.nativo);
 assert.equal(l.e.cortes,0,'and the next change after a resume is quiet too');
}
{
 // The trap found while fixing it: a speed changed while PAUSED goes only to
 // the native module; an explicit play must still write expo-video, even when
 // expo-video happens to hold the same (older) value already.
 const l=leitorComoNoIPhone();
 motor.atualizarVelocidadeDoMotor(l.player,0.9,l.nativo);l.correrFila();
 l.pausar();
 motor.atualizarVelocidadeDoMotor(l.player,0.5,l.nativo);l.correrFila();
 motor.tocarNaVelocidade(l.player,0.9,l.nativo);l.correrFila();
 assert.equal(l.e.taxa,0.9,'plays at the speed asked');
 l.pausar();
 assert.equal(l.e.taxa,0,'and the next pause pauses');
}
{
 const l=leitorComoNoIPhone();
 for(const v of [0.9,1.1,0.7]){motor.atualizarVelocidadeDoMotor(l.player,v,l.nativo);l.correrFila();}
 assert.equal(l.e.taxa,0.7,'0.9, 1.1, 0.7: each change lands');
 for(const v of [0.9,1.1,0.7])motor.atualizarVelocidadeDoMotor(l.player,v,l.nativo);
 l.correrFila();
 assert.equal(l.e.taxa,0.7,'three quick taps before the main thread runs: the last one wins');
 l.pausar();assert.equal(l.e.taxa,0,'pause pauses');
}
// João's report of 26/9: after a crossfade, something outside our code put the
// PREVIOUS speed back right after each change (expo 0.8 -> 1.2 -> 0.8, and then
// 0.9 -> 1.2). The check a moment later has to put the asked one back, and must
// never start a paused player.
{
 const l=leitorComoNoIPhone();
 motor.atualizarVelocidadeDoMotor(l.player,0.8,l.nativo);l.correrFila();
 motor.atualizarVelocidadeDoMotor(l.player,1.2,l.nativo);l.correrFila();
 l.e.defaultRate=0.8;l.e.taxa=0.8;l.e.expo=0.8; // the stale write, as in the report
 assert.equal(motor.corrigirVelocidadeQueFicouAtras(l.player,1.2,l.nativo),true,'sees it is behind');
 l.correrFila();
 assert.equal(l.e.taxa,1.2,'and the player ends at the speed asked');
 assert.equal(motor.corrigirVelocidadeQueFicouAtras(l.player,1.2,l.nativo),false,'nothing to do once right');
 l.e.expo=1.2;l.e.taxa=1.2;l.e.defaultRate=0.9; // "asked 0.9, stayed at 1.2"
 assert.equal(motor.corrigirVelocidadeQueFicouAtras(l.player,0.9,l.nativo),true);
 l.correrFila();
 assert.equal(l.e.taxa,0.9,'the second case lands too');
 l.pausar();
 assert.equal(motor.corrigirVelocidadeQueFicouAtras(l.player,1.5,l.nativo),false,'a paused player is left alone');
 l.correrFila();
 assert.equal(l.e.taxa,0,'and stays paused');
}
// Any interleaving of taps, pauses, plays and main-thread blocks ends where the
// user left it, and a pause afterwards pauses. Deterministic pseudo-random, so
// a failure is reproducible.
for(const adota of [true,false]){
 let semente=7;const acaso=()=>(semente=(semente*1103515245+12345)%2147483648)/2147483648;
 const VALORES=[0.5,0.7,0.9,1,1.1,1.3,1.5,2];
 for(let volta=0;volta<5000;volta++){
  const l=leitorComoNoIPhone({adota});let pausado=false,ultima=1;
  for(let passo=0;passo<14;passo++){
   const r=acaso();
   if(r<0.45){ultima=VALORES[Math.floor(acaso()*VALORES.length)];motor.atualizarVelocidadeDoMotor(l.player,ultima,l.nativo);}
   else if(r<0.6){l.pausar();pausado=true;}
   else if(r<0.72){motor.tocarNaVelocidade(l.player,ultima,l.nativo);pausado=false;}
   else if(l.fila.length)l.fila.shift()();
  }
  l.correrFila();
  assert.equal(l.e.cortes,0,`adota=${adota} volta ${volta}: no change while playing waits for the buffer`);
  if(pausado)assert.equal(l.e.taxa,0,`adota=${adota} volta ${volta}: paused must be paused`);
  else assert.equal(l.e.taxa,ultima,`adota=${adota} volta ${volta}: playing at the last speed asked`);
  l.pausar();
  assert.equal(l.e.taxa,0,`adota=${adota} volta ${volta}: and a pause afterwards pauses`);
 }
}
motor.atualizarVelocidadeDoMotor(p,NaN,()=>false);assert.deepEqual(p.calls,[]);
const bridge=module=>load('modules/duotone-audio/index.ts',{expo:{requireOptionalNativeModule:()=>module}});
assert.equal(bridge(null).aplicarVelocidadeNativa(p,1),false);
assert.equal(bridge({}).aplicarVelocidadeNativa(p,1),false);
assert.equal(bridge({aplicarVelocidade(){throw Error('released');}}).aplicarVelocidadeNativa(p,1),false);
assert.equal(bridge({aplicarVelocidade:()=>true}).aplicarVelocidadeNativa(p,1),true);

// The real Gesture Handler callbacks, including re-renders while dragging.
const G={UNDETERMINED:0,FAILED:1,BEGAN:2,CANCELLED:3,ACTIVE:4,END:5};
function slider(initial=1){
 let slots=[],cursor=0,effects=[],props={valor:initial,aoMudar:v=>calls.push(v)},calls=[];
 const changed=(a,b)=>!a || a.length!==b.length || b.some((v,i)=>!Object.is(v,a[i]));
 const slot=init=>{const i=cursor++;if(!(i in slots))slots[i]=init();return i;};
 const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),
  useState:initial=>{const i=slot(()=>initial);return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
  useRef:initial=>slots[slot(()=>({current:initial}))],
  useMemo:(fn,deps)=>{const i=slot(()=>({deps:null,value:null}));if(changed(slots[i].deps,deps))slots[i]={deps,value:fn()};return slots[i].value;},
  useEffect:(fn,deps)=>{const i=slot(()=>null);if(changed(slots[i],deps)){slots[i]=deps;effects.push(fn);}},
 };
 const {BarraVelocidade}=load('src/components/BarraVelocidade.tsx',{
  react,'react-native':{View:'View',Pressable:'Pressable',Text:'Text'},
  'react-native-gesture-handler':{PanGestureHandler:'PanGestureHandler',State:G},
  '../lib/playbackRate':rate,'../lib/haptics':{hapticSelection(){}},'../theme':{colors:{},radii:{},spacing:{},type:{}},
 });
 const nodes=node=>!node || typeof node!=='object'?[]:[node,...(node.props?.children??[]).flat(Infinity).flatMap(nodes)];
 const render=()=>{cursor=0;const tree=BarraVelocidade(props);for(const fn of effects.splice(0))fn();return tree;};
 let tree=render();let bar=()=>nodes(tree).find(n=>n.props.accessibilityRole==='adjustable').props;
 let x0=0;const gesto=()=>nodes(tree).find(n=>n.type==='PanGestureHandler').props;
 bar().onLayout({nativeEvent:{layout:{width:300}}});tree=render();
 return {calls,bar:()=>bar(),render:()=>{tree=render();return tree;},
  update:v=>{props={...props,valor:v};tree=render();tree=render();},
  reset:()=>nodes(tree).find(n=>n.props.accessibilityLabel==='Reset playback speed to normal').props.onPress(),
  // The handler's `x` is relative to the bar for the whole gesture.
  grant:x=>{x0=x;gesto().onHandlerStateChange({nativeEvent:{state:G.BEGAN,x}});gesto().onHandlerStateChange({nativeEvent:{state:G.ACTIVE,x}});},
  move:dx=>gesto().onGestureEvent({nativeEvent:{x:x0+dx}}),
  release:dx=>gesto().onHandlerStateChange({nativeEvent:{state:G.END,x:x0+dx}}),
  cancel:()=>gesto().onHandlerStateChange({nativeEvent:{state:G.CANCELLED,x:x0}}),
  // A tap as iOS sends it: the pan only activates on movement, so a still
  // finger goes BEGAN -> FAILED, with no ACTIVE and no END.
  tap:x=>{gesto().onHandlerStateChange({nativeEvent:{state:G.BEGAN,x}});gesto().onHandlerStateChange({nativeEvent:{state:G.FAILED,x}});},
 };
}
let s=slider();s.grant(100);
for(let dx=10;dx<=200;dx+=10){s.move(dx);s.render();}
assert.deepEqual(s.calls,[],'drag only previews, no audio writes');
assert.equal(s.bar().accessibilityValue.now,2,'visible value follows finger');
s.release(200);assert.deepEqual(s.calls,[2],'one final value');
s.release(200);assert.deepEqual(s.calls,[2],'duplicate release ignored');
s=slider();s.grant(0);s.release(0);assert.deepEqual(s.calls,[0.5],'tap applies selected value');
s=slider();s.tap(300);s.render();assert.deepEqual(s.calls,[2],'a still tap (BEGAN -> FAILED) applies too (11/10)');
s=slider();s.tap(0);s.render();assert.deepEqual(s.calls,[0.5]);assert.equal(s.bar().accessibilityValue.now,1,'the preview clears; the value comes back from the store');
s=slider();s.grant(100);s.release(0);assert.deepEqual(s.calls,[],'same value is a no-op');
s=slider();s.grant(0);s.move(280);s.render();s.cancel();s.render();assert.deepEqual(s.calls,[]);assert.equal(s.bar().accessibilityValue.now,1);
s=slider();s.grant(0);s.move(200);s.update(1.2);s.release(200);assert.deepEqual(s.calls,[],'external update cancels stale drag');
s=slider(0.8);s.reset();assert.deepEqual(s.calls,[1],'reset is immediate');
s=slider(1);s.bar().onAccessibilityAction({nativeEvent:{actionName:'increment'}});assert.deepEqual(s.calls,[1.05]);
s=slider(2);s.bar().onAccessibilityAction({nativeEvent:{actionName:'increment'}});assert.deepEqual(s.calls,[]);

// Verify the build-time patch against the installed dependency, not a copied fixture.
const {patchSpeedSetter}=require('../plugins/velocidade-expo-video');
const original=fs.readFileSync(path.join(root,'node_modules/expo-video/ios/VideoPlayer.swift'),'utf8');
const patched=patchSpeedSetter(original);
assert.equal(patchSpeedSetter(patched),patched,'patch is idempotent');
assert.throws(()=>patchSpeedSetter('new incompatible upstream implementation'),/setter changed/);
assert.match(patched,/if ref\.rate != playbackRate \{ ref\.rate = playbackRate \}/);
// All non-setter code stays byte-for-byte identical.
const outside=text=>text.replace(/  var playbackRate: Float = 1\.0 \{[\s\S]*?\n  var currentTime:/,'  var currentTime:')
 .replace(/  func onRateChanged\(player: AVPlayer[\s\S]*?\n  func onVolumeChanged/,'  func onVolumeChanged');
// The watcher no longer adopts defaultRate (iOS 16+); the iOS < 16 branch stays.
assert.match(patched,/Duotone: speed belongs to modules\/duotone-audio/);
assert.doesNotMatch(patched,/playbackRate = player\.defaultRate/);
assert.match(patched,/else if newRate != 0 && newRate != playbackRate \{\n      \/\/ On iOS < 16/);
assert.equal(outside(patched),outside(original));
const swift=fs.readFileSync(path.join(root,'modules/duotone-audio/ios/DuotoneAudioModule.swift'),'utf8');
const corpo=swift.slice(swift.indexOf('Function("aplicarVelocidade")'),swift.indexOf('Function("definirTomDaVelocidade")'));
const aplicarSwift=corpo.slice(0,corpo.indexOf('Function("estadoDaVelocidade")'));
assert.doesNotMatch(aplicarSwift,/DispatchQueue/,'applied now, on the JS thread, before expo-video is looked at');
assert.match(aplicarSwift,/guard p\.rate != 0 else \{\s*if p\.defaultRate != nova \{ p\.defaultRate = nova \}\s*return true/,'paused: only defaultRate');
assert.match(aplicarSwift,/self\.semEsperar\(p\) \{\s*if p\.defaultRate != nova \{ p\.defaultRate = nova \}\s*if abs\(p\.rate - nova\) > 0\.001 \{ p\.playImmediately\(atRate: nova\) \}/,
 'playing: buffer wait off, defaultRate first, then playImmediately');
const semEsperar=swift.slice(swift.indexOf('private func semEsperar'),swift.indexOf('private func reporEspera'));
assert.match(semEsperar,/automaticallyWaitsToMinimizeStalling = false[\s\S]*mudar\(\)[\s\S]*p\.observe\(\\\.timeControlStatus/,'the wait goes off before the change, and its watcher is armed after it');
console.log('Speed change: slider gestures, cancellation, optional native bridge, pause/resume, Float values and Expo patch passed.');
