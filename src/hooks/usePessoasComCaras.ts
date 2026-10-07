import { useEffect, useMemo } from 'react';
import { comCarasAtuais, type PessoaDaPlaylist } from '../lib/playlistColaborativa';
import { garantirPerfis, usePerfisPublicos } from '../state/perfisPublicos';

/**
 * As pessoas de uma playlist com a fotografia e o nome ATUAIS (7/10).
 *
 * O `pessoas_da_playlist` lê o `profiles.avatar_url`, que é a coluna antiga: a
 * fotografia de hoje vive no `profile_appearance`, e quem a monta é o
 * `get_public_profiles`. Via-se a fotografia antiga do dono e nenhuma do amigo.
 * A mesma cache de perfis do Jam (`state/perfisPublicos.ts`): um pedido por
 * pessoas novas, partilhado, e nada sem rede -- ficam as caras do servidor.
 */
export function usePessoasComCaras(pessoas: readonly PessoaDaPlaylist[]): readonly PessoaDaPlaylist[] {
  const perfis = usePerfisPublicos((s) => s.perfis);
  // Uma chave estável e não o array, como no Jam.
  const chave = [...new Set(pessoas.map((p) => p.id))].sort().join(',');
  useEffect(() => { if (chave) garantirPerfis(chave.split(',')); }, [chave]);
  return useMemo(() => comCarasAtuais(pessoas, perfis), [pessoas, perfis]);
}
