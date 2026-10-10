// Os novos lançamentos dos teus artistas (10/10).
// Correr: node --experimental-strip-types scripts/test-novos-lancamentos.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  anoRecente, artistasComNovidade, escolherArtistas, lerMemoria, limparNovos, marcarAberto, memoriaVazia,
  NOVO_DURANTE_MS, prateleira, precisaDeVerificar, registarArtista, VERIFICAR_DE_MS,
} from '../src/lib/novosLancamentos.ts';

const DIA = 24 * 60 * 60 * 1000;
const agora = Date.UTC(2026, 9, 10, 12); // 10/10/2026
const album = (id: string, ano: string | null, tipo = 'Single') => ({ id, titulo: `T ${id}`, tipo, ano, capa: null });

// Quem se vê: favoritos primeiro, depois os mais ouvidos, só com músicas na biblioteca.
const grupos = new Map([
  ['isak', { nome: 'Isak', faixas: ['a'] }],
  ['plutonio', { nome: 'Plutónio', faixas: ['b'] }],
  ['dillaz', { nome: 'Dillaz', faixas: ['c'] }],
  ['vazio', { nome: 'Vazio', faixas: [] as string[] }],
]);
assert.deepEqual(escolherArtistas(['dillaz', 'fora'], ['isak', 'dillaz', 'vazio', 'plutonio'], grupos).map((a) => a.chave),
  ['dillaz', 'isak', 'plutonio'], 'favoritos à frente, sem repetidos, sem quem não está na biblioteca');
assert.equal(escolherArtistas([], ['isak', 'plutonio', 'dillaz'], grupos, 2).length, 2, 'um teto por dia');

// Uma vez por dia (20 h), e um relógio que andou para trás volta a verificar.
assert.ok(precisaDeVerificar(memoriaVazia(), agora));
assert.ok(!precisaDeVerificar({ ...memoriaVazia(), verificadoEm: agora - 2 * 60 * 60 * 1000 }, agora));
assert.ok(precisaDeVerificar({ ...memoriaVazia(), verificadoEm: agora - VERIFICAR_DE_MS }, agora));
assert.ok(precisaDeVerificar({ ...memoriaVazia(), verificadoEm: agora + DIA }, agora));

assert.ok(anoRecente('2026', agora));
assert.ok(!anoRecente('2025', agora));
assert.ok(anoRecente('2025', Date.UTC(2026, 0, 5)), 'em janeiro, o do ano passado ainda conta');
assert.ok(!anoRecente(null, agora));

// A primeira vez não há novos: tudo o que lá está já existia.
let m = registarArtista(memoriaVazia(), 'isak', 'Isak', 'UC1', [album('a1', '2026'), album('a0', '2024', 'Album')], agora);
assert.equal(m.novos.length, 0, 'a primeira vez não inventa novidades');
assert.equal(m.artistas.isak.recente?.id, 'a1');
// Mas a prateleira não nasce vazia: o mais recente, se for deste ano.
assert.deepEqual(prateleira(m, agora).map((i) => [i.lancamento.id, i.novo]), [['a1', false]]);

// No dia seguinte aparece um single: é novo.
const amanha = agora + DIA;
m = registarArtista(m, 'isak', 'Isak', 'UC1', [album('a2', '2026'), album('a1', '2026'), album('a0', '2024', 'Album')], amanha);
assert.deepEqual(m.novos.map((n) => n.lancamento.id), ['a2']);
assert.equal(m.artistas.isak.recente?.id, 'a2', 'no mesmo ano, o primeiro do canal');
// Ler outra vez não o repete; um antigo que só agora aparece (de 2023) não é novo.
m = registarArtista(m, 'isak', 'Isak', 'UC1', [album('a2', '2026'), album('a1', '2026'), album('velho', '2023')], amanha + DIA);
assert.deepEqual(m.novos.map((n) => n.lancamento.id), ['a2'], 'nem repetido, nem um antigo que só agora apareceu');
assert.deepEqual(prateleira(m, amanha + DIA).map((i) => [i.lancamento.id, i.novo]), [['a2', true]],
  'o novo à frente, e o mesmo não aparece duas vezes');

// Outro canal (as provas mudaram) é a primeira vez outra vez: nada de inundação.
const outro = registarArtista(m, 'isak', 'Isak', 'UC2', [album('x1', '2026'), album('x2', '2026')], amanha + 2 * DIA);
assert.deepEqual(outro.novos.map((n) => n.lancamento.id), ['a2']);

// O ponto nos Artists: até se abrir a página dele.
assert.deepEqual([...artistasComNovidade(m, amanha + DIA)], ['isak']);
const visto = marcarAberto(m, 'isak', amanha + DIA);
assert.equal(artistasComNovidade(visto, amanha + DIA).size, 0);
assert.equal(prateleira(visto, amanha + DIA)[0].novo, true, 'abrir o artista não tira o "New" da prateleira');

// Ao fim de 14 dias deixa de ser novo, e fica como o mais recente dele.
const depois = amanha + NOVO_DURANTE_MS;
assert.equal(limparNovos(m, depois).novos.length, 0);
assert.deepEqual(prateleira(m, depois).map((i) => [i.lancamento.id, i.novo]), [['a2', false]]);
assert.equal(artistasComNovidade(m, depois).size, 0);

// Vários artistas: os recentes pela ordem dada; os de anos antigos não entram.
let v = registarArtista(memoriaVazia(), 'b', 'B', 'UCb', [album('b1', '2026')], agora);
v = registarArtista(v, 'a', 'A', 'UCa', [album('a1', '2026')], agora);
v = registarArtista(v, 'c', 'C', 'UCc', [album('c1', '2022', 'Album')], agora);
assert.deepEqual(prateleira(v, agora, ['a', 'b', 'c']).map((i) => i.lancamento.id), ['a1', 'b1']);

// O que está guardado: uma memória estranha não parte nada.
assert.deepEqual(lerMemoria(null), memoriaVazia());
assert.deepEqual(lerMemoria({ v: 2 }), memoriaVazia());
const lida = lerMemoria(JSON.parse(JSON.stringify(m)));
assert.deepEqual(lida, m, 'guarda-se e lê-se igual');
assert.equal(lerMemoria({ ...m, novos: [{ lancamento: { id: 1 }, desde: 'x' }] }).novos.length, 0);

// Não custa nada ao Supabase: a memória vive no aparelho.
const estado = readFileSync(new URL('../src/state/novosLancamentos.ts', import.meta.url), 'utf8');
assert.match(estado, /AsyncStorage/);
assert.doesNotMatch(estado, /supabase|yt_cache|guardarNaCache/, 'nada de Supabase');
console.log('Novos lançamentos: escolha dos artistas, primeira vez, novos, 14 dias, ponto e memória passaram.');
