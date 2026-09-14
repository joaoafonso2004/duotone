import { capaDePartida, recuoDaCapa, RECUO, sentidoDaTransicao } from '../src/lib/transicaoDaCapa.ts';

let mau = 0;
const check = (rotulo: string, ok: boolean, extra = '') => {
  if (!ok) mau++;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${rotulo}${extra ? '  -> ' + extra : ''}`);
};
const eq = (rotulo: string, veio: unknown, esperado: unknown) =>
  check(rotulo, veio === esperado, veio === esperado ? '' : `esperado ${esperado}, veio ${veio}`);

console.log('\no sentido');
eq('seguinte vai para a direita', sentidoDaTransicao({ direcao: 1, em: 1000 }, 1200), 1);
eq('anterior vai para a esquerda', sentidoDaTransicao({ direcao: -1, em: 1000 }, 1200), -1);
eq('uma música escolhida numa lista não tem sentido', sentidoDaTransicao(null, 5000), 0);
eq('um skip antigo já não conta', sentidoDaTransicao({ direcao: 1, em: 0 }, RECUO.janelaDoSaltoMs + 1), 0);
eq('um relógio que andou para trás não inventa sentido', sentidoDaTransicao({ direcao: 1, em: 5000 }, 4000), 0);

console.log('\no recuo');
const seguinte = recuoDaCapa({ lado: 300, sentido: 1, capa3D: true, reduzirMovimento: false });
check('recua para dentro do ecrã', !!seguinte && seguinte.profundidade < 0);
check('no seguinte desvia para a direita', !!seguinte && seguinte.desvio > 0);
check('no anterior desvia para a esquerda',
  (recuoDaCapa({ lado: 300, sentido: -1, capa3D: true, reduzirMovimento: false })?.desvio ?? 0) < 0);
check('sem skip recua a direito',
  recuoDaCapa({ lado: 300, sentido: 0, capa3D: true, reduzirMovimento: false })?.desvio === 0);
// "Clean" foi o pedido: se alguém subir estes números, é outro efeito.
check('é subtil: recua menos de um oitavo e desvia menos de um vigésimo do lado',
  !!seguinte && Math.abs(seguinte.profundidade) <= 300 / 8 && Math.abs(seguinte.desvio) <= 300 / 20);
check('é curto', RECUO.idaMs <= 200 && RECUO.cruzarMs <= 350);
eq('com Reduzir movimento não há recuo', recuoDaCapa({ lado: 300, sentido: 1, capa3D: true, reduzirMovimento: true }), null);
eq('na capa Simple não há recuo', recuoDaCapa({ lado: 300, sentido: 1, capa3D: false, reduzirMovimento: false }), null);

console.log('\na capa de partida');
eq('parte da capa que acabou de sair', capaDePartida({ uri: 'a', em: 1000 }, 'b', 1100), 'a');
eq('a mesma capa não cruza consigo', capaDePartida({ uri: 'a', em: 1000 }, 'a', 1100), null);
eq('abrir o leitor muito depois não cruza', capaDePartida({ uri: 'a', em: 0 }, 'b', RECUO.memoriaDaCapaMs + 1), null);
eq('sem capa anterior não cruza', capaDePartida(null, 'b', 1), null);
// A imagem nova pode demorar, mas a antiga é de outra música: não pode ficar.
check('não espera pela imagem nova para sempre', RECUO.esperaMaximaMs <= 1000);

console.log(mau === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${mau} caso(s) a falhar.\n`);
process.exit(mau === 0 ? 0 : 1);
