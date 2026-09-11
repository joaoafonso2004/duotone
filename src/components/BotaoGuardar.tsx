import React from 'react';
import { Pressable } from 'react-native';
import { alternarGuardada, garantirGuardadas } from '../lib/guardarFaixa';
import { hapticSelection } from '../lib/haptics';
import { savedKey, useSaved } from '../state/saved';
import { useTheme } from '../state/theme';
import { colors } from '../theme';
import type { Track } from '../types';
import { StateIcon } from './StateIcon';

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

  React.useEffect(() => { garantirGuardadas(); }, []);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={guardada ? 'Remove from library' : 'Save to library'}
      accessibilityState={{ busy: aGuardar, selected: guardada }}
      hitSlop={10}
      disabled={aGuardar}
      onPress={() => {
        hapticSelection();
        setAGuardar(true);
        // Falhar deixa o coração como estava: a marca só muda depois de o
        // servidor confirmar, dentro do `alternarGuardada`.
        void alternarGuardada(track).catch(() => {}).finally(() => setAGuardar(false));
      }}
      style={({ pressed }) => [{ padding: 4, opacity: aGuardar ? 0.5 : pressed ? 0.7 : 1 }]}
    >
      <StateIcon
        pulsar={guardada}
        name={guardada ? 'heart' : 'heart-outline'}
        size={tamanho}
        color={guardada ? acento : colors.textSecondary}
      />
    </Pressable>
  );
}
