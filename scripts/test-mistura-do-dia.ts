/**
 * A Daily mix -- src/lib/misturaDoDia.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-mistura-do-dia.ts
 */
import assert from 'node:assert/strict';
import {
  GUARDAR_EM_WIFI, MUSICAS_DA_MISTURA, TETO_DE_UMA_ANCORA, ancorasDoDia, comporMistura, diaDe, faixasParaGuardar,
  lugaresPorAncora, misturaGuardada, pesoDaIdade, tetoNasFatias,
} from '../src/lib/misturaDoDia.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

const yt = (id: string) => ({ source: 'youtube', sourceId: id });
const wifi = { offline: false, dadosMoveis: false };

console.log('\no dia');

caso('muda uma vez por dia e é o mesmo durante o dia inteiro', () => {
  const dia = 86_400_000;
  assert.equal(diaDe(5 * dia), 5);
  assert.equal(diaDe(5 * dia + dia - 1), 5);
  assert.equal(diaDe(6 * dia), 6);
});

console.log('\na mistura guardada');

caso('só serve se for deste dia e tiver faixas', () => {
  assert.deepEqual(misturaGuardada({ dia: 7, faixas: [yt('a')] }, 7), [yt('a')]);
  assert.equal(misturaGuardada({ dia: 6, faixas: [yt('a')] }, 7), null, 'a de ontem não serve');
  assert.equal(misturaGuardada({ dia: 7, faixas: [] }, 7), null, 'vazia não se fixa o dia inteiro');
  assert.equal(misturaGuardada(null, 7), null);
  assert.equal(misturaGuardada({ dia: 7, faixas: 'x' }, 7), null);
});

console.log('\no que descarregar em segundo plano');

caso('as primeiras da lista, do YouTube, que ainda não estão em disco', () => {
  const lista = [yt('a'), { source: 'spotify', sourceId: 's' }, yt('b'), yt('c')];
  assert.deepEqual(faixasParaGuardar(lista, (id) => id === 'b', wifi).map((f) => f.sourceId), ['a', 'c']);
});

caso('só as primeiras `GUARDAR_EM_WIFI`, que são as que tocam primeiro', () => {
  const lista = Array.from({ length: MUSICAS_DA_MISTURA }, (_, i) => yt(`t${i}`));
  const escolhidas = faixasParaGuardar(lista, () => false, wifi);
  assert.equal(escolhidas.length, GUARDAR_EM_WIFI);
  assert.equal(escolhidas[0].sourceId, 't0');
  assert.ok(GUARDAR_EM_WIFI < MUSICAS_DA_MISTURA, 'não se descarrega a mistura inteira por conta');
});

caso('nada sem rede, nada em dados móveis', () => {
  assert.deepEqual(faixasParaGuardar([yt('a')], () => false, { offline: true, dadosMoveis: false }), []);
  assert.deepEqual(faixasParaGuardar([yt('a')], () => false, { offline: false, dadosMoveis: true }), []);
});

caso('uma faixa repetida na lista não se descarrega duas vezes', () => {
  assert.deepEqual(faixasParaGuardar([yt('a'), yt('a')], () => false, wifi).length, 1);
});

console.log('\nde onde vêm as músicas (26/9)');

const H = 3_600_000;
const AGORA = 1_000 * 86_400_000;
const escuta = (chave: string, horas: number) => ({ chave, nome: chave.toUpperCase(), em: AGORA - horas * H });

caso('o que se ouviu ontem pesa mais do que o da semana passada', () => {
  assert.ok(pesoDaIdade(20 * H) > pesoDaIdade(60 * H));
  assert.ok(pesoDaIdade(60 * H) > pesoDaIdade(150 * H));
  assert.equal(pesoDaIdade(200 * H), 0, 'mais de uma semana não conta');
});

caso('um dia de uma coisa só dá mais desse lado, mas não tudo', () => {
  // Ontem: 20 escutas de rap; há cinco dias: 4 de fado e 4 de rock.
  const recentes = [
    ...Array.from({ length: 20 }, () => escuta('rap', 18)),
    ...Array.from({ length: 4 }, () => escuta('fado', 120)),
    ...Array.from({ length: 4 }, () => escuta('rock', 130)),
  ];
  const a = ancorasDoDia(recentes, [], AGORA);
  assert.equal(a[0].chave, 'rap', 'o de ontem vem à frente');
  assert.ok(a[0].peso > a[1].peso, 'e leva mais');
  assert.ok(a[0].peso <= TETO_DE_UMA_ANCORA + 1e-9, `mas não passa do teto (${a[0].peso})`);
  assert.ok(a.some((x) => x.chave === 'fado') && a.some((x) => x.chave === 'rock'), 'o resto continua lá');
  assert.ok(Math.abs(a.reduce((s, x) => s + x.peso, 0) - 1) < 1e-9, 'as fatias somam 1');
});

caso('o perfil de sempre entra, mas atrás do que se anda a ouvir', () => {
  const a = ancorasDoDia([escuta('novo', 10), escuta('novo', 12)], [{ chave: 'antigo', nome: 'Antigo', escutas: 400 }], AGORA);
  assert.deepEqual(a.map((x) => x.chave), ['novo', 'antigo']);
});

caso('sem escutas recentes, parte do perfil; sem nada, não há âncoras', () => {
  assert.deepEqual(ancorasDoDia([], [{ chave: 'x', nome: 'X', escutas: 9 }], AGORA).map((a) => a.chave), ['x']);
  assert.deepEqual(ancorasDoDia([], [], AGORA), []);
});

caso('o teto reparte o excesso pelos outros', () => {
  const f = tetoNasFatias([100, 1, 1, 1, 1], 0.4);
  assert.ok(Math.abs(f[0] - 0.4) < 1e-9);
  assert.ok(Math.abs(f.reduce((s, v) => s + v, 0) - 1) < 1e-9);
});

caso('cada âncora leva pelo menos um lugar, e os lugares somam o total', () => {
  const l = lugaresPorAncora([0.4, 0.3, 0.2, 0.05, 0.05], 30);
  assert.equal(l.reduce((s, v) => s + v, 0), 30);
  assert.ok(l.every((v) => v >= 1));
  assert.ok(l[0] > l[4]);
});

console.log('\na mistura montada');

const faixas = (lado: string, tipo: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `${lado}-${tipo}${i}`, lado, nova: tipo === 'n' }));
type F = ReturnType<typeof faixas>[number];
const ANC = [{ chave: 'rap', nome: 'Rap', peso: 0.4 }, { chave: 'fado', nome: 'Fado', peso: 0.35 }, { chave: 'rock', nome: 'Rock', peso: 0.25 }];
const novas = new Map(ANC.map((a) => [a.chave, faixas(a.chave, 'n', 20)]));
const conhecidas = new Map(ANC.map((a) => [a.chave, faixas(a.chave, 'c', 20)]));

caso('60% novas, repartidas pelo peso de cada lado', () => {
  const mix = comporMistura<F>(ANC, novas, conhecidas, 30, (f) => f.id);
  assert.equal(mix.length, 30);
  const nNovas = mix.filter((f) => f.nova).length;
  assert.ok(nNovas >= 16 && nNovas <= 20, `novas: ${nNovas}`);
  const doRap = mix.filter((f) => f.lado === 'rap').length;
  const doRock = mix.filter((f) => f.lado === 'rock').length;
  assert.ok(doRap > doRock, `rap ${doRap}, rock ${doRock}`);
  assert.equal(new Set(mix.map((f) => f.id)).size, 30, 'nada repetido');
});

caso('abre com uma conhecida e não põe dois do mesmo lado seguidos', () => {
  const mix = comporMistura<F>(ANC, novas, conhecidas, 30, (f) => f.id);
  assert.equal(mix[0].nova, false);
  for (let i = 1; i < mix.length; i++) {
    // A troca da primeira pode criar uma repetição no início; o resto não.
    if (i > 1) assert.notEqual(mix[i].lado, mix[i - 1].lado, `posições ${i - 1} e ${i}`);
  }
});

caso('um lado sem novas é tapado pelas conhecidas dele e pelos outros', () => {
  const pobres = new Map(novas);
  pobres.set('rap', []);
  const mix = comporMistura<F>(ANC, pobres, conhecidas, 30, (f) => f.id);
  assert.equal(mix.length, 30);
  assert.ok(mix.some((f) => f.lado === 'rap'), 'o lado do rap continua, com as conhecidas');
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');
