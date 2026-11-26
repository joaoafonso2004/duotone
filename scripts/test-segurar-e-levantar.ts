/**
 * Segurar e levantar (25/11, item 2 do plano de melhorias): quem se segura deixa
 * uma cópia de si (`state/previaDoMenu.ts`), e o `MenuFlutuante` que abre a seguir
 * levanta-a por cima do desfoque e ancora-se a ela. Para já, as linhas das músicas.
 *
 * Correr: node --experimental-strip-types scripts/test-segurar-e-levantar.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { levarPrevia, mostrarPrevia } from '../src/state/previaDoMenu.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const ret = { x: 0, y: 120, width: 390, height: 60 };

caso('o menu que abre já a seguir leva a cópia, uma vez', () => {
  mostrarPrevia(ret, 'linha');
  const p = levarPrevia();
  assert.deepEqual(p?.ret, ret);
  assert.equal(levarPrevia(), null, 'o menu seguinte já não a vê');
});

caso('uma cópia esquecida não aparece num menu aberto mais tarde', () => {
  mostrarPrevia(ret, 'linha');
  assert.equal(levarPrevia(Date.now() + 5000), null);
});

caso('o menu levanta a cópia por cima do desfoque e ancora-se a ela', () => {
  const m = ler('src/components/MenuFlutuante.tsx');
  assert.match(m, /if \(abriuAgora\) previa\.current = levarPrevia\(\);/, 'lê-se ao abrir');
  assert.match(m, /<BlurView intensity=\{24\} tint="dark" style=\{StyleSheet\.absoluteFill\} \/>/);
  assert.match(m, /outputRange: \[1, 1\.045\]/, 'cresce 4,5 %, presa à entrada do menu');
  assert.match(m, /const ancoraVisivel = previaVisivel \? \{ x: previaVisivel\.ret\.x/, 'o menu ancora-se à linha, não ao dedo');
});

caso('a linha de uma música deixa a cópia antes de abrir o menu', () => {
  const t = ler('src/components/TrackRow.tsx');
  assert.match(t, /const ret = medirJa\(linha\.current\);\n\s+if \(ret\) \{\n\s+mostrarPrevia\(ret, <TrackRow track=\{track\}/);
  assert.ok(t.indexOf('mostrarPrevia(ret') < t.indexOf('onAction(track);\n            }'), 'a cópia antes do menu');
  assert.match(t, /<View ref=\{linha\} collapsable=\{false\}>/);
});

caso('os cartões levantam-se como são, sem a placa das linhas (Playlists, Home, álbuns guardados)', () => {
  mostrarPrevia(ret, 'cartao', { semFundo: true });
  assert.equal(levarPrevia()?.semFundo, true);
  assert.match(ler('src/components/MenuFlutuante.tsx'), /previaVisivel\.semFundo && styles\.previaSemFundo/);
  assert.match(ler('src/screens/PlaylistsScreen.tsx'), /levantar\(quadrados\.get\(item\.id\) \?\? null, <ArtworkCollage artworks=\{item\.artworks\} size=\{cardSize\} \/>, \{ semFundo: true \}\);\n\s+setOptionsFor\(item\);/);
  const home = ler('src/screens/SearchScreen.tsx');
  assert.equal((home.match(/levantar\(e\.currentTarget, \(/g) ?? []).length, 2, 'os cartões largos e os quadrados');
  assert.match(ler('src/screens/AlbunsGuardadosScreen.tsx'), /levantar\(e\.currentTarget, \([\s\S]{0,700}\), \{ semFundo: true \}\);\n\s+setComMenu\(item\);/);
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');
