/**
 * O Radio que aprende e não acaba (5/10): `ancorasDoRadio` (src/lib/radioSession.ts),
 * `espalharArtistas` e `tentativasDoRadio` (src/lib/radio.ts).
 *
 * Correr: node --experimental-strip-types scripts/test-radio-inteligente.ts
 */
import assert from 'node:assert/strict';
import {
  ancorasDoRadio, rememberRadioListen, rememberRadioSkip, type RadioListeningSession,
} from '../src/lib/radioSession.ts';
import { espalharArtistas, tentativasDoRadio } from '../src/lib/radio.ts';
import type { Track } from '../src/types.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
const t = (id: string, artist: string): Track => ({ source: 'youtube', sourceId: id, title: id, artist, album: null, artworkUrl: null, durationSeconds: 180 });
const artista = (x: Track) => x.artist ?? '';
const chave = (s: string) => s.toLowerCase();
const ids = (xs: readonly Track[]) => xs.map((x) => x.sourceId);
const ancoras = (nucleo: Track[], s: RadioListeningSession | null) => ancorasDoRadio(nucleo, s, 'eu', artista, chave);
const ouvir = (s: RadioListeningSession | null, ...xs: Track[]) => xs.reduce((a, x) => rememberRadioListen(a, 'eu', x), s);
const saltar = (s: RadioListeningSession | null, ...xs: Track[]) => xs.reduce((a, x) => rememberRadioSkip(a, 'eu', x), s);

const isak = t('isak', 'Isak'), holly = t('holly', 'Holly Hood'), pop = t('pop1', 'Pop');

console.log('\nas âncoras aprendem com a sessão');
caso('sem sessão, são as de quando se ligou', () => {
  assert.deepEqual(ids(ancoras([isak, holly], null).sementes), ['isak', 'holly']);
});
caso('uma escuta sozinha não desvia o Radio', () => {
  assert.deepEqual(ids(ancoras([isak], ouvir(null, pop)).sementes), ['isak']);
});
caso('duas escutas até ao fim fazem do artista uma âncora', () => {
  const s = ouvir(null, pop, t('pop2', 'Pop'));
  assert.deepEqual(ids(ancoras([isak], s).sementes), ['isak', 'pop2'], 'a mais recente dele representa-o');
});
caso('o núcleo continua à frente de quem se ouviu', () => {
  const s = ouvir(null, t('p1', 'Pop'), t('p2', 'Pop'));
  assert.equal(ancoras([isak], s).sementes[0].sourceId, 'isak');
});
caso('um salto tira peso; dois saltos tiram o artista das âncoras e das sugestões', () => {
  const um = saltar(ouvir(null, t('h1', 'Holly Hood')), t('h2', 'Holly Hood'));
  assert.deepEqual(ids(ancoras([isak, holly], um).sementes), ['isak', 'h1'], '3 + 1 - 2 = 2: continua, mas atrás');
  const dois = saltar(null, t('h1', 'Holly Hood'), t('h2', 'Holly Hood'));
  const r = ancoras([isak, holly], dois);
  assert.deepEqual(ids(r.sementes), ['isak']);
  assert.ok(r.evitar.has('holly hood'));
});
caso('saltar tudo não deixa o Radio sem âncoras', () => {
  const s = saltar(null, t('i1', 'Isak'), t('i2', 'Isak'));
  assert.deepEqual(ids(ancoras([isak], s).sementes), ['isak'], 'cai no núcleo');
});
caso('no máximo três âncoras', () => {
  assert.equal(ancoras([isak, holly, t('a', 'A'), t('b', 'B')], null).sementes.length, 3);
});
caso('a sessão de outra conta não conta', () => {
  const alheia = rememberRadioSkip(rememberRadioSkip(null, 'outro', isak), 'outro', isak);
  assert.equal(ancorasDoRadio([isak], alheia, 'eu', artista, chave).evitar.size, 0);
});
caso('ouvir e saltar guardam-se lado a lado', () => {
  const s = saltar(ouvir(null, pop), holly);
  assert.deepEqual(ids(s!.tracks), ['pop1']);
  assert.deepEqual(ids(s!.skipped ?? []), ['holly']);
});

console.log('\nsem o mesmo artista colado');
caso('separa o mesmo artista por três faixas quando dá', () => {
  const lote = [t('a1', 'A'), t('a2', 'A'), t('b1', 'B'), t('c1', 'C'), t('a3', 'A'), t('d1', 'D'), t('e1', 'E'), t('f1', 'F')];
  const r = espalharArtistas(lote, (x) => chave(artista(x)));
  assert.deepEqual(ids(r), ['a1', 'b1', 'c1', 'd1', 'a2', 'e1', 'f1', 'a3']);
});
caso('sem espaço para três, fica pelo menos separado', () => {
  const r = espalharArtistas([t('a1', 'A'), t('a2', 'A'), t('b1', 'B'), t('c1', 'C')], (x) => chave(artista(x)));
  for (let i = 1; i < r.length; i++) assert.notEqual(r[i].artist, r[i - 1].artist, ids(r).join(','));
});
caso('conta com o fim da fila que já lá está', () => {
  const r = espalharArtistas([t('a1', 'A'), t('b1', 'B')], (x) => chave(artista(x)), ['a']);
  assert.equal(r[0].sourceId, 'b1');
});
caso('um lote só de um artista não fica preso', () => {
  assert.deepEqual(ids(espalharArtistas([t('a1', 'A'), t('a2', 'A')], (x) => chave(artista(x)))), ['a1', 'a2']);
});

console.log('\no Radio não acaba');
caso('as tentativas vão por ordem e não se repetem', () => {
  const r = tentativasDoRadio([
    { sementes: [isak], semMemoria: false },
    { sementes: [isak], semMemoria: true },
    { sementes: [isak], semMemoria: true },
    { sementes: [], semMemoria: true },
    { sementes: [holly], semMemoria: true },
  ], (x) => x.sourceId);
  assert.deepEqual(r.map((x) => `${ids(x.sementes)}:${x.semMemoria}`), ['isak:false', 'isak:true', 'holly:true']);
});

if (falhas) { console.log(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\n  Todos os casos passaram.');
