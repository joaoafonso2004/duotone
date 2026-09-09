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
assert.equal(received.player,p);assert.equal(received.value,0.85);assert.deepEqual(p.calls,[],'native path does not also call Expo setter');
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
const outside=text=>text.replace(/  var playbackRate: Float = 1\.0 \{[\s\S]*?\n  var currentTime:/,'  var currentTime:');
assert.equal(outside(patched),outside(original));
console.log('Speed change: slider gestures, cancellation, optional native bridge, pause/resume, Float values and Expo patch passed.');
