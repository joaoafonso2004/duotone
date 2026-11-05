// Executa a store real; só armazenamento, motores e rede usam os duplos.
import assert from 'node:assert/strict';
import { registarOuvirJuntos, usePlayer } from '../src/state/player.ts';
import { trackKey } from '../src/lib/shuffle.ts';
import { reporControlo } from './duplos/controlo.ts';
import type { PonteJam } from '../src/lib/jam.ts';
import type { Track } from '../src/types.ts';

const originalRandom = Math.random;
function seeded(seed: number) {
  let n = seed >>> 0;
  return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; };
}
const tracks: Track[] = Array.from({ length: 2000 }, (_, i) => ({
  source: 'youtube', sourceId: `song-${i}`, title: `Song ${i.toString(36)}alpha`,
  artist: `Artist ${(i % 137).toString(36)}alpha`, album: null, artworkUrl: null, durationSeconds: 180,
}));
const origem = { tipo: 'playlist' as const, nome: '2000 músicas', id: 'playlist-grande' };
const initial = usePlayer.getState();
const leitor = () => usePlayer.getState();
function reset(seed: number) {
  reporControlo(); registarOuvirJuntos(() => null); Math.random = seeded(seed);
  usePlayer.setState({ ...initial, current: tracks[0], queue: tracks, queueIndex: 0,
    shuffle: true, shuffleInteligente: false, shuffleOrder: tracks.map(trackKey).reverse(),
    autoplayRadio: false, repeatMode: 'off', _yt: null, radioStopped: false });
}
try {
  reset(123);
  await leitor().tocarLista(tracks, true, false, origem);
  assert.equal(leitor().queue.length, 2000);
  assert.equal(leitor().shuffleOrder.length, 2000, 'o percurso inteiro existe logo no Play, antes do primeiro Next');
  assert.equal(leitor().shuffleOrder[0], trackKey(leitor().current!));
  assert.equal(new Set(leitor().shuffleOrder).size, 2000, 'todas as músicas entram uma vez');
  const antes = [...leitor().shuffleOrder];
  const proximas = leitor().upcomingQueue();
  assert.equal(proximas.length, 1999);
  assert.deepEqual(proximas.map(u => trackKey(u.track)), antes.slice(1), 'Up next mostra o percurso aleatório desde o início');
  assert.equal(leitor().peekNextTrack(), proximas[0].track, 'o motor prepara a mesma faixa que a fila mostra');
  assert.notDeepEqual(proximas.slice(0, 20).map(u => u.index), Array.from({ length: 20 }, (_, i) => leitor().queueIndex + i + 1));
  for (let i = 1; i <= 15; i++) {
    await leitor().next();
    assert.equal(trackKey(leitor().current!), antes[i], 'Next percorre o sorteio sem o reiniciar');
    assert.deepEqual(leitor().shuffleOrder, antes);
  }
  await leitor().prev();
  assert.equal(trackKey(leitor().current!), antes[14], 'Previous volta pelo mesmo percurso');

  Math.random = seeded(456);
  await leitor().tocarLista(tracks, true, false, origem);
  assert.equal(leitor().shuffleOrder.length, 2000);
  assert.notDeepEqual(leitor().shuffleOrder, antes, 'dar Play de novo na mesma playlist sorteia um percurso novo');

  // Tocar diretamente numa faixa de outra lista não conserva um percurso antigo.
  const outra = [...tracks.slice(300), ...tracks.slice(0, 300)];
  Math.random = seeded(789);
  await leitor().playTrack(outra[1234], outra, false, false, undefined, { ...origem, id: 'outra-lista' });
  assert.equal(leitor().shuffleOrder[0], trackKey(outra[1234]));
  assert.equal(leitor().upcomingQueue().length, 1999);

  const primeiras = new Set<string>();
  for (let i = 0; i < 20; i++) {
    await leitor().tocarLista(tracks, true, false, origem);
    primeiras.add(trackKey(leitor().current!));
  }
  assert.ok(primeiras.size >= 15, 'o início também é sorteado, em vez de tocar sempre a primeira música');

  // No Jam, a lista enviada ao servidor também tem de estar baralhada.
  let anunciada: Track | null = null;
  let semeadas: Track[] = [];
  const ponte = {
    sessao: { id: 'jam' }, fila: [], anfitriao: true, convidadosControlam: false,
    temFaixa: true, semearAoTocar: true,
    anunciarFaixa: async (t: Track) => { anunciada = t; },
    semearFila: async (ts: readonly Track[]) => { semeadas = [...ts]; },
  } as unknown as PonteJam;
  registarOuvirJuntos(() => ponte); Math.random = seeded(321);
  await leitor().playShuffled(tracks);
  assert.ok(anunciada);
  assert.equal(new Set([trackKey(anunciada!), ...semeadas.map(trackKey)]).size, semeadas.length + 1, 'o lote do Jam não repete a faixa inicial');
  assert.equal(semeadas.length, 100, 'mantém o limite de lote da fila partilhada');
  const quartos = new Set(semeadas.slice(0, 100).map(t => Math.floor(Number(t.sourceId.slice(5)) / 500)));
  assert.equal(quartos.size, 4, 'as primeiras 100 sugestões do Jam vêm de toda a playlist, não de um bloco consecutivo');

  // Tocar numa música no Jam com o shuffle aceso: o resto vai baralhado, e
  // outro toque na mesma música dá outra fila (João, 5/11).
  const pequena = tracks.slice(0, 30);
  usePlayer.setState({ shuffle: true });
  await leitor().tocarMusica(pequena[5], pequena, true, undefined, origem);
  assert.equal(trackKey(anunciada!), trackKey(pequena[5]));
  const primeiraSemente = semeadas.map(trackKey);
  assert.equal(new Set(primeiraSemente).size, 29, 'vão as outras 29 da lista, e não só as que vinham depois');
  assert.ok(!primeiraSemente.includes(trackKey(pequena[5])), 'a tocada não entra na fila outra vez');
  assert.notDeepEqual(primeiraSemente.slice(0, 24), pequena.slice(6).map(trackKey), 'não é o resto pela ordem da lista');
  await leitor().tocarMusica(pequena[5], pequena, true, undefined, origem);
  assert.notDeepEqual(semeadas.map(trackKey), primeiraSemente, 'outro toque na mesma música, outra fila');
  usePlayer.setState({ shuffle: false });
  await leitor().tocarMusica(pequena[5], pequena, true, undefined, origem);
  assert.deepEqual(semeadas.map(trackKey), pequena.slice(6).map(trackKey), 'sem shuffle, o resto da lista pela ordem');
  console.log('Shuffle: 2000 músicas, percurso imediato e novo por Play, ordem estável nos saltos e lista aleatória no Jam, também ao tocar numa música.');
} finally {
  Math.random = originalRandom; registarOuvirJuntos(() => null);
}
