// A app é só YouTube. 'spotify' permanece no union apenas por compatibilidade
// com o constraint da BD e dados antigos — já não é usado em lado nenhum.
export type Source = 'youtube' | 'spotify';

export interface Track {
  /** id na base de dados (presente quando a faixa já foi guardada) */
  id?: string;
  source: Source;
  sourceId: string;
  title: string;
  artist: string | null;
  /** nome do álbum (quando disponível); geralmente null no YouTube */
  album: string | null;
  artworkUrl: string | null;
  durationSeconds: number | null;
}

export interface Playlist {
  id: string;
  name: string;
  createdAt: string;
  trackCount: number;
  /** até 4 artworks para a colagem */
  artworks: string[];
}

export interface PlaylistTrack extends Track {
  id: string;
  position: number;
}

export interface Profile {
  id: string;
  email: string | null;
  name: string | null;
}

export interface YtPlaylistItem {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string | null;
}
