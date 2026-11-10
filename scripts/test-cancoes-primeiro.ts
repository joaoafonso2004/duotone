/**
 * A importação procura primeiro nas CANÇÕES do YouTube Music (10/11, como o
 * spotDL) -- `searchSongs` em src/lib/spotifyImport.ts e `resultadosDasCancoes`
 * em src/lib/cancoesDoYtMusic.ts. Sem rede: a pesquisa é falsa, e as canções
 * vêm de uma resposta real recortada (scripts/fixtures/ytmusic-cancoes.json).
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-cancoes-primeiro.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importSpotifyCsv, type SearchHit } from '../src/lib/spotifyImport.ts';
import { lerCancoes, resultadosDasCancoes, type CancaoDoYtMusic } from '../src/lib/cancoesDoYtMusic.ts';
import type { SpotifyCsvRow } from '../src/lib/spotifyCsv.ts';

// ---- as canções como resultados ------------------------------------------------
const reais = lerCancoes(JSON.parse(readFileSync(new URL('./fixtures/ytmusic-cancoes.json', import.meta.url), 'utf8')));
assert.ok(reais.length > 0, 'a resposta gravada traz canções');
const deReais = resultadosDasCancoes(reais);
assert.equal(deReais.length, reais.length);
for (const r of deReais) {
  assert.match(r.channel, / - Topic$/, 'o canal é um Topic');
  assert.equal(r.track.source, 'youtube');
  assert.match(r.track.artworkUrl, /^https:\/\/i\.ytimg\.com\/vi\/.+\/hqdefault\.jpg$/);
}

const cancao = (videoId: string, titulo: string, artista: string, duracaoSec: number, explicita = false): CancaoDoYtMusic =>
  ({ videoId, titulo, artista, album: 'Álbum', duracaoSec, explicita });
const juntas = resultadosDasCancoes([
  cancao('clean', 'Laugh Now Cry Later (feat. Lil Durk)', 'Drake & Lil Durk', 262),
  cancao('explicita', 'Laugh Now Cry Later (feat. Lil Durk)', 'Drake & Lil Durk', 262, true),
]);
assert.deepEqual(juntas.map((r) => r.track.sourceId), ['explicita', 'clean'], 'a explícita primeiro, para ganhar o empate');
assert.equal(juntas[0].channel, 'Drake - Topic', 'o canal é o do primeiro artista');
assert.equal(juntas[0].track.artist, 'Drake & Lil Durk', 'a faixa guarda os artistas todos');

// ---- a importação ----------------------------------------------------------------
const linha = (title: string, artist: string, segundos: number): SpotifyCsvRow =>
  ({ title, artist, album: null, durationMs: segundos * 1000, uri: `spotify:track:${title}` });
const comoResultado = (id: string, title: string, channel: string, segundos: number): SearchHit =>
  ({ channel, track: { source: 'youtube', sourceId: id, title, artist: null, album: null, artworkUrl: null, durationSeconds: segundos } });

async function main() {
  {
    // A canção certa no YouTube Music: entra, e a pesquisa de vídeos nem corre.
    let videos = 0;
    const r = await importSpotifyCsv({
      rows: [linha('Laugh Now Cry Later (feat. Lil Durk)', 'Drake, Lil Durk', 262)],
      searchSongs: async () => juntas,
      search: async () => { videos++; return []; },
    });
    assert.equal(r[0].confident, true);
    assert.equal(r[0].track?.sourceId, 'explicita');
    assert.equal(videos, 0, 'uma canção segura poupa a pesquisa de vídeos');
  }

  {
    // As canções não servem (outra música): cai na pesquisa de vídeos, que tem a certa.
    let videos = 0;
    const r = await importSpotifyCsv({
      rows: [linha('Não Há Volta', 'Plutónio', 215)],
      searchSongs: async () => resultadosDasCancoes([cancao('outra', 'Outra Música', 'Plutónio', 180)]),
      search: async () => { videos++; return [comoResultado('certa', 'Plutónio - Não Há Volta (Videoclip Oficial)', 'Plutonio', 228)]; },
    });
    assert.equal(videos, 1);
    assert.equal(r[0].confident, true);
    assert.equal(r[0].track?.sourceId, 'certa');
  }

  {
    // As duas listas entram juntas na escolha final: uma canção duvidosa pode
    // ganhar a um vídeo pior.
    const r = await importSpotifyCsv({
      rows: [linha('Song', 'Artista', 200)],
      searchSongs: async () => resultadosDasCancoes([cancao('cancao', 'Song', 'Artista', 260)]),
      search: async () => [comoResultado('lixo', 'Song (Sped Up)', 'Canal Qualquer', 160)],
    });
    assert.equal(r[0].track?.sourceId, 'cancao');
  }

  {
    // O YouTube Music em baixo: ao fim de algumas falhas seguidas deixa de se perguntar.
    let perguntas = 0;
    const linhas = Array.from({ length: 20 }, (_, i) => linha(`Song ${i}`, 'Artista', 200));
    const r = await importSpotifyCsv({
      rows: linhas,
      searchSongs: async () => { perguntas++; return null; },
      search: async (q) => [comoResultado(q, q.replace('Artista ', ''), 'Artista - Topic', 200)],
    });
    assert.ok(perguntas < 10, `parou de perguntar ao YouTube Music (${perguntas} perguntas para 20 faixas)`);
    assert.equal(r.filter((x) => x.confident).length, 20, 'e a pesquisa de vídeos fez o trabalho todo');
  }

  {
    // Uma resposta volta a abrir a porta: as falhas contam-se SEGUIDAS.
    let perguntas = 0;
    await importSpotifyCsv({
      rows: Array.from({ length: 12 }, (_, i) => linha(`Song ${i}`, 'Artista', 200)),
      searchSongs: async () => { perguntas++; return perguntas % 2 ? null : []; },
      search: async (q) => [comoResultado(q, q.replace('Artista ', ''), 'Artista - Topic', 200)],
    });
    assert.equal(perguntas, 12, 'falhas alternadas com respostas não fecham a porta');
  }

  {
    // As duas pesquisas em baixo continuam a contar como avaria, e não como "não existe".
    await assert.rejects(importSpotifyCsv({
      rows: Array.from({ length: 30 }, (_, i) => linha(`Song ${i}`, 'Artista', 200)),
      searchSongs: async () => null,
      search: async () => { throw new Error('sem rede'); },
    }), /not responding/);
  }

  {
    // Sem `searchSongs`, é como era.
    const r = await importSpotifyCsv({
      rows: [linha('Song', 'Artista', 200)],
      search: async () => [comoResultado('v', 'Artista - Song', 'Artista - Topic', 200)],
    });
    assert.equal(r[0].confident, true);
  }

  console.log('canções primeiro: ok');
}

main().catch((e) => { console.error(e); process.exit(1); });
