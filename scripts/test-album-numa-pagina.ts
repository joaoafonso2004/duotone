/**
 * Os álbuns abrem numa página (26/11, item 15 do plano de melhorias): era uma
 * folha. A página entra pelo quadrado quando há um cartão, a capa pousa no
 * `AlvoDoVoo`, as músicas entram em cascata e o voltar encolhe até ao cartão.
 *
 * Correr: node --experimental-strip-types scripts/test-album-numa-pagina.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

caso('a página está nas pilhas e abre pelo quadrado', () => {
  const nav = ler('src/navigation/RootNavigator.tsx');
  assert.match(nav, /<Stack\.Screen name="Album" component=\{OnlineAlbum\} options=\{abrePorUmQuadrado\} \/>/);
  assert.match(nav, /Album: ParametrosDoAlbum;/);
  const abrir = ler('src/navigation/abrirAlbum.ts');
  assert.match(abrir, /entrarPeloQuadrado\(no as View, \{\n\s+capas: album\.capa \? \[album\.capa\] : \[\], raio: 12, destino: 'centro', navegar,/);
  assert.match(abrir, /if \(!no\) \{ navegar\(undefined\); return; \}/, 'sem cartão, entra como as outras');
});

caso('a página: a capa pousa, a cascata, o voltar ao cartão, o play de metal e o coração', () => {
  const p = ler('src/screens/AlbumScreen.tsx');
  assert.match(p, /<AlvoDoVoo style=\{\[styles\.capa, \{ width: lado, height: lado \}\]\}>/);
  assert.match(p, /const lado = Math\.min\(240, Math\.round\(width \* 0\.52\)\);/, 'o mesmo lado que a camada prevê');
  assert.match(p, /<LinhaEmCascata indice=\{index\}>/);
  assert.match(p, /const voltar = useVoltarDaPagina\(\);/);
  assert.match(p, /<PlayDeMetal lado=\{LADO_DO_PLAY\}/);
  assert.match(p, /alternarAlbumGuardado\(/);
  assert.match(p, /\(\{ tipo: 'album', nome: titulo \}\)/, 'o topo do leitor diz de onde vem');
});

caso('os quatro sítios que abriam a folha abrem a página', () => {
  const home = ler('src/screens/SearchScreen.tsx');
  assert.match(home, /aoAbrir=\{\(l\) => abrirAlbum\(navigation, \{ id: l\.id, titulo: l\.titulo, capa: l\.capa \}\)\}/);
  assert.doesNotMatch(home, /setAlbumAberto\(/);
  assert.match(ler('src/screens/LibraryGroupScreen.tsx'), /const abrirDisco = [\s\S]{0,120}abrirAlbum\(navigation, \{/);
  assert.match(ler('src/screens/AlbunsGuardadosScreen.tsx'), /onPress=\{\(e\) => abrirAlbum\(navigation, \{[^}]*\}, e\.currentTarget\)\}/, 'a sair do cartão');
  assert.match(ler('src/screens/ConversaScreen.tsx'), /aoAbrirAlbum=\{\(a\)=>abrirAlbum\(navigation,/);
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');
