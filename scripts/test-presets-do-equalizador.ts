/**
 * Os presets do equalizador -- src/lib/presetsDoEqualizador.ts.
 *
 * node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-presets-do-equalizador.ts
 */
import assert from 'node:assert/strict';
import { PERFIS, PLANO } from '../src/lib/equalizer.ts';
import {
  apagarPreset, CHAVE_DO_CARRO, criarPreset, daPersistenciaDePresets, dadosDaLinha, definirPresetDoCarro,
  editarPreset, estaNoCarro, fundirPresets, lerLinha, limparNome, marcarBluetoothDoCarro, mostrarPreset,
  novoIdDePreset, podeGuardarComoPreset, presetDoCarro, presetDosGanhos, presetsVisiveis, reporPreset,
  resolverPresets, resumoDosPresets, type MemoriaDePresets,
  aparelhosComPreset, chaveDoAparelho, definirPresetDoAparelho, eAparelhoComPreset, presetDaSaida, presetDoAparelho,
} from '../src/lib/presetsDoEqualizador.ts';

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); } catch (e) { falhas++; console.log(`  FALHA - ${nome}\n    ${(e as Error).message}`); }
}

const CARRO = [2, 0, 0.5, 0, 0, 0, 0.5, 1, 1, 1.5];
const bass = PERFIS.find((p) => p.id === 'bass')!;

verificar('sem nada guardado são os da app, todos visíveis, pela ordem de sempre', () => {
  const lista = resolverPresets({});
  assert.deepEqual(lista.map((p) => p.id), PERFIS.map((p) => p.id));
  assert.ok(lista.every((p) => p.daApp && !p.editado && !p.escondido));
});

verificar('criar um preset: aparece a seguir aos da app, com o nome limpo', () => {
  const m = criarPreset({}, 'u-1', '  My   car ', CARRO, 1000);
  const lista = resolverPresets(m);
  assert.equal(lista.at(-1)!.id, 'u-1');
  assert.equal(lista.at(-1)!.nome, 'My car');
  assert.equal(lista.at(-1)!.daApp, false);
  assert.equal(criarPreset({}, 'u-2', '   ', CARRO, 1000)['u-2'], undefined, 'sem nome não se cria');
  assert.equal(criarPreset({}, 'bass', 'X', CARRO, 1000)['bass'], undefined, 'não pisa um da app');
  assert.equal(criarPreset({}, CHAVE_DO_CARRO, 'X', CARRO, 1000)[CHAVE_DO_CARRO], undefined);
});

verificar('os teus aparecem pela ordem em que nasceram', () => {
  let m = criarPreset({}, 'u-b', 'Second', CARRO, 2000);
  m = criarPreset(m, 'u-a', 'First', PLANO, 1000);
  assert.deepEqual(resolverPresets(m).slice(-2).map((p) => p.nome), ['First', 'Second']);
});

verificar('editar um da app: fica editado, e voltar à curva original é o mesmo que restaurar', () => {
  let m = editarPreset({}, 'bass', { ganhos: [3, 0, 1, 0, 0, 0, 0, 0, 0, 0] }, 1000);
  let b = resolverPresets(m).find((p) => p.id === 'bass')!;
  assert.equal(b.editado, true);
  assert.deepEqual(b.ganhos, [3, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
  m = editarPreset(m, 'bass', { ganhos: bass.ganhos }, 2000);
  b = resolverPresets(m).find((p) => p.id === 'bass')!;
  assert.equal(b.editado, false, 'a curva original guarda-se como null');
  assert.equal((m.bass as { ganhos: unknown }).ganhos, null);
});

verificar('mudar o nome de um da app, e restaurar', () => {
  let m = editarPreset({}, 'noite', { nome: 'Quiet' }, 1000);
  assert.equal(resolverPresets(m).find((p) => p.id === 'noite')!.nome, 'Quiet');
  m = reporPreset(m, 'noite', 2000);
  const n = resolverPresets(m).find((p) => p.id === 'noite')!;
  assert.equal(n.nome, 'Late night');
  assert.equal(n.editado, false);
  assert.equal(editarPreset(m, 'noite', { nome: '  ' }, 3000), m, 'um nome vazio não muda nada');
});

verificar('restaurar mantém escondido o que estava escondido', () => {
  let m = mostrarPreset({}, 'warm', false, 1000);
  m = editarPreset(m, 'warm', { ganhos: CARRO }, 2000);
  m = reporPreset(m, 'warm', 3000);
  assert.equal(resolverPresets(m).find((p) => p.id === 'warm')!.escondido, true);
});

verificar('esconder tira da fila do equalizador, e só dela', () => {
  let m = criarPreset({}, 'u-1', 'Car', CARRO, 1000);
  m = mostrarPreset(m, 'vocal', false, 2000);
  m = mostrarPreset(m, 'u-1', false, 3000);
  assert.deepEqual(presetsVisiveis(m).map((p) => p.id), ['flat', 'bass', 'warm', 'bright', 'noite']);
  assert.equal(resolverPresets(m).length, 7, 'continuam na lista das Definições');
  m = mostrarPreset(m, 'u-1', true, 4000);
  assert.ok(presetsVisiveis(m).some((p) => p.id === 'u-1'));
});

verificar('apagar: só os teus, com lápide, e o carro deixa de apontar para ele', () => {
  let m = criarPreset({}, 'u-1', 'Car', CARRO, 1000);
  m = definirPresetDoCarro(m, 'u-1', 2000);
  m = apagarPreset(m, 'u-1', 3000);
  assert.equal(resolverPresets(m).some((p) => p.id === 'u-1'), false);
  assert.equal((m['u-1'] as { apagado: boolean }).apagado, true, 'a lápide fica');
  assert.equal(presetDoCarro(m), null);
  assert.equal(apagarPreset(m, 'bass', 4000), m, 'os da app não se apagam');
  assert.equal(mostrarPreset(m, 'u-1', true, 5000), m, 'um apagado não volta por mostrar');
});

verificar('a lápide ganha ao aparelho que ainda o tinha', () => {
  const antes = criarPreset({}, 'u-1', 'Car', CARRO, 1000);
  const aqui = apagarPreset(antes, 'u-1', 5000);
  assert.equal(resolverPresets(fundirPresets(antes, aqui)).some((p) => p.id === 'u-1'), false);
  assert.equal(resolverPresets(fundirPresets(aqui, antes)).some((p) => p.id === 'u-1'), false);
});

verificar('a fusão é linha a linha: o carro e um preset mexidos em aparelhos diferentes sobrevivem os dois', () => {
  const base = criarPreset({}, 'u-1', 'Car', CARRO, 1000);
  const telemovel = definirPresetDoCarro(base, 'u-1', 3000);
  const pc = editarPreset(base, 'u-1', { nome: 'Car 2' }, 4000);
  const junto = fundirPresets(telemovel, pc);
  assert.equal(presetDoCarro(junto)!.nome, 'Car 2');
  assert.deepEqual(fundirPresets(pc, telemovel), junto, 'a ordem não importa');
});

verificar('o visto nunca anda para trás, nem com o relógio atrasado', () => {
  let m = criarPreset({}, 'u-1', 'A', CARRO, 5000);
  m = editarPreset(m, 'u-1', { nome: 'B' }, 1000);
  assert.ok(m['u-1'].visto > 5000);
});

verificar('o preset do carro, escondido ou não', () => {
  let m = definirPresetDoCarro({}, 'noite', 1000);
  m = mostrarPreset(m, 'noite', false, 2000);
  assert.equal(presetDoCarro(m)!.id, 'noite', 'esconder é da fila de perfis, não do carro');
  assert.equal(presetDoCarro(definirPresetDoCarro(m, null, 3000)), null);
  assert.equal(presetDoCarro(definirPresetDoCarro({}, 'u-nao-existe', 1000)), null);
});

verificar('estamos no carro: CarPlay sempre, Bluetooth só se marcado', () => {
  let m = marcarBluetoothDoCarro({}, ' BMW 51234 ', true, 1000);
  assert.equal(estaNoCarro({ tipo: 'CarAudio', nome: 'CarPlay' }, {}), true);
  assert.equal(estaNoCarro({ tipo: 'BluetoothA2DPOutput', nome: 'BMW 51234' }, m), true);
  assert.equal(estaNoCarro({ tipo: 'BluetoothA2DPOutput', nome: 'AirPods' }, m), false);
  assert.equal(estaNoCarro({ tipo: 'Speaker', nome: 'BMW 51234' }, m), false, 'o nome não basta sem ser Bluetooth');
  assert.equal(estaNoCarro(null, m), false);
  m = marcarBluetoothDoCarro(m, 'BMW 51234', false, 2000);
  assert.equal(estaNoCarro({ tipo: 'BluetoothA2DPOutput', nome: 'BMW 51234' }, m), false);
  m = marcarBluetoothDoCarro(m, 'A', true, 3000);
  m = marcarBluetoothDoCarro(m, 'A', true, 4000);
  assert.deepEqual((m[CHAVE_DO_CARRO] as { bluetooth: string[] }).bluetooth, ['A'], 'sem repetidos');
});

verificar('qual preset tem esta curva, e quando se pode guardar como novo', () => {
  const m = criarPreset({}, 'u-1', 'Car', CARRO, 1000);
  assert.equal(presetDosGanhos(resolverPresets(m), CARRO)!.id, 'u-1');
  assert.equal(presetDosGanhos(resolverPresets(m), bass.ganhos)!.id, 'bass');
  assert.equal(podeGuardarComoPreset(m, CARRO), false, 'já é um preset');
  assert.equal(podeGuardarComoPreset(m, PLANO), false, 'plano não é preset nenhum que valha guardar');
  assert.equal(podeGuardarComoPreset(m, [1, 2, 3, 0, 0, 0, 0, 0, 0, 0]), true);
});

verificar('ler de fora: o que não se percebe fica de fora, e ida e volta dá o mesmo', () => {
  let m = criarPreset({}, 'u-1', 'Car', CARRO, 1000);
  m = definirPresetDoCarro(m, 'u-1', 2000);
  m = marcarBluetoothDoCarro(m, 'BMW', true, 3000);
  m = mostrarPreset(m, 'vocal', false, 4000);
  assert.deepEqual(daPersistenciaDePresets(JSON.stringify(m)), m);
  for (const [k, l] of Object.entries(m)) assert.deepEqual(lerLinha(k, dadosDaLinha(l), l.visto), l);
  assert.deepEqual(daPersistenciaDePresets('não é json'), {});
  assert.equal(lerLinha('u-1', null, 1), null);
  assert.equal(lerLinha('u-1', { nome: 'x' }, NaN), null);
  const estranho = lerLinha('u-9', { nome: 'x'.repeat(80), ganhos: [99, -99], escondido: 'sim' }, 5)!;
  assert.equal((estranho as { nome: string }).nome.length, 30);
  assert.deepEqual((estranho as { ganhos: number[] }).ganhos, [20, -20, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal((estranho as { escondido: boolean }).escondido, false);
});

verificar('nomes e ids', () => {
  assert.equal(limparNome('  a   b  '), 'a b');
  assert.equal(limparNome(''), null);
  assert.notEqual(novoIdDePreset(1000, 0.1), novoIdDePreset(1000, 0.2));
  assert.match(novoIdDePreset(1000, 0.5), /^u-/);
});

verificar('o resumo das Definições', () => {
  let m = mostrarPreset({}, 'vocal', false, 1000);
  assert.equal(resumoDosPresets(m), '5 of 6 shown');
  m = definirPresetDoCarro(m, 'flat', 2000);
  assert.equal(resumoDosPresets(m), '5 of 6 shown · Flat in the car');
});

// 11/10: um preset por auscultador ou coluna, como o do carro.
verificar('o preset de um aparelho entra com ele, e o carro continua a ganhar', () => {
  const AIRPODS = { tipo: 'BluetoothA2DPOutput', nome: 'AirPods Pro de João' };
  const COLUNA = { tipo: 'AirPlay', nome: 'Sala' };
  const IPHONE = { tipo: 'Speaker', nome: 'Speaker' };
  let m: MemoriaDePresets = {};
  assert.equal(presetDaSaida(AIRPODS, m), null, 'sem preset, cada faixa com o seu EQ');
  m = definirPresetDoAparelho(m, 'AirPods Pro de João', 'bass', 1000);
  const p = presetDaSaida(AIRPODS, m);
  assert.ok(p && p.onde === 'aparelho' && p.preset.id === 'bass' && p.aparelho === 'AirPods Pro de João');
  assert.equal(presetDaSaida(COLUNA, m), null, 'outro aparelho não herda');
  assert.equal(presetDaSaida(IPHONE, m), null);
  assert.equal(eAparelhoComPreset(IPHONE, m), false, 'o altifalante do iPhone não é um aparelho');
  assert.equal(eAparelhoComPreset(AIRPODS, m), true);
  // O mesmo Bluetooth marcado como carro: é o carro que vale.
  m = marcarBluetoothDoCarro(definirPresetDoCarro(m, 'flat', 1100), 'AirPods Pro de João', true, 1100);
  const noCarro = presetDaSaida(AIRPODS, m);
  assert.ok(noCarro && noCarro.onde === 'carro' && noCarro.preset.id === 'flat');
  assert.equal(eAparelhoComPreset(AIRPODS, m), false, 'o carro não aparece como aparelho');
});
verificar('desligar, apagar o preset e sincronizar', () => {
  const nome = 'Sony WH-1000XM5';
  let m = criarPreset({}, 'u-meu', 'Meu', CARRO, 1000);
  m = definirPresetDoAparelho(m, nome, 'u-meu', 1100);
  assert.equal(presetDoAparelho(m, nome)?.nome, 'Meu');
  assert.deepEqual(aparelhosComPreset(m).map((a) => [a.nome, a.preset.id]), [[nome, 'u-meu']]);
  assert.equal(resolverPresets(m).some((x) => x.id === chaveDoAparelho(nome)), false, 'um aparelho não é um preset');
  m = apagarPreset(m, 'u-meu', 1200);
  assert.equal(presetDoAparelho(m, nome), null, 'apagado o preset, o aparelho fica sem preset');
  m = definirPresetDoAparelho(m, nome, 'bass', 1300);
  m = definirPresetDoAparelho(m, nome, null, 1400);
  assert.equal(presetDoAparelho(m, nome), null, 'Off');
  // Pelo servidor: a linha vai e volta igual, e o mais recente ganha.
  const chave = chaveDoAparelho(nome);
  const linha = m[chave];
  assert.deepEqual(lerLinha(chave, dadosDaLinha(linha), linha.visto), linha);
  const remoto = definirPresetDoAparelho({}, nome, 'bass', 1500);
  assert.equal(presetDoAparelho(fundirPresets(m, remoto), nome)?.id, 'bass');
});
verificar('a chave cabe no servidor (preset_id até 64)', () => {
  const comprido = 'X'.repeat(200);
  assert.ok(chaveDoAparelho(comprido).length <= 64);
  const m = definirPresetDoAparelho({}, comprido, 'bass', 1);
  assert.equal(presetDoAparelho(m, comprido)?.id, 'bass', 'o mesmo nome comprido encontra-se');
  assert.equal(definirPresetDoAparelho({}, '   ', 'bass', 1)['aparelho:'], undefined, 'sem nome, nada');
});

console.log(falhas === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
