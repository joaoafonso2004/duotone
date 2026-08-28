import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { decodeAvatar } from '../lib/avatarPrefs';
import { colors } from '../theme';

interface Props {
  /** `profiles.avatar_url`: um URL, ou `emoji:<emoji>:<gradiente>`. */
  avatarUrl: string | null | undefined;
  name?: string | null;
  size?: number;
}

/** Avatar de outra pessoa. Ver `decodeAvatar` para o formato. */
export function FriendAvatar({ avatarUrl, name, size = 36 }: Props) {
  const avatar = decodeAvatar(avatarUrl, name);
  const round = { width: size, height: size, borderRadius: size / 2 };

  if (avatar.kind === 'emoji') {
    return (
      <LinearGradient colors={avatar.gradient} style={[round, styles.center]}>
        <Text style={{ fontSize: size * 0.48 }}>{avatar.emoji}</Text>
      </LinearGradient>
    );
  }

  if (avatar.kind === 'image') {
    return <Image source={{ uri: avatar.url }} style={round} contentFit="cover" />;
  }

  return (
    <View style={[round, styles.center, styles.fallback]}>
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: size * 0.42 }}>
        {avatar.letter}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  fallback: { backgroundColor: colors.surfaceHigh },
});
