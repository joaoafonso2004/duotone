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
p=fakePlayer(0.899999976);
motor.atualizarVelocidadeDoMotor(p,0.9,()=>false);assert.deepEqual(p.calls,[],'native Float tolerance');
motor.tocarNaVelocidade(p,0.9);assert.deepEqual(p.calls,[['play',0.899999976]]);
p=fakePlayer();let received;
motor.atualizarVelocidadeDoMotor(p,0.85,(player,value)=>{received={player,value};return true;});
assert.equal(received.player,p);assert.equal(received.value,0.85);
// 23/9: with the native module there is ONE writer -- expo-video's property is
// not touched (the model below shows why two writers went one step behind).
assert.deepEqual(p.calls,[],'the native path is the only writer');
p=fakePlayer(0.85);
motor.atualizarVelocidadeDoMotor(p,0.85,()=>true);
assert.deepEqual(p.calls,[],'and writes nothing when it is already in step');
p=fakePlayer(1,false);
motor.atualizarVelocidadeDoMotor(p,0.85,()=>true);
assert.deepEqual(p.calls,[],'a paused player is never written to: that setter plays');

// The real thing this protects, modelled on the iPhone -- and with the part the
// 22/9 model left out: the native module does NOT apply the speed right away.
// `aplicarVelocidade` queues a block on the main thread
// (modules/duotone-audio/ios/DuotoneAudioModule.swift), while JS writes happen
// on the JS thread immediately. In that block:
//  - with the player playing, the live rate changes first (playImmediately)
//    and `defaultRate` is written AFTER -- so the rate watcher runs in between;
//  - paused, only `defaultRate` is written.
// expo-video's watcher (node_modules/expo-video/ios/VideoPlayer.swift,
// onRateChanged), when not patched, ADOPTS `defaultRate` whenever it differs
// from the value expo-video holds, and writes it into the player -- and a rate
// other than zero is playing.
function leitorComoNoIPhone({inicial=1,adota,blocoUsaOUltimo,jsEscreveNoExpo}){
 const estado={taxa:inicial,defaultRate:inicial,guardadaPeloExpo:inicial,pausado:false};
 const fila=[];let pedida=inicial;
 const escreverPeloExpo=v=>{ // patched setter: only what differs
  estado.guardadaPeloExpo=v;
  if(estado.defaultRate!==v)estado.defaultRate=v;
  if(estado.taxa!==v){estado.taxa=v;estado.pausado=false;kvo();}
 };
 const kvo=()=>{
  if(!adota||estado.defaultRate===estado.guardadaPeloExpo)return;
  escreverPeloExpo(estado.defaultRate);
 };
 const aplicar=nova=>{
  if(estado.taxa===0){if(estado.defaultRate!==nova)estado.defaultRate=nova;return;}
  if(estado.taxa!==nova){estado.taxa=nova;kvo();}
  if(estado.defaultRate!==nova)estado.defaultRate=nova;
 };
 const nativo=(_p,v)=>{pedida=v;const minha=v;fila.push(()=>aplicar(blocoUsaOUltimo?pedida:minha));return true;};
 const player={get playbackRate(){return estado.guardadaPeloExpo;},
  set playbackRate(v){escreverPeloExpo(v);},
  get playing(){return !estado.pausado;},
  play(){estado.pausado=false;if(estado.taxa===0){estado.taxa=estado.defaultRate;kvo();}}};
 const pausar=()=>{estado.pausado=true;estado.taxa=0;kvo();};
 const correrFila=()=>{while(fila.length)fila.shift()();};
 // What atualizarVelocidadeDoMotor did on 22/9 (two writers), for the replay below.
 const mudarComoEm22=v=>{nativo(player,v);if(player.playing&&Math.abs(player.playbackRate-v)>0.001)player.playbackRate=v;};
 return {estado,player,nativo,pausar,correrFila,fila,mudarComoEm22};
}

// First: the model reproduces what João saw on 23/9 with the 22/9 code --
// two quick changes before the main thread runs the blocks.
{
 const velho=leitorComoNoIPhone({adota:true,blocoUsaOUltimo:false,jsEscreveNoExpo:true});
 velho.mudarComoEm22(0.9);velho.mudarComoEm22(1.1);velho.correrFila();
 assert.equal(velho.estado.taxa,0.9,'the model reproduces "one click behind" (asked 1.1, got 0.9)');
 velho.pausar();
 assert.equal(velho.estado.pausado,false,'and reproduces "pause keeps playing"');
}
// And why the build patch is not optional: with one writer but expo-video still
// adopting, pause breaks EVERY time (its own value never moves).
{
 const semPatch=leitorComoNoIPhone({adota:true,blocoUsaOUltimo:true});
 motor.atualizarVelocidadeDoMotor(semPatch.player,0.9,semPatch.nativo);semPatch.correrFila();
 semPatch.pausar();
 assert.equal(semPatch.estado.pausado,false,'without the patch the adoption still unpauses');
}

// Now the real fix: one writer, the block applies the LAST request, no adoption.
const novo=()=>leitorComoNoIPhone({adota:false,blocoUsaOUltimo:true});
{
 const iphone=novo();
 motor.atualizarVelocidadeDoMotor(iphone.player,0.9,iphone.nativo);iphone.correrFila();
 assert.equal(iphone.estado.taxa,0.9,'first change: 0.9');
 motor.atualizarVelocidadeDoMotor(iphone.player,1.1,iphone.nativo);iphone.correrFila();
 assert.equal(iphone.estado.taxa,1.1,'second change is NOT one step behind');
 motor.atualizarVelocidadeDoMotor(iphone.player,0.7,iphone.nativo);iphone.correrFila();
 assert.equal(iphone.estado.taxa,0.7,'third change either');
 iphone.pausar();
 assert.equal(iphone.estado.pausado,true,'and pause still pauses');
 assert.equal(iphone.estado.taxa,0,'the player really stops');
}
{
 const iphone=novo();
 for(const v of [0.9,1.1,0.7])motor.atualizarVelocidadeDoMotor(iphone.player,v,iphone.nativo);
 iphone.correrFila();
 assert.equal(iphone.estado.taxa,0.7,'three quick taps before the main thread runs: the last one wins');
 iphone.pausar();assert.equal(iphone.estado.taxa,0,'and pause pauses');
 motor.tocarNaVelocidade(iphone.player,0.7,iphone.nativo);iphone.correrFila();
 assert.equal(iphone.estado.taxa,0.7,'resume at the chosen speed');
}
{
 // A block still queued from a speed change must not undo an explicit play at
 // another speed (a crossfade into a track with its own speed).
 const iphone=novo();
 motor.atualizarVelocidadeDoMotor(iphone.player,0.8,iphone.nativo);
 motor.tocarNaVelocidade(iphone.player,1.3,iphone.nativo);
 iphone.correrFila();
 assert.equal(iphone.estado.taxa,1.3,'a queued block does not undo an explicit play');
}
// Any interleaving of taps, pauses, plays and main-thread runs ends where the
// user left it. Deterministic pseudo-random, so a failure is reproducible.
{
 let semente=12345;const acaso=()=>(semente=(semente*1103515245+12345)%2147483648)/2147483648;
 const VALORES=[0.5,0.7,0.9,1,1.1,1.3,1.5,2];
 for(let volta=0;volta<3000;volta++){
  const iphone=novo();let pausado=false,ultima=1;
  for(let passo=0;passo<12;passo++){
   const r=acaso();
   if(r<0.45){ultima=VALORES[Math.floor(acaso()*VALORES.length)];motor.atualizarVelocidadeDoMotor(iphone.player,ultima,iphone.nativo);}
   else if(r<0.6){iphone.pausar();pausado=true;}
   else if(r<0.72){motor.tocarNaVelocidade(iphone.player,ultima,iphone.nativo);pausado=false;}
   else if(iphone.fila.length)iphone.fila.shift()();
  }
  iphone.correrFila();
  if(pausado)assert.equal(iphone.estado.taxa,0,`volta ${volta}: paused must be paused`);
  else assert.equal(iphone.estado.taxa,ultima,`volta ${volta}: playing at the last speed asked`);
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
