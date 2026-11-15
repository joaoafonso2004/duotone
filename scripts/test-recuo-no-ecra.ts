/**
 * O recuo do skip no Core Animation (15/11): a caixa recua igual ao 3D aprovado,
 * e o caminho até à vista nativa não passa por um efeito do JavaScript.
 */
import { readFileSync } from 'node:fs';
import { cantosDaCaixa, recuoComoSemelhanca, saltoDaCapa } from '../src/lib/recuoNoEcra';
import { curvaDoSkip, RECUO } from '../src/lib/transicaoDaCapa';

let mau = 0;
const check = (rotulo: string, ok: boolean, extra = '') => {
  if (!ok) mau++;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${rotulo}${extra ? '  -> ' + extra : ''}`);
};
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

console.log('\no mesmo movimento do 3D');
{
  const c = curvaDoSkip();
  let pior = 0;
  for (const sentido of [1, -1, 0] as const) {
    for (const k of c.curva) {
      const a = cantosDaCaixa(0, sentido), b = cantosDaCaixa(k, sentido), r = recuoComoSemelhanca(k, sentido);
      a.forEach(([x, y], i) => {
        pior = Math.max(pior, Math.hypot(r.escala * x + r.x - b[i]![0], r.escala * y + r.y - b[i]![1]));
      });
    }
  }
  // 0,6% do lado: 2 pt numa capa de 330 pt, no fundo do recuo, durante 150 ms.
  check('os oito cantos da caixa ficam a menos de 0,6% do lado do 3D verdadeiro', pior < 0.006, `${(pior * 100).toFixed(2)}%`);
  const repouso = recuoComoSemelhanca(0, 1);
  check('no sítio não mexe', Math.abs(repouso.escala - 1) < 1e-12 && Math.abs(repouso.x) < 1e-12 && Math.abs(repouso.y) < 1e-12);
  const seguinte = recuoComoSemelhanca(1, 1), anterior = recuoComoSemelhanca(1, -1);
  check('no fundo a caixa fica mais pequena (afasta-se)', seguinte.escala < 1 && anterior.escala < 1);
  const diferenca = seguinte.x - anterior.x;
  check('o seguinte vai mais para a direita do que o anterior, pelo desvio dos dois lados',
    Math.abs(diferenca - 2 * RECUO.desvio) < 0.004, diferenca.toFixed(4));
}

console.log('\no pedido para a vista nativa');
{
  const p = saltoDaCapa({ id: 3, em: 1000, lado: 330, sentido: 1 });
  const n = p.tempos.length;
  check('as listas têm o mesmo tamanho', [p.escala, p.x, p.y, p.largar].every((l) => l.length === n) && n >= 10);
  check('os tempos vão de 0 a 1, a subir', p.tempos[0] === 0 && p.tempos[n - 1] === 1
    && p.tempos.every((t, i) => i === 0 || t > p.tempos[i - 1]!));
  check('parte e acaba no sítio (a camada volta ao modelo sem saltar)',
    Math.abs(p.escala[0]! - 1) < 1e-12 && Math.abs(p.escala[n - 1]! - 1) < 1e-12
    && Math.abs(p.x[0]!) < 1e-9 && Math.abs(p.x[n - 1]!) < 1e-9 && Math.abs(p.y[n - 1]!) < 1e-9);
  check('a duração é a da curva aprovada', p.duracaoMs === curvaDoSkip().duracaoMs);
  const dobro = saltoDaCapa({ id: 4, em: 1000, lado: 660, sentido: 1 });
  check('as deslocações estão em pontos: o dobro do lado, o dobro do caminho',
    p.x.every((v, i) => Math.abs(dobro.x[i]! - 2 * v) < 1e-9) && p.escala.every((v, i) => v === dobro.escala[i]));
  check('o que sobrava de um recuo anterior conta 1 no início e 0 no fim da ida',
    p.largar[0] === 1 && p.largar[n - 1] === 0);
}

console.log('\nfora da thread principal, e sem esperar pelo JavaScript');
{
  const swift = ler('modules/duotone-capa/ios/DuotoneCapaModule.swift');
  check('a vista anima no Core Animation', /CAKeyframeAnimation\(keyPath: "transform"\)/.test(swift) && /layer\.add\(animacao/.test(swift));
  check('a 120 Hz onde houver', /preferredFrameRateRange = CAFrameRateRange\(minimum: 80, maximum: 120, preferred: 120\)/.test(swift));
  check('skips seguidos partem de onde a caixa está', /layer\.presentation\(\)\?\.transform/.test(swift));
  check('um skip antigo não anima ao montar', /salto\.em > salto\.duracaoMs/.test(swift) || /- salto\.em > salto\.duracaoMs/.test(swift));
  const capa = ler('src/components/CapaFlutuante3D.tsx');
  check('o pedido decide-se no desenho, e não num efeito', /if \(RecuoNativo\) \{\s*const chave = transicao\?\.chave/.test(capa)
    && /s\.pedido = saltoDaCapa\(/.test(capa));
  check('a caixa vai dentro da vista nativa', /<RecuoNativo salto=\{salto\.current\.pedido\}/.test(capa));
  check('com ela, o recuo sai da pose do React Native', /RecuoNativo \? semMontagem\.zero : recuoX/.test(capa)
    && /RecuoNativo \? recuoDoEncaixe : Animated\.add\(recuoZ, recuoDoEncaixe\)/.test(capa));
  check('sem ela (binário antigo), fica o caminho de antes', /if \(RecuoNativo\) return;/.test(capa)
    && /Animated\.timing\(fase, \{ toValue: 1/.test(capa));
  const ponte = ler('modules/duotone-capa/index.ts');
  check('fora do iPhone e sem o módulo, não há vista nativa', /Platform\.OS === 'ios' && requireOptionalNativeModule\('DuotoneCapa'\)/.test(ponte));
  const leitor = ler('src/components/PlayerRoot.tsx');
  check('a capa só respira a carregar depois do recuo', /setTimeout\(\(\) => \{\s*loop = Animated\.loop/.test(leitor)
    && /ESPERA_ANTES_DE_RESPIRAR_MS = 700/.test(leitor) && 700 > curvaDoSkip().duracaoMs);
}

if (mau) {
  console.error(`\n${mau} falha(s)`);
  process.exit(1);
}
console.log('\ntudo ok');
