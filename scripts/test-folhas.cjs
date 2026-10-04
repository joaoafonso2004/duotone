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
    createElement: (type, props, ...children) => ({ type, props: children.length ? { ...props, children } : { ...props } }),
    createContext: value => ({ value, Provider: 'Provider' }), useContext: context => context.value,
    useRef: value => { const [s,i] = slot(() => ({ current: value })); return s.slots[i]; },
    useEffect: (fn, deps) => { const [s,i] = slot(() => ({})); const old = s.slots[i];
      if (!old.deps || deps.some((v,j) => !Object.is(v,old.deps[j]))) { old.cleanup?.(); old.deps = deps; s.effects.push(() => { old.cleanup = fn(); }); } },
    // Sem dependências: corre a cada desenho (é assim que o conteúdo chega à folha nativa).
    useLayoutEffect: (fn) => { const [s,i] = slot(() => ({})); const old = s.slots[i];
      s.effects.push(() => { old.cleanup?.(); old.cleanup = fn(); }); },
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
// A folha nativa (4/10): a rota `Folha` do stack de raiz, a loja a sério.
const folhas = load('src/state/folhasNativas.ts');
let raiz = { key: 'raiz', routeNames: ['Tabs', 'Fila', 'Folha'], routes: [{ name: 'Tabs', key: 'tabs' }] };
const despachadas = [];
let modalDoRN = false;
const sheet = load('src/components/BottomSheet.tsx', {
  react: runtime.react,
  '@react-navigation/native': { StackActions: {
    push: (name, params) => ({ type: 'PUSH', payload: { name, params } }),
    pop: (count) => ({ type: 'POP', payload: { count } }),
  } },
  '../navigation/RootNavigator': { navigationRef: {
    isReady: () => true, getRootState: () => raiz, dispatch: (a) => despachadas.push(a),
  } },
  '../state/folhasNativas': folhas,
  './dentroDeUmModal': { DentroDeUmModal: { value: false, Provider: 'DentroDeUmModal' },
    haModalDoRNAberto: () => modalDoRN, useModalDoRNAberto() {} },
  'react-native-gesture-handler': { GestureHandlerRootView: 'GestureHandlerRootView' },
  'react-native': { Animated: { Value, add: () => 0, View: 'AnimatedView', spring: () => ({ start() {} }) },
    Keyboard: { isVisible: () => keyboard, dismiss: () => { keyboard = false; dismissals++; } },
    Platform: { OS: 'ios' }, PanResponder: { create: handlers => ({ panHandlers: handlers }) },
    Modal: 'Modal', View: 'View', Pressable: 'Pressable', KeyboardAvoidingView: 'KeyboardAvoidingView',
    ScrollView: 'ScrollView', FlatList: 'FlatList', StyleSheet: { create: v => v }, useWindowDimensions: () => ({ height: 844 }),
  },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 34 }) },
  '../hooks/useNotificationOverlay': { useNotificationOverlay: () => () => {} },
  // Os 120 Hz (3/10): aqui não há relógio para pedir.
  '../state/fluidez': { pedirFluidez() {}, segurarFluidez: () => () => {} },
  '../theme': { colors: {}, spacing: {}, radii: {} },
});
const mount = runtime.instance();
// O `Modal` de sempre (o que fica dentro de outro `Modal`, ou sem sessão).
let props = { visible: true, onClose: () => closed++, children: null, nativa: false };
const desenhar = (el) => typeof el?.type === 'function' ? desenhar(el.type(el.props)) : el;
const render = () => {
  const tree = mount(() => desenhar(sheet.BottomSheet(props)));
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

// ---- A folha nativa ----
{
  let fechou = 0;
  const nativa = runtime.instance();
  let p = { visible: true, onClose: () => fechou++, children: 'A' };
  const desenha = () => nativa(() => desenhar(sheet.BottomSheet(p)));
  assert.equal(desenha(), null, 'no iPhone a folha nativa não desenha nada no sítio de quem a abre');
  assert.equal(despachadas.length, 1);
  assert.equal(despachadas[0].type, 'PUSH');
  assert.equal(despachadas[0].payload.name, 'Folha');
  const id = despachadas[0].payload.params.id;
  assert.equal(folhas.folhaAberta(id).conteudo, 'A');
  p = { ...p, children: 'B' }; desenha();
  assert.equal(folhas.folhaAberta(id).conteudo, 'B', 'cada desenho de quem abriu leva o conteúdo novo');
  assert.equal(despachadas.length, 1, 'redesenhar não empurra outra folha');

  // A pessoa desce a folha: a rota sai, o ecrã desmonta, e o dono fica a saber UMA vez.
  folhas.folhaSaiu(id); folhas.folhaSaiu(id);
  assert.equal(fechou, 1);
  p = { ...p, visible: false }; desenha();
  assert.equal(despachadas.length, 1, 'a rota já saiu: o dono a fechar não tira mais nada');

  // O dono fecha com a folha à vista: tira-se a rota DELA, e o onClose não volta.
  p = { ...p, visible: true }; desenha();
  const id2 = despachadas[1].payload.params.id;
  assert.notEqual(id2, id);
  raiz = { ...raiz, routes: [...raiz.routes, { name: 'Folha', key: 'folha-2', params: { id: id2 } }] };
  p = { ...p, visible: false }; desenha();
  assert.equal(despachadas[2].type, 'POP');
  assert.equal(despachadas[2].source, 'folha-2');
  assert.equal(despachadas[2].target, 'raiz');
  folhas.folhaSaiu(id2);
  assert.equal(fechou, 1, 'fechada pelo dono: o onClose não é chamado outra vez');
  raiz = { ...raiz, routes: raiz.routes.filter((r) => r.key !== 'folha-2') };

  // Com um Modal do RN à vista (o modo carro), a folha nativa fechava-o: fica o Modal.
  modalDoRN = true;
  const antes = despachadas.length;
  p = { ...p, visible: true };
  const arvore = desenha();
  assert.equal(despachadas.length, antes, 'com um Modal do RN aberto não se empurra nada');
  assert.ok(nodes(arvore).some((n) => n.type === 'Modal'), 'e abre-se o Modal de sempre');
  modalDoRN = false;

  // Sem a rota (sem sessão), também o Modal.
  const semSessao = runtime.instance();
  raiz = { ...raiz, routeNames: ['Auth'] };
  const n = despachadas.length;
  const t = semSessao(() => desenhar(sheet.BottomSheet({ visible: true, onClose() {}, children: null })));
  assert.equal(despachadas.length, n);
  assert.ok(nodes(t).some((x) => x.type === 'Modal'));
}

// Todo o `Modal` do iPhone diz que é um Modal: uma folha nativa aberta lá
// dentro pedia ao react-native-screens que o fechasse (dentroDeUmModal.ts).
for (const f of ['src/components', 'src/screens'].flatMap((d) => fs.readdirSync(path.join(root, d)).map((n) => `${d}/${n}`))) {
  if (!/\.tsx$/.test(f) || /\.web\.tsx$/.test(f)) continue;
  const texto = fs.readFileSync(path.join(root, f), 'utf8');
  const modais = (texto.match(/<Modal\b[^/]*?>/g) ?? []).length;
  if (!modais) continue;
  const marcados = (texto.match(/<DentroDeUmModal\.Provider value>/g) ?? []).length;
  assert.ok(marcados >= modais, `${f}: ${modais} <Modal> e ${marcados} <DentroDeUmModal.Provider value>`);
}

console.log('Folhas de baixo: arrasto, rolamento, teclado, deslizadores e a folha nativa passaram.');
