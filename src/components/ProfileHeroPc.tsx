import type { SocialProfile } from '../api/profiles';

/**
 * O perfil no PC com a capa por página (30/10): só existe no `.web.tsx`. Aqui
 * ficam as props (que o `SocialProfileView` partilhado passa) e um esqueleto que
 * não desenha nada, porque no iPhone o cabeçalho é o `ProfileHero`.
 */
export type PropsDoHeroPc = {
  profile: SocialProfile | null; own: boolean; cover: string | null; unread: number; status?: string;
  /** O tamanho da janela do perfil: a capa cobre-a toda. */
  altura: number; largura: number;
  /** O botão direito no topo do perfil de um amigo (o menu dele). */
  menu?: Record<string, unknown>;
  onEdit: () => void; onMessage: () => void; onBack?: () => void;
  onSocial?: () => void; onStats?: () => void; onRefresh: () => void; onAddFriend: () => void; pending: boolean;
  onVocesOsDois?: () => void;
};

export function ProfileHeroPc(_: PropsDoHeroPc) {
  return null;
}
