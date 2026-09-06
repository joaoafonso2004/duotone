// Fila de downloads: um de cada vez, e quem espera entra por ordem.
//
// O que isto protege: cada download reserva o ficheiro inteiro em memória, por
// isso dois em paralelo podiam pedir meio giga num telemóvel. E os dois riscos
// de serializar estão aqui: a faixa seguinte ficar presa atrás de uma gravação
// de fundo (buraco no crossfade), e — o que aconteceu de verdade — uma vaga
// que nunca é largada calar a app até alguém a reiniciar.
import assert from 'node:assert/strict';
import {
  estadoDaFila, forcarPrazoDasVagas, largarVez, limparFila, pedirVez,
} from '../src/lib/filaDeDownloads.ts';

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

const passo = () => new Promise((r) => setTimeout(r, 0));

console.log('Fila de downloads:');

await verificar('o primeiro entra sem esperar', async () => {
  await pedirVez('explicito');
  assert.equal(estadoDaFila().aDescarregar, 1);
});

await verificar('o segundo fica à espera', async () => {
  await pedirVez('reproducao');
  let entrou = false;
  void pedirVez('explicito').then(() => { entrou = true; });
  await passo();
  assert.equal(entrou, false, 'entrou com a vaga ocupada');
  assert.equal(estadoDaFila().emEspera, 1);
});

await verificar('largar a vez deixa entrar o seguinte', async () => {
  const bilhete = await pedirVez('reproducao');
  let entrou = false;
  const espera = pedirVez('explicito').then(() => { entrou = true; });
  largarVez(bilhete);
  await espera;
  assert.equal(entrou, true);
  assert.equal(estadoDaFila().aDescarregar, 1);
});

await verificar('a reprodução passa à frente de quem já esperava', async () => {
  let bilhete = await pedirVez('reproducao');
  const ordem: string[] = [];
  const guardar = (nome: string) => (b: number) => { ordem.push(nome); bilhete = b; };
  void pedirVez('explicito').then(guardar('explicito'));
  void pedirVez('seguinte').then(guardar('seguinte'));
  void pedirVez('reproducao').then(guardar('reproducao'));
  await passo();

  for (let i = 0; i < 3; i++) { largarVez(bilhete); await passo(); }
  assert.deepEqual(ordem, ['reproducao', 'seguinte', 'explicito'],
    'a ordem de serviço não respeitou a prioridade');
});

await verificar('a faixa seguinte não fica presa atrás de uma gravação de fundo', async () => {
  const bilhete = await pedirVez('explicito'); // uma gravação de fundo apanhou a vaga
  const ordem: string[] = [];
  void pedirVez('explicito').then(() => ordem.push('outra-de-fundo'));
  void pedirVez('seguinte').then(() => ordem.push('seguinte'));
  await passo();

  largarVez(bilhete); await passo();
  assert.deepEqual(ordem, ['seguinte'], 'o crossfade ficaria à espera da gravação de fundo');
});

await verificar('entre iguais, quem pediu primeiro entra primeiro', async () => {
  let bilhete = await pedirVez('reproducao');
  const ordem: number[] = [];
  for (const n of [1, 2, 3]) void pedirVez('explicito').then((b) => { ordem.push(n); bilhete = b; });
  await passo();
  for (let i = 0; i < 3; i++) { largarVez(bilhete); await passo(); }
  assert.deepEqual(ordem, [1, 2, 3]);
});

// ---- o encravamento -------------------------------------------------------
//
// O que se viu no telemóvel: qualquer faixa não descarregada ficava em 0:00,
// trocar de música não resolvia, e só reiniciar a app punha os downloads a
// andar outra vez. Uma vaga presa cala tudo o que vem a seguir.

await verificar('uma vaga que ninguém larga é recuperada pelo prazo', async () => {
  await pedirVez('reproducao'); // e nunca a larga
  let entrou = false;
  void pedirVez('reproducao').then(() => { entrou = true; });
  await passo();
  assert.equal(entrou, false, 'entrou com a vaga ocupada');

  forcarPrazoDasVagas();
  await passo();
  assert.equal(entrou, true, 'a fila ficou encravada -- é isto que obrigava a reiniciar a app');
});

await verificar('o job atrasado não desconta a vaga que já lhe foi recuperada', async () => {
  const bilhete = await pedirVez('reproducao');
  forcarPrazoDasVagas();
  await passo();
  const b2 = await pedirVez('explicito');
  // O primeiro acaba agora, tarde: o bilhete dele já não vale nada.
  largarVez(bilhete);
  assert.equal(estadoDaFila().aDescarregar, 1,
    'a fila passou a achar que tem lugar a mais do que tem');
  largarVez(b2);
  assert.equal(estadoDaFila().aDescarregar, 0);
});

await verificar('largar um bilhete inventado não mexe na fila', async () => {
  const bilhete = await pedirVez('reproducao');
  largarVez(99999);
  assert.equal(estadoDaFila().aDescarregar, 1);
  largarVez(bilhete);
  assert.equal(estadoDaFila().aDescarregar, 0);
});

await verificar('largar duas vezes o mesmo bilhete conta uma', async () => {
  const bilhete = await pedirVez('reproducao');
  largarVez(bilhete);
  largarVez(bilhete);
  assert.equal(estadoDaFila().aDescarregar, 0);
});

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam`);
  process.exit(1);
}
console.log('\nFila de downloads: todos os casos passaram.');
