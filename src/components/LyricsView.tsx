import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { fetchLyrics, LyricsData } from '../api/lyrics';
import { usePlayer } from '../state/player';
import { colors, spacing, radii } from '../theme';
import type { Track } from '../types';

interface Props {
  track: Track;
  positionMs: number;
  onClose: () => void;
}

export function LyricsView({ track, positionMs, onClose }: Props) {
  const seekTo = usePlayer((s) => s.seekTo);
  const [lyrics, setLyrics] = useState<LyricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLyrics(null);

    fetchLyrics(track.title, track.artist ?? '', track.durationSeconds ?? undefined)
      .then((data) => {
        if (active) {
          setLyrics(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [track]);

  // Find active line index
  const activeIndex = lyrics?.parsedLines
    ? lyrics.parsedLines.findIndex(
        (line, index) =>
          positionMs >= line.timeMs &&
          (index === lyrics.parsedLines.length - 1 || positionMs < lyrics.parsedLines[index + 1].timeMs)
      )
    : -1;

  // Auto scroll to active lyric line
  useEffect(() => {
    if (activeIndex >= 0 && flatListRef.current) {
      flatListRef.current.scrollToIndex({
        index: activeIndex,
        animated: true,
        viewPosition: 0.3,
      });
    }
  }, [activeIndex]);

  const handleLinePress = (timeMs: number) => {
    seekTo(timeMs);
  };

  return (
    <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <View style={styles.container} onStartShouldSetResponder={() => true}>
          {loading ? (
            <ActivityIndicator color={colors.text} size="large" />
          ) : !lyrics || (!lyrics.plainLyrics && lyrics.parsedLines.length === 0) ? (
            <View style={styles.centered}>
              <Text style={styles.errorText}>Lyrics not available</Text>
              <Pressable style={styles.closeBtn} onPress={onClose}>
                <Text style={styles.closeBtnText}>Dismiss</Text>
              </Pressable>
            </View>
          ) : lyrics.parsedLines.length > 0 ? (
            /* Synced Lyrics List */
            <FlatList
              ref={flatListRef}
              data={lyrics.parsedLines}
              keyExtractor={(item, index) => `${item.timeMs}-${index}`}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              onScrollToIndexFailed={(info) => {
                flatListRef.current?.scrollToOffset({
                  offset: info.averageItemLength * info.index,
                  animated: true,
                });
              }}
              renderItem={({ item, index }) => {
                const isActive = index === activeIndex;
                return (
                  <Pressable
                    style={styles.linePressable}
                    onPress={() => handleLinePress(item.timeMs)}
                  >
                    <Text
                      style={[
                        styles.lyricLine,
                        isActive && styles.lyricLineActive,
                      ]}
                    >
                      {item.text}
                    </Text>
                  </Pressable>
                );
              }}
            />
          ) : (
            /* Static Plain Lyrics */
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.plainLyrics}>{lyrics.plainLyrics}</Text>
              <Pressable style={[styles.closeBtn, { marginTop: 24 }]} onPress={onClose}>
                <Text style={styles.closeBtnText}>Close Lyrics</Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      </Pressable>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  errorText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  closeBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  listContent: {
    paddingVertical: 200, // Large padding at top/bottom to keep active line centered
  },
  linePressable: {
    paddingVertical: spacing.md,
  },
  lyricLine: {
    fontSize: 19,
    lineHeight: 28,
    fontWeight: '600',
    color: colors.text,
    opacity: 0.4,
    textAlign: 'center',
  },
  lyricLineActive: {
    fontSize: 22,
    lineHeight: 32,
    fontWeight: '800',
    color: colors.text,
    opacity: 1.0,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  scrollContent: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  plainLyrics: {
    fontSize: 17,
    lineHeight: 28,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
