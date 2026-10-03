// Os 120 Hz das animações e as correções de 3/10 depois de testar no iPhone:
// o piscar dos ícones ativos, o mini-player a fechar, o arrasto da fila, o
// equalizador das Definições e as "Songs of the day".
//
// Correr: node scripts/test-fluidez-e-correcoes.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const root = require('node:path').resolve(__dirname, '..');
const ts = require(root + '/node_modules/typescript');
const ler = (f) => fs.readFileSync(root + '/' + f, 'utf8');

let falhas = 0;
const casos = [];
const caso = (nome, fn) => casos.push([nome, fn]);

// ---------------------------------------------------------------- a lógica
const pedidos = [];
const carregarFluidez = () => {
  const code = ts.transpileModule(ler('src/state/fluidez.ts'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const exp = {};
  vm.runInNewContext(code, {
    exports: exp, setTimeout, clearTimeout, Date,
    require: (n) => {
      assert.equal(n, '../../modules/duotone-diagnostico');
      return { definirFluidez: (alta) => pedidos.push(alta) };
    },
  });
  return exp;
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

caso('uma transição liga os 120 Hz e desliga-os no fim', async () => {
  pedidos.length = 0;
  const f = carregarFluidez();
  f.pedirFluidez(40);
  assert.deepEqual(pedidos, [true]);
  f.pedirFluidez(40);
  assert.deepEqual(pedidos, [true], 'um segundo pedido não volta a chamar o nativo');
  await esperar(90);
  assert.deepEqual(pedidos, [true, false]);
  assert.equal(f.fluidezAgora().alta, false);
});
caso('um gesto segura os 120 Hz até largar, e a mola ainda leva uns ms', async () => {
  pedidos.length = 0;
  const f = carregarFluidez();
  const largar = f.segurarFluidez(40);
  f.pedirFluidez(10);
  await esperar(40);
  assert.equal(f.fluidezAgora().alta, true, 'com o dedo no ecrã não desliga');
  largar();
  largar();
  assert.equal(f.fluidezAgora().segurados, 0, 'largar duas vezes não conta duas');
  await esperar(20);
  assert.equal(f.fluidezAgora().alta, true, 'a mola depois de largar');
  await esperar(60);
  assert.deepEqual(pedidos, [true, false]);
});

// ---------------------------------------------------------------- ligado
caso('o Swift pede 120 Hz só ao relógio das animações do React Native', () => {
  const swift = ler('modules/duotone-diagnostico/ios/DuotoneFluidez.swift');
  assert.match(swift, /displayLinkWithTarget:selector:/);
  assert.match(swift, /"stepAnimations:"/);
  assert.match(swift, /CAFrameRateRange\(minimum: 80, maximum: 120, preferred: 120\)/);
  assert.match(ler('modules/duotone-diagnostico/ios/DuotoneDiagnosticoModule.swift'), /Function\("definirFluidez"\)/);
});
caso('pedem os 120 Hz: o leitor, as folhas, a base, os toques, a barra, o arrasto, os avisos, o skip', () => {
  const leitor = ler('src/components/PlayerRoot.tsx');
  assert.match(leitor, /const alvo = expanded && temFaixa \? 1 : 0;\s*\/\/[^\n]*\n\s*pedirFluidez\(900\)/);
  assert.ok((leitor.match(/segurarFluidez\(/g) ?? []).length >= 2, 'os dois gestos do leitor');
  for (const [f, re] of [
    ['src/components/BottomSheet.tsx', /pedirFluidez\(800\)/],
    ['src/components/Doca.tsx', /pedirFluidez\(800\)/],
    ['src/components/Toque.tsx', /pedirFluidez\(450\)/],
    ['src/components/ProgressBar.tsx', /segurarFluidez\(500\)/],
    ['src/hooks/useArrastarLista.ts', /segurarFluidez\(500\)/],
    ['src/components/AvisoDeRemocao.tsx', /pedirFluidez\(700\)/],
    ['src/components/CapaFlutuante3D.tsx', /pedirFluidez\(900\)/],
  ]) assert.match(ler(f), re, f);
});
caso('o coração e o shuffle ativos não piscam com a cor da capa', () => {
  const icone = ler('src/components/StateIcon.tsx');
  assert.match(icone, /\},\[props\.name,reduced\]\);/, 'a cor fora das dependências do efeito');
  assert.doesNotMatch(icone, /previous\.current\.color===props\.color/);
});
caso('o mini-player sai pelo motor nativo, não pelo closeGain', () => {
  const leitor = ler('src/components/PlayerRoot.tsx');
  assert.doesNotMatch(leitor, /usePlayer\(\(s\) => s\.closeGain\)/);
  assert.doesNotMatch(leitor, /1 - closeGain/);
  assert.match(leitor, /useDoca\.setState\(\{ aFechar: true \}\)/, 'o vidro desce com a linha');
  assert.match(ler('src/components/Doca.tsx'), /!!s\.current && !s\.closing/);
});
caso('o arrasto da fila mede dentro da lista (numa folha nativa o ecrã não bate)', () => {
  const hook = ler('src/hooks/useArrastarLista.ts');
  assert.doesNotMatch(hook, /\.measureInWindow\(/);
  assert.match(hook, /vista\.measureLayout\(moldura/);
  assert.match(hook, /limites\.current = \{ topo: 0, fundo: h \}/);
});
caso('o equalizador é do Gesture Handler (a página das Definições já não desliza)', () => {
  const eq = ler('src/components/Equalizador.tsx');
  assert.match(eq, /<PanGestureHandler minDist=\{0\}/);
  assert.doesNotMatch(eq, /PanResponder\.create/);
});
caso('as "Songs of the day" saíram da Home do iPhone', () => {
  assert.doesNotMatch(ler('src/screens/SearchScreen.tsx'), />Songs of the day<|EscolhasDoDia|'daily'/);
  assert.ok(!fs.existsSync(root + '/src/components/EscolhasDoDia.tsx'));
});

(async () => {
  for (const [nome, fn] of casos) {
    try { await fn(); console.log(`  ok - ${nome}`); }
    catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${e.message}`); }
  }
  if (falhas) { console.error(`\n  ${falhas} caso(s) falharam.\n`); process.exit(1); }
  console.log('\n  Fluidez e correções: todos os casos passaram.\n');
})();
