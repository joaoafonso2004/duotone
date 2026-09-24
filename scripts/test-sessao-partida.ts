import { juntarSessao, partirSessao } from '../src/lib/sessaoPartida.ts';

let mau = 0;
const eq = (rotulo: string, veio: unknown, esperado: unknown) => {
  const ok = JSON.stringify(veio) === JSON.stringify(esperado);
  if (!ok) mau++;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${rotulo}${ok ? '' : `  -> esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(veio)}`}`);
};

const faixa = (i: number) => ({ source: 'youtube', sourceId: `v${i}`, title: `Faixa ${i}` });
const fila = Array.from({ length: 2000 }, (_, i) => faixa(i));
const valor = (queue: unknown, positionMs: number) => ({ state: { current: faixa(3), queue, queueIndex: 3, positionMs }, version: 0 });

console.log('\nescrever');
const primeira = partirSessao(valor(fila, 1000), undefined);
eq('a primeira escrita leva a fila', primeira.fila !== null, true);
eq('a sessão não a leva lá dentro', 'queue' in JSON.parse(primeira.sessao).state, false);
const segunda = partirSessao(valor(fila, 4000), primeira.filaEscrita);
eq('a posição a andar não reescreve a fila', segunda.fila, null);
eq('e a sessão fica pequena', segunda.sessao.length < 300, true);
const outra = fila.slice(0, 10);
eq('uma fila nova escreve-se', partirSessao(valor(outra, 0), primeira.filaEscrita).fila !== null, true);
eq('uma escrita falhada da fila volta a tentar (filaEscrita só avança quem a grava)', partirSessao(valor(fila, 0), undefined).fila !== null, true);

console.log('\nler');
const lida = juntarSessao(segunda.sessao, primeira.fila);
eq('as duas chaves voltam a ser a sessão inteira', lida?.state.queue && (lida.state.queue as unknown[]).length, 2000);
eq('com a posição da última escrita', lida?.state.positionMs, 4000);
const antiga = JSON.stringify(valor(fila.slice(0, 5), 7));
eq('uma sessão de uma versão anterior (fila lá dentro) abre igual', juntarSessao(antiga, null), valor(fila.slice(0, 5), 7));
eq('a fila de dentro ganha a uma chave velha', (juntarSessao(antiga, JSON.stringify(fila))?.state.queue as unknown[]).length, 5);
const semFila = juntarSessao(segunda.sessao, null);
eq('sem a fila no disco fica a faixa atual sozinha', semFila?.state.queue, [faixa(3)]);
eq('e o índice aponta para ela', semFila?.state.queueIndex, 0);
eq('uma fila ilegível também', juntarSessao(segunda.sessao, '{partido')?.state.queue, [faixa(3)]);
eq('sem sessão, nada', juntarSessao(null, primeira.fila), null);

console.log(mau === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${mau} caso(s) a falhar.\n`);
process.exit(mau === 0 ? 0 : 1);
