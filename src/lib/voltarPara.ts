/**
 * O nome da página para onde o "voltar" do PC leva (5/10, auditoria de
 * consistência N7).
 *
 * Os botões tinham o destino escrito à mão ("Back to artists", "Back to
 * playlists", "Settings"), mas todos chamam o `back()`, que volta ao
 * HISTÓRICO: um artista aberto pela pesquisa dizia "Back to artists" e voltava
 * à pesquisa. Agora o botão diz o nome da página que está mesmo atrás, como o
 * chevron do iPhone. Puro e sem imports (a forma da rota vem por estrutura).
 */
export type RotaComNome =
  | { name: 'search' | 'songs' | 'artists' | 'playlists' | 'profile' | 'settings' | 'social' | 'now-playing' | 'import' | 'spotify-import' | 'library-check' }
  | { name: 'friend-profile'; userId: string }
  | { name: 'artist'; value: string }
  | { name: 'playlist'; id: string; title: string }
  | { name: 'mistura'; id: string; titulo: string }
  | { name: 'stats'; userId?: string };

/** Os nomes das secções são os da barra lateral. */
const NOMES: Record<string, string> = {
  search: 'Search', songs: 'Liked Songs', artists: 'Artists', playlists: 'Playlists',
  social: 'Social', profile: 'Profile', settings: 'Settings', 'now-playing': 'Now Playing',
  import: 'Import', 'spotify-import': 'Spotify import', 'library-check': 'Library check',
  'friend-profile': 'Profile', stats: 'Listening stats',
};

export const MAXIMO_DO_NOME = 28;

/** Sem histórico, o `back()` vai às Playlists -- e o botão di-lo. */
export const ROTA_SEM_HISTORICO = { name: 'playlists' } as const;

export function nomeDaRota(rota: RotaComNome | null | undefined): string {
  const r = rota ?? ROTA_SEM_HISTORICO;
  const nome = r.name === 'artist' ? r.value
    : r.name === 'playlist' ? r.title
    : r.name === 'mistura' ? r.titulo
    : NOMES[r.name] ?? 'Back';
  const limpo = (nome ?? '').trim() || NOMES[r.name] || 'Back';
  return limpo.length > MAXIMO_DO_NOME ? `${limpo.slice(0, MAXIMO_DO_NOME - 1).trimEnd()}…` : limpo;
}
