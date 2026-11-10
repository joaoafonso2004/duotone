/**
 * A conta do Spotify no PC pelo leitor web (10/11) -- src/lib/leitorWebDoSpotify.ts.
 * As respostas têm a forma que o ytspot e o SongMirror leem do pathfinder;
 * nada aqui vai à rede.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-leitor-web-do-spotify.ts
 */
import assert from 'node:assert/strict';
import {
  abrirPeloLeitor, ErroDoLeitor, euDoPerfil, linhaDoLeitor, mensagemDoLeitor, paginaDaBiblioteca, paginaDaPlaylist,
  paginaDasGostadas, variaveisDaPlaylist, type Consultar, type ConsultaDoLeitor,
} from '../src/lib/leitorWebDoSpotify.ts';
import { MAXIMO_DA_CONTA } from '../src/lib/bibliotecaDoSpotify.ts';

// ---- as formas do leitor ----------------------------------------------------
const faixa = (nome: string, artistas: string[], extra: Record<string, unknown> = {}) => ({
  __typename: 'Track', uri: `spotify:track:${nome.replace(/\W/g, '')}`, name: nome,
  artists: { items: artistas.map((n) => ({ profile: { name: n } })) },
  albumOfTrack: { name: 'Álbum' }, trackDuration: { totalMilliseconds: 200_000 }, ...extra,
});

assert.deepEqual(linhaDoLeitor(faixa('Lean 4 Real', ['Skepta', 'Playboi Carti'])),
  { title: 'Lean 4 Real', artist: 'Skepta, Playboi Carti', album: 'Álbum', durationMs: 200_000, uri: 'spotify:track:Lean4Real' });
assert.equal(linhaDoLeitor({ __typename: 'Episode', uri: 'spotify:episode:x', name: 'Ep' }), null, 'episódios ficam de fora');
assert.equal(linhaDoLeitor(faixa('Local', ['X'], { uri: 'spotify:local:x' })), null, 'ficheiros locais não se encontram');
assert.equal(linhaDoLeitor({ __typename: 'NotFound' }), null, 'as que o Spotify já não tem');
assert.equal(linhaDoLeitor(faixa('Sem artista', [])), null);
assert.equal(linhaDoLeitor(null), null);
assert.equal(linhaDoLeitor(faixa('Sem uri', ['X'], { uri: undefined }), 'spotify:track:fora')!.uri, 'spotify:track:fora', 'o _uri de fora serve de reserva');
assert.equal(linhaDoLeitor(faixa('Duração antiga', ['X'], { trackDuration: undefined, duration: { totalMilliseconds: 99 } }))!.durationMs, 99);
assert.equal(linhaDoLeitor(faixa('Zero', ['X'], { trackDuration: { totalMilliseconds: 0 } }))!.durationMs, null);
assert.equal(linhaDoLeitor(faixa('Sem álbum', ['X'], { albumOfTrack: null }))!.album, null);

const playlistV2 = (faixas: unknown[], total: number) => ({ playlistV2: { content: { totalCount: total, items: faixas.map((d) => ({ itemV2: { data: d } })) } } });
const p = paginaDaPlaylist(playlistV2([faixa('A', ['X']), { __typename: 'Episode' }, faixa('B', ['Y'])], 230));
assert.deepEqual(p.linhas.map((l) => l.title), ['A', 'B']);
assert.equal(p.itens, 3, 'os itens contam todos, também os que ficam de fora: é por eles que se avança');
assert.equal(p.total, 230);
assert.deepEqual(paginaDaPlaylist(null), { linhas: [], itens: 0, total: 0 });

// Nas Liked Songs o uri vem às vezes só no `_uri` do `track`.
const gostadas = (faixas: unknown[], total: number) => ({ me: { library: { tracks: { totalCount: total, items: faixas.map((d: any) => ({ track: { _uri: d?.uri, data: { ...d, uri: undefined } } })) } } } });
const g = paginaDasGostadas(gostadas([faixa('C', ['Z'])], 41));
assert.deepEqual(g.linhas.map((l) => [l.title, l.uri]), [['C', 'spotify:track:C']]);
assert.equal(g.total, 41);

assert.equal(euDoPerfil({ me: { profile: { name: 'João', username: 'joao123' } } }), 'joao123');
assert.equal(euDoPerfil({ me: null }), null);

const lista = (uri: string, nome: string, dono: string, extra: Record<string, unknown> = {}) => ({
  item: { __typename: 'PlaylistResponseWrapper', _uri: uri, data: {
    __typename: 'Playlist', uri, name: nome, ownerV2: { data: { username: dono } },
    images: { items: [{ sources: [{ url: 'https://i/640', width: 640 }, { url: 'https://i/300', width: 300 }, { url: 'https://i/60', width: 60 }] }] },
    ...extra,
  } },
});
const biblioteca = (itens: unknown[], total: number) => ({ me: { libraryV3: { __typename: 'LibraryPage', totalCount: total, items: itens } } });
const b = paginaDaBiblioteca(biblioteca([
  lista('spotify:playlist:minha', 'Minha', 'joao123'),
  lista('spotify:playlist:seguida', 'Seguida', 'spotify'),
  { item: { __typename: 'LibraryFolderResponseWrapper', data: { __typename: 'Folder', uri: 'spotify:user:x:folder:1', name: 'Pasta' } } },
  { item: { __typename: 'PlaylistResponseWrapper', data: { __typename: 'NotFound' } } },
  lista('spotify:playlist:semnome', '', 'joao123'),
  lista('spotify:album:x', 'Álbum', 'joao123'),
], 6), 'joao123');
assert.deepEqual(b.listas.map((l) => [l.id, l.nome, l.doutraPessoa, l.capa, l.total]), [
  ['spotify:playlist:minha', 'Minha', false, 'https://i/300', 0],
  ['spotify:playlist:seguida', 'Seguida', true, 'https://i/300', 0],
], 'pastas, apagadas, sem nome e o que não é playlist ficam de fora; a capa é a dos 300 px');
assert.equal(b.itens, 6);
assert.equal(b.total, 6);
// Sem o nome de utilizador, quem decide é poder editar.
const semEu = paginaDaBiblioteca(biblioteca([
  lista('spotify:playlist:a', 'A', '', { currentUserCapabilities: { canEditItems: true } }),
  lista('spotify:playlist:b', 'B', '', { currentUserCapabilities: { canEditItems: false } }),
], 2), null);
assert.deepEqual(semEu.listas.map((l) => l.doutraPessoa), [false, true]);

assert.deepEqual(variaveisDaPlaylist('spotify:playlist:x', 200), { uri: 'spotify:playlist:x', offset: 200, limit: 100, enableWatchFeedEntrypoint: false });
for (const t of ['desligado', 'rede', 'ocupado', 'mudou', 'recusado', 'vazio'] as const) assert.ok(mensagemDoLeitor(t).length > 10);

// ---- abrir e ler, com um Spotify falso ----------------------------------------
type Conta = { eu: string | null; gostadas: number; playlists: { uri: string; nome: string; dono: string; total: number; falha?: 'mudou' }[] };

function spotifyFalso(conta: Conta, opcoes: { perfilSemMe?: boolean; falharLer?: 'desligado' } = {}) {
  const pedidos: { nome: ConsultaDoLeitor; variaveis: any }[] = [];
  const consultar: Consultar = async (nome, variaveis: any) => {
    pedidos.push({ nome, variaveis });
    if (nome === 'profileAttributes') return { ok: true, dados: opcoes.perfilSemMe ? { me: null } : { me: { profile: { username: conta.eu } } } };
    if (nome === 'fetchLibraryTracks') {
      const n = Math.max(0, Math.min(variaveis.limit, conta.gostadas - variaveis.offset));
      return { ok: true, dados: gostadas(Array.from({ length: n }, (_, i) => faixa(`G${variaveis.offset + i}`, ['X'])), conta.gostadas) };
    }
    if (nome === 'libraryV3') {
      const pagina = conta.playlists.slice(variaveis.offset, variaveis.offset + variaveis.limit);
      return { ok: true, dados: biblioteca(pagina.map((p) => lista(p.uri, p.nome, p.dono)), conta.playlists.length) };
    }
    const pl = conta.playlists.find((p) => p.uri === variaveis.uri)!;
    if (pl.falha) return { ok: false, falha: pl.falha };
    if (opcoes.falharLer && variaveis.limit > 1) return { ok: false, falha: opcoes.falharLer };
    const n = Math.max(0, Math.min(variaveis.limit, pl.total - variaveis.offset));
    return { ok: true, dados: playlistV2(Array.from({ length: n }, (_, i) => faixa(`${pl.nome}${variaveis.offset + i}`, ['Y'])), pl.total) };
  };
  return { consultar, pedidos };
}

const conta: Conta = {
  eu: 'joao123', gostadas: 120,
  playlists: [
    ...Array.from({ length: 53 }, (_, i) => ({ uri: `spotify:playlist:p${i}`, nome: `P${i}`, dono: i === 1 ? 'spotify' : 'joao123', total: i === 0 ? 230 : i === 2 ? 0 : 5 })),
    { uri: 'spotify:playlist:grande', nome: 'Grande', dono: 'joao123', total: 1500 },
  ],
};

{
  const { consultar, pedidos } = spotifyFalso(conta);
  const lida = await abrirPeloLeitor(consultar);
  assert.equal(pedidos.filter((q) => q.nome === 'libraryV3').length, 2, '54 playlists = duas páginas de 50');
  assert.equal(lida.listas[0].id, 'gostadas', 'as Liked Songs primeiro');
  assert.equal(lida.listas[0].total, 120);
  assert.ok(!lida.listas.some((l) => l.id === 'spotify:playlist:p2'), 'a playlist vazia fica de fora');
  assert.equal(lida.listas.at(-1)!.id, 'spotify:playlist:p1', 'as que se seguem vão para o fim');
  assert.equal(lida.listas.length, 1 + 53, 'as Liked Songs, mais as 54 sem a vazia');

  const p0 = await lida.ler(lida.listas.find((l) => l.id === 'spotify:playlist:p0')!);
  assert.equal(p0.linhas.length, 230, '230 músicas, em três páginas de 100');
  assert.equal(p0.cortada, false);
  assert.equal(p0.linhas[229].title, 'P0229', 'pela ordem');

  const gs = await lida.ler(lida.listas[0]);
  assert.equal(gs.linhas.length, 120, 'as Liked Songs inteiras, em páginas de 50');

  const grande = await lida.ler(lida.listas.find((l) => l.id === 'spotify:playlist:grande')!);
  assert.equal(grande.linhas.length, MAXIMO_DA_CONTA, 'corta no máximo de sempre');
  assert.equal(grande.cortada, true);
}

{
  // O leitor abriu sem sessão: o login caducou.
  const { consultar } = spotifyFalso(conta, { perfilSemMe: true });
  await assert.rejects(abrirPeloLeitor(consultar), (e: unknown) => e instanceof ErroDoLeitor && e.tipo === 'desligado');
}

{
  // Se nenhuma playlist se deixa contar, diz-se porquê em vez de mostrar só as Liked Songs.
  const { consultar } = spotifyFalso({ eu: 'eu', gostadas: 10, playlists: [{ uri: 'spotify:playlist:x', nome: 'X', dono: 'eu', total: 5, falha: 'mudou' }] });
  await assert.rejects(abrirPeloLeitor(consultar), (e: unknown) => e instanceof ErroDoLeitor && e.tipo === 'mudou');
}

{
  // Uma que não se conta fica de fora; as outras continuam.
  const { consultar } = spotifyFalso({ eu: 'eu', gostadas: 0, playlists: [
    { uri: 'spotify:playlist:x', nome: 'X', dono: 'eu', total: 5, falha: 'mudou' },
    { uri: 'spotify:playlist:y', nome: 'Y', dono: 'eu', total: 3 },
  ] });
  const lida = await abrirPeloLeitor(consultar);
  assert.deepEqual(lida.listas.map((l) => l.id), ['spotify:playlist:y']);
}

{
  // Sem nada para importar.
  const { consultar } = spotifyFalso({ eu: 'eu', gostadas: 0, playlists: [] });
  await assert.rejects(abrirPeloLeitor(consultar), (e: unknown) => e instanceof ErroDoLeitor && e.tipo === 'vazio');
}

{
  // A falha a meio da leitura chega a quem lê, com o tipo.
  const { consultar } = spotifyFalso({ eu: 'eu', gostadas: 0, playlists: [{ uri: 'spotify:playlist:y', nome: 'Y', dono: 'eu', total: 3 }] }, { falharLer: 'desligado' });
  const lida = await abrirPeloLeitor(consultar);
  await assert.rejects(lida.ler(lida.listas[0]), (e: unknown) => e instanceof ErroDoLeitor && e.tipo === 'desligado');
}

console.log('leitor web do Spotify: ok');

// ---- o gosto a partir da biblioteca (11/11) ------------------------------------
{
  const { artistasPorFrequencia } = await import('../src/lib/leitorWebDoSpotify.ts');
  const l = (artist: string) => ({ title: 'x', artist, album: null, durationMs: null, uri: null });
  assert.deepEqual(
    artistasPorFrequencia([l('Drake, Lil Durk'), l('Kendrick Lamar'), l('drake'), l('SZA'), l('Kendrick Lamar'), l('Drake'), l('')]),
    ['Drake', 'Kendrick Lamar', 'SZA'], 'o primeiro artista de cada música, sem maiúsculas, do mais frequente para o menos');
  assert.deepEqual(artistasPorFrequencia([l('A'), l('B'), l('C')], 2), ['A', 'B'], 'num empate, quem apareceu primeiro; e corta no pedido');
  assert.deepEqual(artistasPorFrequencia([]), []);
  console.log('gosto a partir da biblioteca: ok');
}
