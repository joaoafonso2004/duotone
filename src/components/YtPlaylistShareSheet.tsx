import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import {
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PillButton } from './PillButton';
import { colors, radii, spacing, type } from '../theme';
import { hapticNotification, hapticSelection } from '../lib/haptics';

interface Props {
  visible: boolean;
  onClose: () => void;
  playlistId: string;
  playlistName: string;
}

export function YtPlaylistShareSheet({
  visible,
  onClose,
  playlistId,
  playlistName,
}: Props) {
  const insets = useSafeAreaInsets();
  const shareLink = `duotone://playlist/import?id=${playlistId}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
    shareLink
  )}`;

  const handleShare = async () => {
    hapticSelection();
    try {
      await Share.share({
        title: `Playlist: ${playlistName}`,
        message: `Importa a minha playlist "${playlistName}" no Duotone:\n${shareLink}`,
      });
      hapticNotification();
    } catch (err) {
      console.warn('Erro ao partilhar:', err);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.dismiss} onPress={onClose} />
        
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              Partilhar Playlist
            </Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Content */}
          <View style={styles.content}>
            <Text style={styles.playlistName} numberOfLines={1}>
              {playlistName}
            </Text>
            
            <Text style={styles.instructions}>
              Pede a um amigo para digitalizar este Código QR com a câmara do telemóvel para importar esta playlist.
            </Text>

            {/* QR Code Container */}
            <View style={styles.qrContainer}>
              <Image
                source={{ uri: qrUrl }}
                style={styles.qrImage}
                contentFit="contain"
              />
            </View>

            {/* Actions */}
            <PillButton
              label="Partilhar Link"
              variant="primary"
              onPress={handleShare}
              style={styles.actionBtn}
            />

            <PillButton
              label="Fechar"
              variant="ghost"
              onPress={onClose}
              style={{ ...styles.actionBtn, marginTop: spacing.xs }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  dismiss: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  title: {
    ...type.title,
    color: colors.text,
    flex: 1,
  },
  closeBtn: {
    padding: 4,
  },
  content: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  playlistName: {
    ...type.title,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  instructions: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
    lineHeight: 18,
  },
  qrContainer: {
    backgroundColor: '#fff',
    padding: spacing.md,
    borderRadius: radii.lg,
    marginBottom: spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  qrImage: {
    width: 200,
    height: 200,
  },
  actionBtn: {
    width: '100%',
  },
});
