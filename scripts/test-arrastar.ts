/**
 * Arrastar uma música no PC (24/10, src/lib/arrastar.ts): quando um gesto
 * passa a arrasto, onde entra a linha de inserção, para onde vai a música ao
 * reordenar, e o que aparece junto ao rato.
 *
 * Correr: node --experimental-strip-types scripts/test-arrastar.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  destinoDaOrdem, eArrasto, LIMIAR_DO_ARRASTO_PX, movidaPara, posicaoDeInsercao, rotuloDaFila, ROTULOS_DO_ARRASTO, topoDaInsercao,
} from '../src/lib/arrastar.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

console.log('\no gesto');
caso('abaixo do limiar ainda é um clique', () => {
  assert.equal(eArrasto(2, 3), null);
  assert.equal(eArrasto(LIMIAR_DO_ARRASTO_PX, 0), true);
});
caso('num carrossel, para o lado é deslizar; para cima ou para baixo, pegar', () => {
  assert.equal(eArrasto(12, 2, true), false);
  assert.equal(eArrasto(3, 9, true), true);
  assert.equal(eArrasto(12, 2, false), true, 'fora de um carrossel, qualquer direção');
});

console.log('\na linha de inserção');
const linhas = [{ top: 0, bottom: 50 }, { top: 50, bottom: 100 }, { top: 100, bottom: 150 }];
caso('pela metade de cada linha', () => {
  assert.equal(posicaoDeInsercao(linhas, 10), 0);
  assert.equal(posicaoDeInsercao(linhas, 30), 1);
  assert.equal(posicaoDeInsercao(linhas, 74), 1);
  assert.equal(posicaoDeInsercao(linhas, 76), 2);
  assert.equal(posicaoDeInsercao(linhas, 140), 3, 'abaixo da última: no fim');
  assert.equal(posicaoDeInsercao([], 10), 0, 'sem linhas: no início');
});
caso('desenha-se por cima da linha, ou por baixo da última', () => {
  assert.equal(topoDaInsercao(linhas, 1), 50);
  assert.equal(topoDaInsercao(linhas, 3), 150);
  assert.equal(topoDaInsercao([], 0), null);
});

console.log('\nreordenar');
caso('logo antes ou logo depois de si própria não move', () => {
  assert.equal(destinoDaOrdem(2, 2), null);
  assert.equal(destinoDaOrdem(2, 3), null);
});
caso('para baixo conta com o lugar que deixou; para cima, não', () => {
  assert.equal(destinoDaOrdem(0, 4), 3);
  assert.equal(destinoDaOrdem(4, 1), 1);
  assert.deepEqual(movidaPara(['a', 'b', 'c', 'd', 'e'], 0, destinoDaOrdem(0, 4)!), ['b', 'c', 'd', 'a', 'e']);
  assert.deepEqual(movidaPara(['a', 'b', 'c', 'd', 'e'], 4, destinoDaOrdem(4, 1)!), ['a', 'e', 'b', 'c', 'd']);
});
caso('todos os casos de uma lista de 5 batem com o que a linha mostra', () => {
  const lista = ['a', 'b', 'c', 'd', 'e'];
  for (let de = 0; de < 5; de++) {
    for (let antesDe = 0; antesDe <= 5; antesDe++) {
      const para = destinoDaOrdem(de, antesDe);
      if (para === null) continue;
      const fica = movidaPara(lista, de, para);
      // Quem estava antes da linha continua antes da música; quem estava depois, depois.
      const i = fica.indexOf(lista[de]);
      const antes = lista.slice(0, antesDe).filter((x) => x !== lista[de]);
      assert.deepEqual(fica.slice(0, i), antes, `de ${de} antes de ${antesDe}`);
    }
  }
});

console.log('\no que aparece junto ao rato');
caso('a fila: no topo "Play next", entre linhas "Play after …", numa Jam sugere-se', () => {
  assert.equal(rotuloDaFila(0, null, false), 'Play next');
  assert.equal(rotuloDaFila(2, 'Magnolia', false), 'Play after Magnolia');
  assert.equal(rotuloDaFila(2, 'Magnolia', true), 'Suggest to the Jam');
});
caso('os destinos dizem o que fazem, e o que não fazem', () => {
  assert.equal(ROTULOS_DO_ARRASTO.playlist('tuff'), 'Add to tuff');
  assert.equal(ROTULOS_DO_ARRASTO.jaNaPlaylist('tuff'), 'Already in tuff');
  assert.equal(ROTULOS_DO_ARRASTO.amigo('Ana'), 'Send to Ana');
  assert.equal(ROTULOS_DO_ARRASTO.jaNasGostadas, 'Already in Liked Songs');
});

console.log('\nligado no PC');
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const ui = ler('src/desktop/ui.web.tsx');
const motor = ler('src/desktop/Arrastar.web.tsx');
caso('pega-se numa linha de qualquer tabela e num cartão das prateleiras (o carrossel só na vertical)', () => {
  assert.match(ui, /onPointerDown=\{\(\(event: any\) => comecarArrasto\(event, track, \{ lista: listKey, indice: index \}\)\) as any\}/);
  assert.match(ui, /onPointerDown=\{\(\(e: any\) => comecarArrasto\(e, t\)\) as any\}/);
  assert.match(ui, /onPointerDown=\{\(\(e: any\) => comecarArrasto\(e, t, \{\}, \{ soVertical: true \}\)\) as any\}/);
});
caso('os destinos: Liked Songs, a barra, as playlists e os amigos da lateral, e a fila', () => {
  const casca = ler('src/desktop/casca.web.tsx');
  assert.match(casca, /alvo=\{item\.id === 'songs' \? alvoDasGostadas\(\) : null\}/);
  assert.match(casca, /ref=\{refDoAlvo\('barra-do-leitor', p\.current \? alvoDaBarra\(\) : null\)\}/);
  const atalhos = ler('src/desktop/AtalhosNaLateral.web.tsx');
  assert.match(atalhos, /a\.tipo === 'playlist' \? alvoDaPlaylist\(\{ id: a\.id, nome: a\.nome \}\)\n\s+: a\.tipo === 'amigo' \? alvoDoAmigo\(\{ id: a\.id, nome: a\.nome \}\) : null/);
  assert.match(ler('src/desktop/AmigosNaLateral.web.tsx'), /ref=\{refDoAlvo\(`lateral-amigo:\$\{a\.friendId\}`, alvoDoAmigo\(\{ id: a\.friendId, nome \}\)\) as any\}/);
  assert.match(ler('src/desktop/FilaDoLeitor.web.tsx'), /<View ref=\{refDoAlvo\(chave, alvoDaFila\(\)\) as any\} style=\{\{ minHeight: 56 \}\}>/);
});
caso('reordena-se só na ordem da playlist, sem procura, e só quem pode mexer', () => {
  const pagina = ler('src/desktop/paginas/PlaylistPages.web.tsx');
  assert.match(pagina, /const podeReordenar = canEdit && sortMode === 'default' && !query\.trim\(\);/);
  assert.match(pagina, /reordenar=\{podeReordenar \? \{ aoMover: moverNaPlaylist \} : null\}/);
  assert.match(pagina, /return setPlaylistOrder\(id, lista\.map\(\(t\) => t\.id\)\);/);
  assert.match(ui, /aceita: \(a\) => a\.origem\.lista === lista && typeof a\.origem\.indice === 'number',/, 'só a música desta lista');
});
caso('mandar a um amigo só sai no fim do aviso (uma mensagem não se apaga)', () => {
  const alvos = ler('src/desktop/alvosDeLargar.web.ts');
  assert.match(alvos, /desfazer: \(\) => \{\},\n\s+aoAcabar: \(\) => \{\n\s+void shareItem\(amigo\.id, 'track', t\)/);
});
caso('o clique depois de largar é engolido, e Esc desiste sem fechar o diálogo', () => {
  assert.match(motor, /if \(!g\.ativo\) \{ terminar\(\); return; \}\n\s+engolirClique\(\);/);
  assert.match(motor, /e\.preventDefault\(\);\n\s+e\.stopPropagation\(\);\n\s+gesto\.cancelado = true;/);
});
caso('o "Already in …" custa uma leitura por arrasto, e só com playlists na lateral', () => {
  assert.match(motor, /if \(querPlaylists\) \{\n\s+void playlistsComAFaixa\(g\.faixa\)/);
});
caso('o Undo aparece no PC (o aviso partilhado com o botão)', () => {
  const raiz = ler('src/navigation/RootNavigator.web.tsx');
  assert.match(raiz, /if \(a\?\.desfazer\) \{ setToast\(''\); setAvisoComDesfazer\(a\); return; \}/);
  assert.match(raiz, /\{avisoComDesfazer && <AvisoComDesfazer aviso=\{avisoComDesfazer\} \/>\}<CamadaDoArrasto \/>/);
});

if (falhas) { console.error(`\n  ${falhas} caso(s) falharam.\n`); process.exit(1); }
console.log('\n  Todos os casos passaram.\n');
