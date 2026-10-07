/**
 * Importar do Spotify pela conta (7/10) -- src/lib/bibliotecaDoSpotify.ts e o
 * `importarLinhas` de src/lib/importacaoPorLink.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-biblioteca-do-spotify.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  linhaDaFaixa, linhasDosItens, listasParaEscolher, MAXIMO_DA_CONTA, playlistsDosItens, quantasLer,
} from '../src/lib/bibliotecaDoSpotify.ts';
import { importarLinhas, ErroDaImportacao, type FaixaImportada } from '../src/lib/importacaoPorLink.ts';

// Uma faixa da API (a forma do /me/tracks e do /playlists/{id}/tracks).
const faixaDaApi = (nome: string, artistas: string[], extra: Record<string, unknown> = {}) => ({
  type: 'track', is_local: false, name: nome, uri: `spotify:track:${nome}`, duration_ms: 180_000,
  album: { name: 'Álbum' }, artists: artistas.map((n) => ({ name: n })), ...extra,
});
assert.deepEqual(linhaDaFaixa(faixaDaApi('Lean 4 Real', ['Skepta', 'Playboi Carti'])),
  { title: 'Lean 4 Real', artist: 'Skepta, Playboi Carti', album: 'Álbum', durationMs: 180_000, uri: 'spotify:track:Lean 4 Real' });
assert.equal(linhaDaFaixa({ ...faixaDaApi('Ep', ['X']), type: 'episode' }), null, 'episódios de podcast ficam de fora');
assert.equal(linhaDaFaixa({ ...faixaDaApi('Local', ['X']), is_local: true }), null, 'ficheiros locais não se encontram');
assert.equal(linhaDaFaixa(faixaDaApi('', ['X'])), null);
assert.equal(linhaDaFaixa(faixaDaApi('Sem artista', [])), null);
assert.equal(linhaDaFaixa(null), null);
assert.equal(linhaDaFaixa({ ...faixaDaApi('Zero', ['X']), duration_ms: 0 })!.durationMs, null);

const itens = [{ track: faixaDaApi('A', ['X']) }, { track: null }, { track: faixaDaApi('B', ['Y']) }, null];
assert.deepEqual(linhasDosItens(itens).map((l) => l.title), ['A', 'B'], 'pela ordem, sem os itens vazios');
assert.deepEqual(linhasDosItens('lixo'), []);

const playlists = playlistsDosItens([
  { id: 'p1', name: 'Minha', images: [{ url: 'https://capa' }], tracks: { total: 30 }, owner: { id: 'eu' } },
  { id: 'p2', name: 'Seguida', images: [], tracks: { total: 12 }, owner: { id: 'spotify' } },
  { id: 'p3', name: 'Vazia', images: null, tracks: { total: 0 }, owner: { id: 'eu' } },
  { id: '', name: 'Sem id' },
  { id: 'p4', name: 'Nova API', items: { total: 7 }, owner: { id: 'eu' } },
], 'eu');
assert.deepEqual(playlists.map((p) => [p.id, p.total, p.doutraPessoa, p.capa]),
  [['p1', 30, false, 'https://capa'], ['p2', 12, true, null], ['p3', 0, false, null], ['p4', 7, false, null]]);

const escolha = listasParaEscolher(250, [playlists[1], playlists[0], playlists[2], playlists[3]]);
assert.deepEqual(escolha.map((l) => l.id), ['gostadas', 'p1', 'p4', 'p2'],
  'Liked Songs primeiro, as da pessoa antes das que segue, sem as vazias');
assert.equal(listasParaEscolher(0, [])[0], undefined, 'sem nada, nada para escolher');

assert.deepEqual(quantasLer(250), { ler: 250, cortada: false });
assert.deepEqual(quantasLer(MAXIMO_DA_CONTA + 5), { ler: MAXIMO_DA_CONTA, cortada: true });

// --- O importarLinhas: só as de confiança, sem repetidas, para o destino certo ---
const faixa = (id: string): FaixaImportada => ({ source: 'youtube', sourceId: id, title: id, artist: 'X', album: null, artworkUrl: null, durationSeconds: 200 });
const linhas = linhasDosItens([{ track: faixaDaApi('A', ['X']) }, { track: faixaDaApi('B', ['X']) }, { track: faixaDaApi('C', ['X']) }]);
const chamadas = { criadas: [] as string[], adicionadas: [] as string[][], gostadas: [] as string[][] };
const deps = {
  resolver: async (ls: typeof linhas, aoAvancar: (n: number) => void) => {
    aoAvancar(ls.length);
    return [{ track: faixa('a'), confident: true }, { track: faixa('b'), confident: false }, { track: faixa('a'), confident: true }];
  },
  criarPlaylist: async (nome: string) => { chamadas.criadas.push(nome); return { id: 'nova' }; },
  adicionar: async (_id: string, f: FaixaImportada[]) => { chamadas.adicionadas.push(f.map((x) => x.sourceId)); },
  guardarNasGostadas: async (f: FaixaImportada[]) => { chamadas.gostadas.push(f.map((x) => x.sourceId)); },
};
const progresso: string[] = [];
const r1 = await importarLinhas({ nome: 'Minha', linhas, cortada: false, destino: 'playlist' }, deps, (p) => progresso.push(p.fase));
assert.deepEqual(chamadas.criadas, ['Minha']);
assert.deepEqual(chamadas.adicionadas, [['a']], 'só a de confiança, uma vez');
assert.deepEqual([r1.adicionadas, r1.deFora, r1.playlistId], [1, 2, 'nova']);
assert.deepEqual(progresso, ['a-procurar', 'a-procurar', 'a-guardar']);

const r2 = await importarLinhas({ nome: 'Liked Songs', linhas, cortada: true, destino: 'gostadas' }, deps, () => {});
assert.deepEqual(chamadas.gostadas, [['a']], 'as Liked Songs vão para as Liked Songs');
assert.equal(chamadas.criadas.length, 1, 'e não criam playlist');
assert.deepEqual([r2.playlistId, r2.cortada], ['', true]);

await assert.rejects(importarLinhas({ nome: 'X', linhas: [], cortada: false, destino: 'playlist' }, deps, () => {}),
  (e: unknown) => e instanceof ErroDaImportacao && e.motivo === 'vazia');

// --- A ligação: o login pede as permissões das playlists e das Liked Songs, e o ecrã usa-o ---
const conta = readFileSync(new URL('../src/api/spotifyConta.ts', import.meta.url), 'utf8');
assert.match(conta, /ESCOPOS_DA_BIBLIOTECA = \['playlist-read-private', 'playlist-read-collaborative', 'user-library-read'\]/);
assert.match(conta, /\/me\/tracks\?limit=50&offset=/);
assert.match(conta, /\/playlists\/\$\{encodeURIComponent\(lista\.id\)\}\/tracks\?limit=100&offset=/);
const ecra = readFileSync(new URL('../src/screens/ImportYouTubeScreen.tsx', import.meta.url), 'utf8');
assert.match(ecra, /<ImportarDaContaDoSpotify aoComecar=/);
const loja = readFileSync(new URL('../src/state/importacoes.ts', import.meta.url), 'utf8');
assert.match(loja, /if \(proxima\.conta\.destino === 'gostadas'\) void useSaved\.getState\(\)\.refresh\(\);/,
  'depois das Liked Songs, os corações acendem-se');

console.log('Biblioteca do Spotify: linhas, listas, destino e ligação passaram.');
