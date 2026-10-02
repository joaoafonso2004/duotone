/**
 * O menu do botão direito num amigo (PC, 2/10, maquete
 * `docs/mensagens-e-menu-do-amigo.html`): que ações há, por que ordem, com que
 * nome. O componente (`desktop/MenuDoAmigo.web.tsx`) só desenha e liga cada
 * `id` a uma função -- a regra dos menus das faixas (`lib/menuDaFaixa.ts`).
 *
 * Sem imports, para se testar em Node (`scripts/test-menu-do-amigo.ts`).
 */

import type { Track } from '../types';

/** O que a presença diz que um amigo está a ouvir (o `currentlyPlaying`). */
export type FaixaDaPresenca = {
  id?: string | null;
  source: 'youtube' | 'spotify';
  sourceId: string;
  title: string;
  artist: string | null;
  artworkUrl: string | null;
  durationSeconds: number | null;
};

/**
 * A música dele como uma faixa que se toca, põe na fila, guarda ou manda: só
 * os campos de uma `Track` (a presença traz também a posição e a hora, que
 * não são da música).
 */
export function faixaDoAmigo(f: FaixaDaPresenca | null | undefined): Track | null {
  if (!f?.sourceId || !f.title) return null;
  return {
    ...(f.id ? { id: f.id } : {}),
    source: f.source, sourceId: f.sourceId, title: f.title, artist: f.artist ?? null,
    album: null, artworkUrl: f.artworkUrl ?? null, durationSeconds: f.durationSeconds ?? null,
  };
}

export type AcaoDoAmigo =
  | 'ouvir' | 'tocar' | 'fila' | 'gostar'
  | 'mensagem' | 'perfil' | 'mistura' | 'jam' | 'partilhar'
  | 'fixar' | 'remover';

export type LinhaDoMenuDoAmigo = {
  id: AcaoDoAmigo;
  rotulo: string;
  /** Um nome do Ionicons. */
  icone: string;
  /** A primeira linha de cada grupo leva um separador por cima (menos a primeira de todas). */
  inicioDeGrupo?: boolean;
  perigo?: boolean;
};

export type SituacaoDoAmigo = {
  nome: string;
  /** A música que ele está a ouvir, se estiver. */
  faixa: { titulo: string } | null;
  /** Ele tem um Jam aberto: "ouvir com ele" é entrar nele. */
  temJam: boolean;
  /** A música dele já está nas tuas Liked Songs. */
  faixaGuardada: boolean;
  /** Tu estás num Jam: convida-se para ele em vez de abrir outro. */
  estouNumJam: boolean;
  /** Tens alguma coisa a tocar (para lha mandares). */
  tenhoFaixa: boolean;
  /** Ele já está fixado na lateral. */
  fixado: boolean;
};

export function opcoesDoMenuDoAmigo(s: SituacaoDoAmigo): LinhaDoMenuDoAmigo[] {
  const linhas: LinhaDoMenuDoAmigo[] = [];
  // A música dele só existe se ele estiver a ouvir alguma coisa.
  if (s.faixa) {
    linhas.push(
      { id: 'ouvir', rotulo: s.temJam ? `Join ${s.nome}'s Jam` : `Listen along with ${s.nome}`, icone: s.temJam ? 'people-outline' : 'headset-outline' },
      { id: 'tocar', rotulo: 'Play this song', icone: 'play-outline' },
      { id: 'fila', rotulo: 'Add to queue', icone: 'list-outline' },
      { id: 'gostar', rotulo: s.faixaGuardada ? 'Remove from Liked Songs' : 'Add to Liked Songs', icone: s.faixaGuardada ? 'heart' : 'heart-outline' },
    );
  }
  linhas.push(
    { id: 'mensagem', rotulo: 'Send message', icone: 'chatbubble-outline', inicioDeGrupo: true },
    { id: 'perfil', rotulo: 'View profile', icone: 'person-outline' },
    { id: 'mistura', rotulo: 'Play a mix of you two', icone: 'git-merge-outline' },
    { id: 'jam', rotulo: s.estouNumJam ? 'Invite to your Jam' : `Start a Jam with ${s.nome}`, icone: 'people-circle-outline' },
  );
  if (s.tenhoFaixa) linhas.push({ id: 'partilhar', rotulo: "Send what you're playing", icone: 'paper-plane-outline' });
  linhas.push(
    { id: 'fixar', rotulo: s.fixado ? 'Unpin from sidebar' : 'Pin to sidebar', icone: s.fixado ? 'pin' : 'pin-outline', inicioDeGrupo: true },
    { id: 'remover', rotulo: 'Remove friend', icone: 'person-remove-outline', perigo: true },
  );
  // O primeiro de todos não leva separador por cima.
  if (linhas[0]) linhas[0] = { ...linhas[0], inicioDeGrupo: false };
  return linhas;
}

/**
 * Onde o menu abre: no rato, mas sempre dentro da janela (com folga). Perto do
 * fundo abre para cima do rato, perto da direita para a esquerda.
 */
export function posicaoDoMenu(
  rato: { x: number; y: number },
  menu: { largura: number; altura: number },
  janela: { largura: number; altura: number },
  folga = 8,
): { x: number; y: number } {
  let x = rato.x, y = rato.y;
  if (x + menu.largura > janela.largura - folga) x = rato.x - menu.largura;
  if (y + menu.altura > janela.altura - folga) y = rato.y - menu.altura;
  x = Math.max(folga, Math.min(x, janela.largura - menu.largura - folga));
  y = Math.max(folga, Math.min(y, janela.altura - menu.altura - folga));
  return { x, y };
}
