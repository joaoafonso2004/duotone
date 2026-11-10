/**
 * As três melhorias de uso de 9/11 (maquete `docs/melhorias-de-uso-maquete.html`,
 * as escolhas do João):
 *   1. escolher várias músicas no PC, com a barra flutuante (B);
 *   2. procurar à mão as que deixaram de tocar no Library check, com o Search da importação (A);
 *   3. a playlist importada de um link atualiza-se sozinha, sem perguntar (C).
 *
 * As regras correm em Node; o resto lê os ficheiros como texto.
 * Correr: node --experimental-strip-types scripts/test-melhorias-de-uso.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  acaoDoClique, alternar, escolhidasPorOrdem, intervalo, SEM_SELECAO, todas,
} from '../src/lib/selecaoDeFaixas.ts';
import {
  chaveDaLinha, chavesDaLeitura, deveVer, juntarConhecidas, novasDaLeitura, UM_DIA_MS,
} from '../src/lib/origemDasPlaylists.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const faixa = (id: string) => ({ id, source: 'youtube', sourceId: id, title: id, artist: 'X', album: null, artworkUrl: null, durationSeconds: 100 }) as any;
const F = ['a', 'b', 'c', 'd', 'e'].map(faixa);

console.log('\n1 · escolher várias (as regras)');
caso('Ctrl+clique junta e tira; a última que sai limpa tudo', () => {
  let s = alternar(SEM_SELECAO, 'L', F, 1);
  assert.deepEqual(s, { lista: 'L', chaves: ['youtube:b'], ancora: 1 });
  s = alternar(s, 'L', F, 3);
  assert.deepEqual(s.chaves, ['youtube:b', 'youtube:d']);
  s = alternar(s, 'L', F, 1);
  assert.deepEqual(s.chaves, ['youtube:d']);
  assert.equal(alternar(s, 'L', F, 3), SEM_SELECAO);
});
caso('Shift+clique junta o intervalo desde a âncora, às que já estavam', () => {
  let s = alternar(SEM_SELECAO, 'L', F, 4);
  s = alternar(s, 'L', F, 0);
  s = intervalo(s, 'L', F, 2);
  assert.deepEqual(new Set(s.chaves), new Set(['youtube:a', 'youtube:b', 'youtube:c', 'youtube:e']));
  assert.equal(s.ancora, 0, 'a âncora fica onde estava');
  assert.deepEqual(intervalo(SEM_SELECAO, 'L', F, 2).chaves, ['youtube:c'], 'sem âncora é um Ctrl+clique');
});
caso('noutra lista começa de novo; Ctrl+A escolhe todas', () => {
  const s = alternar(alternar(SEM_SELECAO, 'L', F, 0), 'M', F, 2);
  assert.deepEqual(s, { lista: 'M', chaves: ['youtube:c'], ancora: 2 });
  assert.equal(todas('L', F).chaves.length, 5);
  assert.equal(todas('L', []), SEM_SELECAO);
});
caso('as escolhidas vêm pela ordem da lista, e só as que lá continuam', () => {
  const s = { lista: 'L', chaves: ['youtube:d', 'youtube:a', 'youtube:z'], ancora: 0 };
  assert.deepEqual(escolhidasPorOrdem(s, 'L', F).map((t) => t.id), ['a', 'd']);
  assert.deepEqual(escolhidasPorOrdem(s, 'outra', F), []);
});
caso('o clique: Shift intervalo, Ctrl/Cmd alterna; sem teclas toca, ou limpa se houver escolhidas', () => {
  assert.equal(acaoDoClique({ shift: true }, false), 'intervalo');
  assert.equal(acaoDoClique({ ctrl: true }, true), 'alternar');
  assert.equal(acaoDoClique({ meta: true }, false), 'alternar');
  assert.equal(acaoDoClique({}, false), 'tocar');
  assert.equal(acaoDoClique({}, true), 'limpar', 'um clique sem Ctrl a meio de escolher não deita a fila fora');
});

console.log('\n1 · escolher várias (a app)');
const ui = ler('src/desktop/ui.web.tsx');
const nav = ler('src/navigation/RootNavigator.web.tsx');
const barra = ler('src/desktop/BarraDaSelecao.web.tsx');
caso('a tabela escolhe com Ctrl/Shift, Ctrl+A, e acende as escolhidas com o ✓', () => {
  assert.match(ui, /<P onPress=\{\(e: any\) => aoCarregar\(e, track, index\)\}/);
  assert.match(ui, /const acao = acaoDoClique\(\{ ctrl: !!n\?\.ctrlKey, meta: !!n\?\.metaKey, shift: !!n\?\.shiftKey \}/);
  assert.match(ui, /\(e\.ctrlKey \|\| e\.metaKey\) && !e\.altKey && \(e\.key === 'a' \|\| e\.key === 'A'\)/);
  assert.match(ui, /escolhida && ui\.trackEscolhida/);
  assert.match(ui, /'aria-selected': escolhida/);
  assert.match(ui, /if \(event\?\.ctrlKey \|\| event\?\.metaKey \|\| event\?\.shiftKey\) return;/, 'com Ctrl ou Shift não começa um arrasto');
  assert.match(ui, /if \(escolhida && s\.faixas\.length > 1\) \{/, 'o botão direito numa escolhida abre o menu de todas');
});
caso('a barra flutua por cima do leitor, com Play, Queue, Add to playlist, Like e Remove', () => {
  assert.match(nav, /<\/TransicaoDePagina><\/View><BarraDaSelecao notify=\{notify\} \/>/);
  for (const r of ['"Play"', '"Queue"', '"Add to playlist"', '"Like"', '"Remove"']) assert.ok(barra.includes(`rotulo=${r}`), r);
  assert.match(barra, /window\.addEventListener\('keydown', tecla, true\)/, 'Esc em captura, antes do painel da fila');
  assert.match(barra, /<EscolherPlaylist faixa=\{lista\[0\]!\} semMarcas/);
  assert.match(ler('src/desktop/EscolherPlaylist.web.tsx'), /if \(semMarcas\) return;/);
  assert.match(ler('src/desktop/casca.web.tsx'), /\[data-dt~="barra-das-escolhidas"\]\{ animation: dt-placa/);
});
caso('tirar várias: as Liked Songs (Undo no mesmo lugar) e as playlists tuas (Undo no fim)', () => {
  assert.match(ler('src/desktop/paginas/BibliotecaPages.web.tsx'), /<TrackTable plain saltoParaAtual saoGostadas removerVarias=\{removerDasGostadas\}/);
  assert.match(ler('src/desktop/paginas/PlaylistPages.web.tsx'), /removerVarias=\{canEdit \? removerDaPlaylist\(id, playlistTitle, /);
  const acoes = ler('src/desktop/acoesDasEscolhidas.web.ts');
  assert.match(acoes, /const tiradas = await tirarDasGuardadas\(ids\);/);
  assert.match(acoes, /await reporGuardadas\(tiradas, faixas\);/);
  assert.match(acoes, /detalhe: 'Undo puts them back at the end of the playlist\.'/);
});

console.log('\n2 · procurar à mão as que deixaram de tocar');
caso('a pesquisa da importação é uma peça só, usada nos dois sítios', () => {
  const peca = ler('src/desktop/PesquisaNaLinha.web.tsx');
  assert.match(peca, /useMusicSearch\(texto, \(\) => \{\}\)/);
  assert.match(peca, /useEffect\(\(\) => \{ pesquisarAgora\(\); \}, \[\]\);/);
  assert.match(ler('src/desktop/ProgressoDaImportacao.web.tsx'), /<PesquisaNaLinha key=\{`\$\{i\}:\$\{n\}`\} titulo=\{n\} textoInicial=\{n\}/);
  const lc = ler('src/desktop/paginas/LibraryCheckPage.web.tsx');
  assert.match(lc, /<Button secondary icon="search" disabled=\{offline \|\| aTratar\} onPress=\{\(\) => setAProcurar\(true\)\}>Search<\/Button>/);
  assert.match(lc, /acao=\{\{ tipo: 'replace', rotulo: \(t\) => `Replace with \$\{t\}` \}\}/);
  assert.match(lc, /aoEscolher=\{\(t\) => substituirPor\(item, t\)\}/);
  assert.match(lc, /No safe copy found\. Search for one, or remove it\./);
});
caso('o Replace à mão faz a mesma junção do Replace da cópia, com o mesmo Undo', () => {
  const v = ler('src/state/verificacaoDaBiblioteca.ts');
  assert.match(v, /export function substituirPor\(item: Indisponivel, escolhida: Track\): Promise<void> \{[\s\S]{0,260}resolver\(chave, 'Replaced', \[\{ tipo: 'juncao', juncao: await substituir\(item\.faixa, escolhida\) \}\]/);
});

caso('iPhone: a mesma peça, no Library check (Replace) e na lista "Not found" (+)', () => {
  const peca = ler('src/components/PesquisaNaLinha.tsx');
  assert.match(peca, /useMusicSearch\(texto, \(\) => \{\}\)/);
  assert.match(peca, /useEffect\(\(\) => \{ pesquisarAgora\(\); \}, \[\]\);/);
  assert.match(peca, /<PillButton label="Replace" small loading=\{aFazer\}/);
  assert.match(peca, /setFalhou\(true\);/, 'o erro fica na linha: dentro de uma folha um aviso não se via');
  const lc = ler('src/screens/LibraryCheckScreen.tsx');
  assert.match(lc, /<PillButton label="Search" variant="ghost" small disabled=\{offline \|\| aTratar\}/);
  assert.match(lc, /ouvirDesligado=\{emJam\} aoEscolher=\{\(t\) => substituirPor\(item, t\)\}/);
  assert.match(lc, /<Animated\.ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets/, 'com o teclado aberto os resultados tocam-se e a lista sobe');
  assert.match(lc, /No safe copy found\. Search for one, or remove it\./);
  const barraDoIphone = ler('src/components/ProgressoDaImportacao.tsx');
  assert.match(barraDoIphone, /<FaltasDaImportacao imp=\{imp\} faltaram=\{faltaram\} \/>/);
  assert.match(barraDoIphone, /<ScrollView keyboardShouldPersistTaps="handled"/);
  assert.match(barraDoIphone, /aoEscolher=\{\(faixa\) => useImportacoes\.getState\(\)\.resolverFalta\(imp\.id, n, faixa\)\}/);
  assert.match(barraDoIphone, /if \(verFaltas && !faltaram\.length\) setVerFaltas\(false\);/, 'a última fecha a folha');
});
caso('num Jam ouvir é sugerir à sala: o ▶ dos resultados não aparece, nos dois', () => {
  for (const f of ['src/desktop/ProgressoDaImportacao.web.tsx', 'src/components/ProgressoDaImportacao.tsx']) {
    assert.match(ler(f), /ouvirDesligado=\{emJam\}/, f);
  }
});

console.log('\n3 · a playlist importada atualiza-se sozinha (as regras)');
caso('as linhas conhecem-se sem acentos nem maiúsculas; as do YouTube pelo vídeo', () => {
  assert.equal(chaveDaLinha({ artist: 'Plutónio', title: '  Sexto  Sentido ' }), 'l:plutonio - sexto sentido');
  assert.deepEqual(chavesDaLeitura({ linhas: [{ artist: 'A', title: 'x' } as any], faixas: [{ sourceId: 'v1' } as any] }), ['l:a - x', 'y:v1']);
});
caso('só entram as que nunca se viram: uma que tiraste de propósito não volta', () => {
  const conhecidas = ['l:a - x', 'l:a - y'];
  const n = novasDaLeitura({ linhas: [{ artist: 'A', title: 'x' }, { artist: 'A', title: 'Z' }] as any }, conhecidas);
  assert.deepEqual(n.linhas.map((l) => l.title), ['Z']);
  assert.deepEqual(n.faixas, []);
});
caso('no máximo uma vez por dia, e as conhecidas têm teto', () => {
  const o = { link: { tipo: 'spotify', id: 'x' } as any, conhecidas: [], vistaEm: 1000 };
  assert.equal(deveVer(o, 1000 + UM_DIA_MS - 1), false);
  assert.equal(deveVer(o, 1000 + UM_DIA_MS), true);
  assert.equal(deveVer(undefined, 1e12), false, 'uma playlist que não veio de um link não se atualiza');
  assert.deepEqual(juntarConhecidas(['a', 'b'], ['b', 'c']), ['a', 'b', 'c']);
  assert.deepEqual(juntarConhecidas(['a', 'b'], ['c'], 2), ['b', 'c'], 'passando do teto ficam as mais recentes');
});

console.log('\n3 · a playlist importada atualiza-se sozinha (a app)');
caso('importar de um link guarda de onde veio, nos dois caminhos e nos dois ecrãs', () => {
  const loja = ler('src/state/importacoes.ts');
  assert.match(loja, /if \(resultado\.playlistId\) void guardarOrigem\(resultado\.playlistId, link, lida\);/);
  assert.match(loja, /void guardarOrigem\(resultado\.playlistId, proxima\.conta\.origem, \{ linhas: proxima\.conta\.linhas, faixas: proxima\.conta\.faixas \}\);/);
  for (const f of ['src/desktop/paginas/ImportPage.web.tsx', 'src/screens/ImportYouTubeScreen.tsx']) {
    assert.match(ler(f), /useImportacoes\.getState\(\)\.importarLida\(leitura, destino, entrada\.tipo === 'link' \? entrada\.link : null\);/, f);
  }
});
caso('abrir a playlist atualiza-a sozinha (PC e iPhone), com aviso e Undo; as que faltam vão para o "Not found"', () => {
  assert.match(ler('src/desktop/paginas/PlaylistPages.web.tsx'), /useEffect\(\(\) => \{ void atualizarDaOrigem\(id, playlistTitle, \(\) => void refresh\(\{ silencioso: true \}\)\); \}, \[id\]\);/);
  assert.match(ler('src/screens/PlaylistDetailScreen.tsx'), /useEffect\(\(\) => \{ void atualizarDaOrigem\(id, name, \(\) => void load\(\{ silencioso: true \}\)\); \}, \[id\]\);/);
  const o = ler('src/state/origemDasPlaylists.ts');
  assert.match(o, /if \(!deveVer\(origem, Date\.now\(\)\)\) return;/);
  assert.match(o, /useConnectivity\.getState\(\)\.offline/, 'sem rede, nada');
  assert.match(o, /desfazer: async \(\) => \{\n\s+for \(const t of entraram\) await removeTrackFromPlaylistBySource\(playlistId, t as any\);/);
  assert.match(o, /useImportacoes\.getState\(\)\.registarAtualizacao\(nome, playlistId, entraram\.length, faltaram\);/);
  assert.doesNotMatch(o, /Spotify/, 'nada a convidar a ir ao Spotify: "the playlist you imported it from"');
  assert.match(ler('src/lib/frasesDaImportacao.ts'), /const titulo = i\.atualizacao \? `\$\{nome\} got new songs`/);
});
caso('apagar a playlist esquece o link dela, nos quatro sítios onde se apaga', () => {
  const pc = ler('src/desktop/paginas/PlaylistPages.web.tsx');
  assert.match(pc, /void esquecerOrigem\(apagar\.id\);/);
  assert.match(pc, /back\(\); void esquecerOrigem\(id\);/);
  assert.match(ler('src/screens/PlaylistDetailScreen.tsx'), /await deletePlaylist\(id\);\n\s+void esquecerOrigem\(id\);/);
  assert.match(ler('src/screens/PlaylistsScreen.tsx'), /await deletePlaylist\(deleteFor\.id\);\n\s+void esquecerOrigem\(deleteFor\.id\);/);
});
caso('desliga-se nas Definições (10/11), no PC e no iPhone; ligado de origem', () => {
  const prefs = ler('src/lib/prefs.ts');
  assert.match(prefs, /export async function getAtualizarImportadas\(\): Promise<boolean> \{\n\s+return getBool\(KEY_ATUALIZAR_IMPORTADAS, true\);/);
  assert.match(ler('src/lib/rotulosDasDefinicoes.ts'), /atualizarImportadas: 'Update imported playlists',/);
  assert.match(ler('src/state/origemDasPlaylists.ts'), /if \(!\(await getAtualizarImportadas\(\)\)\) return;\n\s+const origem = \(await ler\(\)\)\[playlistId\];/, 'desligado, nem se lê o link');
  assert.match(ler('src/desktop/paginas/SettingsPage.web.tsx'), /<ToggleLine label=\{ROTULOS\.atualizarImportadas\}[\s\S]{0,260}void setAtualizarImportadas\(v\);/);
  assert.match(ler('src/screens/SettingsScreen.tsx'), /<LinhaInterruptor icone="refresh" rotulo=\{ROTULOS\.atualizarImportadas\} valor=\{atualizarImportadas\}/);
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\nTodos os casos passaram.');
