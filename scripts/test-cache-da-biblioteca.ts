/**
 * A cache da biblioteca -- src/lib/cacheDaBiblioteca.ts.
 *
 * O que se prende aqui: que a lista aquecida no arranque é a mesma que as
 * páginas leem (senão o aquecimento não servia de nada), que duas páginas a
 * abrir ao mesmo tempo dão UMA consulta, e que ao trocar de sessão não sobra
 * nada da pessoa anterior.
 *
 * Correr: node --experimental-strip-types scripts/test-cache-da-biblioteca.ts
 */
import assert from 'node:assert/strict';
import {
  VALIDADE_DA_BIBLIOTECA_MS, esquecerBiblioteca, faixasEmCache, guardarFaixas, lerFaixas, ouvirFaixas,
} from '../src/lib/cacheDaBiblioteca.ts';
import type { Track } from '../src/types.ts';

let falhas = 0;
async function caso(nome: string, fn: () => void | Promise<void>): Promise<void> {
  try { await fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

const faixa = (id: string): Track => ({
  source: 'youtube', sourceId: id, title: id, artist: 'Teste',
  album: null, artworkUrl: null, durationSeconds: 180,
});

const AGORA = 1_800_000_000_000;

console.log('\no que o arranque aquece é o que as páginas leem');

await caso('guardado agora, está lá', () => {
  esquecerBiblioteca();
  const leitor = async () => [faixa('a')];
  guardarFaixas(leitor, [faixa('a')], AGORA);
  assert.equal(faixasEmCache(leitor, AGORA)?.length, 1);
});

await caso('passada a validade, já não vale', () => {
  esquecerBiblioteca();
  const leitor = async () => [faixa('a')];
  guardarFaixas(leitor, [faixa('a')], AGORA);
  assert.equal(faixasEmCache(leitor, AGORA + VALIDADE_DA_BIBLIOTECA_MS - 1)?.length, 1);
  assert.equal(faixasEmCache(leitor, AGORA + VALIDADE_DA_BIBLIOTECA_MS + 1), null);
});

await caso('cada leitor tem a sua lista', async () => {
  esquecerBiblioteca();
  const biblioteca = async () => [faixa('a'), faixa('b')];
  const gostadas = async () => [faixa('a')];
  assert.equal((await lerFaixas(biblioteca)).length, 2);
  assert.equal((await lerFaixas(gostadas)).length, 1);
  assert.equal(faixasEmCache(biblioteca)?.length, 2, 'as duas listas não se misturam');
});

console.log('\numa consulta, não três');

await caso('com a cache quente não se vai ao servidor', async () => {
  esquecerBiblioteca();
  let idas = 0;
  const leitor = async () => { idas++; return [faixa('a')]; };
  await lerFaixas(leitor);
  await lerFaixas(leitor);
  await lerFaixas(leitor);
  assert.equal(idas, 1, 'o aquecimento do arranque paga por todas as visitas');
});

await caso('duas páginas a abrir ao mesmo tempo partilham a leitura', async () => {
  esquecerBiblioteca();
  let idas = 0;
  let resolver: (v: Track[]) => void = () => {};
  const leitor = () => { idas++; return new Promise<Track[]>((r) => { resolver = r; }); };
  const a = lerFaixas(leitor);
  const b = lerFaixas(leitor);
  resolver([faixa('a')]);
  assert.deepEqual((await a).map((t) => t.sourceId), ['a']);
  assert.deepEqual((await b).map((t) => t.sourceId), ['a']);
  assert.equal(idas, 1, 'o aquecimento e a página não podem ser duas consultas');
});

await caso('forçar vai ao servidor outra vez', async () => {
  esquecerBiblioteca();
  let idas = 0;
  const leitor = async () => { idas++; return [faixa(`v${idas}`)]; };
  await lerFaixas(leitor);
  const segunda = await lerFaixas(leitor, { forcar: true });
  assert.equal(idas, 2);
  assert.equal(segunda[0].sourceId, 'v2', 'quem refresca vê o novo');
  assert.equal(faixasEmCache(leitor)?.[0].sourceId, 'v2', 'e fica guardado o novo');
});

await caso('uma falha não guarda nada, e tenta outra vez a seguir', async () => {
  esquecerBiblioteca();
  let idas = 0;
  const leitor = async () => {
    idas++;
    if (idas === 1) throw new Error('sem rede');
    return [faixa('a')];
  };
  await assert.rejects(() => lerFaixas(leitor));
  assert.equal(faixasEmCache(leitor), null, 'sem rede não se guarda uma lista vazia');
  assert.equal((await lerFaixas(leitor)).length, 1);
});

console.log('\numa lista velha nunca aterra por cima');

await caso('mudar a biblioteca a meio de uma leitura nao a deixa guardar', async () => {
  esquecerBiblioteca();
  let resolver: (v: Track[]) => void = () => {};
  const leitor = () => new Promise<Track[]>((r) => { resolver = r; });
  const pedido = lerFaixas(leitor);
  // Gostou-se de uma musica enquanto a lista vinha.
  esquecerBiblioteca();
  resolver([faixa('sem-a-nova')]);
  await pedido;
  assert.equal(faixasEmCache(leitor), null,
    'a lista pedida antes da mudanca nao pode ficar guardada meia hora');
});

await caso('quem pediu recebe na mesma o que veio', async () => {
  esquecerBiblioteca();
  let resolver: (v: Track[]) => void = () => {};
  const leitor = () => new Promise<Track[]>((r) => { resolver = r; });
  const pedido = lerFaixas(leitor);
  esquecerBiblioteca();
  resolver([faixa('a')]);
  assert.deepEqual((await pedido).map((t) => t.sourceId), ['a']);
});

await caso('depois da mudanca, a leitura seguinte guarda outra vez', async () => {
  esquecerBiblioteca();
  let idas = 0;
  const leitor = async () => { idas++; return [faixa('v' + idas)]; };
  await lerFaixas(leitor);
  esquecerBiblioteca();
  await lerFaixas(leitor);
  assert.equal(faixasEmCache(leitor)?.[0].sourceId, 'v2', 'a cache volta a funcionar');
});

console.log('\nquem ja esta montado recebe a lista');

await caso('guardar avisa quem ouve, com o leitor certo, e parar cala', async () => {
  esquecerBiblioteca();
  const a = async () => [faixa('a')];
  const b = async () => [faixa('b')];
  const recebidos: string[] = [];
  const parar = ouvirFaixas((leitor, faixas) => { if (leitor === a) recebidos.push(faixas[0].sourceId); });
  await lerFaixas(a);
  await lerFaixas(b);
  parar();
  await lerFaixas(a, { forcar: true });
  assert.deepEqual(recebidos, ['a'], 'so a lista dele, e so enquanto ouvia');
});

await caso('um ouvinte que rebenta nao estraga a leitura', async () => {
  esquecerBiblioteca();
  const a = async () => [faixa('a')];
  const parar = ouvirFaixas(() => { throw new Error('partido'); });
  assert.equal((await lerFaixas(a)).length, 1);
  assert.equal(faixasEmCache(a)?.length, 1, 'e fica guardada na mesma');
  parar();
});

console.log('\nao trocar de conta não sobra nada');

await caso('esquecer apaga tudo', async () => {
  esquecerBiblioteca();
  const leitor = async () => [faixa('a')];
  await lerFaixas(leitor);
  esquecerBiblioteca();
  assert.equal(faixasEmCache(leitor), null, 'a biblioteca de quem sai não aparece a quem entra');
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');
