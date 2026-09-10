import AsyncStorage from '@react-native-async-storage/async-storage';
import { DURACOES_DO_CROSSFADE, type DuracaoDoCrossfade } from './crossfade';
import { arredondar as arredondarRate, daPreferenciaAntiga } from './playbackRate';
import {
  daPersistencia, ganhosPorOmissao, normalizar as normalizarGanhos,
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
/** O equalizador base das Definicoes. Chave NOVA -- ver `getEqPadrao`. */
const KEY_EQ_PADRAO = 'pref:eqPadrao';
const KEY_AJUSTES_FAIXA = 'pref:ajustesPorFaixa';
// Chave antiga, escrita à mão pelo ecrã de Definições antes de haver getter.
const KEY_KEEP_AWAKE = 'pref:keepAwake';
const KEY_NOTIFICATIONS = 'pref:notifications';
const KEY_GLITCH_MODE = 'pref:glitchMode';
const KEY_EFFECT_INTENSITY = 'pref:effectIntensity';
/** A presenca do Discord, so no PC. Ver `getDiscordRichPresence`. */
const KEY_DISCORD_ON = 'pref:discordRichPresence';
const KEY_DISCORD_APP = 'pref:discordAppId';
/** Os artistas escolhidos no primeiro dia. Ver `getArtistasSemente`. */
const KEY_SEMENTES = 'pref:artistasSemente';

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

/** Avisos no topo da app móvel; no desktop também controla os avisos Windows.
 * As marcas de mensagens por ler são independentes desta preferência. */
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

/**
 * O equalizador base, escolhido nas Definições e aplicado a todas as faixas
 * que não tenham o seu.
 *
 * **Chave nova, e é de propósito.** A antiga (`pref:eqGanhos`, logo acima)
 * continua a ser apagada a cada arranque e não se toca nela: ali guardava-se a
 * curva ACTIVA sem ninguém a ter escolhido como padrão, e o resultado foi um
 * ajuste de uma faixa a passar a valer para a app inteira. Aqui só entra o que
 * alguém foi mexer às Definições de propósito, o que é outra coisa.
 *
 * Isto vive num `pref:` e por isso já viaja para a conta pelo `lib/prefsSync`
 * -- o que resolve a reinstalação. O que ainda NÃO resolve é dois aparelhos
 * vivos: a fusão do `prefsFusao` só escreve localmente uma chave que o
 * aparelho não tenha. Ver o comentário no `state/player.ts`.
 */
export async function getEqPadrao(): Promise<number[]> {
  try {
    const guardado = await AsyncStorage.getItem(KEY_EQ_PADRAO);
    if (!guardado) return ganhosPorOmissao();
    const lido = JSON.parse(guardado);
    return Array.isArray(lido) ? normalizarGanhos(lido) : ganhosPorOmissao();
  } catch {
    // Guardado ilegível: o padrão é plano, como sempre foi.
    return ganhosPorOmissao();
  }
}

export async function setEqPadrao(ganhos: readonly number[]): Promise<void> {
  await AsyncStorage.setItem(KEY_EQ_PADRAO, JSON.stringify(normalizarGanhos(ganhos)));
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

/**
 * Como as playlists são ordenadas.
 *
 * Guardado porque não o estar era um imposto a cada visita: escolhia-se a
 * ordem, saía-se da playlist, voltava-se, e estava tudo outra vez como no
 * princípio. Uma escolha que se repete é uma preferência, e preferências
 * guardam-se.
 *
 * É uma só para todas as playlists e não uma por playlist -- quem gosta de ver
 * por título gosta de ver por título, e não faixa a faixa por lista.
 */
export type OrdemDaPlaylist =
  'default' | 'title' | 'recent' | 'played_recent' | 'played_most' | 'duration';

const KEY_ORDEM_PLAYLIST = 'prefs:ordemDaPlaylist';
const ORDENS: readonly OrdemDaPlaylist[] =
  ['default', 'title', 'recent', 'played_recent', 'played_most', 'duration'];

export async function getOrdemDaPlaylist(): Promise<OrdemDaPlaylist> {
  const v = await AsyncStorage.getItem(KEY_ORDEM_PLAYLIST);
  // Um valor desconhecido -- de uma versão futura, ou de dados estragados --
  // não pode deixar a lista numa ordem que o ecrã não sabe desenhar.
  return ORDENS.includes(v as OrdemDaPlaylist) ? (v as OrdemDaPlaylist) : 'default';
}

export async function setOrdemDaPlaylist(v: OrdemDaPlaylist): Promise<void> {
  await AsyncStorage.setItem(KEY_ORDEM_PLAYLIST, v);
}

/**
 * A presença do Discord: mostrar no perfil o que está a tocar.
 *
 * **Desligada de origem, e de propósito.** Isto publica o que estás a ouvir
 * para toda a gente que veja o teu perfil do Discord -- não é o género de
 * coisa que se liga sozinha a ninguém.
 *
 * Só funciona no PC: o Discord expõe-se por um socket local, e no iPhone não
 * há socket nenhum para abrir.
 */
export async function getDiscordRichPresence(): Promise<boolean> {
  return getBool(KEY_DISCORD_ON, false);
}
export async function setDiscordRichPresence(v: boolean): Promise<void> {
  await setBool(KEY_DISCORD_ON, v);
}

/**
 * O id da aplicação do Discord.
 *
 * Vem do utilizador e não embutido aqui: a presença aparece com o NOME da
 * aplicação que a publica, por isso tem de ser uma que ele tenha criado no
 * portal do Discord. Uma nossa mostraria o nosso nome no perfil dele.
 */
export async function getDiscordAppId(): Promise<string> {
  return (await AsyncStorage.getItem(KEY_DISCORD_APP)) ?? '';
}
export async function setDiscordAppId(v: string): Promise<void> {
  await AsyncStorage.setItem(KEY_DISCORD_APP, v.trim());
}

/**
 * Os artistas que alguém escolheu quando abriu a app pela primeira vez.
 *
 * Vive num `pref:` e por isso viaja para a conta pelo `lib/prefsSync` -- quem
 * instala no segundo aparelho não volta a ser perguntado.
 *
 * Guarda-se o NOME e não um id de catálogo: é o nome que a recomendação usa
 * em todo o lado (`getTopArtists` devolve nomes, o `chaveDeArtista` compara
 * nomes), e um id do Deezer teria de ser traduzido de volta a cada leitura.
 */
export async function getArtistasSemente(): Promise<string[]> {
  try {
    const guardado = await AsyncStorage.getItem(KEY_SEMENTES);
    if (!guardado) return [];
    const lido = JSON.parse(guardado);
    return Array.isArray(lido) ? lido.filter((n): n is string => typeof n === 'string' && !!n.trim()) : [];
  } catch {
    return [];
  }
}
export async function setArtistasSemente(nomes: readonly string[]): Promise<void> {
  await AsyncStorage.setItem(KEY_SEMENTES, JSON.stringify(nomes.slice(0, 12)));
}

export type OrdemDosArtistas = 'az' | 'played_most';
export async function getOrdemDosArtistas(): Promise<OrdemDosArtistas> {
  return await AsyncStorage.getItem('pref:ordemDosArtistas') === 'az' ? 'az' : 'played_most';
}
export async function setOrdemDosArtistas(value: OrdemDosArtistas): Promise<void> {
  await AsyncStorage.setItem('pref:ordemDosArtistas', value);
}

/**
 * Ao mudar a velocidade, o tom acompanha (falso) ou fica onde esta (verdadeiro)?
 *
 * Falso e o de sempre: reamostra, e a musica soa como uma fita abrandada.
 * Verdadeiro estica o tempo e mantem o tom.
 *
 * A escolha nao e so de gosto. No iPhone, reamostrar muda a taxa de saida, e
 * muda-la a meio obriga o AVFoundation a voltar a preparar a cadeia de audio --
 * e e esse o corte que se ouve ao mexer no deslizador da velocidade. Preservar
 * o tom nao muda a taxa e nao corta, em troca de algum artefacto nas
 * velocidades extremas. Um corte ou um artefacto: e por isso que e uma
 * preferencia e nao uma decisao escrita no codigo.
 */
export async function getVelocidadeMantemTom(): Promise<boolean> {
  return await AsyncStorage.getItem('pref:velocidadeMantemTom') === '1';
}
export async function setVelocidadeMantemTom(v: boolean): Promise<void> {
  await AsyncStorage.setItem('pref:velocidadeMantemTom', v ? '1' : '0');
}
