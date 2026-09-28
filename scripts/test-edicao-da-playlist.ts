// A edição de uma playlist no iPhone (lib/edicaoDaPlaylist.ts, 28/9): o nome,
// a ordem e o que sai ficam num rascunho, e o Save grava só o que mudou.
import assert from 'node:assert/strict';
import {
  comecarRascunho, desfazerTirada, haAlgoParaGravar, moverNoRascunho, planoDeGravacao, tirarDoRascunho,
} from '../src/lib/edicaoDaPlaylist.ts';

type F = { id: string };
const f = (...ids: string[]): F[] => ids.map((id) => ({ id }));
const ids = (fs: F[]) => fs.map((x) => x.id).join();
const idDe = (x: F) => x.id;
const originais = f('a', 'b', 'c', 'd');
const plano = (r: ReturnType<typeof comecarRascunho<F>>, nome = '2hollis') => planoDeGravacao(r, nome, originais, idDe);

let r = comecarRascunho('2hollis', originais);
assert.equal(haAlgoParaGravar(plano(r)), false, 'abrir e fechar sem mexer não grava nada');

r = moverNoRascunho(r, 0, 2);
assert.equal(ids(r.faixas), 'b,c,a,d', 'arrastar a primeira para o terceiro lugar');
assert.deepEqual(plano(r), { nome: null, tirar: [], ordem: ['b', 'c', 'a', 'd'] });
assert.equal(ids(originais), 'a,b,c,d', 'o original não é tocado');

r = moverNoRascunho(r, 2, 0);
assert.equal(plano(r).ordem, null, 'voltar à ordem de antes não grava ordem nenhuma');
assert.equal(moverNoRascunho(r, 0, 9), r, 'um destino fora da lista não mexe');

r = tirarDoRascunho(r, 1);
assert.equal(ids(r.faixas), 'a,c,d');
assert.deepEqual(plano(r), { nome: null, tirar: ['b'], ordem: null }, 'tirar uma não reescreve a ordem das outras');
r = desfazerTirada(r);
assert.equal(ids(r.faixas), 'a,b,c,d', 'o Undo põe-na onde estava');
assert.equal(haAlgoParaGravar(plano(r)), false);

r = tirarDoRascunho(tirarDoRascunho(r, 0), 0);
assert.equal(ids(r.faixas), 'c,d');
r = desfazerTirada(r);
assert.equal(ids(r.faixas), 'b,c,d', 'o Undo desfaz a última primeiro');

r = { ...comecarRascunho('2hollis', originais), nome: '  2hollis mix ' };
assert.equal(plano(r).nome, '2hollis mix', 'o nome grava-se sem espaços à volta');
r = { ...r, nome: '   ' };
assert.equal(plano(r).nome, null, 'um nome vazio não se grava');
r = { ...r, nome: '2hollis ' };
assert.equal(plano(r).nome, null, 'o mesmo nome com um espaço a mais não é uma mudança');

r = moverNoRascunho(tirarDoRascunho({ ...comecarRascunho('x', originais), nome: 'y' }, 0), 2, 0);
assert.deepEqual(planoDeGravacao(r, 'x', originais, idDe), { nome: 'y', tirar: ['a'], ordem: ['d', 'b', 'c'] },
  'tudo junto: nome, a que sai e a ordem das que ficam');

console.log('Edição da playlist: passou.');
