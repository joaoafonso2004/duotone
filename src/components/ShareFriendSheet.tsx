import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  getFriendships, getGrupos, shareComGrupo, shareItem,
  type ChatGroup, type Friendship,
} from '../api/social';
import { hapticNotification, hapticSelection } from '../lib/haptics';
import { useTheme } from '../state/theme';
import { colors, radii, spacing, type } from '../theme';
import { BottomSheet } from './BottomSheet';
import { FriendAvatar } from './FriendAvatar';
import { GroupAvatar } from './GroupChat';
import { Input } from './Input';

type Destino =
  | { kind: 'group'; id: string; nome: string; sub: string; grupo: ChatGroup }
  | { kind: 'friend'; id: string; nome: string; sub: string; amigo: Friendship };

interface ShareFriendSheetProps {
  visible: boolean;
  itemType: 'playlist' | 'track';
  item: any; // Track ou Playlist
  onClose: () => void;
}

/**
 * Mandar uma faixa ou uma playlist a alguém.
 *
 * Construída sobre o mesmo `BottomSheet` do "Adicionar a playlist", e não
 * sobre um modal próprio: eram duas folhas com o mesmo trabalho e desenhos
 * diferentes -- cantos, pega, título, tipos de letra, e até a forma de fechar.
 * Partilhadas as fundações, herda também o arrastar para baixo.
 *
 * A linha inteira é o botão, como nas playlists. Antes havia um "Share"
 * pequeno à direita e o resto da linha não fazia nada.
 */
export function ShareFriendSheet({ visible, itemType, item, onClose }: ShareFriendSheetProps) {
  const tema = useTheme((s) => s.theme);
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [sendingStates, setSendingStates] = useState<Record<string, 'idle' | 'sending' | 'sent'>>({});

  useEffect(() => {
    if (visible) {
      setLoading(true);
      setComment('');
      setSendingStates({});
      // Os grupos faltavam aqui: dava para os criar e falar neles, mas não
      // para lhes mandar uma música ou uma playlist -- o único caminho era
      // abrir a conversa do grupo. Vão os dois, e um falhar não leva o outro.
      Promise.allSettled([getFriendships(), getGrupos()])
        .then(([a, g]) => {
          if (a.status === 'fulfilled') setFriends(a.value.filter((f) => f.status === 'accepted'));
          if (g.status === 'fulfilled') setGroups(g.value);
        })
        .finally(() => setLoading(false));
    }
  }, [visible]);

  const chaveDe = (alvo: Destino) => (alvo.kind === 'group' ? `g:${alvo.id}` : alvo.id);

  const handleShare = async (alvo: Destino) => {
    const chave = chaveDe(alvo);
    if (sendingStates[chave] === 'sending' || sendingStates[chave] === 'sent') return;

    hapticSelection();
    setSendingStates((prev) => ({ ...prev, [chave]: 'sending' }));

    try {
      if (alvo.kind === 'group') await shareComGrupo(alvo.id, itemType, item, comment);
      else await shareItem(alvo.id, itemType, item, comment);
      hapticNotification();
      setSendingStates((prev) => ({ ...prev, [chave]: 'sent' }));
    } catch {
      setSendingStates((prev) => ({ ...prev, [chave]: 'idle' }));
    }
  };

  // Grupos primeiro: são menos, e é para eles que se partilha quando se quer
  // que mais do que uma pessoa oiça.
  const destinos: Destino[] = [
    ...groups.map((g) => ({
      kind: 'group' as const, id: g.id, nome: g.name,
      sub: `${g.membros.length} ${g.membros.length === 1 ? 'member' : 'members'}`, grupo: g,
    })),
    ...friends.map((f) => ({
      kind: 'friend' as const, id: f.friendId, nome: f.name, sub: `@${f.username}`, amigo: f,
    })),
  ];

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={[type.title, { marginBottom: spacing.md }]}>
        Share {itemType === 'track' ? 'track' : 'playlist'}
      </Text>

      <View style={{ marginBottom: spacing.md }}>
        <Input
          icon="chatbubble-outline"
          placeholder="Say something about it…"
          value={comment}
          onChangeText={setComment}
          onClear={() => setComment('')}
          autoCorrect={false}
          returnKeyType="done"
        />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.text} style={{ marginVertical: 24 }} />
      ) : destinos.length === 0 ? (
        <View style={styles.vazio}>
          <Ionicons name="people-outline" size={24} color={colors.textTertiary} />
          <Text style={[type.caption, { textAlign: 'center' }]}>
            You need a friend or a group before you can share music.
          </Text>
        </View>
      ) : (
        <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
          {destinos.map((alvo) => {
            const estado = sendingStates[chaveDe(alvo)] ?? 'idle';
            const enviado = estado === 'sent';
            return (
              <Pressable
                key={`${alvo.kind}:${alvo.id}`}
                onPress={() => handleShare(alvo)}
                disabled={estado !== 'idle'}
                style={({ pressed }) => [
                  styles.row,
                  pressed && { backgroundColor: colors.surfacePressed },
                ]}
              >
                {alvo.kind === 'group' ? (
                  <GroupAvatar group={alvo.grupo} size={44} />
                ) : (
                  <FriendAvatar avatarUrl={alvo.amigo.avatarUrl} name={alvo.nome} size={44} />
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[type.body, { fontWeight: '600' }]}>
                    {alvo.nome}
                  </Text>
                  <Text numberOfLines={1} style={type.caption}>{alvo.sub}</Text>
                </View>
                {/* O mesmo vocabulário da folha das playlists: um visto quando
                    está feito, uma seta quando ainda há alguma coisa a fazer. */}
                {estado === 'sending' ? (
                  <ActivityIndicator size="small" color={tema.color} />
                ) : (
                  <Ionicons
                    name={enviado ? 'checkmark-circle' : 'paper-plane-outline'}
                    size={enviado ? 20 : 16}
                    color={enviado ? colors.text : colors.textTertiary}
                  />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.md,
  },
  vazio: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 32,
    paddingHorizontal: spacing.lg,
  },
});
