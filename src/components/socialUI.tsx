import React from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, type } from '../theme';

/**
 * Os blocos partilhados do Social.
 *
 * **Usa os tokens de `../theme`, e não cores próprias.** A primeira versão
 * trazia dezassete cores escritas à mão só neste ficheiro — um fundo `#121117`
 * onde a app tem `#0A0A0F`, um texto `#F3F2F7` onde tem `#F5F5F7`, e cinzentos
 * puxados ao roxo onde os da app são neutros. Nada disso se nota a olhar para
 * o ficheiro; nota-se a entrar na página, que parecia de outra aplicação.
 *
 * Todos os outros componentes de `src/components/` importam daqui, e é por isso
 * que o resto da app é coerente sem ninguém ter de pensar nisso.
 */

export const socialStyles = StyleSheet.create({
  body: { flex: 1 },
  content: { padding: spacing.xl, gap: 18, paddingBottom: 120 },
  text: { ...type.body },
  muted: { ...type.caption, lineHeight: 20 },
  title: { ...type.title, fontSize: 23 },
  // A sobrancelha da app: mono pequeno, espaçado e em maiúsculas.
  label: { ...type.micro, letterSpacing: 1.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radii.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
  },
  buttonText: { ...type.body, fontSize: 13, fontWeight: '600' },
  input: {
    ...type.body,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    padding: 13,
    // O mesmo que o `Field` do desktop faz. Sem isto o browser desenha o anel
    // de foco dele por cima -- laranja, e so nestes menus, porque em todos os
    // outros campos da app o anel ja estava desligado.
    outlineStyle: 'none',
  } as any,
  error: { ...type.caption, color: colors.danger, lineHeight: 19 },
  badge: { ...type.caption, fontSize: 12, fontWeight: '700', color: colors.text },
});

export function SocialButton({ children, onPress, disabled = false, quiet = false }: {
  children: React.ReactNode; onPress: () => void; disabled?: boolean; quiet?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        socialStyles.button,
        quiet && { backgroundColor: 'transparent' },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Text style={socialStyles.buttonText}>{children}</Text>
    </Pressable>
  );
}

export function SocialModal({ visible, title, onClose, children }: {
  visible: boolean; title: string; onClose: () => void; children: React.ReactNode;
}) {
  const safe = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{
          flex: 1,
          backgroundColor: colors.overlay,
          justifyContent: 'center',
          alignItems: 'center',
          paddingTop: safe.top + spacing.md,
          paddingBottom: safe.bottom + spacing.md,
          paddingHorizontal: spacing.md,
        }}
      >
        <View style={{
          width: '100%',
          maxWidth: 680,
          maxHeight: '100%',
          backgroundColor: colors.surface,
          borderColor: colors.borderStrong,
          borderWidth: 1,
          borderRadius: radii.xl,
          overflow: 'hidden',
        }}>
          <View style={[socialStyles.row, {
            padding: spacing.lg + 4,
            borderBottomWidth: 1,
            borderColor: colors.border,
          }]}>
            <Text style={[socialStyles.title, { flex: 1, fontSize: 19 }]}>{title}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={12}
            >
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
