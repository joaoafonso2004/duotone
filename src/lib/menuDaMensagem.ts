/**
 * O menu de uma mensagem no botão direito do PC (24/10, fase 2 de
 * docs/botao-direito-pc-maquete.html, com as reações "A": a fila de emojis no
 * topo do menu, como no Teams). No PC só havia os dois botões que aparecem ao
 * passar o rato (responder e reagir).
 *
 * Numa mensagem: Reply e, se tiver texto, Copy text. Numa música partilhada,
 * também o que se faz a uma música, com as palavras do menu dela
 * (`lib/menuDaFaixa.ts`): Play now, Add to queue, Liked Songs e o "Add to
 * playlist ›" do PC. As reações são as mesmas seis do painel do chat.
 *
 * Puro: `scripts/test-menu-da-mensagem.ts`.
 */
import { MOTIVOS } from './menuDaFaixa';

/** As reações de um toque, no painel do chat e no topo do menu. */
export const REACOES_RAPIDAS: readonly string[] = ['❤️', '😂', '🔥', '😮', '😢', '👍'];

export type AcaoDaMensagem = 'responder' | 'copiar' | 'tocar' | 'fila' | 'gostar' | 'por-em-playlist';

export type LinhaDaMensagem = {
  id: AcaoDaMensagem;
  rotulo: string;
  icone: string;
  inicioDeGrupo?: boolean;
  motivo?: string | null;
};

export function menuDaMensagem(s: {
  /** Pode-se responder (uma mensagem normal; não um convite nem uma linha de sistema). */
  podeResponder: boolean;
  temTexto: boolean;
  /** A música partilhada, se for uma, e se já está nas Liked Songs. */
  faixa: { guardada: boolean } | null;
  semRede: boolean;
}): LinhaDaMensagem[] {
  const rede = s.semRede ? MOTIVOS.semRede : null;
  const linhas: LinhaDaMensagem[] = [];
  if (s.podeResponder) linhas.push({ id: 'responder', rotulo: 'Reply', icone: 'arrow-undo-outline' });
  if (s.temTexto) linhas.push({ id: 'copiar', rotulo: 'Copy text', icone: 'copy-outline' });
  if (s.faixa) {
    linhas.push(
      { id: 'tocar', rotulo: 'Play now', icone: 'play-circle-outline', inicioDeGrupo: true, motivo: rede },
      { id: 'fila', rotulo: 'Add to queue', icone: 'list-outline', motivo: rede },
      s.faixa.guardada
        ? { id: 'gostar', rotulo: 'Remove from Liked Songs', icone: 'heart', motivo: rede }
        : { id: 'gostar', rotulo: 'Add to Liked Songs', icone: 'heart-outline', motivo: rede },
      { id: 'por-em-playlist', rotulo: 'Add to playlist', icone: 'albums-outline', motivo: rede },
    );
  }
  if (linhas[0]) linhas[0] = { ...linhas[0], inicioDeGrupo: false };
  return linhas;
}
