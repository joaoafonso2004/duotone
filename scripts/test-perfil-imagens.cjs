// Executa o menu, o editor e o seletor reais com hooks e UI nativa simulados.
// Testa a ordem dos eventos; a apresentação do seletor ainda exige um iPhone.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function load(file, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file })(id => {
    assert.ok(id in mocks, `${file}: import sem duplo: ${id}`);
    return mocks[id];
  }, module, module.exports);
  return module.exports;
}

function hookRuntime() {
  let active;
  const slot = init => {
    const s = active, i = s.cursor++;
    if (!(i in s.slots)) s.slots[i] = init();
    return [s, i];
  };
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
  const react = {
    createElement(type, props, ...children) {
      if (props?.ref && !props.ref.current) {
        props.ref.current = { measureInWindow: cb => cb(20, 180, 300, 100) };
      }
      return { type, props: { ...props, children } };
    },
    useRef(value) { const [s, i] = slot(() => ({ current: value })); return s.slots[i]; },
    useState(value) {
      const [s, i] = slot(() => typeof value === 'function' ? value() : value);
      return [s.slots[i], next => {
        const v = typeof next === 'function' ? next(s.slots[i]) : next;
        if (!Object.is(s.slots[i], v)) { s.slots[i] = v; s.dirty = true; }
      }];
    },
    useCallback(fn, deps) {
      const [s, i] = slot(() => ({}));
      if (changed(s.slots[i].deps, deps)) s.slots[i] = { deps, fn };
      return s.slots[i].fn;
    },
    useEffect(fn, deps) {
      const [s, i] = slot(() => ({}));
      const effect = s.slots[i];
      if (changed(effect.deps, deps)) {
        effect.deps = deps;
        s.effects.push(() => { effect.cleanup?.(); effect.cleanup = fn(); });
      }
    },
  };
  return { react, instance(Component) {
    const s = { cursor: 0, slots: [], effects: [], dirty: false };
    return {
      render(props) {
        let tree, rounds = 0;
        do {
          assert.ok(++rounds < 20, 'render em ciclo');
          active = s; s.cursor = 0; s.dirty = false;
          tree = Component(props);
          s.effects.splice(0).forEach(fn => fn());
        } while (s.dirty);
        return tree;
      },
      unmount() { s.slots.forEach(value => value?.cleanup?.()); },
    };
  } };
}

const nodes = tree => !tree || typeof tree !== 'object' ? []
  : [tree, ...[tree.props?.header, ...(tree.props?.children ?? [])].flat(Infinity).flatMap(nodes)];
const runtime = hookRuntime();
let reduced = false;
const exits = [];
class Value {
  constructor(value) { this.value = value; }
  setValue(value) { this.value = value; }
  interpolate(config) { return config; }
}
const native = {
  Platform: { OS: 'ios' },
  Animated: { Value, View: 'AnimatedView',
    spring: () => ({ start() {}, stop() {} }),
    timing: () => {
      const exit = { callback: null, done: false,
        start(cb) { this.callback = cb; exits.push(this); },
        finish(finished = true) {
          if (this.done) return;
          this.done = true; this.callback?.({ finished });
        },
        stop() { this.finish(false); },
      };
      return exit;
    },
  },
  Modal: 'Modal', Pressable: 'Pressable', View: 'View', Text: 'Text',
  Image: 'Image', ScrollView: 'ScrollView', TextInput: 'TextInput',
  ActivityIndicator: 'ActivityIndicator', Switch: 'Switch',
  StyleSheet: { create: value => value, absoluteFill: {}, hairlineWidth: 1 },
  useWindowDimensions: () => ({ width: 393, height: 852 }),
};
const { MenuFlutuante } = load('src/components/MenuFlutuante.tsx', {
  react: runtime.react, 'react-native': native, '@expo/vector-icons/Ionicons': 'Icon',
  'expo-blur': { BlurView: 'BlurView' }, './Toque': { Toque: 'Toque' },
  '../lib/haptics': { hapticSelection() {} },
  '../hooks/useReducedMotion': { useReducedMotion: () => reduced },
  '../hooks/useNotificationOverlay': { useNotificationOverlay: () => () => {} },
  '../lib/movimento': { ESTADO: {} },
  '../theme': { colors: {}, radii: {}, spacing: { xs: 4, sm: 8 }, type: {} },
  './dentroDeUmModal': { DentroDeUmModal: { Provider: 'Provider' } },
});
const open = { visivel: true, ancora: { x: 20, y: 180, width: 300, height: 100 },
  accoes: [{ label: 'Choose a photo', icon: 'images-outline', onPress() {} }], aoFechar() {} };
const closed = { ...open, visivel: false, ancora: null, accoes: [] };

let calls = 0;
const menu = runtime.instance(MenuFlutuante);
menu.render({ ...open, aoFechado: () => calls++ });
let tree = menu.render({ ...closed, aoFechado: () => calls++ });
assert.equal(tree.props.visible, true, 'conserva o Modal durante a saída, mesmo sem âncora');
assert.equal(nodes(tree).find(n => n.type === 'Toque').props.disabled, true, 'não repete a escolha durante a saída');
assert.equal(calls, 0, 'não abre o seletor ao começar a sair');
exits.at(-1).finish();
tree = menu.render({ ...closed, aoFechado: () => calls++ });
assert.equal(tree.props.visible, false);
assert.equal(calls, 0, 'o fim da animação ainda não é o fecho nativo');
tree.props.onDismiss(); tree.props.onDismiss();
assert.equal(calls, 1, 'a ação corre uma vez, depois do onDismiss');
menu.unmount();

for (const mode of ['initial', 'reopen', 'unmount', 'interrupted', 'reduced', 'web', 'android']) {
  calls = 0; reduced = mode === 'reduced';
  native.Platform.OS = mode === 'web' || mode === 'android' ? mode : 'ios';
  const instance = runtime.instance(MenuFlutuante);
  const props = { ...open, aoFechado: () => calls++ };
  const hidden = { ...closed, aoFechado: props.aoFechado };
  if (mode === 'initial') {
    const before = exits.length;
    instance.render(hidden);
    assert.equal(exits.length, before, 'um menu que nunca abriu não inicia uma saída');
    assert.equal(calls, 0);
  } else {
    instance.render(props);
    tree = instance.render(hidden);
    if (mode === 'reopen') {
      const stale = exits.at(-1);
      tree = instance.render(props);
      stale.finish(); tree.props.onDismiss();
      assert.equal(tree.props.visible, true);
      assert.equal(calls, 0, 'o fecho antigo não apaga nem aciona a nova apresentação');
    } else if (mode === 'unmount') {
      instance.unmount(); exits.at(-1).finish(); tree.props.onDismiss();
      assert.equal(calls, 0, 'sair do editor cancela a ação pendente');
      continue;
    } else {
      if (!reduced) exits.at(-1).finish(mode !== 'interrupted');
      tree = instance.render(hidden);
      assert.equal(tree.props.visible, false, 'uma animação interrompida também fecha');
      if (native.Platform.OS === 'ios') {
        assert.equal(calls, 0);
        tree.props.onDismiss();
      }
      assert.equal(calls, 1, `${mode}: uma escolha abre uma vez`);
    }
  }
  instance.unmount();
}

native.Platform.OS = 'ios'; reduced = false;
const crop = load('src/lib/profileImageCrop.ts');
let picked = 0, pickerResult;
const images = load('src/lib/profileImage.ts', {
  'expo-image-picker': { launchImageLibraryAsync: async options => {
    picked++; assert.deepEqual(options.mediaTypes, ['images']);
    if (pickerResult instanceof Error) throw pickerResult;
    return pickerResult;
  } },
  'expo-image-manipulator': {}, 'expo-file-system': {}, './profileImageCrop': crop,
});
const { ProfileEditor } = load('src/components/ProfileEditor.tsx', {
  react: runtime.react, 'react-native': native, '@expo/vector-icons/Ionicons': 'Icon', 'expo-crypto': {},
  '../api/profiles': { appearanceOf: () => ({ cover_path: null, avatar_path: null, bio: '' }) },
  '../api/playlists': {}, '../api/library': {}, '../lib/cacheDaBiblioteca': {},
  '../lib/profileImage': images, '../lib/profileImageCrop': crop,
  '../lib/profileMedia': { useProfileMedia: () => null },
  '../lib/artistName': {}, '../lib/capaDoEcraBloqueado': {}, '../lib/supabase': {},
  './FriendAvatar': { FriendAvatar: 'FriendAvatar' },
  './ProfileCropPreview': { ProfileCropPreview: 'CropPreview' },
  './ArtworkCollage': {}, './MenuFlutuante': { MenuFlutuante },
  '../state/social': {}, '../state/theme': { useTheme: fn => fn({ theme: { color: '#fff' } }) },
  './socialUI': { SocialModal: 'SocialModal', socialStyles: {} },
  './socialTokens': { colors: {}, radii: {} },
});
const profile = { profile: { id: 'me', name: 'João', username: 'joao' } };

async function main() {
  for (const kind of ['avatar', 'cover']) for (const result of ['selected', 'canceled', 'error']) {
    pickerResult = result === 'error' ? new Error('Could not open the library.')
      : result === 'canceled' ? { canceled: true }
      : { canceled: false, assets: [{ uri: `file://${kind}.jpg`, width: 1200, height: 900, mimeType: 'image/jpeg' }] };
    const editor = runtime.instance(ProfileEditor), imageMenu = runtime.instance(MenuFlutuante);
    const props = { profile, highlights: null, playlists: [], onClose() {}, onSaved() {} };
    let editorTree = editor.render(props);
    const edit = nodes(editorTree).find(n => n.props.accessibilityLabel === (kind === 'avatar' ? 'Edit photo' : 'Edit cover'));
    edit.props.onPress();
    editorTree = editor.render(props);
    let menuProps = nodes(editorTree).find(n => n.type === MenuFlutuante).props;
    imageMenu.render(menuProps);
    const before = picked;
    menuProps.accoes[0].onPress();
    editorTree = editor.render(props);
    menuProps = nodes(editorTree).find(n => n.type === MenuFlutuante).props;
    let menuTree = imageMenu.render(menuProps);
    assert.equal(menuTree.props.visible, true);
    assert.equal(picked, before, `${kind}: não abre enquanto o menu está a sair`);
    exits.at(-1).finish();
    menuTree = imageMenu.render(menuProps);
    assert.equal(picked, before, `${kind}: espera pelo fecho nativo`);
    menuTree.props.onDismiss(); menuTree.props.onDismiss();
    await Promise.resolve(); await Promise.resolve();
    assert.equal(picked, before + 1, `${kind}: a biblioteca abre uma vez`);
    editorTree = editor.render(props);
    const previews = nodes(editorTree).filter(n => n.type === 'CropPreview');
    assert.equal(previews.length, result === 'selected' ? 1 : 0);
    if (result === 'selected') {
      assert.equal(previews[0].props.image.uri, `file://${kind}.jpg`);
      assert.equal(previews[0].props.ratio, kind === 'avatar' ? 1 : 1.5);
    }
    const save = nodes(editorTree).find(n => n.props.accessibilityState?.disabled !== undefined);
    assert.equal(save.props.disabled, result !== 'selected', 'cancelar ou falhar não altera o perfil');
    const error = nodes(editorTree).find(n => n.props.accessibilityRole === 'alert');
    assert.equal(!!error, result === 'error', 'um erro do seletor aparece no editor');
    if (error) assert.equal(error.props.children[0], 'Could not open the library.');
    imageMenu.unmount(); editor.unmount();
  }
  console.log('Imagens do perfil: foto/capa, escolha/cancelamento/erro, fecho nativo, saída, reabertura e desmontagem passaram.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
