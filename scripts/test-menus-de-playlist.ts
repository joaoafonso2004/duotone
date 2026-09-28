// As playlists no iPhone (28/9): o que o João pediu fica preso aqui.
//  - o toque longo tem as partilhas (só tinha Rename e Delete);
//  - o nome e a ordem editam-se juntos (havia um Rename à parte);
//  - a edição reordena com o gesto da fila, não com setas;
//  - o mosaico não mostra as barras pretas das capas do YouTube;
//  - nada em português no menu (era "Partilhar com amigo…").
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Sem os \r: no Windows (e no runner da build de Windows) o checkout vem em CRLF.
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let falhas = 0;
const caso = (nome: string, fn: () => void) => {
  try { fn(); console.log(`  ok - ${nome}`); } catch (e) { falhas++; console.error(`  FALHOU - ${nome}: ${(e as Error).message}`); }
};

const grelha = ler('src/screens/PlaylistsScreen.tsx');
const pagina = ler('src/screens/PlaylistDetailScreen.tsx');

caso('o toque longo tem tocar, partilhar, editar e apagar', () => {
  for (const rotulo of ['Play', 'Shuffle', 'Add to queue', 'Share with a friend…', 'QR code / Copy link', 'Edit playlist', 'Delete playlist']) {
    assert.ok(grelha.includes(`label: '${rotulo}'`), `falta "${rotulo}"`);
  }
  assert.match(grelha, /navigate\('PlaylistDetail', \{ id: p\.id, name: p\.name, editar: true \}\)/, 'o Edit abre a página já a editar');
});

caso('não há um Rename à parte, em lado nenhum', () => {
  assert.ok(!grelha.includes('Rename playlist'));
  assert.ok(!pagina.includes('Rename playlist'));
});

caso('a barra da página tem o Share, e o More passou para o ••• de cima', () => {
  assert.match(pagina, /<Text style=\{styles\.toolbarLabel\}>Share<\/Text>/);
  assert.ok(!/<Text style=\{styles\.toolbarLabel\}>More<\/Text>/.test(pagina), 'o More voltou à barra');
  assert.match(pagina, /accessibilityLabel="More options"/);
  assert.match(pagina, /accessibilityLabel=\{procurarAberto \? 'Close search' : 'Search this playlist'\}/, 'a pesquisa é uma lupa');
});

caso('a edição tem o nome em cima e o gesto da fila, sem setas', () => {
  assert.match(pagina, /accessibilityLabel="Playlist name"/);
  assert.match(pagina, /<LinhaArrastavel \{\.\.\.arrasto\.propsDaLinha\(index\)\} podeArrastar>/);
  assert.match(pagina, /<DeslizarParaTirar/);
  assert.ok(!pagina.includes('chevron-up'), 'as setas voltaram');
  assert.match(ler('src/components/QueueSheet.tsx'), /useArrastarLista\(/, 'a fila e a playlist usam o mesmo arrasto');
});

caso('nada é apagado antes do Save, e há Undo', () => {
  assert.match(pagina, /planoDeGravacao\(rascunho, name, tracks/);
  assert.match(pagina, />Undo<\/Text>/);
});

caso('o mosaico passa as capas pelo capaParaLista (sem as barras pretas)', () => {
  assert.match(ler('src/components/ArtworkCollage.tsx'), /capas\.map\(capaParaLista\)/);
});

caso('os menus da playlist estão em inglês', () => {
  for (const [f, s] of [['PlaylistsScreen', grelha], ['PlaylistDetailScreen', pagina]] as const) {
    assert.ok(!/label: '[^']*(Partilhar|amigo|Apagar|Mudar o nome)/i.test(s), `${f} tem um rótulo em português`);
  }
});

if (falhas > 0) { console.error(`\n${falhas} falha(s)`); process.exit(1); }
console.log('Menus de playlist: passou.');
