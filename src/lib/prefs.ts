import AsyncStorage from '@react-native-async-storage/async-storage';
import { DURACOES_DO_CROSSFADE, type DuracaoDoCrossfade } from './crossfade';
import { arredondar as arredondarRate, daPreferenciaAntiga } from './playbackRate';
import {
  daPersistencia, ganhosPorOmissao,
  type MemoriaDeAjustes,
} from './equalizer';

const KEY_DEFAULT_YT_VIEW = 'pref:defaultYtView';
const KEY_REPEAT_MODE = 'pref:repeatMode';
const KEY_SHUFFLE = 'pref:shuffle';
const KEY_SHUFFLE_INTELIGENTE = 'pref:shuffleInteligente';
const KEY_AUDIO_QUALITY = 'pref:audioQuality';
const KEY_SHOW_DURATION = 'pref:showTrackDuration';
const KEY_SHOW_REWIND = 'pref:showRewindButton';
const KEY_HAPTICS_ENABLED = 'pref:hapticsEnabled';
const KEY_CHATS_VISTOS = 'pref:chatsVistos';
const KEY_SEARCH_HISTORY = 'pref:searchHistory';
const MAX_SEARCH_HISTORY = 10;
const KEY_POT_SERVER_URL = 'pref:potServerUrl';
const KEY_AUTOPLAY_RADIO = 'pref:autoplayRadio';
const KEY_VOLUME_NORMALIZATION = 'pref:volumeNormalization';
const KEY_SOUND_PRESET = 'pref:soundPreset';
// Substituiu o KEY_SOUND_PRESET; a chave velha so e lida para migrar.
const KEY_PLAYBACK_RATE = 'pref:playbackRate';
const KEY_EQ_GANHOS = 'pref:eqGanhos';
const KEY_AJUSTES_FAIXA = 'pref:ajustesPorFaixa';
// Chave antiga, escrita à mão pelo ecrã de Definições antes de haver getter.
const KEY_KEEP_AWAKE = 'pref:keepAwake';
const KEY_NOTIFICATIONS = 'pref:notifications';
const KEY_GLITCH_MODE = 'pref:glitchMode';
const KEY_EFFECT_INTENSITY = 'pref:effectIntensity';

export type YtViewMode = 'video' | 'photo';
export type AudioQuality = 'high' | 'saver';

async function getBool(key: string, fallback: boolean): Promise<boolean> {
  const v = await AsyncStorage.getItem(key);
  return v === null ? fallback : v === '1';
}
async function setBool(key: string, v: boolean): Promise<void> {
  await AsyncStorage.setItem(key, v ? '1' : '0');
}

export async function getDefaultYtViewMode(): Promise<YtViewMode> {
  const v = await AsyncStorage.getItem(KEY_DEFAULT_YT_VIEW);
  return v === 'photo' ? 'photo' : 'video';
}
export async function setDefaultYtViewMode(v: YtViewMode): Promise<void> {
  await AsyncStorage.setItem(KEY_DEFAULT_YT_VIEW, v);
}

export type RepeatMode = 'off' | 'all' | 'one';
export async function getRepeatMode(): Promise<RepeatMode> {
  const v = await AsyncStorage.getItem(KEY_REPEAT_MODE);
  return v === 'all' || v === 'one' ? v : 'off';
}
export async function setRepeatMode(v: RepeatMode): Promise<void> {
  await AsyncStorage.setItem(KEY_REPEAT_MODE, v);
}

export async function getShuffle(): Promise<boolean> {
  return getBool(KEY_SHUFFLE, false);
}
/** O segundo estado do botao de shuffle: intercalar sugestoes. */
export async function getShuffleInteligente(): Promise<boolean> {
  return getBool(KEY_SHUFFLE_INTELIGENTE, false);
}
export async function setShuffleInteligente(v: boolean): Promise<void> {
  await setBool(KEY_SHUFFLE_INTELIGENTE, v);
}

export async function setShuffle(v: boolean): Promise<void> {
  await setBool(KEY_SHUFFLE, v);
}

/** Rádio no fim da fila. Ligado por omissão — é o ponto da funcionalidade,
 * e as duas primeiras fontes (biblioteca e histórico) não gastam quota. */
export async function getAutoplayRadio(): Promise<boolean> {
  return getBool(KEY_AUTOPLAY_RADIO, true);
}
export async function setAutoplayRadio(v: boolean): Promise<void> {
  await setBool(KEY_AUTOPLAY_RADIO, v);
}

/** Normalização de volume entre faixas. Ligada por omissão — sem ela o salto
 * de volume entre uploads do YouTube é constante. */
export async function getVolumeNormalization(): Promise<boolean> {
  return getBool(KEY_VOLUME_NORMALIZATION, true);
}
export async function setVolumeNormalization(v: boolean): Promise<void> {
  await setBool(KEY_VOLUME_NORMALIZATION, v);
}

/** Notificações locais (inbox e pedidos de amizade). Ligadas por omissão —
 * são o único aviso de que chegou alguma coisa com a app fechada. */
export async function getNotificationsEnabled(): Promise<boolean> {
  return getBool(KEY_NOTIFICATIONS, true);
}
export async function setNotificationsEnabled(v: boolean): Promise<void> {
  await setBool(KEY_NOTIFICATIONS, v);
}

/**
 * Glitch equalizer do Now Playing (so no desktop).
 *
 * Tres estados e nao um interruptor porque os custos sao mesmo diferentes:
 * `reactive` liga a captura de audio do frame do YouTube, `static` desenha a
 * capa uma vez e nao volta a tocar no assunto, `off` nao monta canvas nenhum.
 *
 * **`off` TEM de parar a captura.** Continuar a analisar som que ninguem ve
 * gasta CPU e mantem aberta uma permissao de captura sem motivo nenhum.
 */
export type GlitchMode = 'reactive' | 'static' | 'off';
export async function getGlitchMode(): Promise<GlitchMode> {
  const v = await AsyncStorage.getItem(KEY_GLITCH_MODE);
  return v === 'static' || v === 'off' ? v : 'reactive';
}
export async function setGlitchMode(v: GlitchMode): Promise<void> {
  await AsyncStorage.setItem(KEY_GLITCH_MODE, v);
}

export type EffectIntensity = 'subtle' | 'normal' | 'strong';
export async function getEffectIntensity(): Promise<EffectIntensity> {
  const v = await AsyncStorage.getItem(KEY_EFFECT_INTENSITY);
  return v === 'subtle' || v === 'strong' ? v : 'normal';
}
export async function setEffectIntensity(v: EffectIntensity): Promise<void> {
  await AsyncStorage.setItem(KEY_EFFECT_INTENSITY, v);
}

/**
 * Velocidade de reproducao. Substituiu os tres presets, que nem sequer
 * concordavam entre plataformas (o "fast" era 1,5 no telemovel e 1,35 no PC).
 *
 * A leitura MIGRA a preferencia antiga: quem tinha "Slowed" nao pode abrir a
 * app e encontra-la a 1x. A chave velha fica onde esta — apaga-la nao ganha
 * nada e tirava a rede de seguranca a quem instalasse uma versao anterior.
 */
export async function getPlaybackRate(): Promise<number> {
  const v = await AsyncStorage.getItem(KEY_PLAYBACK_RATE);
  if (v !== null) return arredondarRate(Number(v));
  return daPreferenciaAntiga(await AsyncStorage.getItem(KEY_SOUND_PRESET));
}
export async function setPlaybackRate(v: number): Promise<void> {
  await AsyncStorage.setItem(KEY_PLAYBACK_RATE, String(arredondarRate(v)));
}

/**
 * O padrão do equalizador é sempre Flat. Builds antigas chegaram a guardar
 * aqui a curva que estava ativa e transformaram um ajuste de uma faixa no
 * default da aplicação (a curva da captura do bug). Apagamos essa chave
 * legada no arranque; escolhas explícitas por faixa vivem noutra chave e não
 * são afetadas.
 */
export async function getEqGanhos(): Promise<number[]> {
  // A limpeza é best-effort: mesmo que o armazenamento esteja indisponível,
  // o arranque continua plano.
  await AsyncStorage.removeItem(KEY_EQ_GANHOS).catch(() => {});
  return ganhosPorOmissao();
}

/** O que cada faixa lembra: a velocidade e os ganhos com que a deixaste. */
export async function getAjustesPorFaixa(): Promise<MemoriaDeAjustes> {
  return daPersistencia(await AsyncStorage.getItem(KEY_AJUSTES_FAIXA));
}
export async function setAjustesPorFaixa(m: MemoriaDeAjustes): Promise<void> {
  await AsyncStorage.setItem(KEY_AJUSTES_FAIXA, JSON.stringify(m));
}

export async function getKeepAwake(): Promise<boolean> {
  return getBool(KEY_KEEP_AWAKE, false);
}
export async function setKeepAwake(v: boolean): Promise<void> {
  await setBool(KEY_KEEP_AWAKE, v);
}

export async function getAudioQuality(): Promise<AudioQuality> {
  const v = await AsyncStorage.getItem(KEY_AUDIO_QUALITY);
  return v === 'saver' ? 'saver' : 'high';
}
export async function setAudioQuality(v: AudioQuality): Promise<void> {
  await AsyncStorage.setItem(KEY_AUDIO_QUALITY, v);
}

export async function getShowRewindButton(): Promise<boolean> {
  return getBool(KEY_SHOW_REWIND, false);
}
export async function setShowRewindButton(v: boolean): Promise<void> {
  await setBool(KEY_SHOW_REWIND, v);
}

export async function getShowTrackDuration(): Promise<boolean> {
  return getBool(KEY_SHOW_DURATION, true);
}
export async function setShowTrackDuration(v: boolean): Promise<void> {
  await setBool(KEY_SHOW_DURATION, v);
}

export async function getHapticsEnabled(): Promise<boolean> {
  return getBool(KEY_HAPTICS_ENABLED, false);
}
export async function setHapticsEnabled(v: boolean): Promise<void> {
  await setBool(KEY_HAPTICS_ENABLED, v);
}

/** Últimas pesquisas (mais recente primeiro, sem duplicados, máx. 10). */
export async function getSearchHistory(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(KEY_SEARCH_HISTORY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function addSearchHistoryEntry(query: string): Promise<string[]> {
  const q = query.trim();
  if (!q) return getSearchHistory();
  const current = await getSearchHistory();
  const next = [q, ...current.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(
    0,
    MAX_SEARCH_HISTORY
  );
  await AsyncStorage.setItem(KEY_SEARCH_HISTORY, JSON.stringify(next));
  return next;
}

export async function clearSearchHistory(): Promise<void> {
  await AsyncStorage.removeItem(KEY_SEARCH_HISTORY);
}

/** URL do servidor bgutil-ytdlp-pot-provider (ex.: http://192.168.1.10:4416).
 * Vazio = funcionalidade desligada, comportamento igual a antes. Ver
 * src/api/potProvider.ts e GUIA-POT-TOKEN.md. */
export async function getPoTokenServerUrl(): Promise<string> {
  return (await AsyncStorage.getItem(KEY_POT_SERVER_URL)) ?? '';
}
export async function setPoTokenServerUrl(v: string): Promise<void> {
  await AsyncStorage.setItem(KEY_POT_SERVER_URL, v.trim());
}

// ------------------------------------------------------------
// Cache síncrono — para preferências lidas em caminhos "quentes"
// (renderização de listas, handlers de toque) onde uma leitura assíncrona
// ao AsyncStorage seria lenta ou causaria flicker. Carregado uma vez no
// arranque da app (ver App.tsx) e atualizado sempre que o utilizador muda
// a preferência nas Definições.
// ------------------------------------------------------------

let hapticsEnabledCache = false;
let showTrackDurationCache = true;

export function isHapticsEnabledSync(): boolean {
  return hapticsEnabledCache;
}
export function setHapticsEnabledCache(v: boolean): void {
  hapticsEnabledCache = v;
}

export function isShowTrackDurationSync(): boolean {
  return showTrackDurationCache;
}
export function setShowTrackDurationCache(v: boolean): void {
  showTrackDurationCache = v;
}

export async function loadPrefsCache(): Promise<void> {
  const [haptics, duration] = await Promise.all([
    getHapticsEnabled(),
    getShowTrackDuration(),
  ]);
  hapticsEnabledCache = haptics;
  showTrackDurationCache = duration;
}

/**
 * Quando cada conversa foi aberta pela ultima vez: `friendId` -> ISO.
 *
 * E o que substitui a aba Inbox a dizer que chegou coisa nova. Fica do lado
 * de ca porque a `shared_items` nao tem coluna de "lido" e acrescentar uma
 * obrigava a uma migracao -- ver `lib/social.ts`.
 */
export async function getChatsVistos(accountId=''): Promise<Record<string, string>> {
  const raw = await AsyncStorage.getItem(`${KEY_CHATS_VISTOS}:${accountId}`);
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

/** Marca a conversa como vista agora. Devolve o mapa ja actualizado, para
 * quem chama nao ter de o voltar a ler. */
export async function marcarChatVisto(friendId: string,timestamp:string,accountId=''): Promise<Record<string, string>> {
  const actual = await getChatsVistos(accountId);
  if(!Number.isFinite(Date.parse(timestamp)))return actual;
  const novo = { ...actual, [friendId]: Date.parse(actual[friendId] || '')>Date.parse(timestamp)?actual[friendId]:timestamp };
  try {
    await AsyncStorage.setItem(`${KEY_CHATS_VISTOS}:${accountId}`, JSON.stringify(novo));
  } catch {
    // best-effort: perder a marca so faz reaparecer o ponto, nao parte nada
  }
  return novo;
}

/**
 * Segundos de passagem entre faixas. Zero desliga, e é o que vem de origem:
 * um crossfade que ninguém pediu é uma surpresa numa app de música.
 *
 * Guardado como texto, como as outras preferências, e validado à leitura contra
 * a lista das durações oferecidas — um valor estranho no armazenamento não pode
 * virar um fade de trinta segundos.
 */
const KEY_CROSSFADE = 'pref:crossfade';

export async function getCrossfadeSegundos(): Promise<DuracaoDoCrossfade> {
  const v = Number(await AsyncStorage.getItem(KEY_CROSSFADE));
  return (DURACOES_DO_CROSSFADE as readonly number[]).includes(v)
    ? (v as DuracaoDoCrossfade)
    : 0;
}

export async function setCrossfadeSegundos(v: DuracaoDoCrossfade): Promise<void> {
  await AsyncStorage.setItem(KEY_CROSSFADE, String(v));
}
