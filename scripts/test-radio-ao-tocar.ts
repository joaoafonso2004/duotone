/**
 * "Start Radio from a song" (6/10): tocar numa música liga o Radio a partir
 * dela, e num Jam liga o Radio da sala. O Play de uma lista não muda.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-duplos.mjs scripts/test-radio-ao-tocar.ts
 */
import assert from 'node:assert/strict';
import { usePlayer, registarOuvirJuntos } from '../src/state/player.ts';
import { controlo, reporControlo } from './duplos/controlo.ts';
import { guardadas } from './duplos/prefs.ts';
import type { PonteJam } from '../src/lib/jam.ts';
import type { Track } from '../src/types.ts';

const faixa = (id: string, artist = 'Isak'): Track => ({ source: 'youtube', sourceId: id, title: id, artist, album: null, artworkUrl: null, durationSeconds: 60 });
const a = faixa('a'), escolhida = faixa('escolhida'), b = faixa('b');
const lista = [a, escolhida, b];
const ids = () => usePlayer.getState().queue.map((t) => t.sourceId);

let ponte: PonteJam | null = null;
registarOuvirJuntos(() => ponte);
const inicial = usePlayer.getState();
function repor(radioAoTocar: boolean) {
  reporControlo();
  ponte = null;
  usePlayer.setState({ ...inicial, current: null, queue: [], queueIndex: 0, radioMode: 'off', radioStopped: false,
    radioAoTocar, autoplayRadio: true, shuffle: false, shuffleOrder: [], _yt: null } as any);
  controlo.radio = [faixa('r1', 'Holly Hood'), faixa('r2', 'Bispo')];
}

// Desligado: tocar numa música põe a lista, como sempre.
repor(false);
await usePlayer.getState().tocarMusica(escolhida, lista, false, undefined, { tipo: 'guardadas', nome: 'Liked Songs' });
assert.deepEqual(ids(), ['a', 'escolhida', 'b']);
assert.equal(usePlayer.getState().radioMode, 'off');
assert.equal(controlo.chamadas.radio, 0, 'sem a opção não se pede Radio nenhum');

// Ligado: só a escolhida, e o Up next é o Radio a partir dela.
repor(true);
await usePlayer.getState().tocarMusica(escolhida, lista, false, undefined, { tipo: 'guardadas', nome: 'Liked Songs' });
assert.deepEqual(ids(), ['escolhida', 'r1', 'r2'], 'o resto da lista não vai atrás; vem o Radio');
assert.equal(usePlayer.getState().current?.sourceId, 'escolhida');
assert.equal(usePlayer.getState().radioMode, 'on');
assert.equal(controlo.chamadas.radio, 1);
assert.deepEqual(usePlayer.getState().origemDaFila, { tipo: 'guardadas', nome: 'Liked Songs' }, 'a música continua a dizer de onde veio');

// O Play de uma lista não passa pela opção.
repor(true);
await usePlayer.getState().tocarLista(lista, false, false, { tipo: 'playlist', nome: 'X', id: 'x' });
assert.deepEqual(ids(), ['a', 'escolhida', 'b'], 'Play numa lista toca a lista');
assert.equal(usePlayer.getState().radioMode, 'off');

// Sem rede o Radio não arranca: toca-se a lista.
repor(true);
controlo.offline = true;
await usePlayer.getState().tocarMusica(escolhida, lista);
assert.deepEqual(ids(), ['a', 'escolhida', 'b']);
assert.equal(controlo.chamadas.radio, 0);
controlo.offline = false;

// A opção fica guardada.
repor(false);
usePlayer.getState().setRadioAoTocar(true);
assert.equal(usePlayer.getState().radioAoTocar, true);
assert.equal(guardadas.radioAoTocar, true);

// --- Num Jam -------------------------------------------------------------------
const ponteDeTeste = (o: { anfitriao: boolean; convidadosControlam?: boolean; radio: PonteJam['radio'] }) => {
  const registo = { anunciadas: [] as string[], sugeridas: [] as string[], semeadas: 0, ligou: 0 };
  ponte = {
    sessao: { id: 'jam' }, fila: [], anfitriao: o.anfitriao, convidadosControlam: !!o.convidadosControlam,
    temFaixa: true, semearAoTocar: true, radio: o.radio,
    sugerir: async (t) => { registo.sugeridas.push(t.sourceId); },
    semearFila: async () => { registo.semeadas++; },
    anunciarFaixa: async (t) => { registo.anunciadas.push(t.sourceId); },
    alternarPausa: async () => {}, procurar: async () => {}, avancar: async () => {},
    recuar: async () => false, sairAoFechar: async () => true, avisarErro: () => {},
  };
  return registo;
};

repor(true);
{
  let ligou = 0;
  const r = ponteDeTeste({ anfitriao: true, radio: { ligado: false, ligar: async () => { ligou++; } } });
  await usePlayer.getState().tocarMusica(escolhida, lista);
  assert.deepEqual(r.anunciadas, ['escolhida'], 'o anfitrião põe a música a tocar na sala');
  assert.equal(r.semeadas, 0, 'o resto da lista não vai para a fila partilhada');
  assert.equal(ligou, 1, 'e liga o Radio da sala');
  assert.equal(controlo.chamadas.radio, 0, 'o Radio pessoal não arranca num Jam');
}
repor(true);
{
  let ligou = 0;
  const r = ponteDeTeste({ anfitriao: true, radio: { ligado: true, ligar: async () => { ligou++; } } });
  await usePlayer.getState().tocarMusica(escolhida, lista);
  assert.equal(ligou, 0, 'já ligado, não se volta a ligar');
  assert.deepEqual(r.anunciadas, ['escolhida']);
}
repor(true);
{
  let ligou = 0;
  const r = ponteDeTeste({ anfitriao: false, radio: { ligado: false, ligar: async () => { ligou++; } } });
  await usePlayer.getState().tocarMusica(escolhida, lista);
  assert.deepEqual(r.sugeridas, ['escolhida'], 'um convidado sem controlo sugere a música');
  assert.equal(ligou, 0, 'e não mexe no Radio da sala');
}
repor(true);
{
  const r = ponteDeTeste({ anfitriao: true, radio: null });
  await usePlayer.getState().tocarMusica(escolhida, lista);
  assert.deepEqual(r.anunciadas, ['escolhida'], 'sem a migração, toca na mesma');
  assert.equal(r.semeadas, 0);
}
// Desligada a opção, num Jam fica o de sempre: a lista vai atrás.
repor(false);
{
  let ligou = 0;
  const r = ponteDeTeste({ anfitriao: true, radio: { ligado: false, ligar: async () => { ligou++; } } });
  await usePlayer.getState().tocarMusica(escolhida, lista);
  assert.equal(r.semeadas, 1, 'o resto da lista vai para a fila partilhada');
  assert.equal(ligou, 0);
}

// --- As listas tocam a música pela ação nova (e o Play da lista não) ----------
{
  const { readFileSync } = await import('node:fs');
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
}

console.log('Radio ao tocar numa música: passou.');
