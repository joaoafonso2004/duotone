/**
 * Os sítios da app, ditos uma vez para as duas plataformas (5/10, auditoria de
 * consistência T1/T2, `docs/AUDITORIA-CONSISTENCIA-PC-IOS.md`).
 *
 * O PC navega por uma união `Route` em kebab (`desktop/rotas.ts`) e o iPhone
 * pelo React Navigation, com nomes mistos (`LibraryGroup`, `Prateleira`...).
 * Os mesmos destinos tinham nomes e parâmetros diferentes, e os componentes
 * partilhados (o perfil, o Social) recebiam uma função por destino -- cada ecrã
 * ligava as que se lembrava, e uma esquecida desaparecia sem erro (o "You two"
 * do PC). Agora um componente diz `irPara({ tipo: 'artista', nome })` e cada
 * plataforma traduz AQUI, numa tabela só; o que não tem tradução não aparece
 * (`podeIrPara`). As rotas reais ficam onde estão.
 *
 * Sem imports em runtime (só tipos): testável em Node puro
 * (`scripts/test-destinos.ts`).
 */
import type { Recente } from './recentes';

export type Plataforma = 'ios' | 'pc';

export type Destino =
  /** A página principal (Home no iPhone, a página "search" no PC). */
  | { tipo: 'inicio' }
  | { tipo: 'gostadas' }
  | { tipo: 'artistas' }
  | { tipo: 'playlists' }
  | { tipo: 'social' }
  /** Sem `userId`, o próprio. */
  | { tipo: 'perfil'; userId?: string }
  | { tipo: 'definicoes' }
  | { tipo: 'a-tocar' }
  | { tipo: 'artista'; nome: string }
  | { tipo: 'album'; nome: string }
  /** `editar`: abre já na edição (iPhone). */
  | { tipo: 'playlist'; id: string; nome?: string; editar?: boolean }
  /** Uma mistura montada pela app (estilo, rádio, década), por id. */
  | { tipo: 'mistura'; id: string; nome: string }
  /** Uma prateleira das recomendações, pelo nome dela (`NomeDaPrateleira`). */
  | { tipo: 'prateleira'; nome: string; titulo: string }
  | { tipo: 'mistura-do-dia' }
  | { tipo: 'conversa'; kind: 'friend' | 'group'; id: string }
  /** Sem `userId`, as próprias. */
  | { tipo: 'estatisticas'; userId?: string }
  | { tipo: 'retrospetiva'; ano?: number; userId?: string }
  | { tipo: 'voces-os-dois'; userId: string; nome?: string }
  | { tipo: 'downloads' }
  | { tipo: 'library-check' }
  | { tipo: 'importar' };

export type TipoDeDestino = Destino['tipo'];
type DoTipo<T extends TipoDeDestino> = Extract<Destino, { tipo: T }>;

/**
 * A rota do PC, com a forma da `Route` de `desktop/rotas.ts` (o
 * `test-destinos.ts` confere os nomes contra esse ficheiro).
 */
export type RotaDoPc = { name: string } & Record<string, unknown>;

/**
 * Onde fica no iPhone: um SEPARADOR (muda de secção) ou um ecrã que entra na
 * PILHA do separador onde se está (todos os detalhes vivem em todas as pilhas,
 * `RootNavigator.tsx`).
 */
export type RotaDoIphone =
  | { onde: 'separador'; ecra: string; params?: object }
  | { onde: 'pilha'; ecra: string; params?: object };

type Tabela<R> = { [T in TipoDeDestino]: ((d: DoTipo<T>) => R) | null };

const NO_PC: Tabela<RotaDoPc> = {
  inicio: () => ({ name: 'search' }),
  gostadas: () => ({ name: 'songs' }),
  artistas: () => ({ name: 'artists' }),
  playlists: () => ({ name: 'playlists' }),
  social: () => ({ name: 'social' }),
  perfil: (d) => (d.userId ? { name: 'friend-profile', userId: d.userId } : { name: 'profile' }),
  definicoes: () => ({ name: 'settings' }),
  'a-tocar': () => ({ name: 'now-playing' }),
  artista: (d) => ({ name: 'artist', value: d.nome }),
  // Os álbuns abrem num diálogo no PC (useDialogoDoAlbum), não numa página.
  album: null,
  playlist: (d) => ({ name: 'playlist', id: d.id, title: d.nome || 'Playlist' }),
  mistura: (d) => ({ name: 'mistura', id: d.id, titulo: d.nome }),
  // As prateleiras e a Daily mix vivem na própria página principal do PC.
  prateleira: null,
  'mistura-do-dia': null,
  // O PC mostra a conversa ao lado da lista, na página Social.
  conversa: (d) => (d.kind === 'group' ? { name: 'social', groupId: d.id } : { name: 'social', friendId: d.id }),
  estatisticas: (d) => ({ name: 'stats', userId: d.userId }),
  retrospetiva: (d) => ({ name: 'retrospetiva', ano: d.ano, userId: d.userId }),
  'voces-os-dois': (d) => ({ name: 'voces-os-dois', userId: d.userId, nome: d.nome }),
  // O leitor do PC não guarda áudio.
  downloads: null,
  'library-check': () => ({ name: 'library-check' }),
  importar: () => ({ name: 'import' }),
};

const NO_IPHONE: Tabela<RotaDoIphone> = {
  inicio: () => ({ onde: 'separador', ecra: 'Search' }),
  gostadas: () => ({ onde: 'separador', ecra: 'Songs' }),
  artistas: () => ({ onde: 'separador', ecra: 'Artists' }),
  playlists: () => ({ onde: 'separador', ecra: 'Playlists' }),
  social: () => ({ onde: 'separador', ecra: 'Social' }),
  perfil: (d) => (d.userId ? { onde: 'pilha', ecra: 'FriendProfile', params: { userId: d.userId } } : { onde: 'separador', ecra: 'Profile' }),
  definicoes: () => ({ onde: 'pilha', ecra: 'Settings' }),
  // O leitor é uma camada por cima de tudo, não um sítio para onde se vai.
  'a-tocar': null,
  artista: (d) => ({ onde: 'pilha', ecra: 'LibraryGroup', params: { type: 'artist', name: d.nome } }),
  album: (d) => ({ onde: 'pilha', ecra: 'LibraryGroup', params: { type: 'album', name: d.nome } }),
  playlist: (d) => ({ onde: 'pilha', ecra: 'PlaylistDetail', params: { id: d.id, name: d.nome || 'Playlist', ...(d.editar ? { editar: true } : {}) } }),
  mistura: (d) => ({ onde: 'pilha', ecra: 'Prateleira', params: { titulo: d.nome, fonte: { tipo: 'mistura', id: d.id } } }),
  prateleira: (d) => ({ onde: 'pilha', ecra: 'Prateleira', params: { titulo: d.titulo, fonte: { tipo: 'prateleira', nome: d.nome } } }),
  'mistura-do-dia': () => ({ onde: 'pilha', ecra: 'Prateleira', params: { titulo: 'Daily mix', fonte: { tipo: 'doDia' } } }),
  conversa: (d) => ({ onde: 'pilha', ecra: 'Conversa', params: { kind: d.kind, id: d.id } }),
  estatisticas: (d) => ({ onde: 'pilha', ecra: 'ListeningStats', params: d.userId ? { userId: d.userId } : undefined }),
  retrospetiva: (d) => ({ onde: 'pilha', ecra: 'Retrospetiva', params: d.ano === undefined && !d.userId ? undefined : { ano: d.ano, userId: d.userId } }),
  'voces-os-dois': (d) => ({ onde: 'pilha', ecra: 'VocesOsDois', params: { userId: d.userId, nome: d.nome } }),
  downloads: () => ({ onde: 'pilha', ecra: 'Downloads' }),
  'library-check': () => ({ onde: 'pilha', ecra: 'LibraryCheck' }),
  importar: () => ({ onde: 'pilha', ecra: 'ImportYouTube' }),
};

export const TIPOS_DE_DESTINO = Object.keys(NO_PC) as TipoDeDestino[];

export function rotaNoPc(d: Destino): RotaDoPc | null {
  const f = NO_PC[d.tipo] as ((d: Destino) => RotaDoPc) | null;
  return f ? f(d) : null;
}

export function rotaNoIphone(d: Destino): RotaDoIphone | null {
  const f = NO_IPHONE[d.tipo] as ((d: Destino) => RotaDoIphone) | null;
  return f ? f(d) : null;
}

/** Se a plataforma tem esse sítio. O que não tem, não aparece -- nunca um botão que não faz nada. */
export function podeIrPara(p: Plataforma, tipo: TipoDeDestino): boolean {
  return (p === 'pc' ? NO_PC : NO_IPHONE)[tipo] !== null;
}

/**
 * As portas que a casca de cada plataforma mostra SEMPRE: a lateral do PC (as
 * secções, a linha do perfil com a roda dentada, a barra do leitor) e a barra
 * de separadores do iPhone. Um componente não as repete -- era a decisão do
 * perfil do PC ("a lateral já tem o Social e as Definições"), escrita à mão em
 * cada ecrã. No iPhone o Social é um separador escondido e as Definições não
 * estão na barra: o perfil mostra os dois botões.
 */
export const PORTAS_DA_CASCA: Record<Plataforma, ReadonlySet<TipoDeDestino>> = {
  pc: new Set<TipoDeDestino>(['inicio', 'gostadas', 'artistas', 'playlists', 'social', 'perfil', 'definicoes', 'a-tocar']),
  ios: new Set<TipoDeDestino>(['inicio', 'gostadas', 'artistas', 'playlists', 'perfil']),
};

/** Mostrar um atalho para este sítio dentro de uma página: existe, e a casca ainda não o mostra. */
export function mostrarPorta(p: Plataforma, tipo: TipoDeDestino): boolean {
  return podeIrPara(p, tipo) && !PORTAS_DA_CASCA[p].has(tipo);
}

/** O sítio de onde se ouviu ("Jump back in"), igual nas duas plataformas. */
export function destinoDoRecente(r: Pick<Recente, 'tipo' | 'nome' | 'id'>): Destino | null {
  switch (r.tipo) {
    case 'guardadas': return { tipo: 'gostadas' };
    case 'playlist': return r.id ? { tipo: 'playlist', id: r.id, nome: r.nome } : null;
    case 'artista': return { tipo: 'artista', nome: r.nome };
    case 'album': return { tipo: 'album', nome: r.nome };
    case 'mistura': return r.id ? { tipo: 'mistura', id: r.id, nome: r.nome } : null;
    case 'prateleira':
      if (r.id === 'doDia') return { tipo: 'mistura-do-dia' };
      return r.id ? { tipo: 'prateleira', nome: r.id, titulo: r.nome } : null;
    default: return null;
  }
}
