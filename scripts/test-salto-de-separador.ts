/**
 * Os saltos de mais de um separador sem a página a deslizar (28/11,
 * `state/saltoDeSeparador.ts`; o João: "se eu clicar numa aba que está a mais de
 * uma página de distância, a app dá um slight freeze").
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eSaltoLongo, saltarSemDeslizar, useSaltoDeSeparador } from '../src/state/saltoDeSeparador.ts';

let falhas = 0;
function caso(nome: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve().then(fn).then(
    () => console.log(`  ok - ${nome}`),
    (e) => { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); },
  );
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

await caso('só os saltos de mais de um separador', () => {
  assert.equal(eSaltoLongo(0, 1), false, 'o do lado desliza');
  assert.equal(eSaltoLongo(3, 2), false);
  assert.equal(eSaltoLongo(0, 2), true);
  assert.equal(eSaltoLongo(4, 0), true);
  assert.equal(eSaltoLongo(2, 2), false, 'o mesmo separador');
  assert.equal(eSaltoLongo(-1, 3), false, 'uma rota que não se achou');
});

await caso('liga-se para o salto e desliga-se pouco depois', async () => {
  assert.equal(useSaltoDeSeparador.getState().saltando, false);
  saltarSemDeslizar();
  assert.equal(useSaltoDeSeparador.getState().saltando, true);
  await new Promise((r) => setTimeout(r, 450));
  assert.equal(useSaltoDeSeparador.getState().saltando, false, 'os toques a seguir voltam a deslizar');
});

await caso('o navegador e o toque', () => {
  const raiz = ler('src/navigation/RootNavigator.tsx');
  assert.match(raiz, /const saltando = useSaltoDeSeparador\(\(s\) => s\.saltando\);/);
  assert.match(raiz, /animationEnabled: !reducedMotion && !saltando,/);
  const barra = ler('src/navigation/BarraDeSeparadores.tsx');
  // Antes do navigate, no mesmo toque: o React junta as duas mudanças num só desenho.
  assert.match(barra, /if \(eSaltoLongo\(state\.index, state\.routes\.findIndex\(\(r\) => r\.key === route\.key\)\)\) saltarSemDeslizar\(\);\n\s+navigation\.navigate\(route\.name\);/);
});

console.log(falhas ? `\n  ${falhas} caso(s) falharam.\n` : '\n  Todos os casos passaram.\n');
process.exit(falhas ? 1 : 0);
