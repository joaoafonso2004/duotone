// Componentes reais, hooks com identidade e fronteira nativa substituída.
// Verifica o que React.memo recebe e a reutilização dos nós; não mede o iOS.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function carregar(ficheiro, duplos = {}) {
  const module = { exports: {} };
  const codigo = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', ficheiro), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(codigo, { module, exports: module.exports, require: nome => {
    assert.ok(nome in duplos, `Import sem duplo: ${nome}`); return duplos[nome];
  } });
  return module.exports;
}
function hooks() {
  let i = 0;
  const valores = [];
  const iguais = (a, b) => a && b && a.length === b.length && a.every((v, k) => Object.is(v, b[k]));
  const useMemo = (fn, deps) => {
    const k = i++;
    if (!valores[k] || !iguais(valores[k].deps, deps)) valores[k] = { deps, valor: fn() };
    return valores[k].valor;
  };
  return {
    render: (fn, props) => { i = 0; return fn(props); },
    React: {
      memo: fn => fn, useEffect: () => {}, useMemo, useCallback: (fn, deps) => useMemo(() => fn, deps),
      useRef: current => { const k = i++; return valores[k] ??= { current }; },
      useState: inicial => { const k = i++; return valores[k] ??= [typeof inicial === 'function' ? inicial() : inicial, v => {
        valores[k][0] = typeof v === 'function' ? v(valores[k][0]) : v;
      }]; },
      createElement: (type, props, ...children) => ({ type, props: { ...props, ...(children.length ? { children } : {}) } }),
    },
  };
}
const todos = n => Array.isArray(n) ? n.flatMap(todos) : !n || typeof n !== 'object' ? [] : [n, ...todos(n.props?.children)];
const propsIguais = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => Object.is(a[k], b[k]));
let interpolacoes = 0;
class Valor {
  interpolate() { interpolacoes++; return new Valor(); }
}
const Animated = { Value: Valor, Text: 'Animated.Text', View: 'Animated.View',
  add: () => new Valor(), subtract: () => new Valor(), multiply: () => new Valor(), event: () => () => {},
};
const rn = { Animated, Easing: {}, StyleSheet: { create: s => s }, ActivityIndicator: 'ActivityIndicator',
  Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View' };

const h = hooks();
const linhas = Array.from({ length: 100 }, (_, i) => ({ text: `Verso ${i}`, timeMs: i * 2000 }));
const player = { positionMs: 4000, seekTo: ms => { player.positionMs = ms; } };
const aparencia = { tamanhoDasLetras: 'm' };
const letra = { entries: { ensaio: { status: 'ready', data: { parsedLines: linhas, timingAvailable: true } } } };
const { LyricsView } = carregar('src/components/LyricsView.tsx', {
  react: h.React, 'react-native': rn,
  '../state/player': { usePlayer: selector => selector(player) },
  '../state/lyrics': { lyricsCacheKey: () => 'ensaio', useLyrics: selector => selector(letra), ensureLyrics() { throw Error('Rede proibida'); } },
  '../lib/lyricsParser': carregar('src/lib/lyricsParser.ts'),
  '../hooks/useReducedMotion': { useReducedMotion: () => false },
  '../lib/aparencia': carregar('src/lib/aparencia.ts'),
  '../state/aparencia': { useAparencia: selector => selector(aparencia) },
});
const props = { track: { sourceId: 'ensaio' }, visible: true };
const desenhar = () => todos(h.render(LyricsView, props)).filter(n => n.type?.name === 'Line');
const antes = desenhar();
player.positionMs = 6000;
const depois = desenhar();
assert.equal(antes.length, 100);
assert.equal(depois.filter((n, i) => !propsIguais(n.props, antes[i].props)).length, 2,
  'avançar um verso só invalida a linha antiga e a nova, em vez das cem');
depois[7].props.onPress(depois[7].props.timeMs);
assert.equal(player.positionMs, 14000, 'o toque continua a procurar a posição certa');
props.visible = false;
assert.ok(desenhar().every(n => n.props.visible === false), 'esconder desativa os toques');
aparencia.tamanhoDasLetras = 'g';
assert.ok(desenhar().every(n => n.props.tamanho.fontSize > depois[0].props.tamanho.fontSize), 'a preferência continua a mudar todas as linhas');

const b = hooks();
let reduzido = false;
const { ProgressBar } = carregar('src/components/ProgressBar.tsx', {
  react: b.React, 'react-native': rn,
  'react-native-gesture-handler': { PanGestureHandler: 'Pan', State: {} },
  '../hooks/useReducedMotion': { useReducedMotion: () => reduzido },
  '../lib/movimento': { BARRA_A_ARRASTAR: 3, BOTAO_DA_BARRA: { repouso: 0.7 }, ESTADO: {}, SOLTAR: {} },
  '../theme': { colors: {} }, '../lib/prefs': {},
  '../lib/barraSuave': carregar('src/lib/barraSuave.ts'),
  '../lib/arrastarBarra': carregar('src/lib/arrastarBarra.ts'),
  '../lib/haptics': {}, '../state/fluidez': {},
});
const barra = { positionMs: 1000, durationMs: 240000, onSeek: ms => { barra.positionMs = ms; } };
b.render(ProgressBar, barra);
const nosIniciais = interpolacoes;
for (let i = 0; i < 60; i++) b.render(ProgressBar, { ...barra, positionMs: 2000 + i * 1000 });
assert.equal(interpolacoes, nosIniciais, 'um minuto de progresso não recria nós da animação');
reduzido = true;
const quieta = b.render(ProgressBar, barra);
const geometria = todos(quieta).flatMap(n => (Array.isArray(n.props?.style) ? n.props.style : []).flatMap(s => s?.transform ?? []));
assert.ok(geometria.some(t => t.scaleY === 1), 'reduzir movimento ainda desliga a animação da espessura');
const acessivel = todos(quieta).find(n => n.props?.accessibilityRole === 'adjustable');
acessivel.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } });
assert.equal(barra.positionMs, 11000, 'a procura acessível continua a funcionar');
console.log('Leitor: duas linhas por verso; nenhum nó da barra recriado por posição.');
