import { displayArtist } from '../lib/artistName';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { hapticImpact } from '../lib/haptics';
import { getAudioQuality } from '../lib/prefs';
import { resolveYouTubeStream } from '../api/ytstream';
import {
  downloadProgressiveAudio,
  isAudioCached,
  removeDownloadedAudio,
} from '../lib/youtubeCache';
import { colors, radii, spacing, type } from '../theme';
import type { Track } from '../types';
import { BottomSheet } from './BottomSheet';
import { SourceBadge } from './SourceBadge';
import { ShareFriendSheet } from './ShareFriendSheet';

export interface SheetAction {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

interface Props {
  visible: boolean;
  track: Track | null;
  actions: SheetAction[];
  onClose: () => void;
}

export function TrackActionsSheet({ visible, track, actions, onClose }: Props) {
  const [shareFriendVisible, setShareFriendVisible] = React.useState(false);
  const [localTrack, setLocalTrack] = React.useState<Track | null>(null);

  React.useEffect(() => {
    if (track) {
      setLocalTrack(track);
    }
  }, [track]);

  const handleShareFriend = () => {
    setShareFriendVisible(true);
    onClose();
  };

  // Download offline (só YouTube — a infraestrutura do cache local já toca
  // ficheiros sem rede; isto só torna o download explícito e permanente).
  const [cacheBump, setCacheBump] = React.useState(0);
  const isYtTrack = track?.source === 'youtube';
  const isDownloaded = isYtTrack && track ? isAudioCached(track.sourceId) : false;
  void cacheBump; // força re-render do label após remover download

  const handleDownloadToggle = async () => {
    if (!track) return;
    if (isDownloaded) {
      removeDownloadedAudio(track.sourceId);
      setCacheBump((v) => v + 1);
      return;
    }
    onClose();
    try {
      const quality = await getAudioQuality();
      const stream = await resolveYouTubeStream(track.sourceId, quality);
      if (!stream.isHls) {
        await downloadProgressiveAudio(
          track.sourceId,
          stream.url,
          stream.contentLength,
          track.durationSeconds || stream.durationSeconds || null,
          {
            renewUrl: async () =>
              (await resolveYouTubeStream(track.sourceId, quality, true)).url,
          }
        );
      }
    } catch (err) {
      console.warn('[Download] Falha ao descarregar faixa:', err);
    }
  };

  const allActions = track
    ? [
        ...actions,
        ...(isYtTrack
          ? [
              {
                icon: (isDownloaded
                  ? 'checkmark-circle'
                  : 'arrow-down-circle-outline') as keyof typeof Ionicons.glyphMap,
                label: isDownloaded ? 'Remover download' : 'Descarregar',
                onPress: handleDownloadToggle,
              },
            ]
          : []),
        {
          icon: 'people-outline' as keyof typeof Ionicons.glyphMap,
          label: 'Partilhar com amigo…',
          onPress: handleShareFriend,
        },
      ]
    : actions;

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose}>
        {track ? (
          <View style={styles.header}>
            {track.artworkUrl ? (
              <Image
                source={{ uri: track.artworkUrl }}
                style={styles.art}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.art, styles.artFallback]}>
                <Ionicons
                  name="musical-notes"
                  size={16}
                  color={colors.textTertiary}
                />
              </View>
            )}
            <View style={{ flex: 1, gap: 3 }}>
              <Text numberOfLines={1} style={[type.headline]}>
                {track.title}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <SourceBadge source={track.source} />
                {track.artist ? (
                  <Text numberOfLines={1} style={type.caption}>
                    {displayArtist(track)}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}

        {allActions.map((a) => (
          <Pressable
            key={a.label}
            onPress={() => {
              hapticImpact();
              a.onPress();
            }}
            style={({ pressed }) => [
              styles.action,
              pressed && { backgroundColor: colors.surfacePressed },
            ]}
          >
            <Ionicons
              name={a.icon}
              size={20}
              color={a.destructive ? colors.danger : colors.text}
            />
            <Text
              style={[
                type.body,
                { fontWeight: '600' },
                a.destructive && { color: colors.danger },
              ]}
            >
              {a.label}
            </Text>
          </Pressable>
        ))}
      </BottomSheet>

      <ShareFriendSheet
        visible={shareFriendVisible}
        itemType="track"
        item={localTrack}
        onClose={() => {
          setShareFriendVisible(false);
          setLocalTrack(null);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    marginBottom: spacing.sm,
  },
  art: {
    width: 44,
    height: 44,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
  },
  artFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
  },
});
