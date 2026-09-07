// Quem está lá, e quando se arranca. Onda 5 do ouvir-juntos.
//
// Estas são as decisões que separam uma demonstração de uma coisa que se usa:
// não é o caso em que corre tudo bem, é o resto. Alguém que fecha a app à
// bruta, alguém em 3G mau, alguém que nunca chega a ter a faixa.
//
// Testáveis sem rede, sem áudio e sem duas pessoas -- que é precisamente o que
// as torna difíceis de acertar no telemóvel.
import assert from 'node:assert/strict';
import {
  decisaoDeArranque, estaPresente, estadoDaSessao, presentes,
  ESPERA_MAXIMA_MS, PRESENCA_VALIDA_MS,
} from '../src/lib/sessaoViva.ts';

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok - ${nome}`);
  } catch (e) {
    falhas++;
    console.log(`  FALHOU - ${nome}: ${(e as Error).message}`);
  }
}

const AGORA = 1_000_000;
const m = (userId: string, hàQuanto: number, pronta = true) =>
  ({ userId, vistoEm: AGORA - hàQuanto, pronta });

console.log('Quem está presente:');

verificar('quem bateu há pouco está presente', () => {
  assert.equal(estaPresente(m('a', 0), AGORA), true);
  assert.equal(estaPresente(m('a', PRESENCA_VALIDA_MS - 1), AGORA), true);
});

verificar('quem desapareceu sem se despedir sai da lista', () => {
  // Fechar a app a bruta, a bateria acabar, o metro entrar num tunel. Sem isto
  // a pessoa ficava na lista para sempre -- e uma sessao com fantasmas diz uma
  // coisa FALSA, que e pior do que nao dizer nada.
  assert.equal(estaPresente(m('a', PRESENCA_VALIDA_MS + 1), AGORA), false);
});

verificar('a folga chega para dois batimentos', () => {
  // O cliente bate de 30 em 30 segundos. Com menos de dois batimentos de
  // folga, um atraso de rede fazia as pessoas piscar para fora da lista.
  assert.ok(
    PRESENCA_VALIDA_MS >= 60_000,
    `${PRESENCA_VALIDA_MS} ms é pouco: um atraso normal apagava alguém da lista`
  );
});

verificar('um carimbo no futuro conta como presente', () => {
  // Relogio local atrasado face ao servidor. Esconder alguem por causa disso
  // era castigar uma pessoa por um erro nosso.
  assert.equal(estaPresente(m('a', -5000), AGORA), true);
});

verificar('presentes filtra e mantém a ordem', () => {
  const lista = [m('a', 0), m('b', PRESENCA_VALIDA_MS + 10), m('c', 1000)];
  assert.deepEqual(presentes(lista, AGORA).map((x) => x.userId), ['a', 'c']);
});

console.log('\nQuando se arranca:');

verificar('com todos prontos, arranca já', () => {
  const d = decisaoDeArranque({ membros: [m('a', 0), m('b', 0)], agora: AGORA, desdeQuandoMs: 0 });
  assert.deepEqual(d, { tipo: 'arrancar' });
});

verificar('falta alguém e ainda há tempo: espera-se', () => {
  const d = decisaoDeArranque({
    membros: [m('a', 0), m('b', 0, false)], agora: AGORA, desdeQuandoMs: 1000,
  });
  assert.deepEqual(d, { tipo: 'esperar', faltam: 1 });
});

verificar('passado o tecto, arranca mesmo sem eles', () => {
  // Sem tecto, um amigo em 3G mau congela a sessao inteira e ninguem percebe
  // porque. "Entrou a meio" e melhor do que "as vezes nao toca".
  const d = decisaoDeArranque({
    membros: [m('a', 0), m('b', 0, false)], agora: AGORA, desdeQuandoMs: ESPERA_MAXIMA_MS,
  });
  assert.deepEqual(d, { tipo: 'arrancar' });
});

verificar('não se espera por um fantasma', () => {
  // Alguem que fechou a app e nunca vai ficar pronto. Esperar por ele era
  // esperar ate ao tecto em TODAS as faixas, para sempre.
  const d = decisaoDeArranque({
    membros: [m('a', 0), m('fantasma', PRESENCA_VALIDA_MS + 10, false)],
    agora: AGORA, desdeQuandoMs: 0,
  });
  assert.deepEqual(d, { tipo: 'arrancar' }, 'ficou à espera de quem já não está lá');
});

verificar('sozinho, arranca sempre', () => {
  const d = decisaoDeArranque({ membros: [m('eu', 0)], agora: AGORA, desdeQuandoMs: 0 });
  assert.deepEqual(d, { tipo: 'arrancar' });
});

verificar('o tecto é curto o suficiente para não parecer avaria', () => {
  assert.ok(
    ESPERA_MAXIMA_MS > 0 && ESPERA_MAXIMA_MS <= 15_000,
    `${ESPERA_MAXIMA_MS} ms de silêncio entre faixas lê-se como a app estar partida`
  );
});

console.log('\nO que a barra diz:');

const q = (nome: string, hàQuanto: number, pronta: boolean, percentagem = 0) =>
  ({ userId: nome, nome, vistoEm: AGORA - hàQuanto, pronta, percentagem });

verificar('sem ninguém, diz que se está à espera', () => {
  assert.equal(estadoDaSessao({ outros: [], agora: AGORA }), 'À espera de quem convidaste');
});

verificar('com quem falta, é isso que se diz -- e não quem está', () => {
  // Enquanto alguem nao consegue ouvir, e isso que interessa. A lista de
  // presentes pode esperar; a espera sem explicacao le-se como avaria.
  const s = estadoDaSessao({
    outros: [q('zyn', 0, true), q('miguel', 0, false, 40)], agora: AGORA,
  });
  assert.equal(s, 'miguel a descarregar · 40%');
});

verificar('com vários a descarregar, conta-os', () => {
  const s = estadoDaSessao({
    outros: [q('a', 0, false, 10), q('b', 0, false, 20)], agora: AGORA,
  });
  assert.equal(s, '2 pessoas a descarregar');
});

verificar('com todos prontos, diz com quem se está', () => {
  assert.equal(estadoDaSessao({ outros: [q('zyn', 0, true)], agora: AGORA }), 'A ouvir com zyn');
  assert.equal(
    estadoDaSessao({ outros: [q('a', 0, true), q('b', 0, true)], agora: AGORA }),
    'A ouvir com 2 amigos'
  );
});

verificar('os fantasmas não entram na contagem', () => {
  const s = estadoDaSessao({
    outros: [q('zyn', 0, true), q('foi-se', PRESENCA_VALIDA_MS + 10, true)], agora: AGORA,
  });
  assert.equal(s, 'A ouvir com zyn', 'contou alguém que já tinha ido embora');
});

verificar('um fantasma que nunca ficou pronto também não conta', () => {
  const s = estadoDaSessao({
    outros: [q('zyn', 0, true), q('foi-se', PRESENCA_VALIDA_MS + 10, false, 30)], agora: AGORA,
  });
  assert.equal(s, 'A ouvir com zyn', 'a barra ficava presa em "a descarregar" para sempre');
});

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam`);
  process.exit(1);
}
console.log('\nSessão viva: sem fantasmas, e ninguém fica à espera para sempre.');
