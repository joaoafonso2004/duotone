import type { Track } from '../types';

/**
 * Rádio: continuar a tocar quando a fila acaba, em vez de ficar em silêncio.
 *
 * Porque não são os mixes do YouTube (`RD<videoId>`): a Data API v3, que é a
 * que a app usa para playlists, NÃO resolve mixes — não são playlists reais
 * para a API e vem 404. Fazê-lo pelo InnerTube era possível mas acrescentava
 * mais uma superfície frágil ao pipeline que já está sempre a partir.
 *
 * Em vez disso o rádio sai dos dados do próprio utilizador (biblioteca,
 * histórico de reproduções no Supabase) e só cai na pesquisa do YouTube em
 * último recurso — que é o que o ROADMAP já previa para as recomendações.
 * Funções puras aqui; a ida à rede em `api/radio.ts`. O extrator de artista
 * e a chave da faixa entram por parâmetro em vez de serem importados: é o que
 * mantém este módulo sem dependências de runtime e, por isso, testável em Node
 * puro como o resto da lógica da app (ver scripts/test-radio.ts).
 */

/** Quantas faixas o rádio acrescenta de cada vez. */
export const RADIO_BATCH = 10;

/** Quantas das últimas ouvidas servem de semente. */
export const RADIO_SEED_COUNT = 3;

/**
 * As faixas que definem "mais do mesmo": as últimas ouvidas, da mais recente
 * para trás. Só a atual seria pouco — numa fila variada, a última faixa pode
 * não representar nada do que se esteve a ouvir.
 */
export function radioSeeds(
  queue: Track[],
  queueIndex: number,
  count: number = RADIO_SEED_COUNT
): Track[] {
  if (queue.length === 0) return [];
  const end = Math.max(0, Math.min(queueIndex, queue.length - 1));
  const start = Math.max(0, end - count + 1);
  return queue.slice(start, end + 1).reverse();
}

/** Artistas distintos das sementes, do mais recente para o mais antigo. */
export function seedArtists(
  seeds: Track[],
  artistOf: (t: Track) => string
): string[] {
  const out: string[] = [];
  for (const t of seeds) {
    const name = artistOf(t)?.trim();
    // O `displayArtist` devolve 'Unknown artist' quando não consegue extrair
    // nada. Pesquisar por isso no YouTube dava lixo — melhor não semear.
    if (!name || name.toLowerCase() === 'unknown artist') continue;
    const norm = name.toLowerCase();
    if (!out.some((a) => a.toLowerCase() === norm)) out.push(name);
  }
  return out;
}

/**
 * Limpa os candidatos: fora o que já está na fila, fora repetidos, e fora o
 * que não é do YouTube (é a única fonte que a app sabe tocar).
 *
 * Sem o filtro da fila, o rádio começava a repetir as faixas que o
 * utilizador acabou de ouvir — que é a maneira mais rápida de o desligar.
 */
export function filterRadioCandidates(
  candidates: Track[],
  exclude: Track[],
  keyOf: (t: Track) => string,
  limit: number = RADIO_BATCH
): Track[] {
  const seen = new Set(exclude.map(keyOf));
  const out: Track[] = [];
  for (const t of candidates) {
    if (out.length >= limit) break;
    if (!t?.sourceId || t.source !== 'youtube') continue;
    const k = keyOf(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/**
 * Fora o que não é música, menos o que ele guardou.
 *
 * O rádio também vai ao Flow e à pesquisa do YouTube, e a pesquisa devolve
 * VÍDEOS: um "6 Hour Timer" de 7 h passava por faixa. O que está na biblioteca
 * passa sempre -- foi ele que o escolheu, mesmo que dure vinte minutos. O
 * critério (`pareceMusica`) entra por parâmetro pela mesma razão que o
 * `artistOf`: este módulo não importa nada em runtime.
 */
export function onlyPlausibleMusic(
  candidates: Track[],
  isKnown: (t: Track) => boolean,
  looksLikeMusic: (t: Track) => boolean
): Track[] {
  return candidates.filter((t) => isKnown(t) || looksLikeMusic(t));
}

/** Baralha sem enviesamento, para dois arranques do rádio não darem o mesmo. */
export function shuffleCandidates(tracks: Track[], rng: () => number = Math.random): Track[] {
  const out = tracks.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Se o rádio deve entrar agora.
 *
 * `upcomingCount` é quantas faixas faltam MESMO tocar (com shuffle não é
 * `queue.length - queueIndex - 1`) — daí vir de fora, do `upcomingQueue()`.
 * Com repeat ligado a fila nunca acaba, e o rádio não tem que se meter.
 */
/**
 * Quantas faixas de um lote do rádio podem ser dos artistas que se estava a
 * ouvir: um quarto. O resto é de artistas com um tom parecido (João, 25/9:
 * "não tem de ser tudo Morad só porque cliquei em Morad"). Quem tinha muitas
 * músicas dele na biblioteca recebia um lote só dele -- era a primeira fonte.
 */
export const PARTE_DO_MESMO_ARTISTA = 0.25;

/**
 * Tira de `faixas` as que passam da parte do mesmo artista, mantendo a ordem.
 * `artistaDe` e `chave` entram por parâmetro: este ficheiro não importa nada.
 */
export function limitarMesmoArtista<T>(
  faixas: readonly T[],
  sementes: readonly string[],
  artistaDe: (t: T) => string,
  chave: (nome: string) => string,
  limite: number,
): T[] {
  const deles = new Set(sementes.map(chave).filter(Boolean));
  const maximo = Math.max(1, Math.ceil(limite * PARTE_DO_MESMO_ARTISTA));
  let usados = 0;
  return faixas.filter((t) => {
    if (!deles.has(chave(artistaDe(t)))) return true;
    usados++;
    return usados <= maximo;
  });
}

/**
 * O lote do rádio sem repetir descobertas (28/9).
 *
 * O rádio tira as novas da MESMA descoberta do Smart Shuffle e, sem memória,
 * voltava a pôr sempre as primeiras dela: o João ouviu "deaf note" e "Drunk And
 * Nasty" dias a fio, sugeridas uma só vez pelo Smart Shuffle e depois repostas
 * pelo rádio no fim de cada lista. As novas já descobertas nos últimos 30 dias
 * (`jaDescoberta`) saem da mistura; só entram, no fim, se sem elas o lote não
 * chegasse ao `limite` e `comRepetidas` -- uma fila que continua é melhor do
 * que o silêncio. As conhecidas (a biblioteca dele) não passam por aqui.
 */
export function loteSemRepetir<T>(
  conhecidas: readonly T[],
  novas: readonly T[],
  recente: (t: T) => boolean,
  limite: number,
  comRepetidas: boolean,
  misturar: (conhecidas: readonly T[], novas: readonly T[], limite: number) => T[],
  /** Quando foi ouvida (ou sugerida) pela última vez: as repetidas mais antigas entram primeiro. */
  quando: (t: T) => number = () => 0,
): T[] {
  // 15/10: as tuas também passam pela memória. Só as novas passavam, e as da
  // biblioteca (e o que se ouviu) voltavam lote após lote, dia após dia.
  const lote = misturar(conhecidas.filter((t) => !recente(t)), novas.filter((t) => !recente(t)), limite);
  if (!comRepetidas || lote.length >= limite) return lote;
  // Repetidas só no fim, e as que se ouviram há MAIS tempo primeiro: a de
  // ontem antes da de há uma hora.
  const repetidas = [...conhecidas, ...novas].filter(recente)
    .map((t, i) => ({ t, i, q: quando(t) }))
    .sort((a, b) => a.q - b.q || a.i - b.i)
    .map((x) => x.t);
  return [...lote, ...repetidas.slice(0, limite - lote.length)];
}

/**
 * O que se ouviu nas últimas 24 h não volta pelo Radio nem pelo autoplay
 * (15/10, "deixo a tocar sozinho muito tempo e começam a repetir-se as
 * mesmas"). Uma descoberta continua a ter os 30 dias da memória do Smart
 * Shuffle; isto apanha as tuas, que essa memória nunca guardou.
 */
export const JANELA_DAS_OUVIDAS_MS = 24 * 60 * 60 * 1000;

/** A última vez que se ouviu alguma das identidades de uma música, ou 0. */
export function ouvidaEm(chaves: readonly string[], ouvidas: ReadonlyMap<string, number>): number {
  let em = 0;
  for (const k of chaves) {
    const q = ouvidas.get(k);
    if (q != null && q > em) em = q;
  }
  return em;
}

/**
 * Por onde o Radio continua quando um lote vem vazio (5/10, "deve ser
 * infinito"). O Radio pedia sempre às MESMAS âncoras e saltava tudo o que a
 * memória de 30 dias já tinha descoberto: ao fim de umas horas (ou de uns dias
 * de Radio) o catálogo dessas âncoras secava e a fila acabava -- só desligar e
 * ligar, que recalculava as âncoras, o fazia voltar. As tentativas vão por
 * ordem e param na primeira que traz música. 15/10: primeiro CAMINHA com a
 * memória (as âncoras, o que se OUVIU nesta sessão, as últimas que tocaram) e
 * só depois a larga -- largá-la logo à segunda era repor as descobertas de há
 * uns dias em vez de ir a sementes novas, e era isso que se ouvia a repetir
 * numa tarde de Radio. Repetidas saem (as mesmas sementes com a mesma memória
 * não se pedem duas vezes).
 */
export type TentativaDoRadio<T> = {
  sementes: readonly T[];
  semMemoria: boolean;
  /** A última: aceita repetidas, as ouvidas há mais tempo primeiro (15/10). */
  comRepetidas?: boolean;
};
export function tentativasDoRadio<T>(
  tentativas: readonly TentativaDoRadio<T>[],
  chave: (t: T) => string,
): TentativaDoRadio<T>[] {
  const vistas = new Set<string>();
  return tentativas.filter((t) => {
    if (t.sementes.length === 0) return false;
    const k = `${t.semMemoria ? 1 : 0}${t.comRepetidas ? 1 : 0}|${t.sementes.map(chave).join(',')}`;
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
}

/**
 * Sem o mesmo artista colado (5/10): reordena um lote para nenhum artista se
 * repetir dentro de `distancia` faixas, contando com o fim da fila que já lá
 * está (`antes`, as chaves dos artistas das últimas). Escolhe sempre a
 * primeira que serve, por isso a ordem do lote mexe o mínimo; quando nenhuma
 * serve, vai a primeira (um lote só de um artista não fica preso).
 */
export function espalharArtistas<T>(
  lote: readonly T[], artistaDe: (t: T) => string, antes: readonly string[] = [], distancia = 3,
): T[] {
  const restantes = [...lote];
  const recentes = [...antes].slice(-distancia);
  const saida: T[] = [];
  while (restantes.length) {
    // A distância maior que der; sem nenhuma, a primeira (nunca fica preso).
    let i = -1;
    for (let d = distancia; d >= 1 && i < 0; d--) {
      const perto = recentes.slice(-d);
      i = restantes.findIndex((t) => !perto.includes(artistaDe(t)));
    }
    if (i < 0) i = 0;
    const [t] = restantes.splice(i, 1);
    saida.push(t);
    recentes.push(artistaDe(t));
    if (recentes.length > distancia) recentes.shift();
  }
  return saida;
}

export function shouldExtendWithRadio(
  enabled: boolean,
  hasCurrent: boolean,
  upcomingCount: number,
  repeatMode: 'off' | 'all' | 'one'
): boolean {
  return enabled && hasCurrent && repeatMode === 'off' && upcomingCount === 0;
}
