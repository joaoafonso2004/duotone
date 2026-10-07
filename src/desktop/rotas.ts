import Ionicons from '@expo/vector-icons/Ionicons';
import { ICONES } from '../lib/icones';
import type { Track } from '../types';
import type { DiscoveryContext } from '../lib/contextoDaDescoberta';
import type { OrigemDaFila } from '../lib/origemDaFila';

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
  | { name: 'playlist'; id: string; title: string; pessoas?: boolean }
  /** Uma mistura que a app montou -- estilo, radio, decada ou playlist. Vive na
   *  store das recomendacoes e nao na base de dados, por isso viaja por id. */
  | { name: 'mistura'; id: string; titulo: string }
  | { name: 'import' }
  | { name: 'stats';userId?:string }
  | { name: 'spotify-import' }
  /** O Library check, que se abre das Definições. */
  | { name: 'library-check' }
  /** "You two" e o ano em revista (5/10): só existiam no iPhone. */
  | { name: 'voces-os-dois'; userId: string; nome?: string }
  | { name: 'retrospetiva'; ano?: number; userId?: string };

/** O que se pode partilhar com um amigo. */
export type ShareTarget =
  | { itemType: 'track'; item: Track; name: string }
  | { itemType: 'playlist'; item: { id: string; name: string }; name: string };

/**
 * O que quase todas as páginas precisam: tocar uma faixa (opcionalmente com a
 * fila em que ela vive), mostrar um aviso, e abrir o menu de contexto.
 */
export interface CommonPageProps {
  /** `origem`: de onde vem a lista, para o Now Playing dizer "From ...". Ver lib/origemDaFila.ts. */
  play: (track: Track, queue?: Track[], discoveryContext?: DiscoveryContext, origem?: OrigemDaFila) => void;
  /**
   * Tocar numa MÚSICA (a linha de uma tabela, um cartão): com "Start Radio
   * from a song" é o Radio a partir dela (`tocarMusica` na store). O Play de
   * uma lista usa o `play`.
   */
  tocarMusica: (track: Track, queue?: Track[], discoveryContext?: DiscoveryContext, origem?: OrigemDaFila) => void;
  notify: (message: string) => void;
  /**
   * O menu da faixa (lib/menuDaFaixa.ts). Com `origem.fila`, abriu numa linha
   * da fila -- o índice real -- e ganha o "Remove from queue".
   */
  more: (track: Track, discoveryContext?: DiscoveryContext, origem?: { fila?: number }) => void;
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
  { id: 'artists', label: 'Artists', icon: `${ICONES.artistas}-outline` },
  { id: 'playlists', label: 'Playlists', icon: `${ICONES.playlists}-outline` },
  { id: 'social', label: 'Social', icon: `${ICONES.social}-outline` },
];
