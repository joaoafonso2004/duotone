/**
 * O Radio "Mix" (18/10): de tudo o que se ouve, a rodar pelos artistas lote a
 * lote, metade tuas e metade novas, com as entradas tiradas do aparelho (zero
 * pedidos ao Supabase). E o menu da pastilha nas duas plataformas: só "Songs
 * like this one" e "Mix", a nascer da pastilha (variante A).
 *
 * Correr: node --experimental-strip-types scripts/test-mix-do-radio.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ancorasDoLote, ANCORAS_POR_LOTE, baralhado, conhecidasDoLote, entradasDoAparelho, FRACAO_DE_NOVAS_NO_MIX,
} from '../src/lib/mixDoRadio.ts';
import { capasDoMix, MENU_DO_RADIO, ROTULO_LIGADO } from '../src/lib/menuDoRadio.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(f, 'utf8');
const AGORA = 1_800_000_000_000;
const DIA = 24 * 60 * 60_000;

console.log('\na roda dos artistas');
caso('cada lote usa os artistas seguintes, e dá a volta', () => {
  const todas = ['a', 'b', 'c', 'd', 'e', 'f'].map((chave) => ({ chave, nome: chave.toUpperCase(), peso: 1 / 6 }));
  assert.deepEqual(ancorasDoLote(todas, 0).map((a) => a.chave), ['a', 'b', 'c', 'd']);
  assert.deepEqual(ancorasDoLote(todas, 1).map((a) => a.chave), ['e', 'f', 'a', 'b']);
  assert.deepEqual(ancorasDoLote(todas, 2).map((a) => a.chave), ['c', 'd', 'e', 'f']);
  const pesos = ancorasDoLote(todas, 0).reduce((s, a) => s + a.peso, 0);
  assert.ok(Math.abs(pesos - 1) < 1e-9, 'as fatias do lote voltam a somar 1');
  assert.equal(ANCORAS_POR_LOTE, 4);
  assert.deepEqual(ancorasDoLote([], 3), []);
  assert.deepEqual(ancorasDoLote(todas.slice(0, 2), 5).map((a) => a.chave), ['a', 'b'], 'com poucos, vão todos');
});
caso('metade tuas, metade novas', () => assert.equal(FRACAO_DE_NOVAS_NO_MIX, 0.5));

console.log('\nas entradas saem do aparelho');
type F = { id: string; artista: string };
const f = (id: string, artista: string): F => ({ id, artista });
const artistaDe = (t: F) => ({ chave: t.artista.toLowerCase(), nome: t.artista });
caso('a semana pesa pelas vezes (com teto), o perfil é de sempre, as favoritas as mais ouvidas', () => {
  const e = entradasDoAparelho([
    { faixa: f('x1', 'Drake'), count: 9, lastPlayed: AGORA - DIA },
    { faixa: f('y1', '2hollis'), count: 2, lastPlayed: AGORA - 2 * DIA },
    { faixa: f('z1', 'Isak'), count: 40, lastPlayed: AGORA - 30 * DIA },
    { faixa: f('nada', 'Ninguém'), count: 0, lastPlayed: AGORA },
  ], artistaDe, AGORA);
  assert.equal(e.recentes.filter((r) => r.chave === 'drake').length, 5, 'até cinco por música');
  assert.equal(e.recentes.filter((r) => r.chave === '2hollis').length, 2);
  assert.equal(e.recentes.filter((r) => r.chave === 'isak').length, 0, 'de há um mês não é da semana');
  assert.deepEqual(e.perfil.find((p) => p.chave === 'isak'), { chave: 'isak', nome: 'Isak', escutas: 40 }, 'mas é do perfil');
  assert.deepEqual(e.favoritas.map((t) => t.id), ['z1', 'x1', 'y1'], 'as mais ouvidas de sempre, sem as de zero');
  assert.equal(e.daSemana.filter((t) => t.id === 'x1').length, 5);
});

console.log('\nas tuas de cada artista');
caso('primeiro as da semana (as mais repetidas), depois as Liked Songs e as favoritas; só as que podem entrar', () => {
  const semana = [f('d1', 'Drake'), f('d2', 'Drake'), f('d2', 'Drake'), f('h1', '2hollis')];
  const biblioteca = [f('d3', 'Drake'), f('x', 'Outro'), f('d1', 'Drake')];
  const favoritas = [f('d4', 'Drake'), f('ouvida', 'Drake')];
  const m = conhecidasDoLote(new Set(['drake']), semana, biblioteca, favoritas, (t) => t.artista.toLowerCase(), (t) => t.id,
    (t) => t.id !== 'ouvida', () => 0);
  assert.deepEqual(m.get('drake')?.map((t) => t.id), ['d2', 'd1', 'd3', 'd4']);
  assert.equal(m.has('2hollis'), false, 'só os artistas do lote');
});
caso('baralhar é Fisher-Yates e não perde nada', () => {
  const lista = [1, 2, 3, 4, 5];
  const b = baralhado(lista, () => 0.5);
  assert.deepEqual([...b].sort(), lista);
  assert.deepEqual(lista, [1, 2, 3, 4, 5], 'não mexe na original');
});

console.log('\nzero pedidos ao Supabase para saber o que ouves');
caso('o lote do Mix lê o aparelho, e passa o perfil à busca das parecidas', () => {
  const d = ler('src/api/descoberta.ts');
  const corpo = d.slice(d.indexOf('export async function loteDaMix'), d.indexOf('\n}\n', d.indexOf('export async function loteDaMix')));
  assert.match(corpo, /contagensNoAparelho\(\)/);
  assert.doesNotMatch(corpo, /getEscutasRecentes|artistasParaRecomendacoes|getHeavyRotation|lerPerfilDeRecomendacoes/,
    'nada de escutas, perfil ou Heavy Rotation da conta por lote');
  assert.match(corpo, /descobertasPorAncora\(\s*biblioteca, doLote\.map\(\(a\) => a\.nome\), doLote\.length, evitar, perfilDoMix,\s*\)/);
  assert.match(d, /const \{ escutas, externos \} = perfil \?\? await lerPerfilDeRecomendacoes\(\);/,
    'a busca usa o perfil que lhe dão');
});
caso('o player: o tipo é guardado, e o Mix pede ao loteDaMix', () => {
  const p = ler('src/state/player.ts');
  assert.match(p, /tipo === 'mix'\s*\? await loteDaMix\(12,/);
  assert.match(p, /const doMix = radioMode === 'on' && radioTipo === 'mix';/);
  assert.match(p, /radioTipo: s\.radioTipo, radioContext: s\.radioContext/, 'sobrevive a reabrir');
  assert.match(p, /const tipo = get\(\)\.radioTipo;/, 'tocar numa música com o Mix ligado continua Mix');
});

console.log('\no menu da pastilha');
caso('só os dois nomes, sem texto por baixo', () => {
  assert.deepEqual(MENU_DO_RADIO.opcoes.map((o) => o.rotulo), ['Songs like this one', 'Mix']);
  assert.deepEqual(ROTULO_LIGADO, { musica: 'Radio on', mix: 'Mix on' });
  for (const f of ['src/components/MenuDoRadio.tsx', 'src/components/MenuDoRadio.web.tsx']) {
    const m = ler(f);
    assert.match(m, /MENU_DO_RADIO\.opcoes\.map/, `${f}: as linhas vêm do lib/menuDoRadio.ts`);
    assert.doesNotMatch(m, /A mix of everything|Based on/, `${f}: sem legenda`);
  }
});
caso('as capas do Mix: as mais ouvidas, uma por artista, só com capa', () => {
  const c = (artist: string, capa: string | null, count: number) => ({ artist, artworkUrl: capa, count, lastPlayed: 0 });
  assert.deepEqual(capasDoMix([c('A', 'a1', 9), c('A', 'a2', 8), c('B', null, 7), c('C', 'c1', 3), c('D', 'd1', 2), c('E', 'e1', 1)],
    (x) => x.artist), ['a1', 'c1', 'd1', 'e1']);
});
caso('iPhone: nasce da pastilha no thread da interface, com os 120 Hz e o Modal de sempre', () => {
  const m = ler('src/components/MenuDoRadio.tsx');
  assert.match(m, /pedirFluidez\(900\)/);
  assert.match(m, /useNativeDriver: true/);
  assert.doesNotMatch(m, /useNativeDriver: false/);
  assert.match(m, /<DentroDeUmModal\.Provider value>/);
  assert.match(m, /scaleX: forma\.interpolate\(\{ inputRange: \[0, 1\], outputRange: \[sx, 1\] \}\)/, 'cresce do tamanho da pastilha');
  assert.match(m, /if \(reduzido\)/, 'Reduzir movimento: só aparece');
  const q = ler('src/components/RadioQueueControl.tsx');
  assert.match(q, /pastilha\.current\.measureInWindow/, 'mede a pastilha para o menu nascer dela');
  assert.match(q, /<MenuDoRadio ancora=\{ancora\} visivel=\{radio\.menuAberto\}/);
  assert.match(q, /setMenuAberto\(true\);/, 'desligado, carregar abre o menu');
  assert.match(q, /if\(usePlayer\.getState\(\)\.radioMode!=='off'\)\{setUndo\(null\);usePlayer\.getState\(\)\.stopRadio\(\);return;\}/, 'ligado, desliga como antes');
});
caso('PC: o mesmo menu, sem desfoque nem className, e fecha com Esc', () => {
  const m = ler('src/components/MenuDoRadio.web.tsx');
  assert.doesNotMatch(m, /backdrop-filter|backdropFilter|className/);
  assert.match(m, /e\.key === 'Escape'/);
  assert.match(m, /pausarAtalhosDaJanela\(true\)/);
  assert.match(m, /prefers-reduced-motion: reduce/);
  const fila = ler('src/desktop/FilaDoLeitor.web.tsx');
  assert.match(fila, /pastilha\.current\?\.getBoundingClientRect/);
  assert.match(fila, /<MenuDoRadio ancora=\{ancora\} visivel=\{radio\.menuAberto\}/);
});

console.log(falhas ? `\n  ${falhas} caso(s) a falhar.\n` : '\n  Todos os casos passaram.\n');
process.exit(falhas ? 1 : 0);
