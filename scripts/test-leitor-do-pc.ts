/**
 * As contas do Now Playing do PC (src/lib/leitorDoPc.ts).
 *
 * Correr: node --experimental-strip-types scripts/test-leitor-do-pc.ts
 */
import assert from 'node:assert/strict';
import {
  ALTURA_DO_TOPO, ALTURA_POR_BAIXO_DA_CAPA, CAPA_MAXIMA, CAPA_MINIMA, MARGEM_DE_BAIXO,
  disposicaoDoLeitor, fimDaFila,
} from '../src/lib/leitorDoPc.ts';

let n = 0;
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok - ${nome}`); };

caso('numa janela de 1440x900 a capa cresce para lá dos 440 da maquete A', () => {
  // A área do conteúdo: 1440 - lateral (232) - margens; 900 - título - leitor.
  const d = disposicaoDoLeitor(1192, 788);
  assert.equal(d.duasColunas, true);
  assert.ok(d.lado >= 440 && d.lado <= CAPA_MAXIMA, String(d.lado));
});
caso('a capa nunca empurra o título e os ícones para fora da janela', () => {
  for (const [l, a] of [[1192, 788], [1700, 700], [2400, 1300], [1000, 560]] as const) {
    const d = disposicaoDoLeitor(l, a);
    if (d.lado > CAPA_MINIMA) {
      assert.ok(ALTURA_DO_TOPO + d.lado + ALTURA_POR_BAIXO_DA_CAPA + MARGEM_DE_BAIXO <= a, `${l}x${a}: ${d.lado}`);
    }
  }
});
caso('a capa deixa pelo menos metade da largura à fila', () => {
  const d = disposicaoDoLeitor(1000, 1400);
  assert.ok(d.lado <= (1000 - 80) * 0.46, String(d.lado));
});
caso('tem limites, e anda em degraus de 8 (o glitch não se refaz a cada píxel)', () => {
  assert.equal(disposicaoDoLeitor(4000, 3000).lado, CAPA_MAXIMA);
  assert.equal(disposicaoDoLeitor(950, 300).lado, CAPA_MINIMA);
  for (let l = 900; l < 2000; l += 37) assert.equal(disposicaoDoLeitor(l, 900).lado % 8, 0);
});
caso('numa janela estreita, capa e fila ficam uma por baixo da outra', () => {
  const d = disposicaoDoLeitor(820, 700);
  assert.equal(d.duasColunas, false);
  assert.ok(d.lado <= 360);
});
caso('o fim da fila diz o que vem a seguir', () => {
  const base = { emJam: false, repeatMode: 'off' as const, autoplayRadio: true, vazia: false };
  assert.equal(fimDaFila(base), "Then: radio based on what you're playing");
  assert.equal(fimDaFila({ ...base, autoplayRadio: false }), 'Queue ends here');
  assert.equal(fimDaFila({ ...base, autoplayRadio: false, vazia: true }), 'Queue ends after this track');
  assert.equal(fimDaFila({ ...base, repeatMode: 'all' }), 'Then the queue starts again');
  assert.equal(fimDaFila({ ...base, repeatMode: 'one' }), 'This track is on repeat');
  assert.equal(fimDaFila({ ...base, emJam: true }), null, 'num Jam a fila é de todos');
});

console.log(`\nLeitor do PC: ${n} casos passaram.`);
