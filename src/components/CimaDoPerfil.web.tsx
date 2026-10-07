import type { Animated } from 'react-native';

/** No PC os botões do perfil vivem dentro do cabeçalho e não há barra com o nome (ver o `.tsx`). */
export function CimaDoPerfil(_: {
  nome: string; rolagem: Animated.Value; fimDoNome: number; own: boolean; unread: number;
  onBack?: () => void; onSocial?: () => void; onSettings?: () => void; onStats?: () => void;
}) {
  return null;
}
