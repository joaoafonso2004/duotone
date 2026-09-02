import type { Ionicons } from '@expo/vector-icons';
import type { Track } from '../types';

/**
 * Navegação do desktop: as rotas e o contrato que as páginas partilham.
 *
 * Vive à parte porque era isto que obrigava as doze páginas a ficarem todas no
 * mesmo ficheiro — cada uma precisa de `Route` para navegar e de
 * `CommonPageProps` para tocar, avisar e abrir o menu de uma faixa. Com os
 * tipos aqui, cada página passa a ser um módulo seu.
 */

export type PrimaryRoute =
  | 'search' | 'songs' | 'artists' | 'playlists'
  | 'profile' | 'settings' | 'social' | 'now-playing';

export type Route =
  | { name: Exclude<PrimaryRoute,'social'> }
  | { name:'social';friendId?:string;groupId?:string }
  | { name:'friend-profile';userId:string }
  | { name: 'artist'; value: string }
  | { name: 'playlist'; id: string; title: string }
  | { name: 'import' }
  | { name: 'stats';userId?:string }
  | { name: 'spotify-import' };

/** O que se pode partilhar com um amigo. */
export type ShareTarget =
  | { itemType: 'track'; item: Track; name: string }
  | { itemType: 'playlist'; item: { id: string; name: string }; name: string };

/**
 * O que quase todas as páginas precisam: tocar uma faixa (opcionalmente com a
 * fila em que ela vive), mostrar um aviso, e abrir o menu de contexto.
 */
export interface CommonPageProps {
  play: (track: Track, queue?: Track[]) => void;
  notify: (message: string) => void;
  more: (track: Track) => void;
}

export type NavegarFn = (route: Route) => void;

/** Os separadores da barra lateral, por ordem. */
export const PRIMARY: {
  id: PrimaryRoute;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: 'search', label: 'Search', icon: 'search-outline' },
  { id: 'songs', label: 'Liked Songs', icon: 'heart-outline' },
  { id: 'artists', label: 'Artists', icon: 'mic-outline' },
  { id: 'playlists', label: 'Playlists', icon: 'albums-outline' },
  { id: 'social', label: 'Social', icon: 'people-outline' },
];
