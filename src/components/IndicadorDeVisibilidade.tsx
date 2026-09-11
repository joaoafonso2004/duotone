import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useVisibilidade } from '../hooks/useVisibilidade';
import { hapticSelection } from '../lib/haptics';
import { ESCALA } from '../lib/movimento';
import { avisoDaTroca } from '../lib/visibilidade';
import { definirPrivacidade, usePrivacidade } from '../state/privacidade';
import { useTheme } from '../state/theme';
import { colors } from '../theme';
import { Toque } from './Toque';

/**
 * "Quem vê isto?" -- no leitor grande, entre a Queue e o EQ.
 *
 * Com a mesma forma dos dois vizinhos (ícone e uma palavra por baixo), no
 * eixo do play: a fila de baixo tinha o lugar do meio vazio, e é o único que
 * não mexe na capa. Fora de um Jam, um toque liga ou desliga a escuta privada;
 * dentro de um, abre o Jam -- a escuta privada não fecha a porta a quem entra
 * sem convite, por isso é lá que se muda quem ouve. A regra e os textos são os
 * mesmos do PC (lib/visibilidade.ts). No iPhone não há Discord.
 */
export function IndicadorDeVisibilidade({ onAbrirJam, onAviso }: {
  onAbrirJam: () => void;
  onAviso?: (mensagem: string) => void;
}) {
  const theme = useTheme((s) => s.theme);
  const v = useVisibilidade(false);
  // Aceso quando não é o costume. O normal (os amigos veem) não se anuncia,
  // pela mesma razão que o shuffle desligado fica cinzento.
  const aceso = v.estado === 'privada' || v.estado === 'jam';

  return (
    <Toque
      escala={ESCALA.icone}
      accessibilityRole="button"
      accessibilityLabel={v.descricao}
      accessibilityHint={v.dica}
      onPress={() => {
        hapticSelection();
        if (v.acao === 'abrirJam') { onAbrirJam(); return; }
        const privada = !usePrivacidade.getState().privada;
        void definirPrivacidade(privada);
        onAviso?.(avisoDaTroca(privada, false));
      }}
      style={styles.botao}
    >
      <Ionicons name={v.icone} size={23} color={aceso ? theme.color : colors.text} />
      <Text numberOfLines={1} style={styles.rotulo}>{v.rotulo}</Text>
    </Toque>
  );
}

const styles = StyleSheet.create({
  // O `utilityIconBtn` do PlayerRoot, com a largura do lugar do meio (64) em
  // vez de 48: "Private" e "Jam · 3" não cabiam em 48 a 11 px.
  botao: {
    width: 64,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 5,
  },
  rotulo: {
    fontSize: 11,
    fontWeight: '400',
    color: colors.textSecondary,
  },
});
