import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { Toque } from './Toque';
import { hapticSelection } from '../lib/haptics';
import { ESCALA } from '../lib/movimento';
import { ouvirRefrao, temRefrao, useRefrao } from '../state/refrao';
import { useTheme } from '../state/theme';
import { colors } from '../theme';
import type { Track } from '../types';

/**
 * O auscultador do refrão primeiro no iPhone (25/10, `state/refrao.ts`). Sem
 * rato não há "ao passar por cima": fica sempre à vista, pequeno, nas músicas
 * das descobertas -- ao canto da capa nos cartões, antes do "…" nas linhas.
 * Tocar nele ouve 15 s do refrão por cima do que estiver a tocar; tocar no
 * resto toca a música normal. A preparar, roda; a soar, é um "parar" na cor do
 * tema.
 */
export function BotaoDoRefrao({ track, forma }: { track: Track; forma: 'capa' | 'linha' }) {
  const cor = useTheme((s) => s.theme.color);
  const meu = useRefrao((s) => s.faixa?.sourceId === track.sourceId);
  const aSoar = useRefrao((s) => s.faixa?.sourceId === track.sourceId && s.ate != null);
  if (!temRefrao(track)) return null;
  const naCapa = forma === 'capa';
  return (
    <Toque
      escala={ESCALA.icone}
      hitSlop={naCapa ? 8 : 10}
      onPress={() => { hapticSelection(); ouvirRefrao(track); }}
      accessibilityRole="button"
      accessibilityLabel={meu ? 'Stop chorus preview' : 'Play chorus preview'}
      style={[naCapa ? styles.naCapa : styles.naLinha, aSoar && naCapa && { backgroundColor: cor }]}
    >
      {meu && !aSoar ? (
        <ActivityIndicator size="small" color={colors.text} style={naCapa ? styles.rodaNaCapa : undefined} />
      ) : (
        <Ionicons
          name={aSoar ? 'stop' : 'headset-outline'}
          size={aSoar ? (naCapa ? 11 : 15) : (naCapa ? 14 : 17)}
          color={aSoar && !naCapa ? cor : naCapa ? colors.text : colors.textSecondary}
        />
      )}
    </Toque>
  );
}

const styles = StyleSheet.create({
  naCapa: {
    position: 'absolute', right: 6, bottom: 6, width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(6,6,8,0.62)',
  },
  rodaNaCapa: { transform: [{ scale: 0.7 }] },
  naLinha: { padding: 4 },
});
