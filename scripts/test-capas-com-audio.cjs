// As capas acompanham o downloader real por eventos; só rede e fronteiras de
// React/Expo são simuladas. Também executa a transição com uma imagem lenta.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function load(file, mocks, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, console, Date, ...globals,
    require: name => { if (!(name in mocks)) throw Error(`Import não simulado: ${name}`); return mocks[name]; },
  }, { filename: file });
  return module.exports;
}
const capa = load('src/lib/capaGrande.ts', {});
const lista = load('src/lib/capaDoEcraBloqueado.ts', {});
const faixa = sourceId => ({ source: 'youtube', sourceId, artworkUrl: null });
const url = (id, tamanho) => `https://i.ytimg.com/vi/${id}/${tamanho}default.jpg`;
function ambiente(downloads = []) {
  const requests = [], timers = new Map(); let next = 0, ouvirDownload;
  const state = load('src/state/capasGrandes.ts', {
    'expo-image': { Image: { prefetch: (uri, policy) => new Promise(resolve => requests.push({ uri, policy, resolve })) } },
    '../lib/capaGrande': capa,
    '../lib/capaDoEcraBloqueado': lista,
    '../lib/youtubeCache': { downloadsEmCurso: () => downloads, ouvirDownloads: fn => { ouvirDownload = fn; } },
  }, { setTimeout: fn => { const id = ++next; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) });
  return { state, requests, timers, event: () => ouvirDownload(), downloads };
}
async function run() {
  {
    const h = ambiente([{ videoId: 'primeira' }]);
    h.state.acompanharDownloads();
    await flush();
    assert.deepEqual(h.requests.map(r => r.uri).sort(), ['hq', 'mq', 'maxres'].map(t => url('primeira', t)).sort(),
      'subscrever já aquece downloads que estavam a decorrer, incluindo mini e recurso');
    assert.ok(h.requests.every(r => r.policy === 'memory-disk'), 'a cache tem de ser a mesma do leitor');
    h.state.acompanharDownloads(); h.event(); await flush();
    assert.equal(h.requests.length, 3, 'cada bocado não duplica os pedidos em curso');
    h.downloads.push({ videoId: 'segunda' }); h.event(); await flush();
    assert.equal(h.requests.length, 6, 'o download seguinte pede as suas capas sem esperar pelo fim do áudio');
    let updates = 0;
    const stop = h.state.ouvirCapasGrandes(() => { updates++; });
    h.requests.find(r => r.uri === url('segunda', 'hq')).resolve(true); await flush();
    assert.equal(h.state.capaGrande(faixa('segunda')), url('segunda', 'hq'), 'mostra a capa pronta desta faixa enquanto a grande vem');
    h.requests.find(r => r.uri === url('segunda', 'maxres')).resolve(true); await flush();
    assert.equal(h.state.capaGrande(faixa('segunda')), url('segunda', 'maxres'), 'a resolução maior substitui a mini quando chega');
    assert.ok(updates >= 2, 'o leitor é avisado quando a escolha da capa muda');
    stop();
    for (const r of h.requests) r.resolve(true); await flush();
    h.event(); await flush(); assert.equal(h.requests.length, 6);
    assert.equal(h.timers.size, 0, 'sucesso limpa todos os prazos');
  }
  {
    const h = ambiente();
    h.state.preCarregarCapasGrandes([faixa('semmaxres')]); await flush();
    h.requests.find(r => r.uri === url('semmaxres', 'maxres')).resolve(false);
    h.requests.find(r => r.uri === url('semmaxres', 'hq')).resolve(true); await flush();
    assert.equal(h.state.capaGrande(faixa('semmaxres')), url('semmaxres', 'hq'), 'maxres inexistente usa recurso já pedido em paralelo');
    h.requests.find(r => r.uri === url('semmaxres', 'mq')).resolve(true); await flush();
    assert.equal(h.timers.size, 0);
  }
  {
    const h = ambiente();
    h.state.preCarregarCapasGrandes([faixa('semrede')]); await flush();
    for (const r of h.requests) r.resolve(false); await flush();
    h.state.preCarregarCapasGrandes([faixa('semrede')]); await flush();
    assert.equal(h.requests.length, 5, 'uma falha temporária não bloqueia o recurso/mini durante toda a sessão');
    for (const fn of [...h.timers.values()]) fn(); await flush();
    assert.equal(h.timers.size, 0, 'um prefetch pendurado tem prazo');
    h.state.preCarregarCapasGrandes([faixa('semrede')]); await flush();
    assert.equal(h.requests.length, 7, 'um prefetch expirado também permite repetir');
    for (const r of h.requests) r.resolve(true); await flush();
    assert.equal(h.timers.size, 0);
  }

  // O componente verdadeiro: A foi desenhada; B demora mais do que os antigos
  // 700 ms. A transição só pode descobrir B depois do evento onDisplay.
  {
    const timers = new Map(); let next = 0, instance, slot = 0, fades = 0;
    const ref = initial => { const i = slot++; return instance.slots[i] ??= { current: initial }; };
    const state = initial => {
      const i = slot++; const owner = instance;
      if (!(i in owner.slots)) owner.slots[i] = initial;
      return [owner.slots[i], value => { owner.slots[i] = value; owner.dirty = true; }];
    };
    const effect = (fn, deps) => {
      const i = slot++, owner = instance, old = owner.effects[i];
      if (old && deps?.every((d, k) => Object.is(d, old.deps[k]))) return;
      owner.pending.push(() => { old?.cleanup?.(); owner.effects[i] = { deps, cleanup: fn() }; });
    };
    class Value { constructor(value) { this.value = value; } setValue(value) { this.value = value; } }
    const react = { useRef: ref, useState: state, useLayoutEffect: effect, useEffect: effect,
      createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat().filter(Boolean) }) };
    const native = { StyleSheet: { absoluteFill: {} }, View: 'View', Image: 'RNImage', Easing: { out: x => x, quad: 'quad' },
      Animated: { Value, View: 'AnimatedView', timing: (value, opts) => ({ start: callback => {
        fades++; value.setValue(opts.toValue); callback?.({ finished: true });
      } }) } };
    const component = load('src/components/CapaComTransicao.tsx', {
      react, 'react-native': native, 'expo-image': { Image: 'ExpoImage' },
      '../lib/transicaoDaCapa': load('src/lib/transicaoDaCapa.ts', {}),
    }, { setTimeout: fn => { const id = ++next; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) });
    function mount(uri) {
      const owner = { slots: [], effects: [], pending: [], dirty: false };
      const render = () => {
        let tree;
        do {
          owner.dirty = false; instance = owner; slot = 0;
          tree = component.CapaComTransicao({ uri, onError() {} });
          for (const fn of owner.pending.splice(0)) fn();
        } while (owner.dirty);
        return tree;
      };
      return { render, unmount: () => owner.effects.forEach(e => e?.cleanup?.()) };
    }
    const images = node => [node, ...node.children.flatMap(images)].filter(n => n.type === 'ExpoImage' || n.type === 'RNImage');
    const first = mount('a'); const a = images(first.render()).at(-1);
    (a.props.onDisplay ?? a.props.onLoad)(); first.unmount();
    const second = mount('b'); let tree = second.render();
    assert.equal(images(tree)[0].props.source.uri, 'a', 'a capa anterior fica por baixo da que está a carregar');
    for (const fn of [...timers.values()]) fn();
    assert.equal(fades, 0, 'o relógio destapou B antes de haver uma imagem para mostrar');
    const b = images(tree).at(-1);
    assert.equal(b.type, 'ExpoImage', 'leitor e prefetch têm de partilhar cache');
    assert.equal(b.props.cachePolicy, 'memory-disk');
    assert.equal(typeof b.props.onDisplay, 'function'); b.props.onDisplay();
    assert.equal(fades, 1);
    tree = second.render(); assert.equal(images(tree).length, 1, 'só retira A depois de B desenhada e do cruzamento');
    second.unmount();
  }
  const player = fs.readFileSync(path.join(root, 'src/components/PlayerRoot.tsx'), 'utf8');
  assert.doesNotMatch(player, /setArtUri/, 'a capa da faixa nova não pode depender de um efeito pós-render');
  assert.match(player, /useSyncExternalStore\(ouvirCapasGrandes/, 'o render lê a capa da faixa atual e acompanha o prefetch');
  console.log('Capas com o áudio: cache partilhada, download em curso, mini/recurso em paralelo, repetição após falha e transição lenta passaram.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
