import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import type { Source } from '../types';

export function SourceBadge({ source }: { source: Source }) {
  const isYt = source === 'youtube';
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: isYt ? colors.youtubeSoft : colors.spotifySoft },
      ]}
    >
      <View
        style={[
          styles.dot,
          { backgroundColor: isYt ? colors.youtube : colors.spotify },
        ]}
      />
      <Text
        style={[
          styles.label,
          { color: isYt ? colors.youtube : colors.spotify },
        ]}
      >
        {isYt ? 'YouTube' : 'Spotify'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    gap: 4,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
