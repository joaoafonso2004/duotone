import { curvaDoSkip, molaDoRN, naCurva, recuoDaCapa, RECUO, sentidoDaTransicao } from '../src/lib/transicaoDaCapa.ts';

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

console.log('\no recuo numa só animação nativa (2/10)');
// Eram duas em sequência, e quem arrancava a volta era o JavaScript, ocupado com
// a faixa nova: a caixa ficava no fundo ~150 ms e depois saltava.
{
  const c = curvaDoSkip();
  const em = (ms: number) => naCurva(c.inputRange, c.curva, ms / c.duracaoMs);
  check('parte do sítio e acaba no sítio', c.curva[0] === 0 && c.curva[c.curva.length - 1] === 0);
  check('o fundo é aos idaMs, e vale 1', Math.abs(em(RECUO.idaMs) - 1) < 1e-9);
  check('a ida só desce (ease-out)', [0, 30, 60, 90, 120, 150].every((ms, i, a) => i === 0 || em(ms) > em(a[i - 1]!)));
  check('a volta é a mola aprovada (speed 14, bounciness 5): quase sem ressalto', Math.min(...c.curva) > -0.05);
  check('tudo em menos de um segundo', c.duracaoMs > 300 && c.duracaoMs < 1000);
  check('o que sobrava do recuo anterior sai durante a ida',
    c.largar[0] === 1 && naCurva(c.inputRange, c.largar, RECUO.idaMs / c.duracaoMs) === 0);
  check('a entrada é crescente (o interpolate exige)', c.inputRange.every((t, i, a) => i === 0 || t > a[i - 1]!));
  const k = molaDoRN(RECUO.mola.bounciness, RECUO.mola.speed);
  check('a mola do RN, convertida como ele a converte', Math.abs(k.rigidez - 384.58) < 0.1 && Math.abs(k.amortecimento - 30.75) < 0.1);
  const { readFileSync } = await import('node:fs');
  const capa = readFileSync(new URL('../src/components/CapaFlutuante3D.tsx', import.meta.url), 'utf8');
  check('o CapaFlutuante3D corre-a numa só animação, sem sequência', !/Animated\.sequence/.test(capa)
    && /Animated\.timing\(fase, \{ toValue: 1, duration: c\.duracaoMs, easing: Easing\.linear, useNativeDriver: true \}\)/.test(capa));
}

console.log(mau === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${mau} caso(s) a falhar.\n`);
process.exit(mau === 0 ? 0 : 1);
