/**
 * Scrobbling no ListenBrainz (16/11). O João: "achei que já havia um tipo de
 * scrobbling; muito cuidado com os gastos da base de dados". Não havia: havia a
 * regra de quando uma escuta conta, que é a do Last.fm (lib/contagemDeEscuta.ts).
 *
 * Nenhum pedido ao Supabase: o aparelho fala direto com o ListenBrainz, com o
 * token de cada pessoa, guardado só no aparelho (`lib/segredos.ts`). Cada
 * aparelho manda as suas escutas -- a mesma música não conta duas vezes, porque
 * só conta onde tocou.
 *
 * - "A tocar agora" quando uma música começa; a escuta quando ela conta (a
 *   metade, ou quatro minutos), com a hora a que começou.
 * - Sem rede, ou com o ListenBrainz em baixo, a escuta fica numa fila no
 *   aparelho (até `MAXIMO_POR_ENVIAR`) e vai num lote ("import") da próxima vez.
 * - A escuta privada (Private listening) não manda nada, como no Spotify.
 *
 * O Last.fm precisa de uma chave da app (uma API key e um segredo, criados na
 * conta do João em last.fm/api): fica para quando houver.
 *
 * Puro: `scripts/test-scrobbling.ts`.
 */

export const API_DO_LISTENBRAINZ = 'https://api.listenbrainz.org';
/** O teto da fila no aparelho: mais do que isto, saem as mais antigas. */
export const MAXIMO_POR_ENVIAR = 300;
/** Quantas vão num lote (o ListenBrainz aceita até 1000 por pedido). */
export const POR_LOTE = 100;

export type MusicaParaScrobble = {
  titulo: string;
  artista: string;
  album?: string | null;
  duracaoMs?: number | null;
  /** O vídeo de onde se ouviu, para o ListenBrainz ligar a escuta a ele. */
  videoId?: string | null;
};

export type EscutaPorEnviar = MusicaParaScrobble & { /** segundos (unix) */ em: number };

type Metadados = {
  artist_name: string;
  track_name: string;
  release_name?: string;
  additional_info: Record<string, string | number>;
};

/** Sem título ou sem artista não há escuta que o ListenBrainz aceite. */
export function podeScrobblar(m: Pick<MusicaParaScrobble, 'titulo' | 'artista'>): boolean {
  return !!m.titulo.trim() && !!m.artista.trim();
}

function metadados(m: MusicaParaScrobble, versao: string): Metadados {
  const info: Record<string, string | number> = {
    media_player: 'Duotone',
    submission_client: 'Duotone',
    submission_client_version: versao,
  };
  if (m.duracaoMs && m.duracaoMs > 0) info.duration_ms = Math.round(m.duracaoMs);
  if (m.videoId && /^[\w-]{11}$/.test(m.videoId)) info.origin_url = `https://music.youtube.com/watch?v=${m.videoId}`;
  return {
    artist_name: m.artista.trim().slice(0, 500),
    track_name: m.titulo.trim().slice(0, 500),
    ...(m.album?.trim() ? { release_name: m.album.trim().slice(0, 500) } : {}),
    additional_info: info,
  };
}

/** O "a tocar agora" (sem hora: o ListenBrainz não o guarda como escuta). */
export function pedidoDeAgora(m: MusicaParaScrobble, versao: string) {
  return { listen_type: 'playing_now', payload: [{ track_metadata: metadados(m, versao) }] };
}

/** Uma escuta, ou um lote das que ficaram por enviar. */
export function pedidoDeEscutas(escutas: readonly EscutaPorEnviar[], versao: string) {
  return {
    listen_type: escutas.length === 1 ? 'single' : 'import',
    payload: escutas.map((e) => ({ listened_at: Math.floor(e.em), track_metadata: metadados(e, versao) })),
  };
}

/** Junta à fila do aparelho, sem repetir a mesma escuta e com o teto. */
export function juntarAFila(fila: readonly EscutaPorEnviar[], nova: EscutaPorEnviar): EscutaPorEnviar[] {
  const mesma = (a: EscutaPorEnviar) => a.em === nova.em && a.titulo === nova.titulo && a.artista === nova.artista;
  const sem = fila.filter((e) => !mesma(e));
  return [...sem, nova].slice(-MAXIMO_POR_ENVIAR);
}

/** O que vem do disco, limpo. */
export function lerFila(bruto: unknown): EscutaPorEnviar[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.flatMap((v): EscutaPorEnviar[] => {
    if (!v || typeof v !== 'object') return [];
    const r = v as Record<string, unknown>;
    if (typeof r.titulo !== 'string' || typeof r.artista !== 'string' || typeof r.em !== 'number') return [];
    return [{
      titulo: r.titulo, artista: r.artista, em: r.em,
      album: typeof r.album === 'string' ? r.album : null,
      duracaoMs: typeof r.duracaoMs === 'number' ? r.duracaoMs : null,
      videoId: typeof r.videoId === 'string' ? r.videoId : null,
    }];
  }).slice(-MAXIMO_POR_ENVIAR);
}

/** Um erro que vale tentar outra vez (sem rede, o servidor em baixo, demasiados pedidos). */
export function valeTentarDeNovo(estado: number | null): boolean {
  return estado == null || estado === 429 || estado >= 500;
}

/** O token tem a forma de um token do ListenBrainz (um UUID). */
export function pareceTokenDoListenBrainz(t: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t.trim());
}

export const FRASES_DO_SCROBBLING = {
  titulo: 'ListenBrainz',
  desligado: 'Off',
  ligado: (utilizador: string) => `Scrobbling as ${utilizador}`,
  pedirToken: 'Paste your ListenBrainz user token',
  ondeEsta: 'Find it at listenbrainz.org, in Settings › User token.',
  tokenMau: "That doesn't look like a ListenBrainz token.",
  tokenRecusado: 'ListenBrainz refused this token.',
  ligou: (utilizador: string) => `Scrobbling to ListenBrainz as ${utilizador}`,
  desligar: 'Disconnect ListenBrainz',
  desligou: 'ListenBrainz disconnected',
} as const;
