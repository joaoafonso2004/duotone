/**
 * O Recommended do equalizador -- src/lib/autoeq.ts.
 *
 * node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-autoeq.ts
 */
import assert from 'node:assert/strict';
import {
  classificarSaida, encontrarModelo, linhaDoRecomendado, modeloPorNome, modelosMedidos, partesDoRotuloDoWindows,
  procurarModelos, recomendar, semDono,
} from '../src/lib/autoeq.ts';
import { BANDAS, ETIQUETAS_BANDAS, GANHO_MAXIMO } from '../src/lib/equalizer.ts';

function t(nome: string, f: () => void) {
  f();
  console.log(`  ok - ${nome}`);
}

const bt = (nome: string) => ({ tipo: 'BluetoothA2DPOutput', nome });
const pc = (nome: string) => ({ tipo: 'windows', nome });

t('os dados: milhares de modelos, dez bandas, dentro do limite', () => {
  const todos = modelosMedidos();
  assert.ok(todos.length > 5000, `só ${todos.length}`);
  for (const m of todos) {
    assert.equal(m.ganhos.length, BANDAS.length, m.nome);
    assert.ok(m.ganhos.every((g) => Number.isFinite(g) && Math.abs(g) <= 10 && Math.abs(g) <= GANHO_MAXIMO), m.nome);
  }
  assert.equal(new Set(todos.map((m) => m.nome)).size, todos.length, 'nomes repetidos');
});

t('a correção conhecida: os Sony XM4 descem os graves médios e sobem a presença', () => {
  const xm4 = modeloPorNome('Sony WH-1000XM4')!;
  const banda = (e: string) => xm4.ganhos[ETIQUETAS_BANDAS.indexOf(e)];
  assert.ok(banda('PUNCH') < -1, `PUNCH ${banda('PUNCH')}`);
  assert.ok(banda('PRES') > 1, `PRES ${banda('PRES')}`);
});

t('o dono sai do nome', () => {
  assert.equal(semDono('AirPods Pro de João'), 'AirPods Pro');
  assert.equal(semDono("João's AirPods"), 'AirPods');
  assert.equal(semDono('WH-1000XM5'), 'WH-1000XM5');
});

t('os AirPods pelo nome do iOS: a geração mais recente medida', () => {
  assert.equal(encontrarModelo('AirPods Pro de João')?.nome, 'Apple AirPods Pro 2');
  assert.equal(encontrarModelo("João's AirPods")?.nome, 'Apple AirPods 4');
  assert.equal(encontrarModelo('AirPods Max')?.nome, 'Apple AirPods Max');
});

t('outros pelo modelo, com ou sem a marca, sem as variantes entre parênteses', () => {
  assert.equal(encontrarModelo('WH-1000XM5')?.nome, 'Sony WH-1000XM5');
  assert.equal(encontrarModelo('Sony WH-1000XM4')?.nome, 'Sony WH-1000XM4');
  assert.equal(encontrarModelo('WF-1000XM5')?.nome, 'Sony WF-1000XM5');
});

t('um nome vago não adivinha', () => {
  assert.equal(encontrarModelo('Sony'), null);
  assert.equal(encontrarModelo('Headphones'), null);
  assert.equal(encontrarModelo('JBL Flip 6'), null);
  assert.equal(encontrarModelo('ab'), null);
});

t('o rótulo do Windows, em inglês e em português', () => {
  assert.deepEqual(partesDoRotuloDoWindows('Default - Headphones (WH-1000XM5)'), { tipo: 'Headphones', nome: 'WH-1000XM5' });
  assert.deepEqual(partesDoRotuloDoWindows('Predefinição - Auscultadores (2- WH-1000XM4 Stereo)'), { tipo: 'Auscultadores', nome: 'WH-1000XM4' });
  assert.deepEqual(partesDoRotuloDoWindows('Headset (WH-1000XM5 Hands-Free AG Audio)'), { tipo: 'Headset', nome: 'WH-1000XM5' });
  assert.deepEqual(partesDoRotuloDoWindows('Speakers (Realtek(R) Audio)'), { tipo: 'Speakers', nome: 'Realtek(R) Audio' });
});

t('iPhone: AirPods reconhecidos', () => {
  const r = recomendar(bt('AirPods Pro de João'), {});
  assert.equal(r.estado, 'medido');
  assert.equal(r.modelo, 'Apple AirPods Pro 2');
  assert.equal(r.escolhido, false);
  assert.deepEqual(r.ganhos, modeloPorNome('Apple AirPods Pro 2')!.ganhos);
  assert.deepEqual(linhaDoRecomendado(r, 'ios'), { texto: 'Tuned for ', destaque: 'Apple AirPods Pro 2', acao: 'Change' });
});

t('iPhone: com fio só diz "Headphones", e pergunta-se', () => {
  const r = recomendar({ tipo: 'Headphones', nome: 'Headphones' }, {});
  assert.equal(r.estado, 'escolher');
  assert.ok(r.ganhos.every((g) => g === 0));
  assert.equal(linhaDoRecomendado(r, 'ios').acao, 'Choose');
});

t('a escolha à mão fica para essa saída', () => {
  const escolhas = { Headphones: 'Sennheiser HD 600' };
  const r = recomendar({ tipo: 'Headphones', nome: 'Headphones' }, escolhas);
  assert.equal(r.estado, 'medido');
  assert.equal(r.escolhido, true);
  assert.equal(r.modelo, 'Sennheiser HD 600');
  // E manda mais do que o nome: uns AirPods Pro que afinal são os primeiros.
  const airpods = recomendar(bt('AirPods Pro de João'), { 'AirPods Pro de João': 'Apple AirPods Pro' });
  assert.equal(airpods.modelo, 'Apple AirPods Pro');
  // Um modelo que deixou de existir nas medições é ignorado.
  assert.equal(recomendar({ tipo: 'Headphones', nome: 'Headphones' }, { Headphones: 'Não existe' }).estado, 'escolher');
});

t('o altifalante do iPhone e o AirPlay ficam planos, sem escolha', () => {
  const r = recomendar({ tipo: 'Speaker', nome: 'Speaker' }, {});
  assert.equal(r.estado, 'altifalante');
  assert.ok(r.ganhos.every((g) => g === 0));
  assert.deepEqual(linhaDoRecomendado(r, 'ios'), { texto: 'iPhone speaker · no correction, stays flat', destaque: null, acao: null });
  assert.equal(recomendar({ tipo: 'AirPlay', nome: 'Sala' }, {}).estado, 'altifalante');
  assert.equal(recomendar(null, {}).estado, 'altifalante');
});

t('uma coluna Bluetooth com nome: plana, e pode escolher-se', () => {
  const r = recomendar(bt('JBL Flip 6'), {});
  assert.equal(r.estado, 'sem-medicao');
  assert.equal(linhaDoRecomendado(r, 'ios').texto, 'No measurements for JBL Flip 6 · stays flat');
});

t('PC: os Sony pela saída do Windows', () => {
  const r = recomendar(pc('Default - Headphones (WH-1000XM5)'), {});
  assert.equal(r.modelo, 'Sony WH-1000XM5');
  assert.equal(r.saida.nome, 'WH-1000XM5');
  assert.equal(recomendar(pc('Predefinição - Auscultadores (2- WH-1000XM4 Stereo)'), {}).modelo, 'Sony WH-1000XM4');
});

t('PC: a ficha da placa de som pede o modelo, porque podem ser auscultadores', () => {
  const r = recomendar(pc('Default - Speakers (Realtek(R) Audio)'), {});
  assert.equal(r.estado, 'escolher');
  assert.equal(classificarSaida(pc('Speakers (Realtek(R) Audio)')).classe, 'colunas');
  assert.deepEqual(linhaDoRecomendado(r, 'pc'), { texto: 'Speakers · no correction, stays flat', destaque: null, acao: 'Choose headphones' });
  const escolhido = recomendar(pc('Default - Speakers (Realtek(R) Audio)'), { 'Realtek(R) Audio': 'Sennheiser HD 650' });
  assert.equal(escolhido.modelo, 'Sennheiser HD 650');
});

t('a pesquisa da lista: todas as palavras, os nomes curtos primeiro', () => {
  const hd6 = procurarModelos('hd 6').map((m) => m.nome);
  assert.ok(hd6.slice(0, 3).includes('Sennheiser HD 600'), hd6.slice(0, 5).join(', '));
  assert.ok(hd6.indexOf('Sennheiser HD 600') < hd6.indexOf('Denon AH-D600'), 'o "hd" a meio de uma palavra vem depois');
  assert.ok(procurarModelos('xm5').some((m) => m.nome === 'Sony WH-1000XM5'));
  assert.equal(procurarModelos('zzzzqqq').length, 0);
  assert.ok(procurarModelos('a', 10).length <= 10);
});

t('antes de se escrever, as sugestões existem todas', () => {
  const sugestoes = procurarModelos('');
  assert.ok(sugestoes.length >= 10, `só ${sugestoes.length}`);
  assert.equal(sugestoes[0].nome, 'Apple AirPods Pro 2');
});

console.log('O Recommended do equalizador: as medições, o aparelho pelo nome, a escolha à mão e a lista passaram.');
