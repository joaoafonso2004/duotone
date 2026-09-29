// A pesquisa por tipo (lib/pesquisaPorTipo.ts, 29/9), contra respostas reais do
// YouTube Music guardadas em scripts/fixtures/ytmusic-pesquisa-*.json.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FILTROS_DA_PESQUISA, juntarPlaylists, legendaDoAlbumEncontrado, lerAlbunsDaPesquisa, lerArtistasDaPesquisa,
  lerPlaylistsDaPesquisa, perguntaSemIntencao, separadorPedidoPelaPergunta, termosDaPergunta,
} from '../src/lib/pesquisaPorTipo.ts';

const ler = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const src = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// ---- artistas: cada um com o CANAL, e os homónimos separados
const artistas = lerArtistasDaPesquisa(ler('ytmusic-pesquisa-artistas.json'));
assert.ok(artistas.length >= 5);
assert.deepEqual(artistas[0], {
  nome: 'Isak', canal: 'UCX24KmsuxFB4jacvMSd3G2Q', legenda: '1.6K subscribers', foto: artistas[0]!.foto,
});
assert.ok(artistas[0]!.foto?.startsWith('https://'));
assert.equal(artistas[1]!.nome, 'Isak Danielson');
assert.equal(artistas[1]!.canal, 'UC75RhrKQDnf2gCFLlvIPQqQ', 'o homónimo é OUTRO canal');
assert.ok(artistas.every((a) => /^UC[\w-]{22}$/.test(a.canal) && !/artist/i.test(a.legenda)));
assert.equal(new Set(artistas.map((a) => a.canal)).size, artistas.length);

// ---- álbuns: a playlist que se abre, o tipo, os artistas e o ano
const albuns = lerAlbunsDaPesquisa(ler('ytmusic-pesquisa-albuns.json'));
assert.ok(albuns.length >= 5);
const jon = albuns.find((a) => a.titulo === 'Jon')!;
assert.equal(jon.id, 'OLAK5uy_kvspZFAwj0MApQuHl1hhe5ykH6i1dCGQ8');
assert.equal(jon.tipo, 'Album');
assert.equal(jon.artista, 'Isak, Zigarro & Armando Teles');
assert.equal(jon.ano, '2026');
assert.equal(legendaDoAlbumEncontrado(jon), 'Album · Isak, Zigarro & Armando Teles · 2026');
assert.ok(albuns.some((a) => a.tipo === 'Single') && albuns.some((a) => a.tipo === 'EP'));
assert.ok(albuns.every((a) => /^OLAK5uy_/.test(a.id)));

// ---- playlists ("drake playlist", 29/9): as de pessoas e as editoriais
const dePessoas = lerPlaylistsDaPesquisa(ler('ytmusic-pesquisa-playlists-comunidade.json'), false);
const editoriais = lerPlaylistsDaPesquisa(ler('ytmusic-pesquisa-playlists-editoriais.json'), true);
assert.ok(dePessoas.length >= 10 && editoriais.length >= 10);
assert.deepEqual(dePessoas[0], {
  id: 'PLjTvFvVGHYJYKuneUbhCu83Q8r1tukonh', titulo: 'chill Drake playlist', legenda: 'Nabhan Noufal · 1.2M views',
  capa: dePessoas[0]!.capa, editorial: false,
});
assert.ok(dePessoas[0]!.capa?.startsWith('https://'));
const presenting = editoriais.find((p) => p.titulo === 'Presenting Drake')!;
assert.ok(presenting && /^RDCLAK5uy_/.test(presenting.id) && presenting.editorial);
assert.equal(presenting.legenda, '95 songs', 'o nome do serviço não aparece');
for (const p of [...dePessoas, ...editoriais]) {
  assert.ok(!/youtube/i.test(p.legenda), `legenda "${p.legenda}"`);
  assert.ok(!p.id.startsWith('VL'), 'o id é o da playlist, sem o VL da página');
}
const juntas = juntarPlaylists('drake playlist', editoriais, dePessoas);
assert.equal(juntas[0]!.titulo, 'Presenting Drake', 'a editorial do artista primeiro');
const primeiraSemDrake = juntas.findIndex((p) => !/drake/i.test(p.titulo));
assert.ok(primeiraSemDrake > 5 && juntas.slice(primeiraSemDrake).every((p) => !/drake/i.test(p.titulo)),
  'as que dizem "drake" vêm todas antes das outras');
assert.ok(juntas.findIndex((p) => p.titulo === 'Feel-Good Hip Hop and R&B') > juntas.findIndex((p) => p.titulo === 'chill Drake playlist'));
assert.equal(new Set(juntas.map((p) => p.id)).size, juntas.length, 'sem repetidas');

// ---- a intenção na pergunta
assert.deepEqual(termosDaPergunta('Drake playlist'), ['drake']);
assert.equal(perguntaSemIntencao('drake playlist'), 'drake');
assert.equal(perguntaSemIntencao('the weeknd album'), 'the weeknd');
assert.equal(perguntaSemIntencao('playlist'), 'playlist', 'sem nada a sobrar, fica como veio');
assert.equal(separadorPedidoPelaPergunta('drake playlist'), 'playlists');
assert.equal(separadorPedidoPelaPergunta('Playlists de verão'), 'playlists');
assert.equal(separadorPedidoPelaPergunta('drake album'), 'albuns');
assert.equal(separadorPedidoPelaPergunta('drake'), null);
assert.equal(separadorPedidoPelaPergunta('playlistas'), null);

assert.deepEqual(lerArtistasDaPesquisa({}), []);
assert.deepEqual(lerAlbunsDaPesquisa(null), []);

// ---- no PC, o processo principal só aceita estes três filtros, e por nome
const main = src('electron/main.cjs');
for (const [tipo, filtro] of Object.entries(FILTROS_DA_PESQUISA)) {
  assert.ok(main.includes(`${tipo}: '${filtro}'`), `o main.cjs não tem o filtro de ${tipo} igual ao da app`);
}
assert.match(main, /FILTROS_DO_YTMUSIC\[tipo\]/, 'o filtro escolhe-se no processo principal, pelo nome');

// ---- a página do artista abre pelo canal que a pesquisa deu
assert.match(src('src/api/albunsDoArtista.ts'), /export function lembrarCanalDoArtista\(nome: string, canal: string\)/);
for (const f of ['src/desktop/paginas/BibliotecaPages.web.tsx', 'src/screens/SearchScreen.tsx']) {
  const s = src(f);
  assert.match(s, /lembrarCanalDoArtista\(a\.nome, a\.canal\)/, `${f}: tocar num artista lembra o canal dele`);
  assert.match(s, /usePesquisaPorTipo\(/, `${f}: os separadores Songs / Artists / Albums`);
  assert.match(s, /\['playlists', 'Playlists'\]/, `${f}: o separador das playlists`);
  assert.match(s, /separadorPedidoPelaPergunta\(query\)/, `${f}: "drake playlist" abre as Playlists`);
}

console.log('Pesquisa por tipo: passou.');
