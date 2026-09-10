// O aviso de "a extracao esta bloqueada", em Node puro.
import assert from 'node:assert/strict';
import {
  deveAvisar, INICIAL, LIMIAR, marcarAvisado, observar, type Estado,
} from '../src/lib/saudeDaReproducao.ts';

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

const bloqueada = (videoId: string) => ({ tipo: 'falha' as const, falha: 'bloqueio-bot' as const, videoId });
const seguir = (estado: Estado, ...ids: string[]) => ids.reduce((e, id) => observar(e, bloqueada(id)), estado);

console.log('\nsaude da reproducao');

verificar('o limiar e tres, e o teste prende-o', () => {
  assert.equal(LIMIAR, 3, 'uma e azar, duas pode ser; tres seguidas e a porta fechada');
});

verificar('tres faixas diferentes bloqueadas avisam', () => {
  assert.equal(deveAvisar(seguir(INICIAL, 'a', 'b')), false);
  assert.equal(deveAvisar(seguir(INICIAL, 'a', 'b', 'c')), true);
});

verificar('a mesma faixa a falhar outra vez conta uma vez so', () => {
  assert.equal(deveAvisar(seguir(INICIAL, 'a', 'a', 'b', 'b')), false);
});

verificar('cdn e sem formato tambem contam: e a extracao que nao passa', () => {
  let e = observar(INICIAL, { tipo: 'falha', falha: 'cdn-recusou', videoId: 'a' });
  e = observar(e, { tipo: 'falha', falha: 'sem-formato', videoId: 'b' });
  e = observar(e, bloqueada('c'));
  assert.equal(deveAvisar(e), true);
});

verificar('falhas do video e sem rede nao contam nem zeram', () => {
  let e = seguir(INICIAL, 'a', 'b');
  for (const falha of ['indisponivel', 'restrito-idade', 'restrito-regiao', 'embed-bloqueado', 'sem-rede'] as const) {
    e = observar(e, { tipo: 'falha', falha, videoId: `v-${falha}` });
  }
  assert.equal(e.seguidas.length, 2, 'um upload removido nao diz nada sobre a extracao');
  assert.equal(deveAvisar(observar(e, bloqueada('c'))), true);
});

verificar('rede lenta nao avisa: o aviso diz que e o YouTube, tem de ser verdade', () => {
  let e = INICIAL;
  for (const [i, falha] of (['tempo-esgotado', 'desconhecido', 'tempo-esgotado'] as const).entries()) {
    e = observar(e, { tipo: 'falha', falha, videoId: `v${i}` });
  }
  assert.equal(deveAvisar(e), false);
});

verificar('uma faixa nativa zera a contagem', () => {
  const e = observar(seguir(INICIAL, 'a', 'b'), { tipo: 'nativo' });
  assert.equal(e.seguidas.length, 0);
  assert.equal(deveAvisar(seguir(e, 'c', 'd')), false);
});

verificar('avisa uma vez por episodio, e so uma faixa nativa rearma', () => {
  const avisado = marcarAvisado(seguir(INICIAL, 'a', 'b', 'c'));
  assert.equal(deveAvisar(avisado), false, 'nada de insistir faixa apos faixa');
  assert.equal(deveAvisar(seguir(avisado, 'd', 'e', 'f')), false);
  const rearmado = observar(avisado, { tipo: 'nativo' });
  assert.equal(deveAvisar(seguir(rearmado, 'g', 'h', 'i')), true, 'um episodio novo volta a avisar');
});

verificar('nativo sem nada para zerar devolve o mesmo estado', () => {
  assert.equal(observar(INICIAL, { tipo: 'nativo' }), INICIAL, 'quem subscreve nao redesenha a toa');
});

console.log(falhas === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
