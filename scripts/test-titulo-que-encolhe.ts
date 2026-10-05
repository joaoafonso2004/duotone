/**
 * O título que encolhe no lugar -- src/lib/tituloQueEncolhe.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-titulo-que-encolhe.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ALTURA_DA_BARRA, TITULO_COMPACTO, faixaDaBarraDoNome, geometriaDoTitulo } from '../src/lib/tituloQueEncolhe.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const perto = (a: number, b: number, folga = 0.01) => Math.abs(a - b) <= folga;

// Um iPhone de 393 pt com a ilha (topo seguro 59): "Liked Songs" a 32 pt.
const iphone = {
  larguraDoEcra: 393, topoSeguro: 59, fundoDaLinha: 59 + 8 + 38 + 18 + 16,
  titulo: { x: 24, y: 67, largura: 180, altura: 38, tamanho: 32 },
  centroDaDireita: 59 + 8 + 50,
};

console.log('\nquanto encolhe');
caso('a linha do título fica da altura da barra', () => {
  const g = geometriaDoTitulo(iphone);
  assert.equal(g.distancia, iphone.fundoDaLinha - (iphone.topoSeguro + ALTURA_DA_BARRA));
});
caso('um cabeçalho já compacto não encolhe (nunca negativo)', () => {
  assert.equal(geometriaDoTitulo({ ...iphone, fundoDaLinha: 80 }).distancia, 0);
});

console.log('\npara onde vai o título');
caso('fica com o tamanho de uma barra do iOS', () => {
  assert.ok(perto(geometriaDoTitulo(iphone).escala * 32, TITULO_COMPACTO));
});
caso('centrado na largura do ecrã', () => {
  const g = geometriaDoTitulo(iphone);
  const esquerda = iphone.titulo.x + g.dx;
  const direita = esquerda + iphone.titulo.largura * g.escala;
  assert.ok(perto(esquerda, 393 - direita), `${esquerda} vs ${393 - direita}`);
});
caso('e no centro vertical da barra compacta', () => {
  const g = geometriaDoTitulo(iphone);
  const centro = iphone.titulo.y + iphone.titulo.altura / 2 + g.dy;
  assert.ok(perto(centro, iphone.topoSeguro + ALTURA_DA_BARRA / 2));
});
caso('um título com voltar (22 pt) também acaba a 17', () => {
  const g = geometriaDoTitulo({ ...iphone, titulo: { ...iphone.titulo, tamanho: 22, altura: 27 } });
  assert.ok(perto(g.escala * 22, TITULO_COMPACTO));
});
caso('um título que já é pequeno não cresce', () => {
  assert.equal(geometriaDoTitulo({ ...iphone, titulo: { ...iphone.titulo, tamanho: 15 } }).escala, 1);
});

console.log('\nos botões');
caso('o da direita acaba no centro da barra', () => {
  const g = geometriaDoTitulo(iphone);
  assert.ok(perto(iphone.centroDaDireita + g.dyDaDireita, iphone.topoSeguro + ALTURA_DA_BARRA / 2));
});
caso('sem medida, sobem o mesmo que a linha encolhe', () => {
  const g = geometriaDoTitulo({ ...iphone, centroDaDireita: undefined });
  assert.equal(g.dyDaDireita, -g.distancia);
  assert.equal(g.dyDoVoltar, -g.distancia);
});

console.log('\nligado');
caso('a barra do nome do perfil só acende quando o nome passa por baixo dela', () => {
  // iPhone com ilha: barra de 59 + 56; o nome acaba a 312 pt da página.
  const [de, ate] = faixaDaBarraDoNome(312, 115);
  assert.ok(de < ate, 'o intervalo tem de subir (ao contrário, o motor nativo deixava-a opaca no topo)');
  assert.deepEqual([de, ate], [167, 197]);
  assert.ok(de > 0, 'no topo da página a barra não se vê: a capa fica à vista');
  const [a2, b2] = faixaDaBarraDoNome(40, 115);
  assert.ok(a2 >= 0 && b2 > a2, 'nunca negativo nem ao contrário');
  // A barra vive no CimaDoPerfil desde 5/10 (só iPhone).
  assert.match(readFileSync('src/components/CimaDoPerfil.tsx', 'utf8'), /inputRange: faixaDaBarraDoNome\(/);
});

caso('a capa fica descoberta no topo em iPhones com e sem recorte', () => {
  for (const topoSeguro of [0, 20, 44, 59, 62]) {
    const alturaDaBarra = topoSeguro + 56;
    const fimDoNome = 260 + topoSeguro * 0.4 - 62 + 112 + 8 + 10 + 34;
    const [de, ate] = faixaDaBarraDoNome(fimDoNome, alturaDaBarra);
    assert.ok(de > 0 && ate > de);
    assert.ok(de > 20, 'puxar para atualizar ou rolar só um pouco não cobre a capa');
    assert.equal(fimDoNome - ate, alturaDaBarra, 'só fica opaca quando o nome grande saiu');
    assert.equal(fimDoNome - de, alturaDaBarra + 30, 'a transição começa ao aproximar-se da barra');
  }
});

caso('o Screen usa a geometria e os ecrãs principais encolhem', () => {
  assert.match(readFileSync('src/components/Screen.tsx', 'utf8'), /geometriaDoTitulo/);
  for (const f of ['SongsScreen', 'ArtistsScreen', 'PlaylistsScreen', 'SearchScreen', 'SettingsScreen',
    'PlaylistDetailScreen', 'LibraryGroupScreen', 'SocialScreen', 'ImportYouTubeScreen'])
    assert.match(readFileSync(`src/screens/${f}.tsx`, 'utf8'), /useCabecalhoQueEncolhe/, `${f} não liga o scroll`);
});

caso('as páginas com capa grande mostram o nome pequeno quando o grande sai', () => {
  const screen = readFileSync('src/components/Screen.tsx', 'utf8');
  assert.match(screen, /function ScreenHeroi/);
  assert.match(readFileSync('src/screens/PlaylistDetailScreen.tsx', 'utf8'), /tituloCompacto=\{!editMode/);
  assert.match(readFileSync('src/screens/LibraryGroupScreen.tsx', 'utf8'), /aoMedirNome=\{setFimDoNome\}/);
  assert.match(readFileSync('src/components/CabecalhoDaPlaylist.tsx', 'utf8'), /aoMedirNome\(/);
});

if (falhas) { console.error(`\n  ${falhas} caso(s) falharam.\n`); process.exit(1); }
console.log('\n  Todos os casos passaram.\n');
