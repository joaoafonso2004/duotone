import { FriendAvatar } from './FriendAvatar';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Keyboard,
} from 'react-native';
import { getFriendships, getGrupos, shareComGrupo, shareItem, type ChatGroup, type Friendship } from '../api/social';
import { GroupAvatar } from './GroupChat';
import { colors, radii, spacing, type as typography } from '../theme';
import { useTheme } from '../state/theme';
import { hapticNotification, hapticSelection } from '../lib/haptics';

type Destino =
  | { kind: 'group'; id: string; nome: string; sub: string; grupo: ChatGroup }
  | { kind: 'friend'; id: string; nome: string; sub: string; amigo: Friendship };

interface ShareFriendSheetProps {
  visible: boolean;
  itemType: 'playlist' | 'track';
  item: any; // Track ou Playlist
  onClose: () => void;
}

export function ShareFriendSheet({ visible, itemType, item, onClose }: ShareFriendSheetProps) {
  const theme = useTheme((s) => s.theme);
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

  /** `alvo` é um amigo ou um grupo; a chave do estado distingue-os. */
  const handleShare = async (alvo: Destino) => {
    const chave = alvo.kind === 'group' ? `g:${alvo.id}` : alvo.id;
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
    ...groups.map((g) => ({ kind: 'group' as const, id: g.id, nome: g.name, sub: `${g.membros.length} ${g.membros.length === 1 ? 'member' : 'members'}`, grupo: g })),
    ...friends.map((f) => ({ kind: 'friend' as const, id: f.friendId, nome: f.name, sub: `@${f.username}`, amigo: f })),
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Sem isto o teclado tapava a lista de amigos e os botões "Partilhar"
          quando o campo de mensagem estava focado. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          
          <Text style={[typography.body, { fontWeight: '700', textAlign: 'center', marginBottom: spacing.md }]}>
            Share {itemType === 'track' ? 'track' : 'playlist'}
          </Text>

          {/* Comment input */}
          <View style={{ marginBottom: spacing.md }}>
            <Text style={[typography.micro, { marginBottom: spacing.xs, color: colors.textSecondary }]}>
              MESSAGE (OPTIONAL)
            </Text>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Say something about it…"
              placeholderTextColor={colors.textTertiary}
              style={styles.commentInput}
              autoCorrect={false}
            />
          </View>

          {/* Grupos e amigos */}
          <Text style={[typography.micro, { marginBottom: spacing.sm, color: colors.textSecondary }]}>
            {groups.length ? 'CHOOSE A GROUP OR A FRIEND' : 'CHOOSE FRIENDS'}
          </Text>

          {loading ? (
            <ActivityIndicator color={theme.color} style={{ marginVertical: 32 }} />
          ) : destinos.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={24} color={colors.textTertiary} />
              <Text style={styles.emptyText}>You need a friend or a group before you can share music.</Text>
            </View>
          ) : (
            <FlatList
              data={destinos}
              keyExtractor={(d) => `${d.kind}:${d.id}`}
              style={{ maxHeight: 250 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: alvo }) => {
                const state = sendingStates[alvo.kind === 'group' ? `g:${alvo.id}` : alvo.id] || 'idle';
                return (
                  <View style={styles.friendRow}>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      {alvo.kind === 'group'
                        ? <GroupAvatar group={alvo.grupo} size={36}/>
                        : <FriendAvatar avatarUrl={alvo.amigo.avatarUrl} name={alvo.nome} size={36}/>}
                      <View style={{ flex: 1 }}>
                        <Text style={[typography.body, { fontWeight: '600' }]} numberOfLines={1}>
                          {alvo.nome}
                        </Text>
                        <Text style={[typography.caption, { fontSize: 11 }]} numberOfLines={1}>
                          {alvo.sub}
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      onPress={() => handleShare(alvo)}
                      disabled={state !== 'idle'}
                      style={({ pressed }) => [
                        styles.shareBtn,
                        state === 'sent' && { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
                        pressed && { opacity: 0.8 },
                      ]}
                    >
                      {state === 'sending' ? (
                        <ActivityIndicator size="small" color={theme.color} />
                      ) : state === 'sent' ? (
                        <Text style={[typography.body, { color: colors.spotify, fontWeight: '700', fontSize: 12 }]}>
                          Sent
                        </Text>
                      ) : (
                        <Text style={[typography.body, { color: theme.color, fontWeight: '700', fontSize: 12 }]}>
                          Share
                        </Text>
                      )}
                    </Pressable>
                  </View>
                );
              }}
            />
          )}

          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.sm,
  },
  commentInput: {
    height: 40,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: spacing.xs,
  },
  emptyText: {
    ...typography.caption,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  avatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  shareBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceHigh,
    minWidth: 70,
    alignItems: 'center',
  },
  closeBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radii.pill,
    paddingVertical: 14,
    alignItems: 'center',
  },
  closeBtnText: {
    ...typography.body,
    fontWeight: '700',
  },
});
