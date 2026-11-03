// Componentes e hook reais, com efeitos e relógio controlados. Mede trabalho
// evitado na abertura (letras, molas e nós); não mede FPS de um iPhone.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const raiz = path.resolve(__dirname, '..');
const base = process.argv.find(x => x.startsWith('--baseline='))?.slice(11);
function carregar(file, duplos = {}, globais = {}) {
  const source = base ? execFileSync('git', ['show', `${base}:${file}`], { cwd: raiz, encoding: 'utf8' })
    : fs.readFileSync(path.join(raiz, file), 'utf8');
  const codigo = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(codigo, { module, exports: module.exports, ...globais, require: nome => {
    assert.ok(nome in duplos, `Import sem duplo: ${nome}`); return duplos[nome];
  } });
  return module.exports;
}
function ambiente() {
  let agora = 10000, proximoTimer = 0, nos = 0;
  const timers = new Map(), animacoes = [];
  const globais = {
    Date: { now: () => agora },
    setTimeout: (fn, ms) => { const id = ++proximoTimer; timers.set(id, { fn, em: agora + ms }); return id; },
    clearTimeout: id => timers.delete(id),
  };
  const ler = x => typeof x === 'number' ? x : x.ler();
  const derivar = fn => { nos++; return { ler: fn, interpolate(config) { return interpolar(this, config); } }; };
  const interpolar = (v, { inputRange: xs, outputRange: ys, extrapolate }) => derivar(() => {
    let t = ler(v);
    if (extrapolate === 'clamp') t = Math.max(xs[0], Math.min(xs.at(-1), t));
    let i = xs.findIndex(x => x > t) - 1;
    if (i < 0) i = t <= xs[0] ? 0 : xs.length - 2;
    return ys[i] + (ys[i + 1] - ys[i]) * (t - xs[i]) / (xs[i + 1] - xs[i]);
  });
  class Value {
    constructor(v) { this.v = v; }
    setValue(v) { this.v = v; }
    ler() { return this.v; }
    interpolate(config) { return interpolar(this, config); }
    stopAnimation() {}
  }
  const animar = tipo => (valor, config) => ({
    start(callback) { animacoes.push({ tipo, valor, config, terminar() { valor?.setValue(config?.toValue); callback?.({ finished: true }); } }); },
    stop() {},
  });
  const Animated = {
    Value, View: 'Animated.View', add: (a, b) => derivar(() => ler(a) + ler(b)),
    subtract: (a, b) => derivar(() => ler(a) - ler(b)), multiply: (a, b) => derivar(() => ler(a) * ler(b)),
    divide: (a, b) => derivar(() => ler(a) / ler(b)), timing: animar('timing'), spring: animar('spring'),
    loop: () => ({ start() {}, stop() {} }), sequence: () => ({ start() {}, stop() {} }), delay: () => ({}),
  };
  const rn = { Animated, View: 'View', Image: 'Image', Platform: { OS: 'ios' },
    PanResponder: { create: handlers => ({ panHandlers: handlers }) },
    StyleSheet: { create: x => x, absoluteFill: {} },
    AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    Easing: { bezier: () => x => x, linear: x => x, out: x => x, in: x => x, inOut: x => x, cubic: x => x, quad: x => x },
  };
  function hooks() {
    let i = 0, fn, props, tree, sujo = false;
    const slots = [], efeitos = [];
    const iguais = (a, b) => a && b && a.length === b.length && a.every((v, k) => Object.is(v, b[k]));
    const useMemo = (calcular, deps) => {
      const k = i++;
      if (!slots[k] || !iguais(slots[k].deps, deps)) slots[k] = { deps, valor: calcular() };
      return slots[k].valor;
    };
    const React = {
      memo: f => f, useMemo, useCallback: (f, deps) => useMemo(() => f, deps),
      useRef: current => { const k = i++; return slots[k] ??= { current }; },
      useState: inicial => {
        const k = i++;
        slots[k] ??= { valor: typeof inicial === 'function' ? inicial() : inicial };
        return [slots[k].valor, v => { const novo = typeof v === 'function' ? v(slots[k].valor) : v;
          if (!Object.is(novo, slots[k].valor)) { slots[k].valor = novo; sujo = true; }
        }];
      },
      useEffect: (effect, deps) => {
        const k = i++;
        if (!slots[k] || !iguais(slots[k].deps, deps)) efeitos.push(() => {
          slots[k]?.cleanup?.(); slots[k] = { deps, cleanup: effect() };
        });
      },
      createElement: (type, props, ...children) => ({ type, props: { ...props, ...(children.length ? { children } : {}) } }),
    };
    const render = () => { i = 0; sujo = false; tree = fn(props); };
    const flush = () => {
      for (let n = 0; efeitos.length || sujo; n++) {
        assert.ok(n < 20, 'Ciclo de efeitos');
        efeitos.splice(0).forEach(effect => effect());
        if (sujo) render();
      }
      return tree;
    };
    return { React, flush, mount(f, p) { fn = f; props = p; render(); return flush(); },
      update(p = props) { props = p; render(); return flush(); } };
  }
  return { globais, rn, hooks, animacoes, ler, nos: () => nos,
    vencer(ms) { agora += ms; for (const [id, t] of [...timers]) if (t.em <= agora) { timers.delete(id); t.fn(); } } };
}
const todos = n => Array.isArray(n) ? n.flatMap(todos) : !n || typeof n !== 'object' ? [] : [n, ...todos(n.props?.children)];
const casos = [];
const caso = (nome, fn) => casos.push([nome, fn]);
caso('a primeira abertura não roda uma capa parada nem monta as letras', () => {
  const a = ambiente(), h = a.hooks();
  let reduzido = false;
  const { ArtworkLyricsCube } = carregar('src/components/ArtworkLyricsCube.tsx', {
    react: h.React, 'react-native': a.rn, 'expo-image': { Image: 'Image' }, 'expo-linear-gradient': { LinearGradient: 'Gradient' },
    '../hooks/useReducedMotion': { useReducedMotion: () => reduzido }, './LyricsView': { LyricsView: 'Lyrics' },
    '../lib/lyricsCubeGesture': carregar('src/lib/lyricsCubeGesture.ts'),
    '../lib/capaFlutuante3D': carregar('src/lib/capaFlutuante3D.ts'), '../lib/capaGrande': carregar('src/lib/capaGrande.ts'),
  }, a.globais);
  const props = { track: { source: 'youtube', sourceId: 'a' }, size: 320, front: 'capa', showLyrics: false, aVista: true,
    onChange(v) { props.showLyrics = v; } };
  let tree = h.mount(ArtworkLyricsCube, props);
  assert.equal(a.animacoes.filter(x => x.tipo === 'spring').length, 0, 'a capa já está na face certa');
  assert.ok(!todos(tree).some(x => x.type === 'Lyrics'), 'as letras não montam durante a abertura');
  a.vencer(899); tree = h.flush();
  assert.ok(!todos(tree).some(x => x.type === 'Lyrics'));
  a.vencer(1); tree = h.flush();
  assert.ok(todos(tree).some(x => x.type === 'Lyrics'), 'as letras continuam a preparar-se depois da abertura');
  tree.props.onMoveShouldSetPanResponderCapture({}, { dx: -300, dy: 0 });
  tree.props.onPanResponderGrant();
  tree.props.onPanResponderMove({}, { dx: -300 });
  tree.props.onPanResponderRelease({}, { dx: -300, vx: -1 });
  tree = h.update(props);
  const molas = a.animacoes.filter(x => x.tipo === 'spring');
  assert.equal(molas.length, 1, 'o gesto e o onChange não arrancam duas molas para a mesma volta');
  molas[0].terminar(); tree = h.flush();
  assert.equal(todos(tree).find(x => x.type === 'Lyrics').props.visible, true, 'o gesto continua a revelar as letras');
  reduzido = true; props.showLyrics = false; tree = h.update(props);
  assert.equal(a.animacoes.filter(x => x.tipo === 'spring').length, 1, 'Reduzir movimento continua sem mola');
  assert.equal(todos(tree).find(x => x.type === 'Lyrics').props.visible, false);
});
caso('abrir com outra música não sobrepõe o recuo do skip à abertura', () => {
  const a = ambiente(), h = a.hooks();
  const lib = carregar('src/lib/transicaoDaCapa.ts');
  const { CapaFlutuante3D } = carregar('src/components/CapaFlutuante3D.tsx', {
    react: h.React, 'react-native': a.rn, '../hooks/useReducedMotion': { useReducedMotion: () => false },
    '../lib/capaFlutuante3D': carregar('src/lib/capaFlutuante3D.ts'), '../lib/transicaoDaCapa': lib,
    '../lib/recuoDoEncaixe': carregar('src/lib/recuoDoEncaixe.ts'), '../state/fluidez': { pedirFluidez() {} },
    '../state/passagemAVista': { luasNoEcra: () => false },
    '../../assets/capa3d-sombra-ambiente.png': 1, '../../assets/capa3d-sombra-contacto.png': 2,
  }, a.globais);
  const props = { size: 320, enabled: true, aVista: false, aFlutuar: false, transicao: { chave: 'a', sentido: 0 }, children: () => null };
  const skips = () => a.animacoes.filter(x => x.tipo === 'timing' && x.config.duration === lib.curvaDoSkip().duracaoMs).length;
  h.mount(CapaFlutuante3D, props);
  props.aVista = true; props.transicao = { chave: 'b', sentido: 0 }; h.update(props);
  assert.equal(skips(), 0, 'mini -> aberto com nova faixa é uma abertura');
  props.transicao = { chave: 'c', sentido: 1 }; h.update(props);
  assert.equal(skips(), 1, 'uma troca com o leitor já aberto mantém o efeito');
  const recuo = a.animacoes.findLast(x => x.tipo === 'timing' && x.config.duration === lib.curvaDoSkip().duracaoMs);
  props.aVista = false; props.transicao = { chave: 'd', sentido: 1 }; h.update(props);
  assert.equal(recuo.valor.ler(), 1, 'fechar termina o recuo antigo antes de outra abertura');
  props.aVista = true; h.update(props);
  assert.equal(skips(), 1, 'uma troca escondida não é reproduzida ao reabrir');
});
caso('o progresso e os avisos do download conservam o mesmo grafo da capa', () => {
  const a = ambiente(), h = a.hooks(), downloads = new Set();
  let download = null, emDisco = false;
  const estado = { current: { sourceId: 'a' }, activeBackend: 'resolving', buffering: true };
  const player = { getState: () => estado, subscribe: () => () => {} };
  const { useMontagemDaCapa } = carregar('src/hooks/useMontagemDaCapa.ts', {
    react: h.React, 'react-native': a.rn, './useReducedMotion': { useReducedMotion: () => false },
    '../state/player': { usePlayer: player }, '../lib/arranqueDaFaixa': { arranqueAtual: () => ({ videoId: 'a', pedidoEm: 10000 }) },
    '../lib/montagemDaCapa': carregar('src/lib/montagemDaCapa.ts'), '../lib/recuoDoEncaixe': carregar('src/lib/recuoDoEncaixe.ts'),
    '../lib/appVisibility': { appEstaVisivel: () => true, ouvirVisibilidade: () => () => {}, intervaloComAppVisivel: () => () => {} },
    '../lib/youtubeCache': { cachedAudioFile: () => emDisco ? { exists: true } : null, estadoDoDownload: () => download,
      ouvirDownloads: fn => { downloads.add(fn); return () => downloads.delete(fn); } },
  }, a.globais);
  const inicial = h.mount(() => useMontagemDaCapa('a', true));
  const animacao = inicial.animacao ?? inicial, nos = a.nos();
  const avisar = () => { downloads.forEach(fn => fn()); return h.flush(); };
  for (let i = 0; i < 3; i++) {
    download = { fase: 'a-descarregar', bocados: i, total: 5e6, bocadoBytes: 1e6, inicioEm: 10000, ultimoBocadoEm: 10000 };
    const atual = avisar();
    assert.ok((atual.animacao ?? atual) === animacao, 'cada bocado mantém as props nativas do cubo');
  }
  a.vencer(6000); const preso = avisar();
  assert.equal(preso.preso, 'preso-a-meio');
  assert.ok(preso.animacao === animacao, 'o aviso não troca o grafo');
  const recuo = a.animacoes.findLast(x => x.config?.toValue === 1 && x.config?.duration === 500);
  recuo.terminar();
  assert.equal(a.ler(animacao.recuos[0]), 0);
  assert.equal(a.ler(animacao.recuos[1]), 0);
  assert.ok(a.ler(animacao.recuos[2]) > 0, 'só a peça seguinte recua');
  assert.equal(a.nos(), nos, 'o progresso não cria mais interpolações');
  emDisco = true; const pronta = avisar();
  assert.equal(pronta.preso, null);
  assert.ok(pronta.animacao === animacao);
  assert.ok(animacao.recuos.every(x => a.ler(x) === 0), 'terminar larga o recuo das peças');
});
let falhas = 0;
for (const [nome, fn] of casos) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (error) { falhas++; console.error(`  FALHOU - ${nome}: ${error.message}`); }
}
if (falhas) process.exitCode = 1;
else console.log('Abertura do leitor: letras, gestos, skip e grafo estável passaram.');
