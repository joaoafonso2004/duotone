/**
 * A cache do perfil -- src/lib/cachePerfil.ts.
 *
 * O que se prende aqui é o que faltava: o ecrã do perfil monta no arranque
 * (o navegador do iPhone tem `lazy: false`), antes de o aquecimento acabar, e
 * lia a cache uma vez só. Quem está montado tem de ser avisado quando o perfil
 * chega -- senão o perfil só carregava ao tocar no separador (13/9).
 *
 * Correr: node --experimental-strip-types scripts/test-cache-do-perfil.ts
 */
import assert from 'node:assert/strict';
import {
  guardarPerfil, limparCachePerfil, ouvirPerfis, perfilEmCache, type PerfilEmCache,
} from '../src/lib/cachePerfil.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

const dados: PerfilEmCache = {
  perfil: { nome: 'joao' }, most: [], recent: [], playlists: [],
  guardadas: new Set<string>(), highlights: null, highlightsLidos: false,
};

console.log('\nquem já está montado é avisado');

caso('guardar avisa quem ouve, com o id certo', () => {
  limparCachePerfil();
  const avisados: string[] = [];
  const parar = ouvirPerfis((id) => avisados.push(id));
  guardarPerfil('eu', dados);
  parar();
  assert.deepEqual(avisados, ['eu']);
  assert.ok(perfilEmCache('eu'), 'e o perfil fica lá para ser pintado');
});

caso('parar de ouvir deixa de avisar', () => {
  limparCachePerfil();
  const avisados: string[] = [];
  const parar = ouvirPerfis((id) => avisados.push(id));
  parar();
  guardarPerfil('eu', dados);
  assert.deepEqual(avisados, []);
});

caso('um ouvinte que rebenta não cala os outros', () => {
  limparCachePerfil();
  const avisados: string[] = [];
  const pararMau = ouvirPerfis(() => { throw new Error('partido'); });
  const pararBom = ouvirPerfis((id) => avisados.push(id));
  guardarPerfil('eu', dados);
  pararMau(); pararBom();
  assert.deepEqual(avisados, ['eu']);
});

caso('limpar a conta apaga o que lá estava', () => {
  guardarPerfil('eu', dados);
  limparCachePerfil();
  assert.equal(perfilEmCache('eu'), null);
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');
