// Grupos e amigos numa lista so, em Node puro.
import assert from 'node:assert/strict';
import { ordenarConversas } from '../src/lib/ordemDasConversas.ts';

const g = (id: string, nome: string) => ({ id, nome, grupo: { id } });
const a = (id: string, nome: string) => ({ id, nome, amigo: { id } });

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

verificar('com a migracao aplicada, tudo se mistura pela hora', () => {
  const r = ordenarConversas(
    [g('gr1', 'Grupo')],
    [a('am1', 'Ana'), a('am2', 'Bruno')],
    { am1: 300, gr1: 200, am2: 100 },
  );
  assert.deepEqual(r.map((x) => x.id), ['am1', 'gr1', 'am2']);
});

verificar('SEM a migracao, os grupos ficam a cabeca e nao no fundo', () => {
  // Nenhum grupo tem data. Misturar mandava-o para tras de conversas antigas.
  const r = ordenarConversas(
    [g('gr1', 'Grupo')],
    [a('am1', 'Ana'), a('am2', 'Bruno')],
    { am1: 300, am2: 100 },
  );
  assert.deepEqual(r.map((x) => x.id), ['gr1', 'am1', 'am2']);
});

verificar('basta UM grupo com data para se assumir a migracao', () => {
  const r = ordenarConversas(
    [g('gr1', 'Antigo'), g('gr2', 'Novo')],
    [a('am1', 'Ana')],
    { am1: 200, gr2: 300 },
  );
  // O gr1 nao tem data: cai para o fim, como um amigo sem conversa.
  assert.deepEqual(r.map((x) => x.id), ['gr2', 'am1', 'gr1']);
});

verificar('quem nunca falou ordena-se por nome, e nao ao acaso', () => {
  const r = ordenarConversas([], [a('c', 'Carlos'), a('b', 'Bruno'), a('x', 'Ana')], {});
  assert.deepEqual(r.map((x) => x.nome), ['Ana', 'Bruno', 'Carlos']);
});

verificar('quem falou vem sempre antes de quem nunca falou', () => {
  const r = ordenarConversas([], [a('z', 'Zeca'), a('an', 'Ana')], { z: 5 });
  assert.deepEqual(r.map((x) => x.nome), ['Zeca', 'Ana']);
});

verificar('o tipo viaja com a entrada, para a linha saber o que desenhar', () => {
  const r = ordenarConversas([g('gr1', 'G')], [a('am1', 'A')], { gr1: 2, am1: 1 });
  assert.equal(r[0].tipo, 'grupo');
  assert.equal(r[1].tipo, 'amigo');
});

verificar('listas vazias nao rebentam', () => {
  assert.deepEqual(ordenarConversas([], [], {}), []);
});

console.log(falhas === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
