import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Toque } from './Toque';
import { ESCALA } from '../lib/movimento';
import { hapticSelection } from '../lib/haptics';
import { useSeguirAmigo } from '../state/seguirAmigo';
import { useTheme } from '../state/theme';
import { colors, radii, spacing, type } from '../theme';

/**
 * "Listening along with X · Leave" (27/9, state/seguirAmigo.ts).
 *
 * Seguir alguém é um MODO: o leitor deixa de obedecer à fila de cada um, e sem
 * uma linha a dizê-lo isso lê-se como a app a escolher músicas sozinha. Por
 * isso fica à vista enquanto dura, com a saída ali mesmo. Quando se deixa de o
 * seguir sem ser por vontade própria ("X stopped listening"), diz-se, e some.
 *
 * `compacta`: no topo do leitor aberto, no lugar da marca -- sem mudar a
 * altura de nada no leitor.
 */
export function BarraDeSeguir({ compacta = false }: { compacta?: boolean }) {
  const tema = useTheme((s) => s.theme);
  const seguindo = useSeguirAmigo((s) => s.seguindo);
  const aviso = useSeguirAmigo((s) => s.aviso);
  const parar = useSeguirAmigo((s) => s.parar);
  const limparAviso = useSeguirAmigo((s) => s.limparAviso);

  React.useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(limparAviso, 6000);
    return () => clearTimeout(t);
  }, [aviso, limparAviso]);

  if (!seguindo) {
    if (!aviso || compacta) return null;
    return (
      <Toque escala={ESCALA.cartao} onPress={limparAviso} accessibilityLabel={aviso} style={[styles.barra, styles.acabou]}>
        <Ionicons name="headset-outline" size={15} color={colors.textSecondary} />
        <Text numberOfLines={1} style={[styles.titulo, { color: colors.textSecondary, flex: 1 }]}>{aviso}</Text>
      </Toque>
    );
  }

  const sair = () => { hapticSelection(); parar(null); };

  if (compacta) {
    return (
      <Toque
        escala={ESCALA.icone}
        onPress={sair}
        accessibilityRole="button"
        accessibilityLabel={`Listening along with ${seguindo.nome}. Leave`}
        style={[styles.compacta, { borderColor: tema.color, backgroundColor: tema.soft }]}
      >
        <Ionicons name="headset" size={12} color={tema.color} />
        <Text numberOfLines={1} style={styles.tituloCompacto}>With {seguindo.nome}</Text>
        <Ionicons name="close" size={12} color={colors.textSecondary} />
      </Toque>
    );
  }

  return (
    <View style={[styles.barra, { backgroundColor: tema.soft, borderColor: tema.color }]}>
      <Ionicons name="headset" size={15} color={tema.color} />
      <Text numberOfLines={1} style={[styles.titulo, { flex: 1 }]}>Listening along with {seguindo.nome}</Text>
      <Toque escala={ESCALA.icone} onPress={sair} accessibilityRole="button" accessibilityLabel="Leave" hitSlop={10} style={styles.sair}>
        <Text style={[styles.titulo, { color: tema.color }]}>Leave</Text>
      </Toque>
    </View>
  );
}

const styles = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: radii.md,
  },
  acabou: { backgroundColor: colors.surface, borderColor: colors.border },
  titulo: { ...type.micro, color: colors.text, fontWeight: '600' },
  sair: { paddingHorizontal: 4 },
  compacta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 190,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderRadius: 999,
  },
  tituloCompacto: { ...type.micro, color: colors.text, fontWeight: '600', flexShrink: 1 },
});
