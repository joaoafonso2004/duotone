// No PlayerRoot, TODAS as animações têm de correr no driver nativo.
//
// Porquê um teste para uma coisa destas: uma vista tem UM nó de propriedades.
// Assim que uma propriedade dessa vista passa para o driver nativo, o React
// Native leva a vista inteira -- e uma segunda animação sobre a mesma vista,
// pedida a partir do JS, deixa de ser mais lenta e passa a ATIRAR:
//
//   Attempting to run JS driven animation on animated node that has been moved
//   to "native" earlier by starting an animation with `useNativeDriver: true`
//
// No PlayerRoot isso acontece dentro de um `useEffect` de montagem, ou seja,
// no arranque da app e antes de haver ecrã. Foi o que matou a 1.12.0: abria,
// meio segundo de preto, fechava. Nem o TypeScript nem os outros testes veem
// isto -- `useNativeDriver: false` é uma opção perfeitamente válida em geral.
//
// O PlayerRoot é o caso em que não é: `anim`, `animRaio`, `dragX`, `dragY`,
// `visibilityAnim` e `miniFade` partilham as mesmas vistas (a moldura da capa,
// a barra mini), e o `anim` é nativo. Por isso a regra aqui é simples e
// verificável: neste ficheiro não existe `useNativeDriver: false`.
//
// Se um dia for mesmo preciso animar uma propriedade que o módulo nativo não
// suporta (`left`, `top`, `width`, `height`, `bottom`...), a saída NÃO é voltar
// a `false` -- é pôr essa propriedade numa vista só dela.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CAMINHO = new URL('../src/components/PlayerRoot.tsx', import.meta.url);
const fonte = readFileSync(CAMINHO, 'utf8');

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

console.log('Driver de animação no PlayerRoot:');

verificar('nenhuma animação corre no driver do JS', () => {
  const linhas = fonte.split('\n');
  const culpadas = linhas
    .map((linha, i) => ({ n: i + 1, linha }))
    .filter(({ linha }) => /useNativeDriver\s*:\s*false/.test(linha))
    .map(({ n, linha }) => `linha ${n}: ${linha.trim()}`);

  assert.deepEqual(
    culpadas,
    [],
    'estas animações atiram no arranque porque partilham vista com o `anim`, ' +
      `que é nativo:\n    ${culpadas.join('\n    ')}`
  );
});

verificar('o ficheiro anima mesmo alguma coisa (o teste não passa por vazio)', () => {
  const nativas = fonte.match(/useNativeDriver\s*:\s*true/g) ?? [];
  assert.ok(
    nativas.length >= 5,
    `só ${nativas.length} animações nativas encontradas -- o teste deixou de olhar para o que devia`
  );
});

// A propriedade que obrigou a separar o `animRaio` do `anim` tem de continuar a
// ser uma que o módulo nativo aceita. Se alguém trocar o `borderRadius` por
// `width` aqui, o erro passa a ser outro ("Style property 'width' is not
// supported by native animated module") mas o resultado é o mesmo: crash.
const SUPORTADAS_PELO_NATIVO = new Set([
  'opacity', 'transform', 'borderRadius', 'zIndex', 'elevation',
  'shadowOpacity', 'shadowRadius', 'color', 'backgroundColor', 'tintColor',
  'translateX', 'translateY', 'scale', 'scaleX', 'scaleY', 'rotate', 'perspective',
]);

verificar('o animRaio só alimenta propriedades que o módulo nativo suporta', () => {
  // Onde o `animRaio` é interpolado, a propriedade que o recebe é a palavra
  // imediatamente antes -- `borderRadius: animRaio.interpolate({...})`.
  const usos = [...fonte.matchAll(/(\w+)\s*:\s*animRaio\b/g)].map((m) => m[1]);
  assert.ok(usos.length > 0, 'o animRaio deixou de ser usado -- este teste ficou cego');
  for (const prop of usos) {
    assert.ok(
      SUPORTADAS_PELO_NATIVO.has(prop),
      `o animRaio alimenta \`${prop}\`, que o módulo nativo não anima`
    );
  }
});

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam`);
  process.exit(1);
}
console.log('\nDriver de animação: o PlayerRoot corre todo na UI thread.');
