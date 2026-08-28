import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { decodeAvatar } from '../lib/avatarPrefs';
import { desktop } from '../desktop/ui.web';

interface Props {
  /** `profiles.avatar_url`: um URL, ou `emoji:<emoji>:<gradiente>`. */
  avatarUrl: string | null | undefined;
  name?: string | null;
  size?: number;
}

/**
 * Avatar de outra pessoa no desktop.
 *
 * Mesma decodificação que a versão do telemóvel; muda só o gradiente, que
 * aqui é CSS (`linear-gradient`) em vez do expo-linear-gradient, como no
 * resto do shell desktop.
 */
export function FriendAvatar({ avatarUrl, name, size = 36 }: Props) {
  const avatar = decodeAvatar(avatarUrl, name);
  const round = { width: size, height: size, borderRadius: size / 2 };

  if (avatar.kind === 'emoji') {
    return (
      <View
        style={[
          round,
          s.center,
          { backgroundImage: `linear-gradient(135deg, ${avatar.gradient[0]}, ${avatar.gradient[1]})` } as any,
        ]}
      >
        <Text style={{ fontSize: size * 0.46 }}>{avatar.emoji}</Text>
      </View>
    );
  }

  if (avatar.kind === 'image') {
    return <Image source={{ uri: avatar.url }} style={round} />;
  }

  return (
    <View style={[round, s.center, { backgroundColor: desktop.raised }]}>
      <Text style={{ color: desktop.text, fontWeight: '700', fontSize: size * 0.4 }}>
        {avatar.letter}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
