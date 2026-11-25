/**
 * A letra com mola, linha a linha (25/11, item 4 do plano de melhorias): as contas
 * do `lib/molaDaLetra.ts`, a opção (Customise › Lyrics, ligada de origem) e quem a lê.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-mola-da-letra.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lerAparencia, PADRAO } from '../src/lib/aparencia.ts';
import { atrasoDaLinha, avisarSaltoDaLetra, MOLA_DA_LETRA, ouvirSaltoDaLetra } from '../src/lib/molaDaLetra.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

caso('as de baixo chegam mais tarde, uma a uma; as de cima e a nova partem juntas', () => {
  assert.equal(atrasoDaLinha(10, 10), 0);
  assert.equal(atrasoDaLinha(8, 10), 0);
  assert.equal(atrasoDaLinha(11, 10), MOLA_DA_LETRA.atrasoPorLinhaMs);
  assert.equal(atrasoDaLinha(14, 10), 4 * MOLA_DA_LETRA.atrasoPorLinhaMs);
  assert.equal(MOLA_DA_LETRA.atrasoPorLinhaMs, 40, 'o da maquete');
});

caso('longe da linha nova, nada se mexe (está fora do ecrã)', () => {
  assert.equal(atrasoDaLinha(10 - MOLA_DA_LETRA.linhasAcima - 1, 10), null);
  assert.equal(atrasoDaLinha(10 + MOLA_DA_LETRA.linhasAbaixo + 1, 10), null);
});

caso('o salto chega a quem ouve, e quem sai deixa de ouvir', () => {
  const vistos: number[] = [];
  const largar = ouvirSaltoDaLetra(({ delta }) => vistos.push(delta));
  avisarSaltoDaLetra(42, 3);
  largar();
  avisarSaltoDaLetra(7, 4);
  assert.deepEqual(vistos, [42]);
});

caso('a opção: ligada de origem, e lê-se do que está guardado', () => {
  assert.equal(PADRAO.letraComMola, true);
  assert.equal(lerAparencia({ letraComMola: false }).letraComMola, false);
  assert.equal(lerAparencia({ letraComMola: 'sim' }).letraComMola, true, 'um valor estragado fica o de origem');
  assert.match(ler('src/screens/PersonalizarScreen.tsx'), /rotulo="Flowing lyrics" valor=\{ap\.letraComMola\}/);
  assert.match(ler('src/i18n/fr.ts'), /"Flowing lyrics": "/);
});

caso('quem a lê: o scroll salta e avisa só no iPhone, e cada linha volta com a mola', () => {
  const v = ler('src/components/LyricsView.tsx');
  assert.match(v, /const comMola=Platform\.OS==='ios'&&molaLigada&&!reduced;/, 'o PC fica como era');
  assert.match(v, /scroll\.current\?\.scrollTo\(\{y:alvo,animated:false\}\);\n\s+if\(Math\.abs\(alvo-ultimoY\.current\)>0\.5\)avisarSaltoDaLetra\(alvo-ultimoY\.current,index\);/);
  assert.match(v, /const pauseFollowing=\(\)=>\{ultimoY\.current=null;/, 'a mão no scroll recomeça a conta');
  const l = ler('src/components/LinhaDaLetra.tsx');
  assert.match(l, /Animated\.spring\(desvio,\{toValue:0,[^}]*delay:atraso,useNativeDriver:true\}\)/);
  assert.match(l, /const comMola=useAparencia\(s=>s\.letraComMola\)&&!reduced;/, 'com Reduzir movimento, nada');
  assert.match(l, /const transform=useMemo\(/, 'uma interpolação por linha, não por desenho');
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');
