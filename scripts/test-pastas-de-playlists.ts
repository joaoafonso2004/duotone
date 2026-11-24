/**
 * As pastas de playlists (16/11, lib/pastasDePlaylists.ts): a grelha, os nomes
 * e o largar no PC; e a ligação na API e nas duas plataformas, lida como texto.
 *
 * Correr: node --experimental-strip-types scripts/test-pastas-de-playlists.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  grelhaComPastas, limparNomeDaPasta, nomeDePastaNova, nomesDasPastas, oQueFazAoLargar, playlistsDaPasta, podeIrParaUmaPasta,
} from '../src/lib/pastasDePlaylists.ts';

let falhas = 0;
function caso(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const p = (id: string, pasta: string | null = null, capa: string | null = `capa-${id}`) => ({ id, pasta, artworks: capa ? [capa] : [] });

caso('a grelha: cada pasta no lugar da primeira playlist dela, as soltas onde estavam', () => {
  const g = grelhaComPastas([p('a'), p('b', 'Chill'), p('c'), p('d', 'chill '), p('e', 'Treino')]);
  assert.deepEqual(g.map((i) => (i.tipo === 'pasta' ? `[${i.nome}:${i.playlists.map((x) => x.id).join('')}]` : i.playlist.id)),
    ['a', '[Chill:bd]', 'c', '[Treino:e]']);
  const chill = g[1] as Extract<(typeof g)[number], { tipo: 'pasta' }>;
  assert.deepEqual(chill.capas, ['capa-b', 'capa-d']);
});

caso('as capas da pasta: as quatro primeiras que existem', () => {
  const g = grelhaComPastas(['1', '2', '3', '4', '5'].map((id) => p(id, 'X')).concat([p('6', 'X', null)]));
  assert.equal((g[0] as any).capas.length, 4);
});

caso('os nomes: limpos, com teto, e a mesma pasta com outras maiúsculas', () => {
  assert.equal(limparNomeDaPasta('  Late   night  '), 'Late night');
  assert.equal(limparNomeDaPasta('   '), null);
  assert.equal(limparNomeDaPasta('x'.repeat(80))!.length, 60);
  assert.deepEqual(playlistsDaPasta([p('a', 'Chill'), p('b', 'CHILL'), p('c')], 'chill').map((x) => x.id), ['a', 'b']);
  assert.deepEqual(nomesDasPastas([p('a', 'B'), p('b', 'A'), p('c', 'b')]), ['B', 'A']);
});

caso('uma pasta nova não repete o nome', () => {
  assert.equal(nomeDePastaNova([]), 'New folder');
  assert.equal(nomeDePastaNova(['new folder', 'New folder 2']), 'New folder 3');
});

caso('só as minhas mudam de pasta; largar numa pasta entra, numa playlist pergunta', () => {
  assert.equal(podeIrParaUmaPasta({ id: 'x', souColaborador: true }), false);
  assert.equal(podeIrParaUmaPasta({ id: 'x' }), true);
  assert.equal(oQueFazAoLargar({ tipo: 'pasta' }), 'entrar-na-pasta');
  assert.equal(oQueFazAoLargar({ tipo: 'playlist' }), 'escolher');
});

caso('a API lê a pasta na mesma leitura, e sem a coluna lê sem ela', () => {
  const api = ler('src/api/playlists.ts');
  assert.match(api, /'id, name, created_at, owner_id, visible_on_profile, copied_from, pasta'/);
  assert.match(api, /if \(faltaAPasta\(lida\.error\)\) \{ semPastas = true;/);
  assert.match(api, /export async function definirPasta\(ids: readonly string\[\], pasta: string \| null\)/);
  assert.match(api, /\.update\(\{ pasta: limparNomeDaPasta\(pasta\) \}\)\.in\('id', minhas\)\.eq\('owner_id', eu\)/);
  assert.match(ler('src/lib/migracoes.ts'), /\{ ficheiro: 'pastas-de-playlists\.sql', marca: 'col:playlists\.pasta'/);
});

caso('o menu de uma playlist tem "Move to folder…" nas minhas', () => {
  const m = ler('src/lib/menuDaPlaylist.ts');
  assert.match(m, /\{ id: 'pasta', rotulo: 'Move to folder…', icone: 'folder-outline' \}/);
});

caso('iPhone: a grelha com as pastas, a pasta aberta, e a folha de escolher a pasta', () => {
  const s = ler('src/screens/PlaylistsScreen.tsx');
  assert.match(s, /grelhaComPastas\(playlists\)/);
  // Abre a partir do quadrado da pasta (24/11, entrar pelo quadrado): o push leva o voo.
  assert.match(s, /navigation\.push\('PastaDePlaylists', \{ nome: celula\.pasta\.nome, \.\.\.\(voo \? \{ voo \} : \{\}\) \}\)/);
  assert.match(s, /const pastaAberta = route\.name === 'PastaDePlaylists' \? route\.params\?\.nome \?\? null : null;/);
  assert.match(ler('src/navigation/RootNavigator.tsx'), /<Stack\.Screen name="PastaDePlaylists" component=\{PlaylistsScreen\} options=\{abrePorUmQuadrado\} \/>/);
});

caso('PC: a grelha com as pastas, a rota, e o arrastar de uma playlist para cima de outra', () => {
  const pc = ler('src/desktop/paginas/PlaylistPages.web.tsx');
  assert.match(pc, /grelhaComPastas\(/);
  assert.match(pc, /navigate\(\{ name: 'pasta-de-playlists', nome: item\.nome \}\)/);
  assert.match(pc, /draggable/);
  assert.match(pc, /mergePlaylists\(alvo\.id, origem\.id\)/);
  assert.match(ler('src/desktop/rotas.ts'), /\| \{ name: 'pasta-de-playlists'; nome: string \}/);
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\ntest-pastas-de-playlists: tudo certo');
