/**
 * A paleta do Ctrl+F no PC (26/11, item 27 do plano): a procura local, as listas
 * com e sem texto, as setas, e que está ligada ao Ctrl+F (sem Ctrl+K).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ACOES_DA_PALETA, ESCOLHAS_DO_TEMPORIZADOR, listaDaPaleta, melhores, moverNaPaleta, normalizar, notaDaProcura, POR_GRUPO,
  type ItemDaPaleta,
} from '../src/lib/paletaDoPc.ts';
import { FR } from '../src/i18n/fr.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); } catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const item = (grupo: ItemDaPaleta<string>['grupo'], titulo: string, legenda = ''): ItemDaPaleta<string> =>
  ({ chave: `${grupo}:${titulo}`, grupo, titulo, legenda, valor: titulo });

caso('a procura: todas as palavras, sem acentos; o título a começar ganha', () => {
  assert.equal(normalizar('  Inês Mar '), 'ines mar');
  assert.ok(notaDaProcura('ines', 'Inês Mar') > 0);
  assert.equal(notaDaProcura('lua harbour', 'Neon Harbour', 'Lua Vale') > 0, true, 'a legenda também conta');
  assert.equal(notaDaProcura('lua xyz', 'Neon Harbour', 'Lua Vale'), 0);
  assert.ok(notaDaProcura('lua', 'Lua Vale radio') > notaDaProcura('lua', 'Neon Harbour', 'Lua Vale'));
  assert.ok(notaDaProcura('vale', 'Lua Vale') > notaDaProcura('ale', 'Lua Vale'), 'o começo de uma palavra ganha ao meio');
  const m = melhores('lua', [item('Songs', 'Neon Harbour', 'Lua Vale'), item('Songs', 'Lua'), item('Songs', 'Lua Nova')]);
  assert.deepEqual(m.map((x) => x.titulo), ['Lua', 'Lua Nova', 'Neon Harbour']);
});

caso('sem texto: as recentes (quatro) e as ações; com texto, quatro por grupo e as ações que servem', () => {
  const fontes = {
    recentes: ['a', 'b', 'c', 'd', 'e'].map((t) => item('Recent', t)),
    musicas: Array.from({ length: 10 }, (_, i) => item('Songs', `Lua ${i}`)),
    artistas: [item('Artists', 'Lua Vale')],
    playlists: [item('Playlists', 'Late drives')],
    acoes: ACOES_DA_PALETA.map((a) => item('Actions', a.titulo)),
  };
  const vazia = listaDaPaleta('', fontes);
  assert.deepEqual(vazia.map((x) => x.grupo), [...Array(POR_GRUPO).fill('Recent'), ...Array(ACOES_DA_PALETA.length).fill('Actions')]);
  const lua = listaDaPaleta('lua', fontes);
  assert.equal(lua.filter((x) => x.grupo === 'Songs').length, POR_GRUPO);
  assert.deepEqual([...new Set(lua.map((x) => x.grupo))], ['Songs', 'Artists']);
  assert.deepEqual(listaDaPaleta('jam', fontes).map((x) => x.titulo), ['Start a Jam']);
});

caso('as setas não saem da lista', () => {
  assert.equal(moverNaPaleta(0, -1, 5), 0);
  assert.equal(moverNaPaleta(4, 1, 5), 4);
  assert.equal(moverNaPaleta(2, 1, 5), 3);
  assert.equal(moverNaPaleta(3, 1, 0), 0);
});

caso('as ações da maquete, e o temporizador com as escolhas das Definições', () => {
  assert.deepEqual(ACOES_DA_PALETA.map((a) => a.titulo), [
    'Shuffle Liked Songs', 'Open the mini player', 'Start a Jam', 'Open Sound settings', 'Sleep timer…', 'Go to Now Playing',
  ]);
  const definicoes = ler('src/desktop/paginas/SettingsPage.web.tsx');
  assert.match(definicoes, /\['15', '15 min'\], \['30', '30 min'\], \['45', '45 min'\], \['60', '60 min'\], \['fim', 'End of track'\]/);
  assert.deepEqual(ESCOLHAS_DO_TEMPORIZADOR.map((e) => e.titulo), ['15 min', '30 min', '45 min', '60 min', 'End of track', 'Off']);
});

caso('no Ctrl+F (sem Ctrl+K), por cima de tudo, e a do servidor só no "See all"', () => {
  const raiz = ler('src/navigation/RootNavigator.web.tsx');
  assert.match(raiz, /pesquisar: \(\) => setPaletaAberta\(true\)/);
  assert.match(raiz, /<PaletaDoPc aberta=\{paletaAberta\}/);
  const atalhos = ler('src/lib/atalhosDaJanela.ts');
  assert.doesNotMatch(atalhos, /['"]k['"]\s*:|KeyK/, 'não há Ctrl+K');
  const paleta = ler('src/desktop/PaletaDoPc.web.tsx');
  assert.doesNotMatch(paleta, /useMusicSearch|pesquisarFaixas|pesquisarMusica|supabase/, 'nenhum pedido por tecla');
  assert.match(paleta, /window\.addEventListener\('keydown', tecla, true\)/, 'as teclas na captura');
  assert.match(paleta, /new CustomEvent\('duotone:pesquisar'/);
  assert.match(ler('src/desktop/paginas/BibliotecaPages.web.tsx'), /addEventListener\('duotone:pesquisar'/);
  assert.match(paleta, /definirSeccaoDasDefinicoes\('som'\)/);
  assert.doesNotMatch(paleta, /backdrop-filter|backdropFilter/);
});

caso('os textos novos em francês', () => {
  for (const t of ['Open the mini player', 'Open Sound settings', 'Sleep timer…', 'Go to Now Playing', 'Search or run an action…',
    'Nothing found', 'Actions', 'See all results for “{0}”', 'to move', 'to open', 'to close', 'to go back']) assert.ok(FR[t], t);
});

console.log(falhas ? `\n  ${falhas} caso(s) falharam.\n` : '\n  Todos os casos passaram.\n');
process.exit(falhas ? 1 : 0);
