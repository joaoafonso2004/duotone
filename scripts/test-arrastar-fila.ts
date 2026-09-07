// As contas de arrastar uma linha da fila, em Node puro.
//
// O que se prova aqui é a concordância entre as duas metades: onde a música
// ATERRA e onde a lista ABRE o buraco. Se discordassem, o utilizador via um
// espaço abrir-se num sítio e a música cair noutro -- e é um bug que ninguém
// consegue reproduzir de propósito, porque depende de meio pixel de dedo.
import assert from 'node:assert/strict';
import {
  destinoDoArrasto, limiarDaLinha, desvioDaLinha, movido,
} from '../src/lib/arrastarFila.ts';

const H = 60;
let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

verificar('o lugar troca a meio da linha, não ao fim dela', () => {
  assert.equal(destinoDoArrasto(0, H * 0.49, H, 5), 0, 'menos de meia linha não mexe');
  assert.equal(destinoDoArrasto(0, H * 0.51, H, 5), 1, 'passada a meia linha, já trocou');
  assert.equal(destinoDoArrasto(2, -H * 0.51, H, 5), 1);
  assert.equal(destinoDoArrasto(2, -H * 1.6, H, 5), 0);
});

verificar('não se sai da lista pelas pontas', () => {
  assert.equal(destinoDoArrasto(0, -H * 10, H, 5), 0, 'a primeira não sobe mais');
  assert.equal(destinoDoArrasto(4, H * 10, H, 5), 4, 'a última não desce mais');
  assert.equal(destinoDoArrasto(2, H * 99, H, 5), 4);
});

verificar('entradas impossíveis devolvem o sítio de onde se veio', () => {
  assert.equal(destinoDoArrasto(3, NaN, H, 5), 3);
  assert.equal(destinoDoArrasto(3, 100, 0, 5), 3, 'sem altura medida não se adivinha');
  assert.equal(destinoDoArrasto(3, 100, H, 0), 3);
});

verificar('quem é arrastado não se desvia a si próprio', () => {
  assert.equal(desvioDaLinha(2, 2, H * 3, H, 5), 0);
});

verificar('abre-se um lugar, e um só', () => {
  // A arrastar a 0 para baixo: a 1 sobe assim que o destino a alcança.
  assert.equal(desvioDaLinha(1, 0, H * 0.49, H, 6), 0, 'ainda não chegou lá');
  assert.equal(desvioDaLinha(1, 0, H * 0.51, H, 6), -H, 'cedeu o lugar');
  assert.equal(desvioDaLinha(1, 0, H * 5, H, 6), -H, 'e não cede mais do que um');
  // A 2 só se mexe quando o destino chega a ela, não antes.
  assert.equal(desvioDaLinha(2, 0, H * 1.49, H, 6), 0);
  assert.equal(desvioDaLinha(2, 0, H * 1.51, H, 6), -H);
  // Para cima é simétrico. A arrastar a 3: com o destino em 2, a linha 1 fica
  // quieta; quando o destino chega a 1, é o lugar DELA que está a ser ocupado
  // e é ela que desce.
  assert.equal(desvioDaLinha(1, 3, -H * 0.51, H, 6), 0, 'destino em 2: a 1 não se mexe');
  assert.equal(desvioDaLinha(2, 3, -H * 0.51, H, 6), H, 'mas a 2 cede o lugar');
  assert.equal(desvioDaLinha(1, 3, -H * 1.51, H, 6), H, 'destino em 1: agora desce');
});

verificar('o buraco abre onde a música aterra', () => {
  // É esta a propriedade que interessa, e a única que apanha uma discordância
  // entre o arredondamento e o limiar. Varre-se o gesto todo, meio pixel a
  // meio pixel, e em cada ponto conta-se quantas linhas cederam: tem de ser
  // exactamente a distância a que a música vai ficar.
  const total = 6;
  for (let de = 0; de < total; de++) {
    for (let dy = -H * total; dy <= H * total; dy += H / 8) {
      const destino = destinoDoArrasto(de, dy, H, total);
      const cederam = Array.from({ length: total }, (_, j) => desvioDaLinha(j, de, dy, H, total))
        .filter(d => d !== 0).length;
      assert.equal(cederam, Math.abs(destino - de),
        `de ${de}, dy ${dy}: ${cederam} linhas cederam para um salto de ${Math.abs(destino - de)}`);
    }
  }
});

verificar('o limiar é o mesmo dos dois lados da linha', () => {
  assert.equal(limiarDaLinha(1, 0, H), H * 0.5);
  assert.equal(limiarDaLinha(0, 1, H), -H * 0.5);
  assert.equal(limiarDaLinha(3, 0, H), H * 2.5);
});

verificar('mover não perde nem duplica', () => {
  const l = ['a', 'b', 'c', 'd'];
  assert.deepEqual(movido(l, 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(movido(l, 3, 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(movido(l, 1, 1), l, 'para o mesmo sítio não mexe');
  assert.deepEqual(l, ['a', 'b', 'c', 'd'], 'a lista de entrada não é tocada');
  assert.deepEqual(movido(l, -1, 2), l, 'fora dos limites devolve como estava');
  assert.deepEqual(movido(l, 0, 9), l);
});

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam`);
  process.exit(1);
}
console.log('\nArrastar na fila: o buraco abre onde a música aterra.');
