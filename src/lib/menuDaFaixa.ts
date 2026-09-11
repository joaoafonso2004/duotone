/**
 * O menu de uma faixa: as mesmas ações, pela mesma ordem e com os mesmos
 * nomes em todo o lado.
 *
 * Havia sete menus e cada um dizia as coisas à sua maneira. A fila do iPhone
 * dizia "Partilhar com um amigo", o leitor "Share with a friend", as listas
 * "Share with a friend…" e o PC "Share with friends or groups…"; o PC não tinha
 * "Play next", o leitor chamava "Like" ao guardar, e cada ecrã do iPhone
 * escolhia a sua lista e a sua ordem. Quem mudava de ecrã tinha de voltar a
 * procurar.
 *
 * Agora quem decide é isto, e os menus só desenham. Um menu novo não escreve
 * rótulos: pede-os aqui e liga cada `id` a uma função.
 *
 * ## O que muda de sítio para sítio, e porquê
 *
 *  - **O que não se aplica não aparece.** No leitor não há "Play now" (já está
 *    a tocar); numa linha da fila não há "Play next" nem "Add to queue" (já lá
 *    está); no PC não há download (o leitor do PC é o player oficial do YouTube
 *    e não guarda áudio -- ver as Definições no CLAUDE.md). As de contexto --
 *    tirar da playlist, tirar da fila -- só onde há playlist ou fila.
 *  - **O que não se pode fazer AGORA fica à vista, a dizer porquê.** Sem rede,
 *    dentro de um Jam, numa playlist que não é tua. Uma ação que desaparece
 *    obriga a adivinhar onde foi parar; uma que diz "Needs internet" já
 *    respondeu.
 *
 * Tudo em inglês, como o resto da interface. Sem imports de runtime:
 * `scripts/test-menu-da-faixa.ts` corre em Node puro.
 */

export type IdDaAcao =
  | 'tocar-agora'
  | 'tocar-a-seguir'
  | 'por-na-fila'
  | 'guardar'
  | 'por-em-playlist'
  | 'ver-artista'
  | 'partilhar'
  | 'descarregar'
  | 'recomendacoes'
  | 'tirar-da-playlist'
  | 'tirar-da-fila';

/** A ordem de todos os menus. As de contexto e destrutivas ficam no fim. */
export const ORDEM: readonly IdDaAcao[] = [
  'tocar-agora',
  'tocar-a-seguir',
  'por-na-fila',
  'guardar',
  'por-em-playlist',
  'ver-artista',
  'partilhar',
  'descarregar',
  'recomendacoes',
  'tirar-da-playlist',
  'tirar-da-fila',
];

/** Nomes do Ionicons, escritos aqui para nenhum menu escolher o seu. */
export type IconeDoMenu =
  | 'play-circle-outline'
  | 'play-forward-outline'
  | 'list-outline'
  | 'heart'
  | 'heart-outline'
  | 'albums-outline'
  | 'mic-outline'
  | 'share-social-outline'
  | 'arrow-down-circle-outline'
  | 'checkmark-circle'
  | 'options-outline'
  | 'trash-outline';

/** Porque é que uma ação não se pode fazer agora. Curto: cabe numa linha por baixo do rótulo. */
export const MOTIVOS = {
  semRede: 'Needs internet',
  naoDescarregada: 'Not downloaded · needs internet',
  aVerificar: 'Checking your library…',
  semArtista: 'Artist unknown',
  soODono: 'Only the owner can remove songs',
  filaDoJam: 'The Jam queue is shared · change it in the Jam',
  filaMudou: 'The queue changed',
} as const;

/** Onde o menu abriu. */
export type OndeAbriu = 'lista' | 'leitor' | 'fila';

export interface ContextoDoMenu {
  plataforma: 'ios' | 'pc';
  onde: OndeAbriu;
  semRede: boolean;
  /**
   * A faixa toca sem rede (está descarregada). No PC é sempre `false`: o
   * leitor de lá precisa de rede para tudo.
   */
  tocaSemRede: boolean;
  /** `null` enquanto não se sabe (a biblioteca ainda não foi lida). */
  guardada: boolean | null;
  /** Faixa do YouTube, no iPhone. */
  podeDescarregar: boolean;
  descarregada: boolean;
  /** Um nome de artista a sério, e não o "Unknown artist" do `displayArtist`. */
  temArtista: boolean;
  /** Presente quando o menu abriu dentro de uma playlist. */
  playlist?: { podeEditar: boolean } | null;
  /** Presente quando o menu abriu numa linha da fila (que não a que toca). */
  fila?: { emJam: boolean; mudou: boolean } | null;
}

export interface AcaoDoMenu {
  id: IdDaAcao;
  rotulo: string;
  icone: IconeDoMenu;
  destrutiva: boolean;
  /** Porque não se pode fazer agora, ou `null`. Nunca some por isso. */
  indisponivel: string | null;
}

function aplicaSe(id: IdDaAcao, c: ContextoDoMenu): boolean {
  switch (id) {
    case 'tocar-agora': return c.onde !== 'leitor';
    case 'tocar-a-seguir':
    case 'por-na-fila': return c.onde === 'lista';
    case 'descarregar': return c.plataforma === 'ios' && c.podeDescarregar;
    case 'tirar-da-playlist': return c.onde === 'lista' && !!c.playlist;
    case 'tirar-da-fila': return c.onde === 'fila' && !!c.fila;
    default: return true;
  }
}

function descrever(id: IdDaAcao, c: ContextoDoMenu): AcaoDoMenu {
  const semRede = c.semRede ? MOTIVOS.semRede : null;
  const tocar = c.semRede && !c.tocaSemRede
    ? (c.plataforma === 'ios' ? MOTIVOS.naoDescarregada : MOTIVOS.semRede)
    : null;
  const acao = (rotulo: string, icone: IconeDoMenu, indisponivel: string | null, destrutiva = false): AcaoDoMenu =>
    ({ id, rotulo, icone, destrutiva, indisponivel });

  switch (id) {
    case 'tocar-agora': return acao('Play now', 'play-circle-outline', tocar);
    case 'tocar-a-seguir': return acao('Play next', 'play-forward-outline', tocar);
    case 'por-na-fila': return acao('Add to queue', 'list-outline', tocar);
    case 'guardar': return c.guardada
      ? acao('Remove from library', 'heart', semRede)
      : acao('Save to library', 'heart-outline', semRede ?? (c.guardada === null ? MOTIVOS.aVerificar : null));
    case 'por-em-playlist': return acao('Add to playlist…', 'albums-outline', semRede);
    case 'ver-artista': return acao('View artist', 'mic-outline', c.temArtista ? null : MOTIVOS.semArtista);
    case 'partilhar': return acao('Share with friends or groups…', 'share-social-outline', semRede);
    // Tirar um download não precisa de rede; fazê-lo sim.
    case 'descarregar': return c.descarregada
      ? acao('Remove download', 'checkmark-circle', null)
      : acao('Download', 'arrow-down-circle-outline', semRede);
    case 'recomendacoes': return acao('Recommendations…', 'options-outline', semRede);
    case 'tirar-da-playlist': return acao('Remove from this playlist', 'trash-outline',
      c.playlist && !c.playlist.podeEditar ? MOTIVOS.soODono : semRede, true);
    case 'tirar-da-fila': return acao('Remove from queue', 'trash-outline',
      c.fila?.emJam ? MOTIVOS.filaDoJam : c.fila?.mudou ? MOTIVOS.filaMudou : null, true);
  }
}

/** As ações deste menu, já pela ordem certa e com o motivo das indisponíveis. */
export function menuDaFaixa(c: ContextoDoMenu): AcaoDoMenu[] {
  return ORDEM.filter((id) => aplicaSe(id, c)).map((id) => descrever(id, c));
}
