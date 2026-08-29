import {
  comecouAArrastar,
  deslize,
  indiceAlvo,
  LIMIAR_ARRASTO_PX,
  reordenar,
} from '../src/lib/reorder.ts';

let bad = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (!cond) bad++;
  console.log(`  ${cond ? 'ok   ' : 'FALHA'} ${label}${extra ? '  -> ' + extra : ''}`);
};

const H = 64; // altura de uma linha

console.log('\npara onde a linha vai');
check('sem arrastar fica onde esta', indiceAlvo(2, 0, H, 8) === 2);
check('uma linha para baixo', indiceAlvo(2, H, H, 8) === 3);
check('uma linha para cima', indiceAlvo(2, -H, H, 8) === 1);
check('tres linhas para baixo', indiceAlvo(1, 3 * H, H, 8) === 4);

// O "engate": so troca depois de passar METADE da vizinha.
check('a 40% da linha ainda nao troca', indiceAlvo(2, H * 0.4, H, 8) === 2);
check('a 60% ja trocou', indiceAlvo(2, H * 0.6, H, 8) === 3);
check('a -40% ainda nao troca', indiceAlvo(2, -H * 0.4, H, 8) === 2);
check('a -60% ja trocou', indiceAlvo(2, -H * 0.6, H, 8) === 1);

console.log('\nnao se sai da lista');
check('nao passa do fim', indiceAlvo(6, 99 * H, H, 8) === 7);
check('nao passa do principio', indiceAlvo(1, -99 * H, H, 8) === 0);
check('lista de um so nao mexe', indiceAlvo(0, 5 * H, H, 1) === 0);
check('altura zero nao rebenta', indiceAlvo(3, 100, 0, 8) === 3);
check('lista vazia nao rebenta', indiceAlvo(0, 100, H, 0) === 0);

console.log('\na pre-visualizacao: quem desliza, e para onde');
// Arrastar a 1 para a posicao 3: as linhas 2 e 3 sobem uma; as outras ficam.
check('a arrastada nao "desliza" (esta a ser levada)', deslize(1, 1, 3) === 0);
check('quem fica no meio sobe', deslize(2, 1, 3) === -1 && deslize(3, 1, 3) === -1);
check('quem esta fora fica quieto', deslize(0, 1, 3) === 0 && deslize(4, 1, 3) === 0);

// Para cima: arrastar a 4 para a 1.
check('para cima, o meio desce', deslize(1, 4, 1) === 1 && deslize(3, 4, 1) === 1);
check('para cima, fora fica quieto', deslize(0, 4, 1) === 0 && deslize(5, 4, 1) === 0);
check('sem destino novo, ninguem desliza', deslize(2, 2, 2) === 0);

console.log('\no que se ve tem de ser o que acontece');
// O teste que interessa: a pre-visualizacao (deslize) e desenhada a cada
// fotograma, o resultado (reordenar) e o que fica gravado. Se discordarem, o
// utilizador larga e a lista salta — que e o bug classico destas listas.
const lista = ['a', 'b', 'c', 'd', 'e'];
let mau = '';
for (let de = 0; de < lista.length; de++) {
  for (let para = 0; para < lista.length; para++) {
    const real = reordenar(lista, de, para);
    // Reconstruir a lista SO a partir dos deslizes desenhados.
    const previsto: string[] = new Array(lista.length);
    previsto[para] = lista[de];
    for (let i = 0; i < lista.length; i++) {
      if (i === de) continue;
      previsto[i + deslize(i, de, para)] = lista[i];
    }
    if (previsto.join() !== real.join()) {
      mau = `de ${de} para ${para}: viu-se ${previsto.join()} mas ficou ${real.join()}`;
    }
  }
}
check('a previsao bate certo com o resultado em todos os 25 casos', mau === '', mau);

console.log('\nreordenar');
check('mover para baixo', reordenar(lista, 0, 2).join() === 'b,c,a,d,e');
check('mover para cima', reordenar(lista, 3, 1).join() === 'a,d,b,c,e');
check('mover para o mesmo sitio nao mexe', reordenar(lista, 2, 2).join() === 'a,b,c,d,e');
check('indice invalido devolve copia intacta', reordenar(lista, 9, 1).join() === 'a,b,c,d,e');
check('nao mexe no original', (reordenar(lista, 0, 4), lista.join() === 'a,b,c,d,e'));

console.log('\nclicar nao e arrastar');
// Sem este limiar, tocar numa faixa para a ouvir acabava a reordenar a fila.
check('um pixel nao e arrasto', comecouAArrastar(1) === false);
check('tres pixeis ainda nao', comecouAArrastar(3) === false);
check('quatro pixeis ja e', comecouAArrastar(LIMIAR_ARRASTO_PX) === true);
check('para cima conta na mesma', comecouAArrastar(-10) === true);

console.log(bad === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${bad} caso(s) a falhar.\n`);
process.exit(bad === 0 ? 0 : 1);
