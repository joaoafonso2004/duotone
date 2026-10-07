/**
 * O Radio ligado fica ligado (7/10): com a pastilha acesa, tocar numa música
 * toca essa e recomeça o Radio a partir dela; num Jam com o Radio da sala,
 * toca essa sem a lista atrás. O Play de uma lista toca a lista e desliga-o.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-duplos.mjs scripts/test-radio-ao-tocar.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { usePlayer, registarOuvirJuntos } from '../src/state/player.ts';
import { controlo, reporControlo } from './duplos/controlo.ts';
import type { PonteJam } from '../src/lib/jam.ts';
import type { Track } from '../src/types.ts';

const faixa = (id: string, artist = 'Isak'): Track => ({ source: 'youtube', sourceId: id, title: id, artist, album: null, artworkUrl: null, durationSeconds: 60 });
const a = faixa('a'), escolhida = faixa('escolhida'), b = faixa('b'), antes = faixa('antes');
const lista = [a, escolhida, b];
const ids = () => usePlayer.getState().queue.map((t) => t.sourceId);

let ponte: PonteJam | null = null;
registarOuvirJuntos(() => ponte);
const inicial = usePlayer.getState();
async function repor(radioLigado: boolean) {
  reporControlo();
  ponte = null;
  usePlayer.setState({ ...inicial, current: antes, queue: [antes], queueIndex: 0, radioMode: 'off', radioStopped: false,
    autoplayRadio: true, shuffle: false, shuffleOrder: [], _yt: null } as any);
  controlo.radio = [faixa('r1', 'Holly Hood'), faixa('r2', 'Bispo')];
  if (radioLigado) {
    assert.equal(await usePlayer.getState().startRadio(), true);
    assert.equal(usePlayer.getState().radioMode, 'on');
    controlo.chamadas.radio = 0;
    controlo.radio = [faixa('r3', 'Dillaz'), faixa('r4', 'Regula')];
  }
}

// Sem Radio: tocar numa música põe a lista, como sempre.
await repor(false);
await usePlayer.getState().tocarMusica(escolhida, lista, false, undefined, { tipo: 'guardadas', nome: 'Liked Songs' });
assert.deepEqual(ids(), ['a', 'escolhida', 'b']);
assert.equal(usePlayer.getState().radioMode, 'off');
assert.equal(controlo.chamadas.radio, 0, 'sem Radio ligado não se pede Radio nenhum');

// Com o Radio ligado: só a escolhida, e o Radio recomeça a partir DELA -- não
// do que se ouviu na sessão (um artista diferente).
await repor(true);
usePlayer.setState({ radioListeningSession: { owner: 'utilizador-de-teste', tracks: [faixa('ouvida1', 'Bispo'), faixa('ouvida2', 'Bispo')] } } as any);
await usePlayer.getState().tocarMusica(escolhida, lista, false, undefined, { tipo: 'guardadas', nome: 'Liked Songs' });
assert.deepEqual(ids(), ['escolhida', 'r3', 'r4'], 'o resto da lista não vai atrás; vem o Radio a partir dela');
assert.equal(usePlayer.getState().current?.sourceId, 'escolhida');
assert.equal(usePlayer.getState().radioMode, 'on', 'o Radio continua ligado');
assert.equal(controlo.chamadas.radio, 1);
assert.deepEqual(controlo.radioContextos.at(-1)?.map((t) => t.sourceId), ['escolhida'], 'a partir da música escolhida, só dela');
assert.deepEqual(usePlayer.getState().origemDaFila, { tipo: 'guardadas', nome: 'Liked Songs' }, 'a música continua a dizer de onde veio');

// O Play de uma lista toca a lista e desliga o Radio: foi a lista que se pediu.
await repor(true);
await usePlayer.getState().tocarLista(lista, false, false, { tipo: 'playlist', nome: 'X', id: 'x' });
assert.deepEqual(ids(), ['a', 'escolhida', 'b'], 'Play numa lista toca a lista');
assert.equal(usePlayer.getState().radioMode, 'off');

// Sem rede o Radio não arranca: toca-se a lista.
await repor(true);
controlo.offline = true;
await usePlayer.getState().tocarMusica(escolhida, lista);
assert.deepEqual(ids(), ['a', 'escolhida', 'b']);
assert.equal(controlo.chamadas.radio, 0);
controlo.offline = false;

// Desligado na pastilha, volta a ser a lista.
await repor(true);
usePlayer.getState().stopRadio();
await usePlayer.getState().tocarMusica(escolhida, lista);
assert.deepEqual(ids(), ['a', 'escolhida', 'b'], 'desligado, tocar numa música põe a lista');

// --- Num Jam -------------------------------------------------------------------
const ponteDeTeste = (o: { anfitriao: boolean; radio: PonteJam['radio'] }) => {
  const registo = { anunciadas: [] as string[], sugeridas: [] as string[], semeadas: 0 };
  ponte = {
    sessao: { id: 'jam' }, fila: [], anfitriao: o.anfitriao, convidadosControlam: false,
    temFaixa: true, semearAoTocar: true, radio: o.radio,
    sugerir: async (t) => { registo.sugeridas.push(t.sourceId); },
    semearFila: async () => { registo.semeadas++; },
    anunciarFaixa: async (t) => { registo.anunciadas.push(t.sourceId); },
    alternarPausa: async () => {}, procurar: async () => {}, avancar: async () => {},
    recuar: async () => false, sairAoFechar: async () => true, avisarErro: () => {},
  };
  return registo;
};

await repor(false);
{
  const r = ponteDeTeste({ anfitriao: true, radio: { ligado: true } });
  await usePlayer.getState().tocarMusica(escolhida, lista);
  assert.deepEqual(r.anunciadas, ['escolhida'], 'com o Radio da sala, toca essa para todos');
  assert.equal(r.semeadas, 0, 'e o resto da lista não vai para a fila partilhada');
  assert.equal(controlo.chamadas.radio, 0, 'o Radio pessoal não arranca num Jam');
}
await repor(false);
{
  const r = ponteDeTeste({ anfitriao: true, radio: { ligado: false } });
  await usePlayer.getState().tocarMusica(escolhida, lista);
  assert.equal(r.semeadas, 1, 'sem o Radio da sala, o resto da lista vai atrás, como sempre');
}
await repor(false);
{
  const r = ponteDeTeste({ anfitriao: true, radio: null });
  await usePlayer.getState().tocarMusica(escolhida, lista);
  assert.equal(r.semeadas, 1, 'sem a migração, como sempre');
}
await repor(false);
{
  const r = ponteDeTeste({ anfitriao: false, radio: { ligado: true } });
  await usePlayer.getState().tocarMusica(escolhida, lista);
  assert.deepEqual(r.sugeridas, ['escolhida'], 'um convidado sem controlo sugere a música');
}

// --- As listas tocam a música pela ação nova (e o Play da lista não) ----------
{
  const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  const usam: [string, RegExp][] = [
    ['src/screens/SongsScreen.tsx', /tocarMusica\(item, sortedTracks/],
    ['src/screens/PlaylistDetailScreen.tsx', /tocarMusica\(item, visibleTracks/],
    ['src/screens/SearchScreen.tsx', /tocarMusica\(track, data, true, contextoDe\(track\)\)/],
    ['src/screens/LibraryGroupScreen.tsx', /tocarMusica\(item, activeTab/],
    ['src/screens/PrateleiraScreen.tsx', /tocarMusica\(item, faixas/],
    ['src/components/TrackActionsSheet.tsx', /case 'tocar-agora': void player\.tocarMusica\(/],
    ['src/desktop/paginas/BibliotecaPages.web.tsx', /props\.tocarMusica\(t, filteredTracks/],
    ['src/desktop/paginas/PlaylistPages.web.tsx', /props\.tocarMusica\(t, filteredTracks/],
    ['src/navigation/RootNavigator.web.tsx', /const common = \{ play, tocarMusica, notify, more \}/],
  ];
  for (const [f, re] of usam) assert.match(ler(f), re, `${f}: tocar numa música passa pelo tocarMusica`);
  assert.match(ler('src/screens/LibraryGroupScreen.tsx'), /label="Play all" small onPress=\{\(\) => playTrack\(tracks\[0\], tracks/,
    'o Play all continua a tocar a lista');
  // Não há opção nas Definições: o interruptor é a pastilha.
  for (const f of ['src/screens/SettingsScreen.tsx', 'src/desktop/paginas/SettingsPage.web.tsx', 'src/lib/prefs.ts']) {
    assert.doesNotMatch(ler(f), /radioAoTocar|RadioAoTocar/, `${f}: sem opção do Radio nas Definições`);
  }
}

console.log('Radio que fica ligado: passou.');
