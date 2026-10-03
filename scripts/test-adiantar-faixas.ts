/**
 * Que músicas ficam prontas antes de chegar a vez delas -- src/lib/adiantarFaixas.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-adiantar-faixas.ts
 */
import assert from 'node:assert/strict';
import {
  ADIANTAR_EM_DADOS_MOVEIS, ADIANTAR_EM_WIFI, faixasParaAdiantar, podeDescarregarOpcionais, quantasAdiantar,
} from '../src/lib/adiantarFaixas.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

const yt = (id: string) => ({ source: 'youtube', sourceId: id });
const ids = (l: { sourceId: string }[]) => l.map((t) => t.sourceId);

console.log('\nquantas');

caso('com a app escondida, só a seguinte, e a Daily mix espera (3/10)', () => {
  assert.equal(quantasAdiantar(false, null, false), 1);
  assert.equal(quantasAdiantar(true, null, false), 1);
  assert.equal(quantasAdiantar(false, null, true), ADIANTAR_EM_WIFI);
  assert.equal(podeDescarregarOpcionais(null, false), false);
  assert.equal(podeDescarregarOpcionais(null, true), true);
});

caso('três em Wi-Fi, menos em dados móveis', () => {
  assert.equal(quantasAdiantar(false), ADIANTAR_EM_WIFI);
  assert.equal(quantasAdiantar(true), ADIANTAR_EM_DADOS_MOVEIS);
  assert.ok(ADIANTAR_EM_DADOS_MOVEIS < ADIANTAR_EM_WIFI, 'dados móveis não pode adiantar mais do que Wi-Fi');
  assert.ok(ADIANTAR_EM_DADOS_MOVEIS >= 1, 'a seguinte tem de estar sempre pronta: o crossfade depende dela');
});

console.log('\nquente ou em modo de poupança (2/10)');

const energia = (termico: string, poupanca = false) => ({ termico, poupanca }) as any;

caso('sem saber nada do aparelho, fica tudo como sempre', () => {
  assert.equal(quantasAdiantar(false, null), ADIANTAR_EM_WIFI);
  assert.equal(quantasAdiantar(true), ADIANTAR_EM_DADOS_MOVEIS);
  assert.equal(quantasAdiantar(false, energia('nominal')), ADIANTAR_EM_WIFI);
  assert.equal(quantasAdiantar(false, energia('unknown')), ADIANTAR_EM_WIFI);
  assert.equal(podeDescarregarOpcionais(null), true);
  assert.equal(podeDescarregarOpcionais(energia('nominal')), true);
});

caso('morno (fair): uma a menos, e a Daily mix espera', () => {
  assert.equal(quantasAdiantar(false, energia('fair')), ADIANTAR_EM_WIFI - 1);
  assert.equal(quantasAdiantar(true, energia('fair')), ADIANTAR_EM_DADOS_MOVEIS - 1);
  assert.equal(podeDescarregarOpcionais(energia('fair')), false);
});

caso('quente ou em poupança: só a seguinte, nunca nenhuma', () => {
  for (const e of [energia('serious'), energia('critical'), energia('nominal', true), energia('fair', true)]) {
    assert.equal(quantasAdiantar(false, e), 1, JSON.stringify(e));
    assert.equal(quantasAdiantar(true, e), 1, JSON.stringify(e));
    assert.equal(podeDescarregarOpcionais(e), false, JSON.stringify(e));
  }
});

caso('nunca adianta mais do que o normal, e nunca menos de uma', () => {
  for (const termico of ['nominal', 'fair', 'serious', 'critical', 'unknown'])
    for (const poupanca of [false, true])
      for (const dados of [false, true]) {
        const n = quantasAdiantar(dados, energia(termico, poupanca));
        assert.ok(n >= 1 && n <= quantasAdiantar(dados), `${termico} ${poupanca} ${dados}: ${n}`);
      }
});

console.log('\nquais');

caso('a primeira é a próxima, e as outras seguem a ordem da fila', () => {
  const lista = faixasParaAdiantar(yt('b'), [yt('b'), yt('c'), yt('d'), yt('e')], 'a', 3);
  assert.deepEqual(ids(lista), ['b', 'c', 'd']);
});

caso('a que está a tocar e as repetidas não contam', () => {
  const lista = faixasParaAdiantar(yt('b'), [yt('a'), yt('b'), yt('c'), yt('c'), yt('d')], 'a', 3);
  assert.deepEqual(ids(lista), ['b', 'c', 'd']);
});

caso('só YouTube: o resto não descarrega', () => {
  const spotify = { source: 'spotify', sourceId: 'x' };
  const lista = faixasParaAdiantar(yt('b'), [spotify, yt('c')], 'a', 3);
  assert.deepEqual(ids(lista), ['b', 'c']);
});

caso('sem próxima não se adivinha nada (repeat one, shuffle sem percurso)', () => {
  assert.deepEqual(faixasParaAdiantar(null, [yt('c'), yt('d')], 'a', 3), []);
});

caso('uma fila de uma faixa só não adianta a própria', () => {
  assert.deepEqual(faixasParaAdiantar(yt('a'), [], 'a', 3), []);
});

caso('nunca passa do número pedido', () => {
  assert.equal(faixasParaAdiantar(yt('b'), [yt('c'), yt('d'), yt('e')], 'a', 2).length, 2);
  assert.deepEqual(faixasParaAdiantar(yt('b'), [yt('c')], 'a', 0), []);
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');
