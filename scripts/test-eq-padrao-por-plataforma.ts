/**
 * O equalizador padrão é de cada plataforma (31/10, o João: "um preset default para o iOS e um
 * para o Windows; só deixa de estar esse default se eu alterar manualmente uma música").
 * O `state/player.ts` corre com os duplos; as chaves, as frases e a restauração lêem-se como TEXTO.
 *
 * node --experimental-strip-types --import ./scripts/registar-duplos.mjs scripts/test-eq-padrao-por-plataforma.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { baseDoEq, usePlayer } from '../src/state/player.ts';
import { aoTocar, CHAVE_DO_PADRAO, chaveDaFaixa, PLANO } from '../src/lib/equalizer.ts';
import type { Track } from '../src/types.ts';
import { guardadas } from './duplos/prefs.ts';

// Cada passo uns milissegundos depois do anterior, como dois toques a sério: a memória dos
// ajustes funde-se pela data, e duas escritas da mesma faixa no mesmo milissegundo ficam com a primeira.
async function t(nome: string, f: () => void | Promise<void>) {
  await new Promise((r) => setTimeout(r, 5));
  await f();
  console.log(`  ok - ${nome}`);
}
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

const faixa = (id: string): Track => ({ source: 'youtube', sourceId: id, title: id, artist: 'X', album: null, artworkUrl: null, durationSeconds: 180 });
const A = faixa('a');
const B = faixa('b');
const BASS = [5, 0, 1.5, 0, 0, 0, 0, 0, 0, 0];
const VOCAL = [0, 0, 0, 2, 3, 3, 1, 0, 0, 0];
const TREBLE = [0, 0, 0, 0, 0, 0, 0, 2, 3, 4];
const DOOUTRO = [-2, -2, 0, 0, 0, 0, 0, 0, 0, 5];
const st = () => usePlayer.getState();
/** O que uma faixa toca ao arrancar: o que ela lembra, ou o padrão de agora. */
const aoArrancar = (f: Track) => aoTocar(st().ajustesPorFaixa, chaveDaFaixa(f), { rate: st().padraoRate, ganhos: baseDoEq(st()) }).ganhos;

usePlayer.setState({ current: A, ajustesPorFaixa: {}, padraoGanhos: PLANO, eqGanhos: PLANO, carro: null, eqRecomendado: null, playbackRate: 1, padraoRate: 1 });

console.log('\no padrão desta plataforma');
await t('escolher um preset como padrão fica no aparelho, vale para as faixas sem EQ próprio e não mexe na que toca', () => {
  st().setEqGanhos(BASS, true);
  assert.deepEqual(st().padraoGanhos, BASS);
  assert.deepEqual(guardadas.eqPadrao, BASS, 'persistido na chave desta plataforma');
  assert.deepEqual(st().eqGanhos, PLANO, 'a faixa que toca só muda na seguinte');
  assert.deepEqual(aoArrancar(B), BASS);
});

await t('o padrão já não viaja pela linha das faixas: o outro aparelho fica com o seu', () => {
  const linha = st().ajustesPorFaixa[CHAVE_DO_PADRAO];
  assert.equal(linha, undefined, 'escolher o padrão não escreve a linha `padrao:global`');
});

await t('um padrão que chega de outro aparelho pela linha não mexe no EQ deste', () => {
  st()._carregarPadrao({ [CHAVE_DO_PADRAO]: { rate: 0.9, ganhos: DOOUTRO, visto: Date.now() + 1000 } });
  assert.deepEqual(st().padraoGanhos, BASS, 'o EQ padrão é desta plataforma');
  assert.equal(st().padraoRate, 0.9, 'o ritmo continua a ser da conta');
});

await t('o arranque e a sincronização usam o padrão desta plataforma, e não os ganhos da linha', () => {
  st()._carregarAjustes({ [CHAVE_DO_PADRAO]: { rate: 1, ganhos: DOOUTRO, visto: Date.now() + 2000 } }, VOCAL, 1);
  assert.deepEqual(st().padraoGanhos, VOCAL);
  st()._carregarAjustes({}, BASS, 1);
  assert.deepEqual(st().padraoGanhos, BASS);
});

console.log('\numa faixa só fica diferente se se mexer no EQ dela');
await t('mexer no EQ da faixa que toca guarda-o só nela; as outras seguem o padrão', () => {
  usePlayer.setState({ current: A, eqGanhos: BASS, ajustesPorFaixa: {} });
  st().setEqGanhos(TREBLE);
  assert.deepEqual(st().ajustesPorFaixa[chaveDaFaixa(A)]?.ganhos, TREBLE);
  assert.deepEqual(aoArrancar(A), TREBLE);
  assert.deepEqual(aoArrancar(B), BASS);
});

await t('mudar o padrão depois: a faixa mexida fica como estava, as outras seguem o novo', () => {
  st().setEqGanhos(VOCAL, true);
  assert.deepEqual(aoArrancar(A), TREBLE);
  assert.deepEqual(aoArrancar(B), VOCAL);
});

await t('mudar só a velocidade de uma faixa NÃO congela o padrão nela (continua a segui-lo)', () => {
  usePlayer.setState({ current: B, eqGanhos: VOCAL });
  st().setPlaybackRate(1.25);
  assert.equal(st().ajustesPorFaixa[chaveDaFaixa(B)]?.rate, 1.25);
  assert.equal(st().ajustesPorFaixa[chaveDaFaixa(B)]?.ganhos, null, 'sem ganhos próprios');
  st().setEqGanhos(BASS, true);
  assert.deepEqual(aoArrancar(B), BASS, 'e quando o padrão muda, ela vai com ele');
});

await t('pôr uma faixa a Flat de propósito, com outro padrão, é uma escolha dela e fica', () => {
  usePlayer.setState({ current: faixa('c'), eqGanhos: BASS, ajustesPorFaixa: {} });
  st().setEqGanhos(PLANO);
  assert.deepEqual(st().ajustesPorFaixa[chaveDaFaixa(faixa('c'))]?.ganhos, PLANO);
  assert.deepEqual(aoArrancar(faixa('c')), PLANO);
});

console.log('\nonde está guardado');
const PREFS = ler('src/lib/prefs.ts');
const PLAYER = ler('src/state/player.ts');
const APP = ler('App.tsx');
const SYNC = ler('src/lib/prefsSync.ts');
await t('uma chave por plataforma, o padrão de antes só como ponto de partida', () => {
  assert.match(PREFS, /const KEY_EQ_PADRAO_IOS = 'pref:eqPadrao:ios';/);
  assert.match(PREFS, /const KEY_EQ_PADRAO_WINDOWS = 'pref:eqPadrao:windows';/);
  assert.match(PREFS, /navigator\.product === 'ReactNative'/);
  assert.match(PREFS, /\(await AsyncStorage\.getItem\(chaveDoEqPadrao\(\)\)\) \?\? \(await AsyncStorage\.getItem\(KEY_EQ_PADRAO\)\)/);
  assert.match(PREFS, /await AsyncStorage\.setItem\(chaveDoEqPadrao\(\), JSON\.stringify\(normalizarGanhos\(ganhos\)\)\);/);
  assert.ok(!/setItem\(KEY_EQ_PADRAO,/.test(PREFS), 'ninguém volta a escrever a chave partilhada');
});
await t('a linha da conta leva só o ritmo (ganhos a null, para um aparelho antigo ficar com o EQ dele)', () => {
  assert.match(PLAYER, /function guardarOPadrao\(rate: number\): void \{/);
  assert.match(PLAYER, /const value = \{ rate, ganhos: null, visto: Date\.now\(\) \};/);
  assert.ok(!/guardarOPadrao\([^)]*,/.test(PLAYER), 'ninguém passa ganhos');
});
await t('uma plataforma reinstalada recupera o padrão da conta sem esperar pelo arranque seguinte', () => {
  assert.match(SYNC, /export function sincronizarPreferencias\(userId: string, aoRestaurar\?: \(chaves: string\[\]\) => void\): \(\) => void \{/);
  assert.match(SYNC, /aoRestaurar\?\.\(aEscrever\.map\(\(\[chave\]\) => chave\)\)/);
  assert.match(APP, /chave\.startsWith\('pref:eqPadrao'\)/);
  assert.match(APP, /usePlayer\.setState\(\{ padraoGanhos: ganhos \}\)/);
});

console.log('\no que as Definições dizem');
await t('o PC e o iPhone dizem de quem é o padrão', () => {
  assert.match(ler('src/desktop/paginas/SettingsPage.web.tsx'), /This PC's default, for songs you haven't set on their own\. The iPhone has its own\./);
  assert.match(ler('src/screens/SettingsScreen.tsx'), /This iPhone's default, for every song that has no EQ of its own\. The PC has its own\./);
});

console.log('\ntudo certo');
process.exit(0);
