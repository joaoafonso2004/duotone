// O hook real com relógio e medidas controladas. O Fabric mede a posição no
// conteúdo, sem contentOffset; o teste começa com dez músicas já fora do ecrã.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const raiz = path.resolve(__dirname, '..');
const carregar = (ficheiro, duplos, extras = {}) => {
  const module = { exports: {} };
  const codigo = ts.transpileModule(fs.readFileSync(path.join(raiz, ficheiro), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(codigo, { module, exports: module.exports, require: nome => {
    assert.ok(nome in duplos, `Import sem duplo: ${nome}`); return duplos[nome];
  }, ...extras });
  return module.exports;
};
const contas = carregar('src/lib/arrastarFila.ts', {});
function ensaio() {
  let cursor = 0, renderes = 0, segurados = 0;
  const slots = [], efeitos = [], intervalos = new Map(), scrolls = [], reordenacoes = [];
  const iguais = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const React = {
    useState(valor) { const i = cursor++; slots[i] ??= { valor }; return [slots[i].valor, v => { slots[i].valor = v; }]; },
    useRef(current) { const i = cursor++; return slots[i] ??= { current }; },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || !iguais(slots[i].deps, deps)) slots[i] = { deps, fn }; return slots[i].fn; },
    useEffect(fn, deps) {
      const i = cursor++;
      if (slots[i] && iguais(slots[i].deps, deps)) return;
      const anterior = slots[i]; slots[i] = { deps, limpar: anterior?.limpar };
      efeitos.push(() => { anterior?.limpar?.(); slots[i].limpar = fn(); });
    },
  };
  class Valor { constructor(v) { this.valor = v; } setValue(v) { this.valor = v; } }
  const { useArrastarLista } = carregar('src/hooks/useArrastarLista.ts', {
    react: React, 'react-native': { Animated: { Value: Valor, timing: (v, p) => ({ start(cb) { v.setValue(p.toValue); cb(); }, stop() {} }) }, Easing: { out: x => x, cubic: x => x } },
    '../lib/arrastarFila': contas, '../components/TrackRow': { TRACK_ROW_HEIGHT: 68 },
    '../lib/haptics': { hapticSelection() {} },
    '../state/fluidez': { segurarFluidez() { segurados++; return () => { segurados--; }; } },
  }, { setInterval(fn) { const id = {}; intervalos.set(id, fn); return id; }, clearInterval: id => intervalos.delete(id), setTimeout: fn => fn() });
  const chaves = Array.from({ length: 80 }, (_, i) => `musica-${i}`);
  const render = () => {
    cursor = 0; renderes++;
    const hook = useArrastarLista({ chaves, aoReordenar: (de, para) => reordenacoes.push([de, para]) });
    for (const fn of efeitos.splice(0)) fn();
    return hook;
  };
  let hook = render();
  const moldura = { measure: cb => cb(0, 0, 390, 400) };
  hook.molduraRef.current = moldura;
  hook.listaRef.current = { setNativeProps() {}, scrollToOffset: p => scrolls.push(p.offset) };
  hook.aoMudarTamanho(390, 80 * 68);
  const rolar = y => hook.aoRolar({ nativeEvent: { contentOffset: { y } } });
  const pegar = (index, medir) => {
    hook.comecarArrasto(index); hook = render();
    const linha = hook.propsDaLinha(index);
    linha.aoPegar(20, { measureLayout: medir ?? ((_m, cb) => cb(0, index * 68)) });
    return linha;
  };
  const passo = (n = 1) => { for (let i = 0; i < n; i++) for (const fn of intervalos.values()) fn(); };
  return { render, rolar, pegar, passo, scrolls, reordenacoes, get hook() { return hook; }, get renderes() { return renderes; }, get segurados() { return segurados; },
    desmontar() { for (const s of slots) s?.limpar?.(); } };
}

const meio = ensaio();
meio.rolar(680);
const linha = meio.pegar(12); // 816 + 20 - 680 = 156, a meio do viewport.
const antes = meio.renderes;
linha.aoMover(10);
meio.passo(120);
assert.deepEqual(meio.scrolls, [680], 'só pára a inércia: não desce sozinho depois de rolar');
assert.equal(linha.dy.valor, 10, 'a linha segue só o dedo');
assert.equal(meio.renderes, antes, 'os passos do dedo não redesenham o React');
linha.aoLargar(10);
assert.deepEqual(meio.reordenacoes, [], 'um movimento pequeno não muda a ordem');
assert.equal(meio.segurados, 0);

const borda = ensaio();
borda.rolar(680);
const emBaixo = borda.pegar(15); // 360, já na margem inferior ao agarrar.
borda.passo(120);
emBaixo.aoMover(7);
borda.passo(120);
assert.deepEqual(borda.scrolls, [680], 'hold e tremor do dedo não ativam o deslize');
emBaixo.aoMover(16);
borda.passo(12);
assert.ok(borda.scrolls.at(-1) > 680, 'levar o dedo à borda volta a deslizar');
const esperado = contas.destinoDoArrasto(15, 16 + borda.scrolls.at(-1) - 680, 68, 80);
emBaixo.aoLargar(16);
assert.deepEqual(borda.reordenacoes, [[15, esperado]], 'o destino conta o scroll por baixo do dedo');
borda.render();
const parou = borda.scrolls.length;
borda.passo(20);
assert.equal(borda.scrolls.length, parou, 'largar termina o scroll');

const tardio = ensaio();
tardio.rolar(680);
let medidaAntiga;
tardio.pegar(12, (_m, cb) => { medidaAntiga = cb; }).aoCancelar();
const nova = tardio.pegar(12);
medidaAntiga(0, 9000);
nova.aoMover(10);
tardio.passo(20);
assert.deepEqual(tardio.scrolls, [680, 680], 'uma medida antiga do mesmo índice não altera o novo arrasto');
tardio.desmontar();
assert.equal(tardio.segurados, 0, 'fechar a folha larga a taxa alta de animação');
assert.equal(nova.pegadaRef.current, null);
tardio.passo(20);
assert.deepEqual(tardio.scrolls, [680, 680], 'fechar também pára o relógio das bordas');

const estado = carregar('src/state/filaNativa.ts', { zustand: require('zustand') });
const limpezas = [];
const { FilaScreen } = carregar('src/screens/FilaScreen.tsx', {
  react: { useEffect: fn => limpezas.push(fn()), createElement: () => null },
  'react-native-gesture-handler': { GestureHandlerRootView: 'Gestos' },
  '../components/QueueSheet': { QueueSheet: 'Fila' }, '../state/filaNativa': estado,
  '../components/FundoDaFolha': { FundoDaFolha: 'Fundo' },
});
assert.equal(estado.useFilaNativa.getState().aberta, false);
FilaScreen({ navigation: { canGoBack: () => true, goBack() {} } });
assert.equal(estado.useFilaNativa.getState().aberta, true, 'abrir a fila pausa o movimento atrás dela');
limpezas.forEach(fn => fn());
assert.equal(estado.useFilaNativa.getState().aberta, false, 'sair da fila deixa o leitor retomar');
const ler = f => fs.readFileSync(path.join(raiz, f), 'utf8').replace(/\r\n/g, '\n');
const leitor = ler('src/components/PlayerRoot.tsx');
assert.match(leitor, /aVista=\{aberto && !filaAberta\}/, 'a capa 3D pára atrás da fila');
assert.match(leitor, /const aVista = .*&& !filaAberta && AppState/, 'o progresso pára de se animar atrás da fila');
assert.match(ler('src/components/ArtworkLyricsCube.tsx'), /visible=\{aVista&&showLyrics&&!moving\}/, 'a letra não corre scroll escondida');

console.log('Fila rolada: hold parado, dedo no viewport, bordas e destino certos; cleanup ao fechar.');
