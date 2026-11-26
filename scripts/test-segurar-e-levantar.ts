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
import { ESPACO_ATE_A_PREVIA, lugarComPrevia } from '../src/lib/posicaoDoMenu.ts';

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
  assert.match(m, /outputRange: \[1, previaVisivel\.semFundo \? 1\.045 : 1\.03\]/, 'cresce, presa à entrada do menu (as linhas menos, que já entram dos lados)');
  assert.match(m, /const ancoraVisivel = previaVisivel \? \{ x: previaVisivel\.ret\.x/, 'o menu ancora-se à linha, não ao dedo');
});

// 26/11: o menu tapava a música levantada (o "Patek" na captura do João).
const iphone = { altura: 844, topo: 47, fundo: 34 };
const naoTapa = (r: { y: number; height: number }, l: { topo: number; altura: number; desvioDaPrevia: number }) =>
  l.topo >= r.y + l.desvioDaPrevia + r.height || l.topo + l.altura <= r.y + l.desvioDaPrevia;

caso('com espaço por baixo, o menu fica por baixo da linha e a linha não se mexe', () => {
  const r = { y: 200, height: 60 };
  const l = lugarComPrevia(r, 400, iphone);
  assert.deepEqual(l, { topo: 260 + ESPACO_ATE_A_PREVIA, altura: 400, desvioDaPrevia: 0 });
});

caso('sem espaço por baixo, vai por cima', () => {
  const r = { y: 700, height: 60 };
  const l = lugarComPrevia(r, 400, iphone);
  assert.equal(l.desvioDaPrevia, 0);
  assert.equal(l.topo + l.altura, 700 - ESPACO_ATE_A_PREVIA);
});

caso('a meio do ecrã com um menu alto: a linha sobe e o menu fica por baixo, sem a tapar', () => {
  const r = { y: 425, height: 60 };
  const l = lugarComPrevia(r, 560, iphone);
  assert.ok(l.desvioDaPrevia < 0, 'a linha sobe');
  assert.ok(naoTapa(r, l));
  assert.ok(r.y + l.desvioDaPrevia >= iphone.topo + 12, 'não passa para baixo da ilha');
  assert.ok(l.topo + l.altura <= iphone.altura - iphone.fundo - 12, 'nem sai pelo fundo');
});

caso('um menu maior do que o ecrã rola por dentro, ainda sem tapar a linha', () => {
  const r = { y: 425, height: 60 };
  const l = lugarComPrevia(r, 1200, iphone);
  assert.ok(l.altura < 1200);
  assert.ok(naoTapa(r, l));
});

caso('a linha levantada tem os cantos redondos e entra uns pontos dos lados; os cartões não', () => {
  const m = ler('src/components/MenuFlutuante.tsx');
  assert.match(m, /left: previaVisivel\.ret\.x \+ \(previaVisivel\.semFundo \? 0 : RECUO_DA_PLACA\)/);
  assert.match(m, /recorteDaPlaca: \{ flex: 1, borderRadius: 14, overflow: 'hidden' \}/);
  assert.match(m, /translateY: entrada\.interpolate\(\{ inputRange: \[0, 1\], outputRange: \[0, desvioDaPrevia\] \}\)/);
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
