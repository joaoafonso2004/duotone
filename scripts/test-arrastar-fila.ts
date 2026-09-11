// As contas de arrastar uma linha da fila, em Node puro.
//
// O que se prova aqui é a concordância entre as duas metades: onde a música
// ATERRA e onde a lista ABRE o buraco. Se discordassem, o utilizador via um
// espaço abrir-se num sítio e a música cair noutro -- e é um bug que ninguém
// consegue reproduzir de propósito, porque depende de meio pixel de dedo.
import assert from 'node:assert/strict';
import {
  destinoDoArrasto, limiarDaLinha, desvioDaLinha, movido,
  velocidadeDoDeslize, MARGEM_DE_DESLIZE, DESLIZE_MAXIMO_PX,
  offsetDoDeslize, ALCANCE_DO_DESLIZE_EM_ECRAS, chavesEstaveis,
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

verificar('no meio da lista não se desliza nada', () => {
  assert.equal(velocidadeDoDeslize(400, 100, 700), 0);
  assert.equal(velocidadeDoDeslize(100 + MARGEM_DE_DESLIZE, 100, 700), 0, 'a fronteira ainda é o meio');
});

verificar('junto às bordas desliza, e para o lado certo', () => {
  assert.ok(velocidadeDoDeslize(110, 100, 700) < 0, 'em cima sobe');
  assert.ok(velocidadeDoDeslize(690, 100, 700) > 0, 'em baixo desce');
});

verificar('a velocidade cresce com a proximidade', () => {
  const longe = Math.abs(velocidadeDoDeslize(155, 100, 700));
  const perto = Math.abs(velocidadeDoDeslize(105, 100, 700));
  assert.ok(perto > longe, `colado devia correr mais: ${perto} vs ${longe}`);
  assert.equal(Math.abs(velocidadeDoDeslize(100, 100, 700)), DESLIZE_MAXIMO_PX, 'na borda vai ao máximo');
  assert.equal(Math.abs(velocidadeDoDeslize(-50, 100, 700)), DESLIZE_MAXIMO_PX, 'e fora dela não passa disso');
});

verificar('uma lista pequena não desliza', () => {
  // Sem espaço para as duas margens, tudo é borda e a lista tremia.
  assert.equal(velocidadeDoDeslize(110, 100, 200), 0);
  assert.equal(velocidadeDoDeslize(NaN, 100, 700), 0);
});

verificar('sem limites medidos não há deslize', () => {
  // O bug da 2.6.4: os limites eram medidos com a folha ainda a subir, e a
  // lista achava que o dedo estava sempre acima do topo -- subia sozinha e
  // nunca descia. Agora mede-se ao pegar, e até a medição voltar é NaN.
  assert.equal(velocidadeDoDeslize(400, NaN, NaN), 0);
  assert.equal(velocidadeDoDeslize(690, 100, NaN), 0);
});

verificar('o deslize não sai do conteúdo', () => {
  assert.equal(offsetDoDeslize(5, -12, 1000, 5, 300), 0, 'não passa acima do topo');
  assert.equal(offsetDoDeslize(995, 12, 1000, 995, 300), 1000, 'nem abaixo do fim');
  assert.equal(offsetDoDeslize(500, 0, 1000, 500, 300), 500, 'parado fica onde está');
  assert.equal(offsetDoDeslize(500, NaN, 1000, 500, 300), 500);
});

verificar('o deslize não leva a linha pegada para fora das montadas', () => {
  const raio = 300 * ALCANCE_DO_DESLIZE_EM_ECRAS;
  assert.equal(offsetDoDeslize(raio, 12, 99_999, 0, 300), raio, 'para no alcance, a descer');
  assert.equal(offsetDoDeslize(50_000 - raio, -12, 99_999, 50_000, 300), 50_000 - raio, 'e a subir');
  assert.equal(offsetDoDeslize(100, 12, 99_999, 0, 300), 112, 'dentro do alcance corre à vontade');
});

verificar('as chaves das linhas não mudam com a ordem', () => {
  const antes = chavesEstaveis(['a', 'b', 'c', 'd']);
  const depois = chavesEstaveis(['b', 'c', 'a', 'd']);
  // A mesma faixa tem a mesma chave nos dois sítios: mudar de lugar não é
  // desmontar e montar, e as capas deixam de piscar.
  assert.deepEqual([...depois].sort(), [...antes].sort());
  assert.equal(depois[2], 'a');
  assert.deepEqual(chavesEstaveis(['x', 'y', 'x', 'x']), ['x', 'y', 'x#1', 'x#2'], 'repetidas ficam distintas');
});

verificar('o destino conta com o que a lista deslizou', () => {
  // O dedo mexeu-se meia linha, mas a lista correu duas por baixo dele: a
  // música tem de aterrar duas linhas e meia abaixo, não meia.
  const H = 60;
  assert.equal(destinoDoArrasto(0, H * 0.5 + H * 2, H, 10), 3);
});

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam`);
  process.exit(1);
}
console.log('\nArrastar na fila: o buraco abre onde a música aterra.');
