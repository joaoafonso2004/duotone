/**
 * O menu de um artista no PC (24/10, fase 1 de docs/botao-direito-pc-maquete.html):
 * o botão direito num artista abre-o em todo o lado com as mesmas linhas -- na
 * grelha dos Artists, na pesquisa, no "Fans also like" e fixado na lateral.
 * Antes não fazia nada.
 *
 * As palavras são as que a página do artista já usa: o "Mix" do botão (aqui
 * "Play Mix", que num menu é preciso dizer o verbo), o coração dos favoritos e
 * o "Pin to sidebar" do `BotaoDeFixar`. "Shuffle your songs" baralha as dele
 * que estão na biblioteca, e só aparece se houver.
 *
 * Puro: `scripts/test-menu-do-artista.ts`.
 */
import { MOTIVOS } from './menuDaFaixa';

export type AcaoDoArtista = 'abrir' | 'mix' | 'baralhar' | 'favorito' | 'fixar';

export type LinhaDoArtista = {
  id: AcaoDoArtista;
  rotulo: string;
  icone: string;
  inicioDeGrupo?: boolean;
  /** Indisponível agora, e porquê. */
  motivo?: string | null;
};

export function menuDoArtista(s: {
  semRede: boolean;
  /** Quantas músicas dele há na biblioteca. */
  tuas: number;
  favorito: boolean;
  fixado: boolean;
}): LinhaDoArtista[] {
  const rede = s.semRede ? MOTIVOS.semRede : null;
  const linhas: LinhaDoArtista[] = [
    { id: 'abrir', rotulo: 'Open artist', icone: 'person-outline' },
    { id: 'mix', rotulo: 'Play Mix', icone: 'radio-outline', inicioDeGrupo: true, motivo: rede },
  ];
  // No PC tocar precisa sempre da rede (o leitor é o do YouTube).
  if (s.tuas > 0) linhas.push({ id: 'baralhar', rotulo: 'Shuffle your songs', icone: 'shuffle', motivo: rede });
  linhas.push(
    { id: 'favorito', rotulo: s.favorito ? 'Remove from favourite artists' : 'Add to favourite artists',
      icone: s.favorito ? 'heart' : 'heart-outline', inicioDeGrupo: true },
    { id: 'fixar', rotulo: s.fixado ? 'Unpin from sidebar' : 'Pin to sidebar', icone: 'pin-outline' },
  );
  return linhas;
}

/** "Artist", ou "Artist · 14 songs" quando há músicas dele na biblioteca. */
export function legendaDoMenuDoArtista(tuas: number): string {
  return tuas > 0 ? `Artist · ${tuas} ${tuas === 1 ? 'song' : 'songs'}` : 'Artist';
}
