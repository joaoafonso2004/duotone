/**
 * Scrobbling no ListenBrainz (16/11, lib/scrobbling.ts): os pedidos, a fila do
 * aparelho e o que vale tentar outra vez. A ligação ao leitor e às Definições
 * lê-se como texto.
 *
 * Correr: node --experimental-strip-types scripts/test-scrobbling.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  juntarAFila, lerFila, MAXIMO_POR_ENVIAR, pareceTokenDoListenBrainz, pedidoDeAgora, pedidoDeEscutas, podeScrobblar, valeTentarDeNovo,
} from '../src/lib/scrobbling.ts';

let falhas = 0;
function caso(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const musica = { titulo: ' Patek ', artista: 'Lil Uzi Vert', album: 'Eternal Atake 2', duracaoMs: 215_400.6, videoId: 'abcdefghijk' };

caso('a escuta leva o título e o artista limpos, a duração e de onde se ouviu', () => {
  const p = pedidoDeEscutas([{ ...musica, em: 1_700_000_000.9 }], '6.0.6');
  assert.equal(p.listen_type, 'single');
  assert.equal(p.payload[0]!.listened_at, 1_700_000_000);
  assert.deepEqual(p.payload[0]!.track_metadata, {
    artist_name: 'Lil Uzi Vert', track_name: 'Patek', release_name: 'Eternal Atake 2',
    additional_info: {
      media_player: 'Duotone', submission_client: 'Duotone', submission_client_version: '6.0.6',
      duration_ms: 215_401, origin_url: 'https://music.youtube.com/watch?v=abcdefghijk',
    },
  });
});

caso('várias de uma vez vão como "import"; o "a tocar agora" não tem hora', () => {
  assert.equal(pedidoDeEscutas([{ ...musica, em: 1 }, { ...musica, em: 2 }], 'x').listen_type, 'import');
  const agora = pedidoDeAgora({ titulo: 'T', artista: 'A' }, 'x');
  assert.equal(agora.listen_type, 'playing_now');
  assert.ok(!('listened_at' in agora.payload[0]!));
  assert.ok(!('release_name' in agora.payload[0]!.track_metadata), 'sem álbum, sem a chave');
});

caso('sem título ou sem artista não se manda; um vídeo estranho não vira link', () => {
  assert.equal(podeScrobblar({ titulo: ' ', artista: 'A' }), false);
  assert.equal(podeScrobblar({ titulo: 'T', artista: '' }), false);
  const p = pedidoDeEscutas([{ titulo: 'T', artista: 'A', videoId: 'x y', em: 1 }], 'v');
  assert.ok(!('origin_url' in p.payload[0]!.track_metadata.additional_info));
});

caso('a fila do aparelho: sem repetidas, com teto, e o que vem do disco limpo', () => {
  let f = juntarAFila([], { ...musica, em: 1 });
  f = juntarAFila(f, { ...musica, em: 1 });
  assert.equal(f.length, 1);
  for (let i = 0; i < MAXIMO_POR_ENVIAR + 20; i++) f = juntarAFila(f, { ...musica, em: 100 + i });
  assert.equal(f.length, MAXIMO_POR_ENVIAR);
  assert.equal(f[0]!.em, 120, 'saem as mais antigas');
  assert.deepEqual(lerFila([{ titulo: 'T', artista: 'A', em: 5 }, { titulo: 1 }, null]), [{ titulo: 'T', artista: 'A', em: 5, album: null, duracaoMs: null, videoId: null }]);
  assert.deepEqual(lerFila('lixo'), []);
});

caso('tenta outra vez sem rede, com o servidor em baixo ou a pedir calma; não com o token recusado', () => {
  assert.equal(valeTentarDeNovo(null), true);
  assert.equal(valeTentarDeNovo(503), true);
  assert.equal(valeTentarDeNovo(429), true);
  assert.equal(valeTentarDeNovo(401), false);
  assert.equal(valeTentarDeNovo(400), false);
});

caso('o token tem a forma de um UUID', () => {
  assert.equal(pareceTokenDoListenBrainz(' 6c2f3a1e-1b2c-4d5e-8f90-a1b2c3d4e5f6 '), true);
  assert.equal(pareceTokenDoListenBrainz('o-meu-token'), false);
});

caso('o leitor avisa o scrobbler ao começar e quando a escuta conta, e nada vai ao Supabase', () => {
  const p = ler('src/state/player.ts');
  assert.match(p, /scrobbler\?\.agora\(conta\);/);
  assert.match(p, /scrobbler\?\.contou\(faixa, comecouEm\);/);
  const s = ler('src/state/scrobbling.ts');
  assert.doesNotMatch(s, /from '\.\.\/lib\/supabase'|supabase\.(from|rpc)/, 'direto ao ListenBrainz');
  assert.match(s, /if \(usePrivacidade\.getState\(\)\.privada\) return;/, 'a escuta privada não manda nada');
  assert.match(s, /Authorization: `Token \$\{token\}`/);
});

caso('as Definições têm o ListenBrainz nas duas plataformas, com o efeito dito', () => {
  assert.match(ler('src/screens/SettingsScreen.tsx'), /FRASES_DO_SCROBBLING\.titulo/);
  assert.match(ler('src/desktop/paginas/SettingsPage.web.tsx'), /FRASES_DO_SCROBBLING\.titulo/);
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\ntest-scrobbling: tudo certo');
