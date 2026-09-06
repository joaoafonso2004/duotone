// Paginação da pesquisa livre, sem rede.
//
// Duas coisas partem em silêncio se alguém lhes mexer:
//  1. o token da página seguinte deixa de ser encontrado na árvore, e a app
//     volta a ver só os primeiros ~20 resultados -- que era o bug de origem:
//     procurar pelo nome do artista não encontrava faixas que estão lá;
//  2. a página 2 chega noutra forma (`onResponseReceivedCommands` em vez de
//     `contents`) e ser exigente com `contents` rejeitava-a por inteiro.
import assert from 'node:assert/strict';
import { continuarPesquisaFree, pesquisarPaginaFree } from '../src/api/ytSearchFree.ts';

function video(id: string, titulo: string) {
  return {
    videoRenderer: {
      videoId: id,
      title: { runs: [{ text: titulo }] },
      ownerText: { runs: [{ text: 'Canal de Teste' }] },
      lengthText: { simpleText: '3:45' },
    },
  };
}
const continuacao = (token: string) => ({
  continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token } } },
});

let ultimoCorpo: any = null;
function responder(payload: any) {
  (globalThis as any).fetch = async (_url: string, init: any) => {
    ultimoCorpo = JSON.parse(init.body);
    return { ok: true, json: async () => payload };
  };
}

let falhas = 0;
async function verificar(nome: string, fn: () => Promise<void>) {
  try { await fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

console.log('Pesquisa paginada:');

await verificar('a primeira página traz as faixas e o token da seguinte', async () => {
  responder({ contents: { secao: [video('aaa', 'Primeira'), continuacao('TOKEN-1')] } });
  const p = await pesquisarPaginaFree('teste');
  assert.equal(p.resultados.length, 1);
  assert.equal(p.resultados[0]!.track.sourceId, 'aaa');
  assert.equal(p.resultados[0]!.track.durationSeconds, 225);
  assert.equal(p.continuacao, 'TOKEN-1', 'não encontrou o token da página seguinte');
  assert.equal(ultimoCorpo.query, 'teste');
  assert.ok(!ultimoCorpo.continuation, 'a primeira página não leva token');
});

await verificar('a página 2 vem noutra forma e continua a ser lida', async () => {
  responder({
    onResponseReceivedCommands: [
      { appendContinuationItemsAction: { continuationItems: [video('bbb', 'Segunda'), continuacao('TOKEN-2')] } },
    ],
  });
  const p = await continuarPesquisaFree('TOKEN-1');
  assert.equal(p.resultados.length, 1, 'a página 2 foi rejeitada por não ter "contents"');
  assert.equal(p.resultados[0]!.track.sourceId, 'bbb');
  assert.equal(p.continuacao, 'TOKEN-2');
  assert.equal(ultimoCorpo.continuation, 'TOKEN-1', 'não mandou o token');
  assert.ok(!ultimoCorpo.query, 'a página seguinte não leva pergunta');
});

await verificar('sem token, a paginação para', async () => {
  responder({ contents: { secao: [video('ccc', 'Única')] } });
  const p = await pesquisarPaginaFree('teste');
  assert.equal(p.continuacao, null);
});

await verificar('uma resposta irreconhecível continua a dar erro', async () => {
  responder({ qualquerCoisa: true });
  await assert.rejects(() => pesquisarPaginaFree('teste'));
});

if (falhas > 0) { console.error(`\n${falhas} teste(s) falharam`); process.exit(1); }
console.log('\nPesquisa paginada: todos os casos passaram.');
