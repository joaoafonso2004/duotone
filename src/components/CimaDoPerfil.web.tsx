import type { Animated } from 'react-native';
import type { Ancora } from './MenuFlutuante';

/** No PC os botões do perfil vivem dentro do cabeçalho e não há barra com o nome (ver o `.tsx`). */
export function CimaDoPerfil(_: {
  nome: string; rolagem: Animated.Value; fimDoNome: number; own: boolean; unread: number;
  onBack?: () => void; onSocial?: () => void; onSettings?: () => void; onOptions?: (ancora: Ancora) => void;
}) {
  return null;
}
