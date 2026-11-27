/**
 * O Liquid Glass da base, refeito (27/11, depois da 7.2.8; `lib/vidroDaBase.ts`).
 * A 7.2.8 punha o mini e os separadores num só cartão de vidro, cortado por uma
 * vista de fora, sem nada a marcar o escolhido. Agora duas cápsulas como a barra
 * do iOS 26, com as medidas tiradas da verdadeira.
 *
 * O vidro em si só se vê num iPhone com o iOS 26: aqui as contas e a montagem.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { geometriaDoVidro, MUSICA_NO_VIDRO, selecaoDoVidro, VIDRO_DA_BASE } from '../src/lib/vidroDaBase.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); } catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

caso('as medidas da barra do iOS 26: 62 pt, a 21 das bordas e do fundo', () => {
  assert.equal(VIDRO_DA_BASE.altura, 62);
  assert.equal(VIDRO_DA_BASE.margem, 21);
  const g = geometriaDoVidro(34, 54);
  assert.deepEqual({ fundo: g.fundo, altura: g.altura, raio: g.raio }, { fundo: 21, altura: 62, raio: 31 });
  // O resto da app conta por cima do insets.bottom: a linha da música fica por cima da cápsula.
  assert.equal(g.separadores + 34, 21 + 62);
});
caso('sem indicador de casa, a 12 do fundo; com a letra grande, a cápsula cresce', () => {
  assert.equal(geometriaDoVidro(0, 54).fundo, 12);
  assert.equal(geometriaDoVidro(0, 54).separadores, 74);
  const grande = geometriaDoVidro(34, 66.4);
  assert.equal(grande.altura, 75);
  assert.equal(grande.raio, 37.5);
});
caso('a cápsula do escolhido: dentro da coluna, com 5 pt de vidro em cima e em baixo', () => {
  const s = selecaoDoVidro(398, 5, 62);
  assert.equal(s.coluna, 78);
  assert.equal(s.largura, 74);
  assert.equal(s.altura, 52);
  assert.equal(s.raio, 26);
  assert.equal(s.topo, 5);
  assert.equal(s.x(0), 6);
  assert.equal(s.x(4), 4 + 78 * 4 + 2);
  assert.equal(selecaoDoVidro(0, 5, 62).coluna, 0, 'antes de medir, nada');
});
caso('a capa da música longe da curva da cápsula (64 pt, semicírculos de 32)', () => {
  // No topo da capa (8 pt abaixo do topo da cápsula), a curva está a 32 - √(32² - 24²) da borda.
  const curva = 32 - Math.sqrt(32 ** 2 - 24 ** 2);
  assert.ok(MUSICA_NO_VIDRO.dentro > curva + 1);
  // A barra de progresso, a 5 pt do fundo, longe das pontas.
  assert.ok(MUSICA_NO_VIDRO.progressoLados > 32 - Math.sqrt(32 ** 2 - (32 - MUSICA_NO_VIDRO.progressoFundo) ** 2));
});

caso('a base: duas cápsulas, o raio no próprio vidro, nenhuma vista de fora a cortá-lo', () => {
  const doca = ler('src/components/Doca.tsx');
  assert.match(doca, /<Vidro style=\{\[StyleSheet\.absoluteFill, \{ borderRadius: MINI_PLAYER_HEIGHT \/ 2 \}\]\} \/>/);
  assert.match(doca, /<Vidro style=\{\[StyleSheet\.absoluteFill, \{ borderRadius: geo\.raio \}\]\} \/>/);
  assert.doesNotMatch(doca, /flutuante|RAIO_DO_CARTAO/, 'o cartão único da 7.2.8 saiu');
  const estilos = doca.slice(doca.indexOf('const styles = StyleSheet.create'));
  for (const nome of ['capsulaDaMusica', 'capsulaDosSeparadores']) {
    const bloco = estilos.slice(estilos.indexOf(`${nome}:`), estilos.indexOf('}', estilos.indexOf(`${nome}:`)));
    assert.doesNotMatch(bloco, /overflow/, `${nome}: sem overflow`);
  }
  assert.match(doca, /useEffect\(\(\) => \{ if \(vidro && linha > 0\) definirAlturaDosSeparadores\(geo\.separadores\); \}/, 'o resto da app conta a cápsula');
  assert.match(doca, /<SelecaoDoVidro state=\{separadores\.state\} position=\{separadores\.position\}/);
});
caso('o escolhido: uma cápsula lisa com rebordo (não de vidro), que anda com o pager', () => {
  const barra = ler('src/navigation/BarraDeSeparadores.tsx');
  const sel = barra.slice(barra.indexOf('export function SelecaoDoVidro'), barra.indexOf('const styles = StyleSheet.create'));
  assert.doesNotMatch(sel, /<Vidro|GlassView/, 'vidro sobre vidro funde-se e desaparece');
  assert.match(sel, /position\.interpolate\(\{ inputRange, outputRange: xs, extrapolate: 'clamp' \}\)/);
  assert.match(sel, /r\.name === 'Social' \? 0 : 1/, 'no Social, que não tem botão, apaga-se');
  assert.match(barra, /publicarSeparadores\(\{ state, navigation, position \}\)/);
  assert.match(barra, /backgroundColor: VIDRO_DA_BASE\.corDaSelecao,\n\s+borderWidth: StyleSheet\.hairlineWidth, borderColor: VIDRO_DA_BASE\.rebordoDaSelecao,/);
});
caso('a linha da música dentro da cápsula, e a capa que voa parte do sítio novo', () => {
  const leitor = ler('src/components/PlayerRoot.tsx');
  assert.match(leitor, /x: vidro \? MUSICA_NO_VIDRO\.margem \+ MUSICA_NO_VIDRO\.dentro : 16,/);
  assert.match(leitor, /styles\.mini,\n\s+vidro && styles\.miniNoVidro,/);
  assert.match(leitor, /capsulaDosBotoes: \{ marginHorizontal: 28, borderRadius: 26, borderCurve: 'continuous', paddingVertical: 4 \}/, 'a cápsula dos botões sem overflow');
  const outro = ler('src/components/OutroAparelho.tsx');
  assert.match(outro, /style=\{\[estilos\.mini, vidro && estilos\.miniNoVidro,/);
});

console.log(falhas ? `\n  ${falhas} caso(s) falharam.\n` : '\n  Todos os casos passaram.\n');
process.exit(falhas ? 1 : 0);
