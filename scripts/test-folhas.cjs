// As folhas de baixo: quem fica com o dedo, e quando é que arrastar fecha.
//
// Corre a `BottomSheet` a sério -- num runtime de hooks mínimo -- em vez de
// verificar o ficheiro por fora. O que se quer garantir é a NEGOCIAÇÃO do
// gesto, e essa vive toda em refs que um teste de texto nunca veria:
//
//   - arrastar para baixo fecha, de qualquer ponto da folha;
//   - uma lista a meio do rolamento fica com o dedo;
//   - chegar ao topo a meio de um arrasto não começa um fecho;
//   - um deslizador vertical (o equalizador) é dono do seu gesto;
//   - com o teclado aberto, o primeiro arrasto fecha o TECLADO;
//   - a fila em reordenação bloqueia tudo, mesmo depois de redesenhar.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file })(name => {
    if (!(name in mocks)) throw Error('Missing mock: ' + name); return mocks[name];
  }, module, module.exports);
  return module.exports;
}
function hookRuntime() {
  let active;
  const slot = init => { const i = active.cursor++; if (!(i in active.slots)) active.slots[i] = init(); return [active, i]; };
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    createContext: value => ({ value, Provider: 'Provider' }), useContext: context => context.value,
    useRef: value => { const [s,i] = slot(() => ({ current: value })); return s.slots[i]; },
    useEffect: (fn, deps) => { const [s,i] = slot(() => ({})); const old = s.slots[i];
      if (!old.deps || deps.some((v,j) => !Object.is(v,old.deps[j]))) { old.cleanup?.(); old.deps = deps; s.effects.push(() => { old.cleanup = fn(); }); } },
  };
  return { react, instance: () => {
    const state = { cursor: 0, slots: [], effects: [] };
    return fn => { active = state; state.cursor = 0; const value = fn(); state.effects.splice(0).forEach(f => f()); return value; };
  } };
}
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...(node.props?.children ?? []).flat(Infinity).flatMap(nodes)];
const runtime = hookRuntime();
let context, keyboard = false, dismissals = 0, closed = 0;
const createContext = runtime.react.createContext;
runtime.react.createContext = value => (context = createContext(value));
class Value { constructor(v) { this.value = v; } setValue(v) { this.value = v; } interpolate() { return 0; } }
const sheet = load('src/components/BottomSheet.tsx', {
  react: runtime.react,
  'react-native': { Animated: { Value, add: () => 0, View: 'AnimatedView', spring: () => ({ start() {} }) },
    Keyboard: { isVisible: () => keyboard, dismiss: () => { keyboard = false; dismissals++; } },
    Platform: { OS: 'ios' }, PanResponder: { create: handlers => ({ panHandlers: handlers }) },
    Modal: 'Modal', View: 'View', Pressable: 'Pressable', KeyboardAvoidingView: 'KeyboardAvoidingView',
    ScrollView: 'ScrollView', FlatList: 'FlatList', StyleSheet: { create: v => v }, useWindowDimensions: () => ({ height: 844 }),
  },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 34 }) },
  '../hooks/useNotificationOverlay': { useNotificationOverlay: () => () => {} },
  '../theme': { colors: {}, spacing: {}, radii: {} },
});
const mount = runtime.instance();
let props = { visible: true, onClose: () => closed++, children: null };
const render = () => {
  const tree = mount(() => sheet.BottomSheet(props));
  context.value = nodes(tree).find(n => n.type === 'Provider').props.value;
  return nodes(tree).find(n => n.type === 'AnimatedView').props;
};
let handlers = render();
const canDrag = (dx,dy) => handlers.onMoveShouldSetPanResponderCapture({}, { dx,dy });
handlers.onTouchStart();
assert.equal(canDrag(0,50),true); assert.equal(canDrag(50,10),false); assert.equal(canDrag(0,-50),false);
const scrollRender = runtime.instance(); let forwarded = 0;
let scroll = scrollRender(() => sheet.BottomSheetScrollView({ onScroll: () => forwarded++ }));
scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 120 } } }); handlers.onTouchStart();
assert.equal(canDrag(0,80),false,'scrolling within a list must not dismiss');
scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 0 } } });
assert.equal(canDrag(0,80),false,'reaching the top halfway through a scroll is not a new dismiss gesture');
handlers.onTouchStart(); assert.equal(canDrag(0,80),true); assert.equal(forwarded,2);
const guardRender = runtime.instance(); const control = guardRender(() => sheet.BottomSheetGestureGuard({ children: null }));
control.props.onTouchStart(); assert.equal(canDrag(0,80),false,'vertical EQ slider owns its gesture');
control.props.onTouchEnd(); assert.equal(canDrag(0,80),true);
keyboard = true; handlers.onPanResponderGrant(); handlers.onPanResponderRelease({}, { dy: 150,vy: 1 });
assert.equal(dismissals,1); assert.equal(closed,0,'first swipe only dismisses keyboard');
handlers.onTouchStart(); handlers.onPanResponderGrant(); handlers.onPanResponderRelease({}, { dy: 150,vy: 1 });
assert.equal(closed,1);
props = { ...props, gestureBlocked: true }; handlers = render(); handlers.onTouchStart();
assert.equal(canDrag(0,80),false,'queue reorder is protected after a re-render');
console.log('Folhas de baixo: arrasto, rolamento, teclado e deslizadores passaram.');
