/**
 * O menu de uma mensagem no botão direito do PC (24/10, src/lib/menuDaMensagem.ts,
 * fase 2 de docs/botao-direito-pc-maquete.html, com as reações "A").
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-menu-da-mensagem.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { menuDaMensagem, REACOES_RAPIDAS } from '../src/lib/menuDaMensagem.ts';
import { menuDaFaixa, MOTIVOS } from '../src/lib/menuDaFaixa.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const m = (o: Partial<Parameters<typeof menuDaMensagem>[0]> = {}) =>
  menuDaMensagem({ podeResponder: true, temTexto: true, faixa: null, semRede: false, ...o });

caso('uma mensagem de texto: Reply e Copy text', () => {
  assert.deepEqual(m().map((l) => l.rotulo), ['Reply', 'Copy text']);
});
caso('sem texto, sem Copy text; sem poder responder, sem Reply', () => {
  assert.deepEqual(m({ temTexto: false }).map((l) => l.id), ['responder']);
  assert.deepEqual(m({ podeResponder: false }).map((l) => l.id), ['copiar']);
});
caso('uma música partilhada: o que se faz a uma música, num grupo à parte', () => {
  const l = m({ temTexto: false, faixa: { guardada: false } });
  assert.deepEqual(l.map((x) => x.id), ['responder', 'tocar', 'fila', 'gostar', 'por-em-playlist']);
  assert.deepEqual(l.filter((x) => x.inicioDeGrupo).map((x) => x.id), ['tocar']);
  assert.equal(l.find((x) => x.id === 'gostar')!.rotulo, 'Add to Liked Songs');
  assert.equal(m({ faixa: { guardada: true } }).find((x) => x.id === 'gostar')!.rotulo, 'Remove from Liked Songs');
});
caso('com as palavras do menu de uma música no PC', () => {
  const daFaixa = menuDaFaixa({ plataforma: 'pc', onde: 'lista', semRede: false, tocaSemRede: false, guardada: false,
    podeDescarregar: false, download: 'nenhum', temArtista: true });
  const nome = (id: string) => daFaixa.find((a) => a.id === id)?.rotulo;
  const l = m({ faixa: { guardada: false } });
  assert.equal(l.find((x) => x.id === 'tocar')!.rotulo, nome('tocar-agora'));
  assert.equal(l.find((x) => x.id === 'fila')!.rotulo, nome('por-na-fila'));
  assert.equal(l.find((x) => x.id === 'gostar')!.rotulo, nome('guardar'));
  assert.equal(l.find((x) => x.id === 'por-em-playlist')!.rotulo, nome('por-em-playlist'));
});
caso('sem rede, a música fica apagada a dizer porquê; responder e copiar não', () => {
  for (const l of m({ faixa: { guardada: false }, semRede: true })) {
    assert.equal(l.motivo ?? null, l.id === 'responder' || l.id === 'copiar' ? null : MOTIVOS.semRede, l.id);
  }
});
caso('as reações do menu são as seis do painel do chat', () => {
  assert.deepEqual([...REACOES_RAPIDAS], ['❤️', '😂', '🔥', '😮', '😢', '👍']);
  const painel = readFileSync(new URL('../src/components/ReactionRow.tsx', import.meta.url), 'utf8');
  assert.match(painel, /const RAPIDAS=REACOES_RAPIDAS;/);
});

if (falhas) { console.error(`\n  ${falhas} caso(s) falharam.\n`); process.exit(1); }
console.log('\n  Todos os casos passaram.\n');
