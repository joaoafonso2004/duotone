import React from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BottomSheet, BottomSheetScrollView } from './BottomSheet';
import { Toque } from './Toque';
import { hapticSelection } from '../lib/haptics';
import type { AcaoDoMenu, IdDaAcao } from '../lib/menuDaFaixa';
import { colors, spacing, type } from '../theme';

export type PlayerAction = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /**
   * Porque não se pode fazer agora. Com motivo a linha fica indisponível mas
   * à vista, e o motivo aparece por baixo do rótulo -- ver lib/menuDaFaixa.ts.
   */
  motivo?: string | null;
  /** Começa um grupo: um traço por cima separa-o do anterior. */
  /**
   * Uma segunda linha que NAO apaga a acao -- ao contrario do `motivo`, que
   * quer dizer "nao da agora, e e por isto". Serve para dizer o estado de uma
   * linha em que se PODE carregar ("Playing now", num aparelho do Connect).
   */
  nota?: string | null;
  inicioDeGrupo?: boolean;
};

/** As linhas de um menu de faixa (lib/menuDaFaixa.ts), com o que cada uma faz. */
export function accoesDoMenu(menu: AcaoDoMenu[], fazer: (id: IdDaAcao) => void): PlayerAction[] {
  return menu.map((a) => ({
    label: a.rotulo,
    icon: a.icone as keyof typeof Ionicons.glyphMap,
    destructive: a.destrutiva,
    motivo: a.indisponivel,
    onPress: () => fazer(a.id),
  }));
}

export function PlayerActionsContent({ title, actions }: { title: string; actions: PlayerAction[] }) {
  const { height } = useWindowDimensions();
  return (
    <BottomSheetScrollView style={{ maxHeight: height * 0.65 }} contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={type.title}>{title}</Text>
      <View>
        {actions.map(action => {
          const apagada = !!action.disabled || !!action.motivo;
          return (
            <Toque
              key={action.label}
              acende
              accessibilityRole="button"
              accessibilityLabel={action.motivo || action.nota ? `${action.label}. ${action.motivo || action.nota}` : action.label}
              accessibilityState={{ disabled: apagada }}
              disabled={apagada}
              onPress={() => { hapticSelection(); action.onPress(); }}
              style={[styles.action, action.inicioDeGrupo && styles.grupo]}
            >
              <Ionicons name={action.icon} size={21} color={action.destructive ? colors.danger : colors.textSecondary} style={apagada && styles.disabled} />
              <View style={styles.label}>
                <Text style={[type.body, action.destructive && { color: colors.danger }, apagada && styles.disabled]}>{action.label}</Text>
                {action.motivo || action.nota
                  ? <Text style={[type.caption, styles.motivo]}>{action.motivo || action.nota}</Text>
                  : null}
              </View>
            </Toque>
          );
        })}
      </View>
    </BottomSheetScrollView>
  );
}

export function PlayerActionsSheet({ visible, onClose, ...content }: {
  visible: boolean; onClose: () => void; title: string; actions: PlayerAction[];
}) {
  return <BottomSheet visible={visible} onClose={onClose}><PlayerActionsContent {...content} /></BottomSheet>;
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.sm },
  action: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  label: { flex: 1 },
  disabled: { opacity: 0.4 },
  motivo: { marginTop: 2, color: colors.textSecondary },
  grupo: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: spacing.xs },
});
