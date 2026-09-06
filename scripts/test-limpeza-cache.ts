// Quem sai quando o cache passa do limite.
//
// É a única decisão da app que apaga música do telemóvel. O caso que interessa
// mais não é o de libertar espaço — é o de NÃO apagar o que foi fixado, mesmo
// que isso deixe o cache acima do limite.
import assert from 'node:assert/strict';
import { escolherParaApagar, type FicheiroEmCache } from '../src/lib/limpezaDoCache.ts';

const MB = 1024 * 1024;
const f = (id: string, mb: number, dia: number): FicheiroEmCache => ({
  id,
  bytes: mb * MB,
  modificadoEm: Date.UTC(2026, 0, dia),
});

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

console.log('Limpeza do cache:');

verificar('nada é apagado enquanto couber', () => {
  const ficheiros = [f('a', 100, 1), f('b', 100, 2)];
  assert.deepEqual(escolherParaApagar(ficheiros, [], 500 * MB), []);
});

verificar('exatamente no limite também não apaga', () => {
  assert.deepEqual(escolherParaApagar([f('a', 500, 1)], [], 500 * MB), []);
});

verificar('saem os mais antigos primeiro', () => {
  const ficheiros = [f('novo', 200, 9), f('velho', 200, 1), f('medio', 200, 5)];
  assert.deepEqual(escolherParaApagar(ficheiros, [], 500 * MB), ['velho']);
});

verificar('para assim que couber, não apaga a mais', () => {
  const ficheiros = [f('a', 200, 1), f('b', 200, 2), f('c', 200, 3), f('d', 200, 4)];
  // 800 MB para um limite de 500: chega tirar dois (400 MB).
  assert.deepEqual(escolherParaApagar(ficheiros, [], 500 * MB), ['a', 'b']);
});

verificar('o que está fixado nunca sai', () => {
  const ficheiros = [f('fixado', 400, 1), f('outro', 300, 2)];
  const apagar = escolherParaApagar(ficheiros, ['fixado'], 500 * MB);
  assert.deepEqual(apagar, ['outro']);
  assert.equal(apagar.includes('fixado'), false);
});

verificar('fica acima do limite antes de apagar um fixado', () => {
  // Tudo fixado e tudo acima do limite: mais vale ficar cheio do que apagar o
  // que a pessoa guardou de propósito para uma viagem.
  const ficheiros = [f('a', 400, 1), f('b', 400, 2)];
  assert.deepEqual(escolherParaApagar(ficheiros, ['a', 'b'], 500 * MB), []);
});

verificar('a fila a tocar também é protegida', () => {
  const ficheiros = [f('aTocar', 400, 1), f('antiga', 300, 2)];
  assert.deepEqual(escolherParaApagar(ficheiros, ['aTocar'], 500 * MB), ['antiga']);
});

verificar('sem ficheiros não há nada a decidir', () => {
  assert.deepEqual(escolherParaApagar([], ['x'], 500 * MB), []);
});

verificar('tamanhos negativos não abrem buracos na conta', () => {
  const ficheiros: FicheiroEmCache[] = [
    { id: 'mau', bytes: -100, modificadoEm: 1 },
    f('bom', 600, 2),
  ];
  assert.deepEqual(escolherParaApagar(ficheiros, [], 500 * MB), ['mau', 'bom']);
});

verificar('não altera a lista que recebe', () => {
  const ficheiros = [f('novo', 400, 9), f('velho', 400, 1)];
  escolherParaApagar(ficheiros, [], 100 * MB);
  assert.deepEqual(ficheiros.map((x) => x.id), ['novo', 'velho'], 'a ordem de quem chama mudou');
});

if (falhas > 0) { console.error(`\n${falhas} teste(s) falharam`); process.exit(1); }
console.log('\nLimpeza do cache: todos os casos passaram.');
