import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlayer } from '../state/player';
import { MINI_PLAYER_HEIGHT, spacing } from '../theme';

export function useSocialBottomPadding(hasTabs = false) {
  const safe = useSafeAreaInsets();
  const playing = usePlayer(s => !!s.current);
  // O PlayerRoot mantém a reserva da tab bar também nos ecrãs de pilha.
  return safe.bottom + (hasTabs || playing ? 49 : 0) + (playing ? MINI_PLAYER_HEIGHT + 12 : 0) + spacing.xxl;
}
