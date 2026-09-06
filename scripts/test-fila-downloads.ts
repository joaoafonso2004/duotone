// Fila de downloads: um de cada vez, e quem espera entra por ordem.
//
// O que isto protege: cada download reserva o ficheiro inteiro em memória, por
// isso dois em paralelo podiam pedir meio giga num telemóvel. E o risco de
// serializar é o oposto — a faixa seguinte ficar presa atrás de uma gravação de
// fundo e abrir um buraco no crossfade. Os dois casos estão aqui.
import assert from 'node:assert/strict';
import { estadoDaFila, largarVez, limparFila, pedirVez } from '../src/lib/filaDeDownloads.ts';

let falhas = 0;
async function verificar(nome: string, fn: () => Promise<void> | void) {
  limparFila();
  try {
    await fn();
    console.log(`  ok - ${nome}`);
  } catch (e) {
    falhas++;
    console.log(`  FALHOU - ${nome}: ${(e as Error).message}`);
  }
  limparFila();
}

console.log('Fila de downloads:');

await verificar('o primeiro entra sem esperar', async () => {
  await pedirVez('explicito');
  assert.equal(estadoDaFila().aDescarregar, 1);
});

await verificar('o segundo fica à espera', async () => {
  await pedirVez('reproducao');
  let entrou = false;
  void pedirVez('explicito').then(() => { entrou = true; });
  await Promise.resolve();
  assert.equal(entrou, false, 'entrou com a vaga ocupada');
  assert.equal(estadoDaFila().emEspera, 1);
});

await verificar('largar a vez deixa entrar o seguinte', async () => {
  await pedirVez('reproducao');
  let entrou = false;
  const espera = pedirVez('explicito').then(() => { entrou = true; });
  largarVez();
  await espera;
  assert.equal(entrou, true);
  assert.equal(estadoDaFila().aDescarregar, 1);
});

await verificar('a reprodução passa à frente de quem já esperava', async () => {
  await pedirVez('reproducao'); // ocupa a vaga
  const ordem: string[] = [];
  void pedirVez('explicito').then(() => ordem.push('explicito'));
  void pedirVez('seguinte').then(() => ordem.push('seguinte'));
  void pedirVez('reproducao').then(() => ordem.push('reproducao'));
  await Promise.resolve();

  largarVez(); await new Promise((r) => setTimeout(r, 0));
  largarVez(); await new Promise((r) => setTimeout(r, 0));
  largarVez(); await new Promise((r) => setTimeout(r, 0));

  assert.deepEqual(ordem, ['reproducao', 'seguinte', 'explicito'],
    'a ordem de serviço não respeitou a prioridade');
});

await verificar('a faixa seguinte não fica presa atrás de uma gravação de fundo', async () => {
  await pedirVez('explicito'); // uma gravação de fundo apanhou a vaga
  const ordem: string[] = [];
  void pedirVez('explicito').then(() => ordem.push('outra-de-fundo'));
  void pedirVez('seguinte').then(() => ordem.push('seguinte'));
  await Promise.resolve();

  largarVez(); await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(ordem, ['seguinte'], 'o crossfade ficaria à espera da gravação de fundo');
});

await verificar('entre iguais, quem pediu primeiro entra primeiro', async () => {
  await pedirVez('reproducao');
  const ordem: number[] = [];
  for (const n of [1, 2, 3]) void pedirVez('explicito').then(() => ordem.push(n));
  await Promise.resolve();
  for (let i = 0; i < 3; i++) { largarVez(); await new Promise((r) => setTimeout(r, 0)); }
  assert.deepEqual(ordem, [1, 2, 3]);
});

await verificar('largar a vez sem ninguém a descarregar não fica negativo', () => {
  largarVez();
  largarVez();
  assert.equal(estadoDaFila().aDescarregar, 0);
});

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam`);
  process.exit(1);
}
console.log('\nFila de downloads: todos os casos passaram.');
