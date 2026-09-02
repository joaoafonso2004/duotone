import { FriendAvatar } from './FriendAvatar';
import { Ionicons } from '@expo/vector-icons';
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
import { getFriendships, shareItem, type Friendship } from '../api/social';
import { colors, radii, spacing, type as typography } from '../theme';
import { useTheme } from '../state/theme';
import { hapticNotification, hapticSelection } from '../lib/haptics';

interface ShareFriendSheetProps {
  visible: boolean;
  itemType: 'playlist' | 'track';
  item: any; // Track ou Playlist
  onClose: () => void;
}

export function ShareFriendSheet({ visible, itemType, item, onClose }: ShareFriendSheetProps) {
  const theme = useTheme((s) => s.theme);
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [sendingStates, setSendingStates] = useState<Record<string, 'idle' | 'sending' | 'sent'>>({});

  useEffect(() => {
    if (visible) {
      setLoading(true);
      setComment('');
      setSendingStates({});
      getFriendships()
        .then((list) => {
          setFriends(list.filter((f) => f.status === 'accepted'));
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [visible]);

  const handleShare = async (friend: Friendship) => {
    const friendId = friend.friendId;
    if (sendingStates[friendId] === 'sending' || sendingStates[friendId] === 'sent') return;

    hapticSelection();
    setSendingStates((prev) => ({ ...prev, [friendId]: 'sending' }));

    try {
      await shareItem(friendId, itemType, item, comment);
      hapticNotification();
      setSendingStates((prev) => ({ ...prev, [friendId]: 'sent' }));
    } catch {
      setSendingStates((prev) => ({ ...prev, [friendId]: 'idle' }));
    }
  };

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
            Partilhar {itemType === 'track' ? 'Música' : 'Playlist'}
          </Text>

          {/* Comment input */}
          <View style={{ marginBottom: spacing.md }}>
            <Text style={[typography.micro, { marginBottom: spacing.xs, color: colors.textSecondary }]}>
              MENSAGEM / COMENTÁRIO (OPCIONAL)
            </Text>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Escreve algo sobre este som..."
              placeholderTextColor={colors.textTertiary}
              style={styles.commentInput}
              autoCorrect={false}
            />
          </View>

          {/* Friends list */}
          <Text style={[typography.micro, { marginBottom: spacing.sm, color: colors.textSecondary }]}>
            SELECIONAR AMIGOS
          </Text>

          {loading ? (
            <ActivityIndicator color={theme.color} style={{ marginVertical: 32 }} />
          ) : friends.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={24} color={colors.textTertiary} />
              <Text style={styles.emptyText}>Garante que tens amigos aceites para partilhares músicas.</Text>
            </View>
          ) : (
            <FlatList
              data={friends}
              keyExtractor={(f) => f.friendId}
              style={{ maxHeight: 250 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: friend }) => {
                const state = sendingStates[friend.friendId] || 'idle';
                return (
                  <View style={styles.friendRow}>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <FriendAvatar avatarUrl={friend.avatarUrl} name={friend.name} size={36}/>
                      <View style={{ flex: 1 }}>
                        <Text style={[typography.body, { fontWeight: '600' }]} numberOfLines={1}>
                          {friend.name}
                        </Text>
                        <Text style={[typography.caption, { fontSize: 11 }]} numberOfLines={1}>
                          @{friend.username}
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      onPress={() => handleShare(friend)}
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
                          Enviado!
                        </Text>
                      ) : (
                        <Text style={[typography.body, { color: theme.color, fontWeight: '700', fontSize: 12 }]}>
                          Partilhar
                        </Text>
                      )}
                    </Pressable>
                  </View>
                );
              }}
            />
          )}

          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Fechar</Text>
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
