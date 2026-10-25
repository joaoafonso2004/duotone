/**
 * O refrão primeiro, à volta da curva (o `test-refrao.ts` trata dela): o pedido
 * com memória, a pré-escuta na store, o abafo da música de sempre, a risca na
 * barra, e os dois leitores e os cartões que os usam.
 *
 * node --experimental-strip-types --import ./scripts/registar-duplos.mjs scripts/test-refrao-pre-escuta.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { refraoDaMusica, pontoDoRefrao } from '../src/api/refrao.ts';
import { limparPedidos, registarPedidoAoYouTube, resumoDosPedidos } from '../src/lib/pedidosAoYouTube.ts';
import { ABAFO } from '../src/lib/refrao.ts';
import { usePlayer } from '../src/state/player.ts';
import {
  abafoDoRefrao, ligarMarcaDoRefrao, ouvirRefrao, pararRefrao, refraoComecou, seguirOAbafo, useMarcaDoRefrao, useRefrao,
} from '../src/state/refrao.ts';
import type { Track } from '../src/types.ts';
import { guardadas } from './duplos/prefs.ts';

const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function t(nome: string, f: () => void | Promise<void>) {
  await f();
  console.log(`  ok - ${nome}`);
}

// O `next` de verdade não sai daqui: a resposta é a fixture, e conta-se.
const fixture = JSON.parse(ler('scripts/fixtures/heatmap-next.json'));
let pedidos = 0;
let falhar = false;
(globalThis as any).fetch = async () => {
  pedidos++;
  if (falhar) throw new Error('rede');
  return { ok: true, status: 200, json: async () => fixture };
};

const faixa = (id: string, extra: Partial<Track> = {}): Track =>
  ({ source: 'youtube', sourceId: id, title: id, artist: 'X', album: null, artworkUrl: null, durationSeconds: 213, ...extra });

console.log('\no pedido');
await t('um pedido por música, contado como "refrao", e a segunda vez vem da memória', async () => {
  limparPedidos();
  const [a, b] = await Promise.all([pontoDoRefrao('aaaaaaaaaaa', 213), pontoDoRefrao('aaaaaaaaaaa', 213)]);
  assert.equal(pedidos, 1, 'dois toques ao mesmo tempo são um pedido');
  assert.ok(a >= 37 && a <= 43 && a === b, `${a}`);
  assert.equal(await pontoDoRefrao('aaaaaaaaaaa', 213), a);
  assert.equal(pedidos, 1);
  assert.equal(resumoDosPedidos(60_000).porTipo.refrao, 1);
  assert.equal((await refraoDaMusica('aaaaaaaaaaa', 213)).daCurva, true);
});

await t('com o YouTube a recusar não se pede: fica a estimativa (um terço)', async () => {
  registarPedidoAoYouTube('pesquisa', 429);
  const r = await refraoDaMusica('bbbbbbbbbbb', 210);
  assert.deepEqual(r, { inicioS: 70, daCurva: false });
  assert.equal(pedidos, 1);
  limparPedidos();
});

await t('uma falha de rede dá a estimativa e não fica guardada', async () => {
  falhar = true;
  assert.deepEqual(await refraoDaMusica('ccccccccccc', 210), { inicioS: 70, daCurva: false });
  falhar = false;
  assert.equal((await refraoDaMusica('ccccccccccc', 210)).daCurva, true, 'à segunda, com rede, pede outra vez');
  assert.equal(pedidos, 3);
});

console.log('\na pré-escuta');
let aplicacoes = 0;
const largarAbafo = seguirOAbafo(() => { aplicacoes++; });
usePlayer.setState({ current: faixa('principal00'), isPlaying: true } as any);

await t('o auscultador começa a pré-escuta; só se abafa quando há som', async () => {
  ouvirRefrao(faixa('aaaaaaaaaaa'));
  assert.equal(useRefrao.getState().faixa?.sourceId, 'aaaaaaaaaaa');
  await espera(5);
  assert.ok(useRefrao.getState().inicioS! >= 37);
  assert.equal(useRefrao.getState().ate, null);
  assert.equal(abafoDoRefrao(), 1, 'a preparar, a música de sempre continua igual');
  refraoComecou();
  assert.ok(useRefrao.getState().ate! > Date.now() + 14_000);
  await espera(350);
  assert.equal(abafoDoRefrao(), ABAFO);
  assert.ok(aplicacoes >= 2, 'os leitores reaplicaram o volume durante a descida');
});

await t('outro auscultador troca; o mesmo pára, e o volume volta', async () => {
  ouvirRefrao(faixa('ddddddddddd'));
  assert.equal(useRefrao.getState().faixa?.sourceId, 'ddddddddddd');
  assert.equal(useRefrao.getState().ate, null);
  ouvirRefrao(faixa('ddddddddddd'));
  assert.equal(useRefrao.getState().faixa, null);
  await espera(350);
  assert.equal(abafoDoRefrao(), 1);
});

await t('a música de sempre a mudar, ou a voltar a tocar, acaba com a pré-escuta', async () => {
  ouvirRefrao(faixa('aaaaaaaaaaa'));
  usePlayer.setState({ current: faixa('outra000000') } as any);
  assert.equal(useRefrao.getState().faixa, null);
  usePlayer.setState({ isPlaying: false } as any);
  ouvirRefrao(faixa('aaaaaaaaaaa'));
  usePlayer.setState({ positionMs: 1234 } as any);
  assert.equal(useRefrao.getState().faixa?.sourceId, 'aaaaaaaaaaa', 'o resto da store não conta');
  usePlayer.setState({ isPlaying: true } as any);
  assert.equal(useRefrao.getState().faixa, null);
});

await t('uma resposta que chega depois de parar não ressuscita a pré-escuta', async () => {
  ouvirRefrao(faixa('eeeeeeeeeee'));
  pararRefrao();
  await espera(5);
  assert.deepEqual(useRefrao.getState(), { faixa: null, inicioS: null, ate: null });
});

await t('só as músicas do YouTube', () => {
  ouvirRefrao(faixa('x', { source: 'spotify' as any }));
  assert.equal(useRefrao.getState().faixa, null);
});
largarAbafo();

await t('a risca na barra: desligada de origem, e ligá-la grava', () => {
  assert.equal(useMarcaDoRefrao.getState().ligada, false);
  ligarMarcaDoRefrao(true);
  assert.equal(useMarcaDoRefrao.getState().ligada, true);
  assert.equal(guardadas.refraoNaBarra, true);
  ligarMarcaDoRefrao(false);
});

console.log('\nno código');
await t('o processo principal do PC só aceita um id de vídeo, e o endereço vive lá', () => {
  const main = ler('electron/main.cjs');
  assert.match(main, /ipcMain\.handle\('yt:refrao', async \(event, pedido\) => \{\n\s+if \(!daJanelaPrincipal\(event\)\) throw/);
  assert.match(main, /if \(!\/\^\[\\w-\]\{11\}\$\/\.test\(videoId\)\) throw new Error\('Video invalido\.'\);/);
  assert.match(ler('electron/preload.cjs'), /lerRefraoDoYouTube: \(pedido\) => ipcRenderer\.invoke\('yt:refrao', pedido\)/);
});

await t('PC: o auscultador aparece pelo CSS com o rato no cartão, e não é o clique do cartão', () => {
  const ui = ler('src/desktop/ui.web.tsx');
  assert.equal((ui.match(/<BotaoDoRefrao track=\{t\} \/>/g) ?? []).length, 2, 'na grelha e no carrossel');
  assert.match(ui, /onPointerDown=\{\(\(e: any\) => e\.stopPropagation\(\)\) as any\}\n\s+onPress=\{\(e: any\) => \{ e\?\.stopPropagation\?\.\(\); ouvirRefrao\(track\); \}\}/);
  const casca = ler('src/desktop/casca.web.tsx');
  assert.match(casca, /\[data-dt~="refrao"\]\{ opacity:0;/);
  assert.match(casca, /\[data-dt~="cartao"\]:hover \[data-dt~="refrao"\], \[data-dt~="cartao"\]:focus-within \[data-dt~="refrao"\],\n\s+\[data-dt~="refrao"\]\[data-dt~="refrao-meu"\]\{ opacity:1;/);
});

await t('os dois leitores abafam pela store, e o do PC não deixa o abafo calar', () => {
  const pc = ler('src/components/YouTubePlayerView.web.tsx');
  assert.match(pc, /return volume > 0 \? Math\.max\(1, Math\.round\(volume \* abafoDoRefrao\(\)\)\) : 0;/);
  assert.match(pc, /const volume = abafado\(volumeParaOMotor\(vol\)\);/);
  assert.match(pc, /useEffect\(\(\) => seguirOAbafo\(/);
  const ios = ler('src/components/YouTubePlayerView.tsx');
  assert.match(ios, /motorActivo\(\)\.volume = ceilingRef\.current \* abafoDoRefrao\(\);/);
  assert.match(ios, /if \(backend !== 'native' \|\| mantidoVivoRef\.current \|\| fadeIntervalRef\.current \|\| passagemRef\.current\) return;/);
});

await t('a pré-escuta do iPhone: HLS, sem Now Playing nem segundo plano, e só se ouve no refrão', () => {
  const ios = ler('src/components/PreEscutaDoRefrao.tsx');
  assert.match(ios, /resolveYouTubeHls\(videoId, 'saver'\)/);
  assert.match(ios, /p\.showNowPlayingNotification = false;\n\s+p\.staysActiveInBackground = false;/);
  assert.match(ios, /if \(!vivo \|\| soou \|\| currentTime < inicioS - 2\) return;/);
  assert.doesNotMatch(ios, /playbackRate/, 'mexer no rate arranca a reprodução');
  // O do PC vai para o fim do body: o EQ do processo principal usa o primeiro frame.
  assert.match(ler('src/desktop/PreEscutaDoRefrao.web.tsx'), /document\.body\.appendChild\(anfitriao\);/);
});

await t('iPhone: o auscultador só nas descobertas', () => {
  const pesquisa = ler('src/screens/SearchScreen.tsx');
  assert.equal((pesquisa.match(/<BotaoDoRefrao /g) ?? []).length, 1, 'nos cartões quadrados (Rare finds)');
  assert.equal((pesquisa.match(/\n\s+refrao\n/g) ?? []).length, 1, 'e nas linhas do Discover daily');
  assert.match(ler('src/screens/PrateleiraScreen.tsx'), /refrao=\{fonte\.tipo === 'prateleira' && \(fonte\.nome === 'descobrir' \|\| fonte\.nome === 'nuncaLancado'\)\}/);
});

await t('a risca só da curva, e só pede com a barra à vista', () => {
  const st = ler('src/state/refrao.ts');
  assert.match(st, /if \(!ligada \|\| !aVista \|\| !id \|\| ponto\?\.id === id\) return;/);
  assert.match(st, /if \(viva && r\.daCurva\) setPonto/);
  assert.match(ler('src/components/PlayerRoot.tsx'), /const refraoS = usePontoNaBarra\(usePlayer\(\(s\) => s\.current\), aberto\);/);
});

console.log('O refrão primeiro: o pedido com memória, a pré-escuta, o abafo, a risca e os cartões passaram.');
process.exit(0);
