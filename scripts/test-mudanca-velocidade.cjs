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
//  - the native module (modules/duotone-audio, aplicarVelocidade) does not
//    apply the speed right away: it queues a block on the main thread, and
//    JS writes to expo-video happen immediately. In the block, with the player
//    playing, the live rate changes first and `defaultRate` AFTER -- so the
//    rate watcher runs in between; paused, only `defaultRate` is written.
//  - expo-video's watcher (node_modules/expo-video/ios/VideoPlayer.swift,
//    onRateChanged) ADOPTS `defaultRate` when it differs from the value it
//    holds, and writes it into the player -- a rate other than zero is playing.
//    It only fires when the rate really changes. expo-video comes PRECOMPILED
//    in SDK 57, so the plugin patch that would remove this never ships: the
//    model runs with adoption ON, which is the phone, and OFF, in case it ever
//    builds from source.
function leitorComoNoIPhone({adota=true,blocoUsaOUltimo=true}={}){
 const e={taxa:1,defaultRate:1,expo:1,pausado:false};
 const fila=[];let pedida=1;
 const setter=v=>{ // expo-video's setter as shipped: writes both
  e.expo=v;e.defaultRate=v;
  if(e.taxa!==v){e.taxa=v;e.pausado=false;kvo();}
 };
 const kvo=()=>{if(adota&&e.defaultRate!==e.expo)setter(e.defaultRate);};
 const aplicar=nova=>{
  if(e.taxa===0){e.defaultRate=nova;return;}
  if(e.taxa!==nova){e.taxa=nova;kvo();}
  e.defaultRate=nova;
 };
 const nativo=(_p,v)=>{pedida=v;const minha=v;fila.push(()=>aplicar(blocoUsaOUltimo?pedida:minha));return true;};
 const player={get playbackRate(){return e.expo;},set playbackRate(v){setter(v);},
  get playing(){return !e.pausado;},
  play(){e.pausado=false;if(e.taxa===0){e.taxa=e.defaultRate;kvo();}}};
 const pausar=()=>{e.pausado=true;if(e.taxa!==0){e.taxa=0;kvo();}};
 const correrFila=()=>{while(fila.length)fila.shift()();};
 return {e,player,nativo,pausar,correrFila,fila};
}

// The model reproduces both things João saw.
{
 // 22/9 code: two writers, but each queued block applied its OWN value.
 const l=leitorComoNoIPhone({blocoUsaOUltimo:false});
 motor.atualizarVelocidadeDoMotor(l.player,0.9,l.nativo);
 motor.atualizarVelocidadeDoMotor(l.player,1.1,l.nativo);
 l.correrFila();
 assert.equal(l.e.taxa,0.9,'reproduces "one click behind" (asked 1.1, got 0.9)');
 l.pausar();
 assert.equal(l.e.pausado,false,'and "pause keeps playing"');
}
{
 // Build 69c03bf (23/9): one writer, relying on a patch that never shipped.
 const l=leitorComoNoIPhone();
 const soNativo=v=>l.nativo(l.player,v);
 soNativo(0.9);l.correrFila();
 soNativo(1.1);l.correrFila();
 assert.equal(l.e.taxa,0.9,'reproduces "the second change keeps the previous speed"');
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

// The real PanResponder handlers, including re-renders while dragging.
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
  react,'react-native':{PanResponder:{create:handlers=>({panHandlers:handlers})},View:'View',Pressable:'Pressable',Text:'Text'},
  '../lib/playbackRate':rate,'../lib/haptics':{hapticSelection(){}},'../theme':{colors:{},radii:{},spacing:{},type:{}},
 });
 const nodes=node=>!node || typeof node!=='object'?[]:[node,...(node.props?.children??[]).flat(Infinity).flatMap(nodes)];
 const render=()=>{cursor=0;const tree=BarraVelocidade(props);for(const fn of effects.splice(0))fn();return tree;};
 let tree=render();let bar=()=>nodes(tree).find(n=>n.props.accessibilityRole==='adjustable').props;
 bar().onLayout({nativeEvent:{layout:{width:300}}});tree=render();
 return {calls,bar:()=>bar(),render:()=>{tree=render();return tree;},
  update:v=>{props={...props,valor:v};tree=render();tree=render();},
  reset:()=>nodes(tree).find(n=>n.props.accessibilityLabel==='Reset playback speed to normal').props.onPress(),
  grant:x=>bar().onPanResponderGrant({nativeEvent:{locationX:x}}),
  move:dx=>bar().onPanResponderMove({}, {dx}),release:dx=>bar().onPanResponderRelease({}, {dx}),
  cancel:()=>bar().onPanResponderTerminate(),
 };
}
let s=slider();s.grant(100);
for(let dx=10;dx<=200;dx+=10){s.move(dx);s.render();}
assert.deepEqual(s.calls,[],'drag only previews, no audio writes');
assert.equal(s.bar().accessibilityValue.now,2,'visible value follows finger');
s.release(200);assert.deepEqual(s.calls,[2],'one final value');
s.release(200);assert.deepEqual(s.calls,[2],'duplicate release ignored');
s=slider();s.grant(0);s.release(0);assert.deepEqual(s.calls,[0.5],'tap applies selected value');
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
assert.match(corpo,/velocidadePedida\[chave\] = Float\(velocidade\)/,'the request is stored before the block is queued');
assert.match(corpo,/DispatchQueue\.main\.async \{[\s\S]*?let pedida = self\.velocidadePedida\[chave\][\s\S]*?guard let nova = pedida/,'the queued block applies the LAST request');
console.log('Speed change: slider gestures, cancellation, optional native bridge, pause/resume, Float values and Expo patch passed.');
