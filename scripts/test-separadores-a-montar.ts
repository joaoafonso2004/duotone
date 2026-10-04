/**
 * Os separadores montam-se depois da abertura, do mais perto ao mais longe
 * (src/lib/separadoresAMontar.ts), e o navegador está ligado assim.
 *
 * Correr: node --experimental-strip-types scripts/test-separadores-a-montar.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { proximoAMontar } from '../src/lib/separadoresAMontar.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

const rotas = ['Search', 'Songs', 'Artists', 'Playlists', 'Profile', 'Social'].map((name) => ({ key: `${name}-1`, name }));

caso('a partir da Home: as vizinhas já estão, e o resto vai do mais perto ao mais longe', () => {
  const pedidos = new Set<string>();
  const ordem: string[] = [];
  for (let n = proximoAMontar(rotas, 0, pedidos); n; n = proximoAMontar(rotas, 0, pedidos)) {
    ordem.push(n);
    pedidos.add(n);
  }
  assert.deepEqual(ordem, ['Artists', 'Playlists', 'Profile', 'Social']);
});
caso('sem rede abre nas Songs: monta os dois lados por distância', () => {
  const pedidos = new Set<string>();
  const ordem: string[] = [];
  for (let n = proximoAMontar(rotas, 1, pedidos); n; n = proximoAMontar(rotas, 1, pedidos)) { ordem.push(n); pedidos.add(n); }
  assert.deepEqual(ordem, ['Playlists', 'Profile', 'Social']);
});
caso('o que já foi pedido não se pede outra vez', () => {
  assert.equal(proximoAMontar(rotas, 0, new Set(['Artists', 'Playlists', 'Profile', 'Social'])), null);
});

caso('o navegador é lazy com a vizinha pronta, e a barra monta o resto depois da abertura', () => {
  const nav = readFileSync('src/navigation/RootNavigator.tsx', 'utf8');
  assert.match(nav, /lazy: true/);
  assert.match(nav, /lazyPreloadDistance: 1/);
  const barra = readFileSync('src/navigation/BarraDeSeparadores.tsx', 'utf8');
  assert.match(barra, /useAbertura\(\(s\) => s\.aFrente\)/);
  assert.match(barra, /navigation\.preload\(/);
});

if (falhas) { console.error(`\n  ${falhas} caso(s) falharam.\n`); process.exit(1); }
console.log('\n  Todos os casos passaram.\n');
