import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { naoLidasPorAmigo } from '../lib/social';
import { useSocial } from '../state/social';
import { colors } from '../theme';

/**
 * As mensagens por ler e os pedidos de amizade por responder: o mesmo número
 * que acende o Social na lateral do PC (`casca.web.tsx`).
 */
export function useAvisosDoSocial(): number {
  const received = useSocial((s) => s.received);
  const seen = useSocial((s) => s.seen);
  const pedidos = useSocial((s) => s.friends.filter((f) => f.status === 'pending' && !f.isSender).length);
  return [...naoLidasPorAmigo(received, seen).values()].reduce((n, v) => n + v, 0) + pedidos;
}

/**
 * A porta para o Social no cabeçalho da Home (5/10, auditoria de consistência
 * N4). No iPhone o Social é um separador fora da barra (seis ícones não
 * cabiam), e só se chegava lá a deslizar para lá do Perfil ou pelo botão do
 * perfil. A Home é onde já estão os amigos a ouvir.
 */
export function BotaoDasMensagens({ onPress }: { onPress: () => void }) {
  const avisos = useAvisosDoSocial();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={avisos ? `Friends and chats, ${avisos} new` : 'Friends and chats'}
      hitSlop={12}
      onPress={onPress}
      style={({ pressed }) => pressed && { opacity: 0.6 }}
    >
      <Ionicons name="chatbubbles-outline" size={23} color={colors.textSecondary} />
      {avisos > 0 ? (
        <View style={styles.emblema}>
          <Text style={styles.numero}>{avisos > 99 ? '99+' : avisos}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  emblema: {
    position: 'absolute', right: -8, top: -6, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: colors.danger, justifyContent: 'center', borderWidth: 2, borderColor: colors.bg,
  },
  numero: { fontSize: 10, fontWeight: '800', color: '#fff', textAlign: 'center' },
});
