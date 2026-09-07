// Trocar a fonte do motor de áudio, uma de cada vez.
//
// O motor falso aqui não é uma invenção: é o `expo-video` 57.0.3 escrito em
// JavaScript, linha por linha a partir do `VideoPlayer.swift` e do
// `VideoSourceLoader.swift`. Serve para provar duas coisas.
//
// Primeiro, que o problema existe: com trocas sobrepostas, o motor acaba a
// segurar uma fonte que já ninguém pediu, enquanto o JS julga que toca outra e
// já mandou tocar. O motor tem a antiga, parada no início -- e fica em 0:00.
//
// Segundo, que serializar resolve, porque sem sobreposição não há cancelamento
// e sem cancelamento não há nenhum destes caminhos.
//
// NOTA sobre uma hipótese minha que este teste DEITOU ABAIXO: eu julgava que a
// bandeira `ownerIsReplacing` ficava levantada para sempre, e que era isso que
// engolia os seeks. Não fica. Quem entra por último nunca é cancelado, e ao
// terminar limpa-a sempre. O defeito é o outro, e é este que está aqui.
import assert from 'node:assert/strict';
import { limparCadeia, trocarFonte } from '../src/lib/trocaDeFonte.ts';

let falhas = 0;
async function verificar(nome: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`  ok - ${nome}`);
  } catch (e) {
    falhas++;
    console.log(`  FALHOU - ${nome}: ${(e as Error).message}`);
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * O `expo-video` tal como está, com os dois defeitos que interessam:
 *
 *  - quem sai pelo `else` do `guard` deixa `ownerIsReplacing` levantada, à
 *    espera que quem cancelou a limpe;
 *  - quem foi CANCELADO também executa `currentTask = nil`, apagando o
 *    registo da tarefa viva -- e a partir daí ninguém mais é cancelado.
 */
class MotorFalso {
  ownerIsReplacing = false;
  currentTask: { cancelado: boolean } | null = null;
  item: string | null = null;
  posicao = 0;
  /** Quantas trocas estão a decorrer AGORA. Serializado, nunca passa de 1. */
  aDecorrer = 0;
  maximoEmParalelo = 0;
  /** Quanto demora a carga de cada fonte, por nome. */
  demora: Record<string, number> = {};

  async replaceAsync(fonte: unknown): Promise<void> {
    const nome = String(fonte);
    this.aDecorrer++;
    this.maximoEmParalelo = Math.max(this.maximoEmParalelo, this.aDecorrer);

    this.ownerIsReplacing = true;

    // VideoSourceLoader.load
    if (this.currentTask) this.currentTask.cancelado = true;
    const minha = { cancelado: false };
    this.currentTask = minha;

    await esperar(this.demora[nome] ?? 10);

    // O erro de contabilidade: mesmo cancelada, esta linha corre.
    this.currentTask = null;
    this.aDecorrer--;

    if (minha.cancelado) {
      // guard ... else { return } -- sai com a bandeira levantada.
      return;
    }

    this.item = nome;
    this.ownerIsReplacing = false;
  }

  /** O setter do `currentTime`: com a bandeira levantada, engole. */
  procurar(segundos: number) {
    if (this.ownerIsReplacing) return;
    this.posicao = segundos;
  }
}

console.log('Troca de fonte:');

// ---- primeiro: provar que o problema existe -------------------------------

await verificar('SEM serializar, duas trocas sobrepõem-se', async () => {
  const m = new MotorFalso();
  m.demora = { a: 40, b: 10 };
  await Promise.all([m.replaceAsync('a'), m.replaceAsync('b')]);
  assert.equal(m.maximoEmParalelo, 2, 'o motor falso não chegou a ter duas em paralelo');
});

await verificar('SEM serializar, o motor fica com uma fonte que ninguém pediu', async () => {
  const m = new MotorFalso();
  // A sequência exacta que o erro de contabilidade do VideoSourceLoader
  // permite. Pedem-se a, b, c por esta ordem -- e o motor fica com o `b`.
  //
  //   a entra           -> currentTask = a
  //   b entra           -> cancela a, currentTask = b
  //   a acaba (5 ms)    -> currentTask = null   <- apaga o registo do b, que
  //                        continua vivo; a sai pelo `else`
  //   c entra (10 ms)   -> currentTask esta a null, por isso NAO cancela o b
  //   c acaba (15 ms)   -> item = c
  //   b acaba (60 ms)   -> ninguem o cancelou: item = b
  //
  // O JS julga que toca o `c` e ja mandou tocar. O motor tem o `b`, parado no
  // inicio. E isto que deixa a faixa em 0:00.
  m.demora = { a: 5, b: 60, c: 5 };
  const primeiras = Promise.all([m.replaceAsync('a'), m.replaceAsync('b')]);
  await esperar(10);
  const terceira = m.replaceAsync('c');
  await Promise.all([primeiras, terceira]);

  assert.equal(
    m.item,
    'b',
    'o modelo deixou de reproduzir o defeito -- sem ele nao ha nada a corrigir'
  );
});

// ---- depois: provar que serializar resolve --------------------------------

await verificar('serializado, nunca há duas ao mesmo tempo', async () => {
  const m = new MotorFalso();
  limparCadeia(m);
  m.demora = { a: 40, b: 10, c: 25 };
  await Promise.all([
    trocarFonte(m, 'a'),
    trocarFonte(m, 'b'),
    trocarFonte(m, 'c'),
  ]);
  assert.equal(m.maximoEmParalelo, 1, `chegou a ter ${m.maximoEmParalelo} trocas em paralelo`);
});

await verificar('serializado, a bandeira desce sempre e os seeks passam', async () => {
  const m = new MotorFalso();
  limparCadeia(m);
  m.demora = { a: 40, b: 10, c: 25 };
  await Promise.all([trocarFonte(m, 'a'), trocarFonte(m, 'b'), trocarFonte(m, 'c')]);
  assert.equal(m.ownerIsReplacing, false, 'a bandeira ficou levantada');
  m.procurar(30);
  assert.equal(m.posicao, 30, 'o seek foi engolido');
});

await verificar('serializado, fica a ÚLTIMA fonte pedida', async () => {
  const m = new MotorFalso();
  limparCadeia(m);
  // A primeira demora muito mais do que a última: sem ordem, a antiga assenta
  // por cima da nova e o motor toca uma faixa que já ninguém quer.
  m.demora = { antiga: 60, nova: 5 };
  await Promise.all([trocarFonte(m, 'antiga'), trocarFonte(m, 'nova')]);
  assert.equal(m.item, 'nova', `o motor ficou com "${m.item}"`);
});

// ---- e que a serialização não cria um encravamento novo -------------------

await verificar('uma troca que nunca volta não tranca a seguinte', async () => {
  const m = new MotorFalso();
  limparCadeia(m);
  let entrou = false;
  const presa = { replaceAsync: () => new Promise<void>(() => {}) };
  void trocarFonte(presa, 'nunca-volta', { prazoMs: 30 });
  await trocarFonte(presa, 'a-seguir', { prazoMs: 30 }).then(() => { entrou = true; });
  assert.equal(entrou, true, 'a cadeia ficou trancada -- trocámos um encravamento por outro');
});

await verificar('uma troca que já não interessa é saltada', async () => {
  const m = new MotorFalso();
  limparCadeia(m);
  m.demora = { primeira: 30, morta: 10, viva: 10 };
  await Promise.all([
    trocarFonte(m, 'primeira'),
    trocarFonte(m, 'morta', { desistir: () => true }),
    trocarFonte(m, 'viva'),
  ]);
  assert.equal(m.item, 'viva', `o motor ficou com "${m.item}" -- a morta não devia ter chegado a carregar`);
});

await verificar('um erro numa troca não impede a seguinte', async () => {
  let segunda = false;
  const motor = {
    n: 0,
    replaceAsync() {
      this.n++;
      if (this.n === 1) return Promise.reject(new Error('falhou'));
      segunda = true;
      return Promise.resolve();
    },
  };
  await trocarFonte(motor, 'x').catch(() => {});
  await trocarFonte(motor, 'y');
  assert.equal(segunda, true, 'a segunda troca não chegou a acontecer');
});

// ---- e no motor certo ------------------------------------------------------
//
// O `player` do YouTubePlayerView sai de `qualMotor`, que e estado do React:
// fica congelado no closure de tudo o que seja `async`. O caminho que poe uma
// faixa a tocar demora entre cinco e trinta segundos, e uma passagem que
// termine a meio disso troca o motor activo.
//
// Quando isso acontece, o audio e instalado no motor que ja nao manda enquanto
// a app olha para o outro: nada toca, a posicao fica em 0:00, e mudar de faixa
// nao resolve. So reiniciar. E o mesmo sintoma da corrida do expo-video, por
// outra porta -- e nenhum tipo o apanha, porque `player` e uma variavel
// perfeitamente valida.

console.log('\nNo motor certo:');

await verificar('as trocas de fonte usam o motor activo AGORA, não o do closure', async () => {
  const { readFileSync } = await import('node:fs');
  const fonte = readFileSync(
    new URL('../src/components/YouTubePlayerView.tsx', import.meta.url),
    'utf8'
  );
  const chamadas = [...fonte.matchAll(/trocarFonte\(\s*([A-Za-z().]+)\s*,/g)].map((m) => m[1]);
  assert.ok(chamadas.length >= 3, `só ${chamadas.length} trocas de fonte -- o teste ficou cego`);

  const permitidos = new Set(['motorActivo()', 'emEspera']);
  const más = chamadas.filter((c) => !permitidos.has(c));
  assert.deepEqual(
    más,
    [],
    'estas trocas usam um motor capturado no render e podem instalar o áudio ' +
      `no motor errado: ${más.join(', ')}`
  );
});

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam`);
  process.exit(1);
}
console.log('\nTroca de fonte: uma de cada vez, no motor certo, e a bandeira desce sempre.');
