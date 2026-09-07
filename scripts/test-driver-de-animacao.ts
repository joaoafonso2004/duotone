// As regras do movimento da app, fixadas onde não se podem perder.
//
// Duas coisas diferentes se verificam aqui.
//
// ## 1. O driver, nos ficheiros que animam
//
// Uma vista tem UM nó de propriedades. Assim que uma propriedade dessa vista
// passa para o driver nativo, o React Native leva a vista inteira -- e uma
// segunda animação sobre a mesma vista, pedida a partir do JS, deixa de ser
// mais lenta e passa a ATIRAR:
//
//   Attempting to run JS driven animation on animated node that has been moved
//   to "native" earlier by starting an animation with `useNativeDriver: true`
//
// No PlayerRoot isso acontece dentro de um `useEffect` de montagem, ou seja,
// no arranque da app e antes de haver ecrã. Foi o que matou a 1.12.0: abria,
// meio segundo de preto, fechava. Nem o TypeScript nem os outros testes veem
// isto -- `useNativeDriver: false` é uma opção perfeitamente válida em geral.
//
// Com o `Toque` aplicado a botões por toda a app, um erro destes deixa de
// afectar um ecrã e passa a afectar todos. Daí a lista crescer.
//
// ## 2. A assimetria do movimento
//
// A regra que separa uma app viva de uma app mole: **entrar depressa, sair com
// calma**. O dedo tem de sentir resposta imediata; o regresso é que se pode dar
// ao luxo de respirar. Um botão premido vinte vezes seguidas com uma animação
// simétrica e lenta transforma-se em espera.
//
// Isto não se vê a ler o código -- vê-se a usar a app, tarde de mais. Por isso
// está aqui em números.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ESCALA, ENTRADA, ESTADO, PREMIR, PULO, SOLTAR } from '../src/lib/movimento.ts';

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok - ${nome}`);
  } catch (e) {
    falhas++;
    console.log(`  FALHOU - ${nome}: ${(e as Error).message}`);
  }
}

const ler = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

/**
 * Os ficheiros onde `useNativeDriver: false` é proibido.
 *
 * Não é a app toda: há sítios onde animar uma propriedade de layout é a única
 * forma, e aí o correcto é isolar essa propriedade numa vista só dela. Estes
 * são os ficheiros onde já se sabe que as vistas são partilhadas.
 */
const SO_NATIVO = [
  'src/components/PlayerRoot.tsx',
  'src/components/Toque.tsx',
  'src/components/StateIcon.tsx',
  'src/components/TransitionView.tsx',
];

console.log('Driver de animação:');

for (const ficheiro of SO_NATIVO) {
  verificar(`${ficheiro} não corre nada no driver do JS`, () => {
    const culpadas = ler(ficheiro)
      .split('\n')
      .map((linha, i) => ({ n: i + 1, linha }))
      .filter(({ linha }) => /useNativeDriver\s*:\s*false/.test(linha))
      .map(({ n, linha }) => `linha ${n}: ${linha.trim()}`);

    assert.deepEqual(
      culpadas,
      [],
      'estas animações partilham vista com animações nativas e atiram:\n    ' +
        culpadas.join('\n    ')
    );
  });
}

verificar('os ficheiros de movimento animam mesmo (o teste não passa por vazio)', () => {
  const nativas = SO_NATIVO.map((f) => (ler(f).match(/useNativeDriver\s*:\s*true/g) ?? []).length)
    .reduce((a, b) => a + b, 0);
  assert.ok(nativas >= 8, `só ${nativas} animações nativas -- o teste deixou de olhar para o que devia`);
});

const SUPORTADAS_PELO_NATIVO = new Set([
  'opacity', 'transform', 'borderRadius', 'zIndex', 'elevation',
  'shadowOpacity', 'shadowRadius', 'color', 'backgroundColor', 'tintColor',
  'translateX', 'translateY', 'scale', 'scaleX', 'scaleY', 'rotate', 'perspective',
]);

verificar('o animRaio só alimenta propriedades que o módulo nativo suporta', () => {
  const usos = [...ler('src/components/PlayerRoot.tsx').matchAll(/(\w+)\s*:\s*animRaio\b/g)].map((m) => m[1]);
  assert.ok(usos.length > 0, 'o animRaio deixou de ser usado -- este teste ficou cego');
  for (const prop of usos) {
    assert.ok(
      SUPORTADAS_PELO_NATIVO.has(prop),
      `o animRaio alimenta \`${prop}\`, que o módulo nativo não anima`
    );
  }
});

verificar('o Toque não anima nenhuma propriedade de layout', () => {
  const fonte = ler('src/components/Toque.tsx');
  for (const proibida of ['width', 'height', 'padding', 'margin', 'left', 'top', 'right', 'bottom']) {
    assert.ok(
      !new RegExp(`${proibida}\\s*:\\s*premido`).test(fonte),
      `o Toque anima \`${proibida}\` -- isso não corre na UI thread e mistura drivers`
    );
  }
});

console.log('\nAssimetria do movimento:');

verificar('premir responde mais depressa do que soltar', () => {
  assert.ok(
    PREMIR.stiffness > SOLTAR.stiffness,
    `premir (${PREMIR.stiffness}) tem de ser mais rígido do que soltar (${SOLTAR.stiffness}) -- ` +
      'ao contrário, o botão fica lento a responder e rápido a voltar, que é o pior dos dois'
  );
});

verificar('premir não abana', () => {
  // Amortecimento crítico é 2 * sqrt(stiffness * mass). Acima disso não há
  // ressalto nenhum -- que é o que se quer quando o dedo ainda lá está.
  const critico = 2 * Math.sqrt(PREMIR.stiffness * PREMIR.mass);
  assert.ok(
    PREMIR.damping >= critico * 0.9,
    `premir ressalta (amortecimento ${PREMIR.damping} contra crítico ${critico.toFixed(1)}) -- ` +
      'um botão que oscila debaixo do dedo lê-se como avaria'
  );
});

verificar('soltar tem ressalto, mas pouco', () => {
  const critico = 2 * Math.sqrt(SOLTAR.stiffness * SOLTAR.mass);
  assert.ok(SOLTAR.damping < critico, 'soltar não ressalta nada -- fica sem vida');
  assert.ok(
    SOLTAR.damping > critico * 0.5,
    'soltar ressalta de mais -- passa de vivo a borrachudo'
  );
});

verificar('as escalas encolhem, e menos quanto maior for o alvo', () => {
  assert.ok(ESCALA.icone < ESCALA.botao, 'um ícone tem de encolher mais do que um botão para se notar');
  assert.ok(ESCALA.botao < ESCALA.cartao, 'um cartão grande a encolher como um botão parece que se partiu');
  assert.equal(ESCALA.nenhuma, 1);
  for (const [nome, v] of Object.entries(ESCALA)) {
    assert.ok(v > 0.8 && v <= 1, `ESCALA.${nome} = ${v} está fora do razoável`);
  }
});

verificar('o pulo cresce em vez de encolher', () => {
  assert.ok(PULO > 1, 'um salto que encolhe não é um salto');
  assert.ok(PULO < 1.6, `${PULO} é grande de mais -- um coração a saltar meio ecrã é uma piada, não um estado`);
});

verificar('todas as molas têm massa e rigidez positivas', () => {
  for (const [nome, m] of Object.entries({ PREMIR, SOLTAR, ESTADO, ENTRADA })) {
    assert.ok(m.stiffness > 0 && m.damping > 0 && m.mass > 0, `${nome} tem um valor não positivo`);
  }
});

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam`);
  process.exit(1);
}
console.log('\nMovimento: driver nativo em todo o lado, e a assimetria mantida.');
