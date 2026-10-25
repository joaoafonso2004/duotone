/**
 * O Recommended do equalizador no leitor: a base que segue os auscultadores
 * (src/state/recomendado.ts e o `eqRecomendado` do src/state/player.ts).
 *
 * node --experimental-strip-types --import ./scripts/registar-duplos.mjs scripts/test-eq-recomendado.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { usePlayer } from '../src/state/player.ts';
import {
  escolherModelo, escolherRecomendadoNaFaixa, iniciarRecomendado, ligarRecomendado, useRecomendado,
} from '../src/state/recomendado.ts';
import { modeloPorNome } from '../src/lib/autoeq.ts';
import { chaveDaFaixa, PLANO } from '../src/lib/equalizer.ts';
import type { Track } from '../src/types.ts';
import { mudarSaida } from './duplos/saidaDeSom.ts';
import { guardado } from './duplos/async-storage.ts';

// Cada passo uns milissegundos depois do anterior, como dois toques a sério: a
// memória dos ajustes funde-se pela data (`fundirAjustes`), e duas escritas da
// mesma faixa no mesmo milissegundo ficam com a primeira.
async function t(nome: string, f: () => void | Promise<void>) {
  await new Promise((r) => setTimeout(r, 5));
  await f();
  console.log(`  ok - ${nome}`);
}

const faixa: Track = { source: 'youtube', sourceId: 'a', title: 'A', artist: 'X', album: null, artworkUrl: null, durationSeconds: 180 };
const chave = chaveDaFaixa(faixa);
const BASS = [5, 0, 1.5, 0, 0, 0, 0, 0, 0, 0];
const airpods = modeloPorNome('Apple AirPods Pro 2')!.ganhos;
const sony = modeloPorNome('Sony WH-1000XM5')!.ganhos;
const hd600 = modeloPorNome('Sennheiser HD 600')!.ganhos;
const st = () => usePlayer.getState();

usePlayer.setState({ current: faixa, ajustesPorFaixa: {}, padraoGanhos: BASS, eqGanhos: BASS, carro: null, playbackRate: 1, padraoRate: 1 });
const largar = iniciarRecomendado();
await new Promise((r) => setTimeout(r, 0));

await t('desligado não muda nada: a faixa toca com o padrão', () => {
  mudarSaida({ tipo: 'BluetoothA2DPOutput', nome: 'AirPods Pro de João' });
  assert.equal(useRecomendado.getState().recomendacao.modelo, 'Apple AirPods Pro 2');
  assert.equal(st().eqRecomendado, null);
  assert.deepEqual(st().eqGanhos, BASS);
});

await t('carregar no Recommended no leitor: liga-o, e a faixa segue-o sem guardar a curva', () => {
  escolherRecomendadoNaFaixa();
  assert.equal(useRecomendado.getState().ligado, true);
  assert.deepEqual(st().eqGanhos, airpods);
  assert.equal(st().ajustesPorFaixa[chave]?.ganhos, null, 'a faixa não congela a curva destes auscultadores');
  assert.equal(guardado.get('pref:eqRecomendado'), '1');
});

await t('trocar de auscultadores muda a curva já, sem esperar pela música seguinte', () => {
  mudarSaida({ tipo: 'BluetoothA2DPOutput', nome: 'WH-1000XM5' });
  assert.deepEqual(st().eqGanhos, sony);
});

await t('mudar só a velocidade não congela a curva', () => {
  st().setPlaybackRate(1.25);
  assert.equal(st().ajustesPorFaixa[chave]?.rate, 1.25);
  assert.equal(st().ajustesPorFaixa[chave]?.ganhos, null);
  mudarSaida({ tipo: 'BluetoothA2DPOutput', nome: 'AirPods Pro de João' });
  assert.deepEqual(st().eqGanhos, airpods);
});

await t('com fio: plano até se escolher o modelo, e depois o escolhido', () => {
  mudarSaida({ tipo: 'Headphones', nome: 'Headphones' });
  assert.equal(useRecomendado.getState().recomendacao.estado, 'escolher');
  assert.deepEqual(st().eqGanhos, PLANO);
  escolherModelo('Headphones', 'Sennheiser HD 600');
  assert.deepEqual(st().eqGanhos, hd600);
  assert.equal(JSON.parse(guardado.get('pref:eqModelosDasSaidas')!).Headphones, 'Sennheiser HD 600');
});

await t('uma faixa com EQ próprio fica com o dela', () => {
  st().setEqGanhos(BASS);
  assert.deepEqual(st().ajustesPorFaixa[chave]?.ganhos, BASS);
  mudarSaida({ tipo: 'BluetoothA2DPOutput', nome: 'WH-1000XM5' });
  assert.deepEqual(st().eqGanhos, BASS);
  // E o Recommended carregado outra vez devolve-a à base.
  escolherRecomendadoNaFaixa();
  assert.deepEqual(st().eqGanhos, sony);
  assert.equal(st().ajustesPorFaixa[chave]?.ganhos, null);
});

await t('a base também vale para as faixas que vêm (o playTrack lê-a)', () => {
  const player = readFileSync(new URL('../src/state/player.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(player, /\{ rate: st\.padraoRate, ganhos: baseDoEq\(st\) \}/);
  assert.match(player, /return s\.eqRecomendado \?\? s\.padraoGanhos;/);
});

await t('desligar volta ao padrão das Definições', () => {
  ligarRecomendado(false);
  assert.equal(st().eqRecomendado, null);
  assert.deepEqual(st().eqGanhos, BASS);
  assert.equal(guardado.get('pref:eqRecomendado'), '0');
});

await t('no carro, o Recommended mexe na curva da viagem e não na faixa', () => {
  ligarRecomendado(true);
  usePlayer.setState({ carro: { presetId: 'bass', nome: 'Bass boost', base: BASS, ganhos: BASS, onde: 'carro' } });
  escolherRecomendadoNaFaixa();
  assert.deepEqual(st().carro?.ganhos, sony);
  usePlayer.setState({ carro: null });
});

largar();
console.log('O Recommended no leitor: liga-se no leitor, segue os auscultadores, respeita o EQ de cada faixa e o carro.');
