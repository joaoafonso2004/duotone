// O ciclo de vida REAL dos efeitos do Smart Cache, sem montar motores iOS.
// Extrai os callbacks por AST e executa setup/cleanup como o React: a limpeza
// da renderização anterior corre antes do setup da seguinte. O AbortSignal é
// real: voltar a pôr abandonado=false não desfaz um abort() já entregue.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const file = new URL('../src/components/YouTubePlayerView.tsx', import.meta.url);
const source = ts.createSourceFile(file.pathname, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let smartCache, montagem;
function visitar(node) {
  if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect') {
    const callback = node.arguments[0];
    const texto = callback?.getText(source) ?? '';
    if (texto.includes('const servem =') && texto.includes('aAdiantar')) smartCache = callback;
    if (texto.includes('isMountedRef.current = false')) montagem = callback;
  }
  ts.forEachChild(node, visitar);
}
visitar(source);
assert.ok(smartCache && montagem, 'não encontrou os efeitos reais do player');

function leitor(atual, proximas, adiantadas) {
  let seguinteTimer = 0;
  const timers = new Map();
  const pedidos = new Map(adiantadas.map(id => [id, {
    abandonado: false, pronto: new Promise(() => {}), controller: new AbortController(),
  }]));
  const contexto = {
    backend: 'native', track: { sourceId: atual }, proximas,
    aAdiantar: pedidos, isMountedRef: { current: true },
    usePlayer: { getState: () => ({ proximasFaixas: () => contexto.proximas.map(sourceId => ({ sourceId })) }) },
    useConnectivity: { getState: () => ({ dadosMoveis: false, offline: false }) },
    quantasAdiantar: () => 3, preCarregarCapasGrandes: () => {},
    verificarCancelamentos: () => {
      for (const pedido of pedidos.values()) if (pedido.abandonado) pedido.controller.abort();
    },
    setTimeout: callback => { const id = ++seguinteTimer; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
  };
  vm.createContext(contexto);
  const codigo = ts.transpileModule(
    `globalThis.smartCache = ${smartCache.getText(source)}; globalThis.montagem = ${montagem.getText(source)};`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  vm.runInContext(codigo, contexto, { filename: file.pathname });
  const desmontar = contexto.montagem();
  let limpar = contexto.smartCache();
  return {
    pedidos, timers,
    render(atual, proximas, backend) {
      contexto.track = { sourceId: atual };
      contexto.proximas = proximas;
      contexto.backend = backend;
      limpar?.();
      limpar = contexto.smartCache();
    },
    desmontar() { desmontar(); limpar?.(); },
  };
}

let falhas = 0;
function caso(nome, testar) {
  try { testar(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}: ${e.message}`); }
}

caso('A → B adota B sem abortar o pedido entre cleanup e setup', () => {
  const l = leitor('a', ['b', 'c'], ['b', 'c']);
  l.render('b', ['c', 'd'], 'native');
  assert.equal(l.pedidos.get('b').controller.signal.aborted, false, 'abortar é irreversível, mesmo que o setup reponha abandonado=false');
  assert.equal(l.pedidos.get('c').controller.signal.aborted, false, 'a próxima continua a servir enquanto o motor está pronto');
});

caso('resolver B preserva B e larga C para a faixa atual poder começar', () => {
  const l = leitor('a', ['b', 'c'], ['b', 'c']);
  l.render('b', ['c', 'd'], 'resolving');
  assert.equal(l.pedidos.get('b').abandonado, false, 'a reprodução precisa deste mesmo download');
  assert.equal(l.pedidos.get('b').controller.signal.aborted, false);
  assert.equal(l.pedidos.get('c').abandonado, true, 'uma próxima ainda útil não pode ocupar a única vaga enquanto B espera');
  assert.equal(l.pedidos.get('c').controller.signal.aborted, true, 'o abandono deve ser comunicado já');
  assert.equal(l.timers.size, 0, 'não começa adiantamentos novos enquanto resolve');
});

caso('recalcular a mesma fila preserva os pedidos que ainda servem', () => {
  const l = leitor('a', ['b', 'c'], ['b', 'c']);
  l.render('a', ['b', 'c'], 'native');
  for (const pedido of l.pedidos.values()) assert.equal(pedido.controller.signal.aborted, false);
  assert.equal(l.timers.size, 1, 'só deve sobrar o timer da renderização atual');
});

caso('salto A → X abandona B e avisa imediatamente, mesmo a resolver', () => {
  const l = leitor('a', ['b', 'c'], ['b', 'c']);
  l.render('x', ['y', 'z'], 'resolving');
  for (const pedido of l.pedidos.values()) {
    assert.equal(pedido.abandonado, true);
    assert.equal(pedido.controller.signal.aborted, true);
  }
});

caso('desmontar abandona tudo e limpa o timer', () => {
  const l = leitor('a', ['b', 'c'], ['b', 'c']);
  l.desmontar();
  for (const pedido of l.pedidos.values()) {
    assert.equal(pedido.abandonado, true);
    assert.equal(pedido.controller.signal.aborted, true);
  }
  assert.equal(l.timers.size, 0);
});

if (falhas) process.exitCode = 1;
else console.log('Smart Cache: todos os casos passaram.');
