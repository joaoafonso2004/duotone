/**
 * O aviso do que se tirou, com "Undo" -- src/lib/avisoDeRemocao.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-aviso-de-remocao.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DURACAO_COM_DESFAZER_MS, DURACAO_SEM_DESFAZER_MS, contarMusicas, criarAvisos, duracaoDoAviso,
} from '../src/lib/avisoDeRemocao.ts';

let falhas = 0;
async function caso(nome: string, fn: () => void | Promise<void>): Promise<void> {
  try { await fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

/** Um relógio à mão: os temporizadores só correm quando se manda. */
function relogio() {
  const marcados = new Map<number, { fn: () => void; ms: number }>();
  let id = 0;
  return {
    marcar: (fn: () => void, ms: number) => { marcados.set(++id, { fn, ms }); return id; },
    desmarcar: (i: unknown) => { marcados.delete(i as number); },
    correr() { for (const [i, m] of [...marcados]) { marcados.delete(i); m.fn(); } },
    duracoes: () => [...marcados.values()].map((m) => m.ms),
  };
}

console.log('\nquanto dura');
await caso('com "Undo" dura mais do que sem', () => {
  assert.equal(duracaoDoAviso({ desfazer: () => {} }), DURACAO_COM_DESFAZER_MS);
  assert.equal(duracaoDoAviso({}), DURACAO_SEM_DESFAZER_MS);
  assert.ok(DURACAO_COM_DESFAZER_MS > DURACAO_SEM_DESFAZER_MS);
});

console.log('\no ciclo de um aviso');
await caso('sai sozinho e faz o que estava adiado', () => {
  const r = relogio(); const a = criarAvisos(r); let apagado = 0;
  a.mostrar({ texto: 'Download removed', desfazer: () => {}, aoAcabar: () => { apagado++; } });
  assert.deepEqual(r.duracoes(), [DURACAO_COM_DESFAZER_MS]);
  r.correr();
  assert.equal(a.atual(), null);
  assert.equal(apagado, 1);
});
await caso('"Undo" repõe e NÃO faz o que estava adiado', async () => {
  const r = relogio(); const a = criarAvisos(r); let reposto = 0, apagado = 0;
  const id = a.mostrar({ texto: 'x', desfazer: () => { reposto++; }, aoAcabar: () => { apagado++; } });
  assert.equal(await a.desfazer(id), true);
  r.correr();
  assert.equal(reposto, 1); assert.equal(apagado, 0); assert.equal(a.atual(), null);
});
await caso('um aviso novo substitui o anterior, e o anterior conta como acabado', () => {
  const r = relogio(); const a = criarAvisos(r); const acabados: string[] = [];
  a.mostrar({ texto: 'a', aoAcabar: () => acabados.push('a') });
  const b = a.mostrar({ texto: 'b', aoAcabar: () => acabados.push('b') });
  assert.deepEqual(acabados, ['a']);
  assert.equal(a.atual()?.id, b);
  assert.equal(r.duracoes().length, 1, 'o temporizador do anterior sai');
});
await caso('o "Undo" de um aviso que já saiu não faz nada', async () => {
  const r = relogio(); const a = criarAvisos(r); let reposto = 0;
  const id = a.mostrar({ texto: 'x', desfazer: () => { reposto++; } });
  a.fechar(id);
  assert.equal(await a.desfazer(id), false);
  assert.equal(reposto, 0);
});
await caso('fechar um aviso velho não fecha o novo', () => {
  const r = relogio(); const a = criarAvisos(r);
  const velho = a.mostrar({ texto: 'a' });
  const novo = a.mostrar({ texto: 'b' });
  a.fechar(velho);
  assert.equal(a.atual()?.id, novo);
});
await caso('quem ouve sabe de cada mudança', async () => {
  const r = relogio(); const a = criarAvisos(r); let vezes = 0;
  const parar = a.ouvir(() => { vezes++; });
  const id = a.mostrar({ texto: 'x', desfazer: () => {} });
  await a.desfazer(id);
  parar();
  a.mostrar({ texto: 'y' });
  assert.equal(vezes, 2);
});
await caso('um aoAcabar que rebenta não parte o aviso', () => {
  const r = relogio(); const a = criarAvisos(r);
  a.mostrar({ texto: 'x', aoAcabar: () => { throw new Error('boom'); } });
  r.correr();
  assert.equal(a.atual(), null);
});

console.log('\no texto');
await caso('singular e plural', () => {
  assert.equal(contarMusicas(1), '1 song');
  assert.equal(contarMusicas(3), '3 songs');
});

console.log('\nonde se usa (só remoções)');
await caso('nada que cria mostra o aviso', () => {
  for (const f of ['src/components/AddToPlaylistSheet.tsx', 'src/screens/ImportYouTubeScreen.tsx']) {
    assert.ok(!readFileSync(f, 'utf8').includes('avisarRemocao'), `${f} cria coisas e não avisa`);
  }
});
await caso('tirar das Liked Songs já não pergunta "Are you sure"', () => {
  assert.ok(!readFileSync('src/screens/SongsScreen.tsx', 'utf8').includes('Are you sure you want to remove'));
});

if (falhas) { console.error(`\n  ${falhas} caso(s) falharam.\n`); process.exit(1); }
console.log('\n  Todos os casos passaram.\n');
