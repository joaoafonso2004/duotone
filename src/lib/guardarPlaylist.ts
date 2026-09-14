/**
 * Guardar uma playlist de outra pessoa -- a que te mandaram numa conversa, ou
 * a do perfil de um amigo.
 *
 * Pedido a 14/9: no PC não havia maneira de guardar uma playlist recebida (e no
 * iPhone também não, fora do perfil). Guardar faz uma CÓPIA tua
 * (`savePlaylistCopy`), e a base de dados precisa de
 * `supabase/guardar-playlist-partilhada.sql` para aceitar as do chat.
 *
 * Sem imports de runtime, testado em `scripts/test-guardar-playlist.ts`.
 */

/**
 * O botão: escondido, "Save", ou "Open your copy".
 *
 * Não há "tirar": na página de uma playlist isso apagaria a CÓPIA, com o que
 * lhe tivesses mudado entretanto. Quem a quer apagar fá-lo na cópia, como a
 * qualquer playlist sua.
 */
export type EstadoDoGuardar = 'escondido' | 'guardar' | 'abrir-copia';

export function estadoDoGuardar(p: {
  id: string;
  donoId: string | null | undefined;
  eu: string | null | undefined;
  /** As origens de que já tenho cópia; null enquanto não se sabe. */
  copias: ReadonlySet<string> | null;
}): EstadoDoGuardar {
  if (!p.donoId || !p.eu || p.donoId === p.eu) return 'escondido';
  // Enquanto não se sabe se já a tens, não se mostra um botão que pode mentir.
  if (!p.copias) return 'escondido';
  return p.copias.has(p.id) ? 'abrir-copia' : 'guardar';
}

/**
 * A frase para quando guardar falha.
 *
 * A versão antiga da função diz "...on this profile": é a base de dados sem a
 * migração, e dizer "já não está partilhada" mandava procurar o problema no
 * sítio errado.
 */
export function mensagemDeFalhaAoGuardar(erro: { code?: string; message?: string } | null | undefined): string {
  if (/on this profile/i.test(erro?.message ?? '')) {
    return 'Saving playlists from chats needs the latest server update.';
  }
  if (erro?.code === '42501') return 'This playlist is no longer shared with you.';
  return 'Could not save this playlist. Please try again.';
}
