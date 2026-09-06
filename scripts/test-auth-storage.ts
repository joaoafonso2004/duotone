// Migração da sessão para o cofre da plataforma.
//
// O caso que interessa não é o feliz: é o SecureStore recusar um payload
// grande. Se apagássemos o legado a contar com uma escrita que não aconteceu,
// o utilizador abria a app deslogado. Estes testes existem para garantir que
// isso não pode acontecer.
import assert from 'node:assert/strict';
import { criarStorageMigrado, type Armazem } from '../src/lib/authStorageMigration.ts';

function memoria(limiteBytes = Infinity): Armazem & { dados: Map<string, string> } {
  const dados = new Map<string, string>();
  return {
    dados,
    async getItem(c) { return dados.has(c) ? dados.get(c)! : null; },
    async setItem(c, v) {
      if (v.length > limiteBytes) throw new Error('valor grande demais para o cofre');
      dados.set(c, v);
    },
    async removeItem(c) { dados.delete(c); },
  };
}

let falhas = 0;
async function verificar(nome: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ok - ${nome}`);
  } catch (e) {
    falhas++;
    console.log(`  FALHOU - ${nome}: ${(e as Error).message}`);
  }
}

console.log('Sessão no cofre:');

await verificar('guardar vai para o cofre e não deixa rasto no legado', async () => {
  const cofre = memoria(), legado = memoria();
  const s = criarStorageMigrado(cofre, legado);
  await s.setItem('sessao', 'token-123');
  assert.equal(cofre.dados.get('sessao'), 'token-123');
  assert.equal(legado.dados.has('sessao'), false, 'o token ficou em claro no legado');
  assert.equal(await s.getItem('sessao'), 'token-123');
});

await verificar('uma sessão que já existia é migrada ao ser lida', async () => {
  const cofre = memoria(), legado = memoria();
  legado.dados.set('sessao', 'token-antigo');
  const s = criarStorageMigrado(cofre, legado);
  assert.equal(await s.getItem('sessao'), 'token-antigo', 'não devolveu a sessão existente');
  assert.equal(cofre.dados.get('sessao'), 'token-antigo', 'não migrou');
  assert.equal(legado.dados.has('sessao'), false);
});

await verificar('o cofre a recusar um payload grande NÃO perde a sessão', async () => {
  const cofre = memoria(8), legado = memoria(); // o cofre só aceita 8 bytes
  const s = criarStorageMigrado(cofre, legado);
  const grande = 'x'.repeat(5000);
  await s.setItem('sessao', grande);
  assert.equal(await s.getItem('sessao'), grande, 'a sessão desapareceu');
  assert.equal(legado.dados.get('sessao'), grande, 'não caiu para o legado');
});

await verificar('uma sessão antiga sobrevive a um cofre que recusa', async () => {
  const cofre = memoria(8), legado = memoria();
  legado.dados.set('sessao', 'x'.repeat(5000));
  const s = criarStorageMigrado(cofre, legado);
  assert.equal((await s.getItem('sessao'))?.length, 5000);
  assert.equal(legado.dados.has('sessao'), true, 'apagou o legado sem ter guardado');
});

await verificar('um cofre que rebenta a ler cai para o legado', async () => {
  const cofre: Armazem = {
    async getItem() { throw new Error('Keychain indisponível'); },
    async setItem() { throw new Error('Keychain indisponível'); },
    async removeItem() {},
  };
  const legado = memoria();
  legado.dados.set('sessao', 'token-antigo');
  const s = criarStorageMigrado(cofre, legado);
  assert.equal(await s.getItem('sessao'), 'token-antigo');
  assert.equal(legado.dados.get('sessao'), 'token-antigo', 'apagou sem alternativa');
});

await verificar('sair da conta limpa os dois sítios', async () => {
  const cofre = memoria(), legado = memoria();
  cofre.dados.set('sessao', 'no-cofre');
  legado.dados.set('sessao', 'no-legado');
  const s = criarStorageMigrado(cofre, legado);
  await s.removeItem('sessao');
  assert.equal(cofre.dados.has('sessao'), false);
  assert.equal(legado.dados.has('sessao'), false, 'ficou sessão no legado depois do logout');
  assert.equal(await s.getItem('sessao'), null);
});

await verificar('sem sessão nenhuma devolve null', async () => {
  const s = criarStorageMigrado(memoria(), memoria());
  assert.equal(await s.getItem('sessao'), null);
});

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam`);
  process.exit(1);
}
console.log('\nSessão no cofre: todos os casos passaram.');
