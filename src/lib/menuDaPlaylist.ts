/**
 * O menu de uma playlist, nos dois lados (5/10, auditoria de consistência M4).
 *
 * Como o `menuDaFaixa`: aqui decide-se QUE ações há, por que ORDEM e com que
 * NOMES; os ecrãs só desenham e ligam cada `id` a uma função. Havia quatro
 * menus escritos à mão (cartão e página, PC e iPhone) e cada um tinha as suas:
 * tocar sem abrir só no iPhone, fixar e juntar no cartão só no PC, "Rename" num
 * lado e "Edit playlist" no outro.
 *
 * Sem imports: `scripts/test-menu-da-playlist.ts`.
 */

export type IdDaAcaoDaPlaylist =
  | 'tocar' | 'baralhar' | 'fila'
  | 'partilhar' | 'partilhar-link' | 'fixar'
  | 'editar' | 'juntar' | 'apagar'
  | 'colaboradores' | 'sair';

export type AcaoDaPlaylist = {
  id: IdDaAcaoDaPlaylist;
  rotulo: string;
  /** Nome de um ícone do Ionicons. */
  icone: string;
  destrutiva?: boolean;
  /** Abre um bloco novo (um fio por cima). */
  inicioDeGrupo?: boolean;
};

export type SituacaoDaPlaylist = {
  plataforma: 'ios' | 'pc';
  /** No cartão da lista (toque longo, "•••", clique direito) ou dentro dela ("⋯"). */
  onde: 'cartao' | 'pagina';
  temFaixas: boolean;
  /** É de quem abre o menu: pode editar, juntar e apagar. */
  minha: boolean;
  /**
   * Quem abre o menu colabora nela (7/10, playlists colaborativas): mexe nas
   * músicas e pode sair, mas não muda o nome nem apaga.
   */
  colaboro?: boolean;
  /** Só no PC: está nos atalhos da lateral. */
  fixada?: boolean;
};

export function menuDaPlaylist(s: SituacaoDaPlaylist): AcaoDaPlaylist[] {
  const acoes: AcaoDaPlaylist[] = [];
  // Tocar sem abrir: só no cartão. Lá dentro há os botões grandes.
  if (s.onde === 'cartao' && s.temFaixas) {
    acoes.push(
      { id: 'tocar', rotulo: 'Play', icone: 'play-outline' },
      { id: 'baralhar', rotulo: 'Shuffle', icone: 'shuffle' },
      { id: 'fila', rotulo: 'Add to queue', icone: 'list-outline' },
    );
  }
  acoes.push({ id: 'partilhar', rotulo: 'Share with a friend…', icone: 'people-outline', inicioDeGrupo: acoes.length > 0 });
  // O QR e o link vivem na folha de partilha do iPhone; no PC não há.
  if (s.plataforma === 'ios') acoes.push({ id: 'partilhar-link', rotulo: 'QR code / Copy link', icone: 'share-social-outline' });
  // Os atalhos da lateral só existem no PC.
  if (s.plataforma === 'pc') acoes.push({ id: 'fixar', rotulo: s.fixada ? 'Unpin from sidebar' : 'Pin to sidebar', icone: 'pin-outline' });
  const colaboro = !s.minha && !!s.colaboro;
  if (s.minha || colaboro) {
    const grupo: AcaoDaPlaylist[] = [];
    // No iPhone o Edit muda o nome E a ordem; no PC só o nome. Quem colabora
    // edita a ordem e o que sai (só no iPhone), o nome é do dono.
    if (s.minha || s.plataforma === 'ios') {
      grupo.push({ id: 'editar', rotulo: s.plataforma === 'ios' ? 'Edit playlist' : 'Rename…', icone: 'pencil-outline' });
    }
    if (s.onde === 'pagina') grupo.push({ id: 'juntar', rotulo: 'Merge another playlist…', icone: 'git-merge-outline' });
    grupo.push({ id: 'colaboradores', rotulo: s.minha ? 'Collaborators…' : 'People in this playlist', icone: 'person-add-outline' });
    if (s.minha) grupo.push({ id: 'apagar', rotulo: 'Delete playlist', icone: 'trash-outline', destrutiva: true });
    else grupo.push({ id: 'sair', rotulo: 'Leave playlist', icone: 'exit-outline', destrutiva: true });
    grupo[0] = { ...grupo[0], inicioDeGrupo: true };
    acoes.push(...grupo);
  }
  return acoes;
}
