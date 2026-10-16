import React from 'react';
import { Pressable } from 'react-native';
import { alternarGuardada, garantirGuardadas } from '../lib/guardarFaixa';
import { hapticSelection } from '../lib/haptics';
import { savedKey, useSaved } from '../state/saved';
import { useTheme } from '../state/theme';
import { colors } from '../theme';
import type { Track } from '../types';
import { CoracaoAnimado } from './CoracaoAnimado';
import { useCoracaoAoCarregar } from '../hooks/useCoracaoAoCarregar';

/**
 * O coração de uma música partilhada numa conversa.
 *
 * Guardar era o passo que faltava para a partilha "fechar o ciclo": já se
 * tocava e se reagia, mas guardar obrigava a abrir a música noutro sítio. As
 * cores são as do coração do leitor -- acento quando guardada, apagado quando
 * não -- para o mesmo estado se ler igual em toda a app.
 */
export function BotaoGuardar({ track, tamanho = 18 }: { track: Track; tamanho?: number }) {
  const acento = useTheme((s) => s.theme.color);
  const guardada = useSaved((s) => s.keys.has(savedKey(track)));
  const [aGuardar, setAGuardar] = React.useState(false);
  // Reage ao carregar (16/10, lib/coracaoAoCarregar.ts); a guarda espera pelo
  // servidor como antes, e até lá mostra-se o que se pediu. Se o toque virar
  // scroll na conversa, o coração volta atrás.
  const coracao = useCoracaoAoCarregar(guardada, () => {
    setAGuardar(true);
    // Falhar deixa o coração como estava: a marca só muda depois de o
    // servidor confirmar, dentro do `alternarGuardada`.
    return alternarGuardada(track).catch(() => {}).finally(() => setAGuardar(false));
  });

  React.useEffect(() => { garantirGuardadas(); }, []);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={coracao.mostrada ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
      accessibilityState={{ busy: aGuardar, selected: coracao.mostrada }}
      hitSlop={10}
      disabled={aGuardar}
      onPressIn={() => { hapticSelection(); coracao.onPressIn(); }}
      onPress={coracao.onPress}
      onPressOut={coracao.onPressOut}
      style={{ padding: 4 }}
    >
      <CoracaoAnimado guardada={coracao.mostrada} pulso={coracao.pulso} tamanho={tamanho} cor={colors.textSecondary} corCheio={acento} />
    </Pressable>
  );
}
