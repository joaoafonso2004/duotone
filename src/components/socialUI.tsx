import React from 'react';
import { KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { FriendAvatar } from './FriendAvatar';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../state/theme';
import { hapticSelection } from '../lib/haptics';
import { spacing } from '../theme';
import { colors, radii, type, SOCIAL_GUTTER } from './socialTokens';

const web = Platform.OS === 'web';
export const socialStyles = StyleSheet.create({
  // A faixa que apanha o gesto de voltar. Estreita de propósito: mais larga
  // do que isto e comeria os toques na margem das mensagens.
  margemDeVoltar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 22 },
  body: { flex: 1, minHeight: 0, minWidth: 0 },
  content: { paddingHorizontal: SOCIAL_GUTTER, paddingTop: web ? 0 : spacing.lg, gap: spacing.xl },
  text: { ...type.body },
  muted: { ...type.caption, lineHeight: 20 },
  title: { ...type.title },
  label: { ...type.micro, letterSpacing: 1.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  // Sem contorno e com o mesmo raio das outras superficies da app. A caixa
  // desenhada a linha era a linguagem antiga; hoje o que levanta um bloco do
  // fundo e o preenchimento, e nada no resto da app tem moldura.
  card: { backgroundColor: colors.surface, padding: spacing.lg, borderRadius: radii.md, gap: spacing.md },
  // Uma linha de lista dentro do perfil: sem caixa nenhuma, como nas Songs.
  linhaSimples: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10 },
  listRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 12, flexDirection: 'row', alignItems: 'center' },
  // A linha da lista de conversas. Sem risco por baixo: o que separa é o
  // espaço. Uma altura mínima igual para todas é o que dá o ritmo -- havia
  // linhas de duas linhas de texto e outras de três (a que está a tocar), e
  // com o risco a marcar cada uma via-se a diferença.
  conversa: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, paddingVertical: 8, paddingHorizontal: 8, borderRadius: radii.md },
  pontoOnline: { position: 'absolute', right: -1, bottom: -1, width: 15, height: 15, borderRadius: 8, backgroundColor: colors.online, borderWidth: 3, borderColor: colors.bg },
  pontoPorLer: { width: 9, height: 9, borderRadius: 5 },
  button: { minHeight: 44, overflow: 'hidden', paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: web ? radii.md : radii.pill, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, borderWidth: 1, borderColor: colors.borderStrong },
  buttonText: { ...type.body, fontSize: 13, fontWeight: '600', flexShrink:1, minWidth:0, textAlign:'center' },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md },
  input: { ...type.body, minHeight: 46, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.md, padding: 13 },
  error: { ...type.caption, color: colors.danger, lineHeight: 19 },
  badge: { ...type.caption, fontSize: 12, fontWeight: '700', color: colors.text },
});

export function SocialButton({ children, onPress, disabled = false, quiet = false, primary = false, danger = false, icon, badge }: {
  children: React.ReactNode; onPress: () => void; disabled?: boolean; quiet?: boolean; primary?: boolean; danger?: boolean;
  icon?: keyof typeof Ionicons.glyphMap; badge?: number;
}) {
  const theme = useTheme(s => s.theme);
  const fill = web ? colors.accent : theme.color;
  const textColor = danger ? colors.danger : primary ? (web ? colors.bg : theme.textColorOnGradient) : colors.text;
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    onPress={() => { if (!web) hapticSelection(); onPress(); }}
    style={({ pressed, hovered, focused }: any) => [socialStyles.button,
      quiet && { backgroundColor: 'transparent', borderColor: 'transparent' },
      primary && { backgroundColor: fill, borderColor: fill },
      danger && { backgroundColor: colors.surface, borderColor: colors.danger },
      (hovered || focused) && !primary && { backgroundColor: colors.surfacePressed },
      pressed && { opacity: 0.7 }, disabled && { opacity: 0.4 }]}>
    {!web && primary && <LinearGradient colors={theme.gradient} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFill}/>}
    {icon && <Ionicons name={icon} size={17} color={textColor}/>}
    <Text style={[socialStyles.buttonText, { color: textColor }]}>{children}</Text>
    {!!badge && <View style={{ backgroundColor: colors.danger, borderRadius: 12, minWidth: 22, paddingHorizontal: 5, paddingVertical: 2 }}><Text style={[socialStyles.badge, { color: '#fff', textAlign: 'center' }]}>{badge > 99 ? '99+' : badge}</Text></View>}
  </Pressable>;
}

export function SocialIconButton({ label, icon, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={({ pressed, hovered, focused }: any) => [socialStyles.iconButton, (pressed || hovered || focused) && { backgroundColor: colors.surfacePressed }]}>
    <Ionicons name={icon} size={20} color={colors.textSecondary}/>
  </Pressable>;
}

/**
 * O avatar com o estado agarrado a ele.
 *
 * O "● Online now" era uma linha de texto que gastava a segunda linha da
 * conversa -- a mesma onde deve estar o que interessa. Um ponto no avatar diz
 * o mesmo sem gastar linha nenhuma.
 */
export function AvatarDeConversa({ avatarUrl, nome, online, tamanho = 54 }: {
  avatarUrl: string | null | undefined; nome?: string | null; online?: boolean; tamanho?: number;
}) {
  return <View>
    <FriendAvatar avatarUrl={avatarUrl} name={nome} size={tamanho}/>
    {online && <View style={socialStyles.pontoOnline}/>}
  </View>;
}

export function SocialTabs({ value, onChange }: { value: 'friends' | 'add'; onChange: (value: 'friends' | 'add') => void }) {
  return <View accessibilityRole="tablist" style={{ flex: 1, flexDirection: 'row', padding: 2, borderRadius: web ? radii.md : radii.pill, backgroundColor: colors.surface }}>
    {(['friends', 'add'] as const).map(tab => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: value === tab }} onPress={() => { if (!web) hapticSelection(); onChange(tab); }}
      style={({ pressed, hovered }: any) => ({ flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: web ? radii.md : radii.pill, backgroundColor: value === tab || pressed || hovered ? colors.surfaceHigh : 'transparent' })}>
      <Text style={[socialStyles.buttonText, { color: value === tab ? colors.text : colors.textSecondary }]}>{tab === 'friends' ? 'Chats' : 'Find people'}</Text>
    </Pressable>)}
  </View>;
}

/** Diálogo no Windows, folha no iOS; a conversa móvel ocupa o ecrã inteiro. */
export function SocialModal({ visible, title, onClose, children, wide = false, fullScreen = false, header }: {
  visible: boolean; title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; fullScreen?: boolean; header?: React.ReactNode;
}) {
  const safe = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  /**
   * Arrastar da esquerda para a direita volta atrás, como no resto da app.
   *
   * O chat parece um ecrã mas não é: é uma troca de vista dentro do Social,
   * por isso não herdava o gesto nativo da navegação. Quem lá estava dentro
   * ficava sem a saída que usa em todo o lado.
   *
   * O responder vive numa faixa estreita da margem esquerda -- por cima da
   * lista de mensagens roubava-lhe o dedo a cada scroll.
   */
  const fechar = React.useRef(onClose);
  fechar.current = onClose;
  const voltar = React.useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dx > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_e, g) => {
        if (g.dx > 60 || g.vx > 0.5) fechar.current();
      },
    })
  ).current;

  return <Modal visible={visible} transparent={!fullScreen} animationType={web ? 'fade' : 'slide'} onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: fullScreen ? colors.bg : colors.overlay, justifyContent: web ? 'center' : 'flex-end', alignItems: 'center', paddingTop: safe.top + (fullScreen ? 0 : 12), paddingBottom: web ? 12 : 0, paddingHorizontal: web ? 24 : 0 }}>
      {/* Tocar fora fecha. Só numa folha: em ecrã inteiro não há "fora", e
          fechar ao toque perdia a conversa a meio de a estar a ler.
          `accessible={false}` porque o X já dá a saída aos leitores de ecrã --
          um botão invisível do tamanho do ecrã só atrapalharia. */}
      {!fullScreen && <Pressable accessible={false} onPress={onClose} style={StyleSheet.absoluteFill} />}
      <View style={{ width: '100%', maxWidth: web ? (wide ? 940 : 680) : undefined, flex: fullScreen ? 1 : undefined, maxHeight: fullScreen ? undefined : web ? height - 24 : height - safe.top - 12, backgroundColor: web || fullScreen ? colors.bg : colors.surfaceHigh, borderColor: colors.borderStrong, borderWidth: web ? 1 : 0, borderRadius: fullScreen ? 0 : radii.xl, borderBottomLeftRadius: web ? radii.xl : 0, borderBottomRightRadius: web ? radii.xl : 0, paddingBottom: web ? 0 : safe.bottom, overflow: 'hidden' }}>
        {!web && !fullScreen && <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center', marginTop: 8 }}/>}
        {header ?? <View style={[socialStyles.row, { paddingHorizontal: 20, paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.border }]}>
          {fullScreen && <SocialIconButton label="Back to chats" icon="chevron-back" onPress={onClose}/>}
          <Text numberOfLines={1} style={[socialStyles.title, { flex: 1, fontSize: 19 }]}>{title}</Text>
          {!fullScreen && <SocialIconButton label="Close" icon="close" onPress={onClose}/>}
        </View>}
        {children}
        {!web && fullScreen && (
          <View {...voltar.panHandlers} style={socialStyles.margemDeVoltar} pointerEvents="box-only" />
        )}
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
