// Retrospetiva do ano, a partir do histórico que já existe.
import assert from 'node:assert/strict';
import {
  anosComReproducoes, calcularRetrospetiva, descreverHora,
} from '../src/lib/retrospetiva.ts';
import type { PlayRow } from '../src/lib/listeningStats.ts';

/** `quando` é hora LOCAL de propósito: é assim que a app agrupa os dias. */
function play(quando: string, titulo: string, artista: string | null, segundos = 180): PlayRow {
  return {
    playedAt: new Date(quando).toISOString(),
    source: 'youtube',
    sourceId: titulo.toLowerCase().replace(/\W/g, ''),
    title: titulo,
    artist: artista,
    artworkUrl: null,
    durationSeconds: segundos,
  };
}

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

console.log('Retrospetiva:');

const historico: PlayRow[] = [
  play('2025-03-02 14:00', 'Antiga', 'Velho Conhecido'),
  play('2026-01-10 23:30', 'Uma', 'Velho Conhecido'),
  play('2026-02-14 23:10', 'Uma', 'Velho Conhecido'),
  play('2026-02-15 23:45', 'Duas', 'Nome Novo'),
  play('2026-02-20 09:00', 'Duas', 'Nome Novo'),
  play('2026-02-21 23:05', 'Duas', 'Nome Novo'),
  play('2026-07-04 18:00', 'Três', null),
];

verificar('os anos saem do mais recente para o mais antigo', () => {
  assert.deepEqual(anosComReproducoes(historico), [2026, 2025]);
});

verificar('só conta as reproduções do ano pedido', () => {
  const r = calcularRetrospetiva(historico, 2026);
  assert.equal(r.base.totalPlays, 6, 'a de 2025 entrou no total de 2026');
  assert.equal(calcularRetrospetiva(historico, 2025).base.totalPlays, 1);
});

verificar('o mês maior é o que tem mais reproduções', () => {
  const r = calcularRetrospetiva(historico, 2026);
  assert.equal(r.mesMaior?.nome, 'fevereiro');
  assert.equal(r.mesMaior?.reproducoes, 4);
});

verificar('a hora preferida é a mais repetida', () => {
  const r = calcularRetrospetiva(historico, 2026);
  assert.equal(r.horaPreferida?.hora, 23);
  assert.equal(r.horaPreferida?.reproducoes, 4);
});

verificar('só é descoberta quem nunca tinha sido ouvido antes', () => {
  const r = calcularRetrospetiva(historico, 2026);
  // "Velho Conhecido" já tinha sido ouvido em 2025; "Nome Novo" estreia-se
  // em 2026. O null não conta como artista.
  assert.equal(r.artistasDescobertos, 1);
});

verificar('quem se estreia no próprio ano conta nesse ano', () => {
  assert.equal(calcularRetrospetiva(historico, 2025).artistasDescobertos, 1);
});

verificar('os tops batem certo', () => {
  const r = calcularRetrospetiva(historico, 2026);
  assert.equal(r.base.topFaixas === undefined, true, 'a base é a do computeStats');
  assert.equal(r.base.topTracks[0]!.title, 'Duas');
  assert.equal(r.base.topTracks[0]!.plays, 3);
  assert.equal(r.base.topArtists[0]!.name, 'Nome Novo');
  assert.equal(r.base.uniqueArtists, 2, 'o artista nulo não devia contar');
});

verificar('um ano sem nada não finge que tem', () => {
  const r = calcularRetrospetiva(historico, 2020);
  assert.equal(r.temDados, false);
  assert.equal(r.base.totalPlays, 0);
  assert.equal(r.mesMaior, null);
  assert.equal(r.horaPreferida, null);
  assert.equal(r.artistasDescobertos, 0);
});

verificar('datas inválidas não rebentam nem contam', () => {
  const sujo: PlayRow[] = [...historico, { ...play('2026-01-01 10:00', 'Má', 'X'), playedAt: 'não é uma data' }];
  const r = calcularRetrospetiva(sujo, 2026);
  assert.equal(r.base.totalPlays, 6);
  assert.deepEqual(anosComReproducoes(sujo), [2026, 2025]);
});

verificar('a hora é escrita como se diz', () => {
  assert.equal(descreverHora(0), 'à meia-noite');
  assert.equal(descreverHora(12), 'ao meio-dia');
  assert.equal(descreverHora(23), 'às 23h');
});

if (falhas > 0) { console.error(`\n${falhas} teste(s) falharam`); process.exit(1); }
console.log('\nRetrospetiva: todos os casos passaram.');
