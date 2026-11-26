/**
 * A pesquisa da Home abre a crescer do campo (26/11, o resto do item 16 do plano,
 * `docs/maquetes-da-lista-2026-11-25.html#m16`): o cabeçalho compacta-se (o título
 * sobe e o campo com ele), a Home recua (0,94) e apaga-se por baixo, e o que se
 * pesquisa abre por cima, encostado ao campo. O Cancel faz o contrário.
 *
 * O movimento só se vê no iPhone. Aqui fixa-se o que o faz funcionar sem saltos.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); } catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const ecra = ler('src/screens/SearchScreen.tsx');
const conteudo = ecra.slice(ecra.indexOf('<KeyboardAvoidingView'), ecra.indexOf('</KeyboardAvoidingView>'));

caso('o cabeçalho diz quanto falta para ficar compacto', () => {
  const screen = ler('src/components/Screen.tsx');
  assert.match(screen, /distancia: number;/);
  assert.match(screen, /useEffect\(\(\) => \{ if \(g\) definirDistancia\(g\.distancia\); \}, \[g, definirDistancia\]\);/);
});

caso('ao entrar e ao sair da pesquisa: a rolagem até à distância, e de volta à da Home', () => {
  assert.match(ecra, /const modoPesquisa = isFocused \|\| query\.trim\(\)\.length >= 2;/);
  assert.match(ecra, /const alvo = modoPesquisa \? d : casa;/);
  assert.match(ecra, /Animated\.spring\(cab\.rolagem, \{ toValue: alvo, \.\.\.ENTRADA, useNativeDriver: true \}\)/);
  assert.match(ecra, /Animated\.spring\(recuo, \{ toValue: modoPesquisa \? 1 : 0, \.\.\.ENTRADA, useNativeDriver: true \}\)/);
  assert.match(ecra, /pedirFluidez\(700\)/);
  // Com Reduzir movimento, sem animação.
  assert.match(ecra, /if \(reduzido\) \{\n\s+recuo\.setValue/);
  // A Home já rolada para lá da distância: o cabeçalho fica onde está.
  assert.match(ecra, /const mexeCabecalho = d > 0 && casa < d;/);
});

caso('a Home recua (0,94, 30 pt, apaga-se) e fica montada por baixo', () => {
  assert.match(ecra, /outputRange: \[1, 0\.94\]/);
  assert.match(ecra, /outputRange: \[0, 30\]/);
  const camada = conteudo.indexOf("style={[StyleSheet.absoluteFill, { transformOrigin: 'top' }, estiloDaCasa]}");
  assert.ok(camada > 0, 'a camada da Home');
  assert.ok(conteudo.indexOf('ref={topoDaPagina}') > camada, 'a Home dentro da camada');
  assert.ok(conteudo.indexOf('{!modoPesquisa ? null :') > conteudo.indexOf('ref={topoDaPagina}'), 'a pesquisa por cima dela');
  assert.match(conteudo, /pointerEvents=\{modoPesquisa \? 'none' : 'box-none'\}/);
  assert.match(conteudo, /onScroll=\{modoPesquisa \? undefined : cab\.onScroll\}/);
  assert.match(conteudo, /onMomentumScrollEnd=\{guardarRolagemDaCasa\}/);
});

caso('o que se pesquisa encosta ao campo e não mexe no cabeçalho', () => {
  const pesquisa = conteudo.slice(conteudo.indexOf('{!modoPesquisa ? null :'));
  assert.doesNotMatch(pesquisa, /cab\.onScroll/, 'nenhuma lista da pesquisa mexe na rolagem');
  assert.doesNotMatch(pesquisa, /cab\.espaco/, 'todas começam por baixo do cabeçalho compacto');
  assert.match(ecra, /const topoDaPesquisa = Math\.max\(0, cab\.espaco - cab\.distancia\);/);
  // Dentro da camada da Home, o comentário vai entre chavetas: um /* */ solto entre
  // filhos de JSX é texto, e parte no iPhone.
  assert.match(conteudo, /estiloDaCasa\]\}\n\s+>\n\s+\{\/\* Default state - Show Recommendations \*\/\}/);
});

caso('o Cancel pela direita e as recentes em cascata continuam (25/11)', () => {
  assert.match(ecra, /<EntradaPelaDireita>/);
  assert.match(ecra, /<EntradaEmCascata key=\{q\} indice=\{i \+ 1\}>/);
});

console.log(falhas ? `\n  ${falhas} caso(s) falharam.\n` : '\n  Todos os casos passaram.\n');
process.exit(falhas ? 1 : 0);
