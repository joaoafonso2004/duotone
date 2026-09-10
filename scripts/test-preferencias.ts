// As preferencias de recomendacao, em Node puro.
//
// O que se garante aqui e a SIMETRIA: o sistema sabia dizer que nao de duas
// maneiras e nao sabia dizer que sim de nenhuma. E, sobretudo, que nao se pode
// ficar com as duas opinioes sobre o mesmo artista ao mesmo tempo.
import assert from 'node:assert/strict';
import {
  ajustarSugestoes, ESCUTAS_DE_UM_PREFERIDO, PESO_A_MAIS, PESO_A_MENOS,
  pesoDoArtista, preferidos, type Feedback,
} from '../src/lib/recommendationFeedback.ts';

const f = (id: string, artista: string) => ({ id, artista });
const chaveDaFaixa = (t: { id: string }) => t.id;
const chaveDoArtista = (t: { artista: string }) => t.artista;

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

verificar('sem preferencias, nada se mexe', () => {
  const lista = [f('1', 'a'), f('2', 'b')];
  assert.deepEqual(ajustarSugestoes(lista, [], chaveDaFaixa, chaveDoArtista), lista);
});

verificar('uma faixa bloqueada sai', () => {
  const prefs: Feedback[] = [{ kind: 'track', key: '1', label: 'x' }];
  const r = ajustarSugestoes([f('1', 'a'), f('2', 'b')], prefs, chaveDaFaixa, chaveDoArtista);
  assert.deepEqual(r.map((t) => t.id), ['2']);
});

verificar('um artista a menos desce, e so uma faixa dele sobrevive', () => {
  const prefs: Feedback[] = [{ kind: 'artist', key: 'a', label: 'A' }];
  const lista = [f('1', 'a'), f('2', 'a'), f('3', 'b')];
  const r = ajustarSugestoes(lista, prefs, chaveDaFaixa, chaveDoArtista);
  assert.deepEqual(r.map((t) => t.id), ['3', '1']);
});

verificar('um artista a MAIS sobe a frente', () => {
  const prefs: Feedback[] = [{ kind: 'artist_more', key: 'b', label: 'B' }];
  const lista = [f('1', 'a'), f('2', 'b'), f('3', 'a'), f('4', 'b')];
  const r = ajustarSugestoes(lista, prefs, chaveDaFaixa, chaveDoArtista);
  assert.deepEqual(r.map((t) => t.id), ['2', '4', '1', '3']);
});

verificar('e ao contrario do "menos", nao ha tecto de uma por artista', () => {
  const prefs: Feedback[] = [{ kind: 'artist_more', key: 'a', label: 'A' }];
  const lista = [f('1', 'a'), f('2', 'a'), f('3', 'a')];
  assert.equal(ajustarSugestoes(lista, prefs, chaveDaFaixa, chaveDoArtista).length, 3);
});

verificar('subir nao e inventar: so entra o que ja estava na lista', () => {
  const prefs: Feedback[] = [{ kind: 'artist_more', key: 'z', label: 'Z' }];
  const lista = [f('1', 'a'), f('2', 'b')];
  const r = ajustarSugestoes(lista, prefs, chaveDaFaixa, chaveDoArtista);
  assert.deepEqual(r.map((t) => t.id), ['1', '2']);
});

verificar('os tres montes convivem, e a ordem entre eles e que manda', () => {
  const prefs: Feedback[] = [
    { kind: 'artist_more', key: 'c', label: 'C' },
    { kind: 'artist', key: 'a', label: 'A' },
    { kind: 'track', key: '9', label: 'X' },
  ];
  const lista = [f('9', 'b'), f('1', 'a'), f('2', 'b'), f('3', 'c')];
  const r = ajustarSugestoes(lista, prefs, chaveDaFaixa, chaveDoArtista);
  assert.deepEqual(r.map((t) => t.id), ['3', '2', '1'], 'preferido, normal, reduzido -- e o bloqueado fora');
});

verificar('o peso e um multiplicador, e o de um artista qualquer e um', () => {
  assert.equal(pesoDoArtista([], 'a'), 1);
  assert.equal(pesoDoArtista([{ kind: 'artist', key: 'a', label: 'A' }], 'a'), PESO_A_MENOS);
  assert.equal(pesoDoArtista([{ kind: 'artist_more', key: 'a', label: 'A' }], 'a'), PESO_A_MAIS);
});

verificar('tirar custa mais do que por -- de proposito', () => {
  // Simetrico seria 4x, e 4x esmagava o retrato: o peso normal e a RAIZ das
  // escutas, por isso 4 bate um artista com dezasseis vezes mais reproducoes.
  assert.ok(PESO_A_MAIS < 1 / PESO_A_MENOS, 'o positivo e mais contido que o negativo');
  assert.ok(PESO_A_MAIS > 1, 'mas e mesmo um aumento');
});

verificar('uma faixa de um artista bloqueado NAO e salva por ele ser preferido', () => {
  // O bloqueio e por faixa e ganha sempre: e a escolha mais especifica.
  const prefs: Feedback[] = [
    { kind: 'artist_more', key: 'a', label: 'A' },
    { kind: 'track', key: '1', label: 'X' },
  ];
  const r = ajustarSugestoes([f('1', 'a'), f('2', 'a')], prefs, chaveDaFaixa, chaveDoArtista);
  assert.deepEqual(r.map((t) => t.id), ['2']);
});

verificar('os preferidos saem com o nome como esta escrito', () => {
  const prefs: Feedback[] = [
    { kind: 'artist_more', key: 'juice wrld', label: 'Juice WRLD' },
    { kind: 'artist', key: 'outro', label: 'Outro' },
  ];
  assert.deepEqual(preferidos(prefs), [{ chave: 'juice wrld', nome: 'Juice WRLD' }]);
});

verificar('um preferido comeca a valer alguma coisa, e nao zero', () => {
  // E o ponto todo: o peso MULTIPLICA, e um artista fora da biblioteca vale
  // zero. Sem um valor de partida, dizer "mais destas" a uma descoberta nao
  // fazia nada.
  assert.ok(ESCUTAS_DE_UM_PREFERIDO > 0);
  assert.ok(Math.sqrt(ESCUTAS_DE_UM_PREFERIDO) * PESO_A_MAIS > 1);
});

console.log(falhas === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
