import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, radii, spacing, type } from '../theme';

/**
 * Um caminho a seguir, dentro de um ecrã vazio.
 *
 * Um ecrã vazio que só diz "não há nada" é um beco: a app tinha importação de
 * playlists do YouTube e do Spotify, e nada nos ecrãs vazios dizia que elas
 * existiam. Isto existe para o primeiro minuto de uma conta nova ter para onde
 * ir — e para as duas plataformas oferecerem os mesmos passos.
 */
export function PrimeiroPasso({
  icon, label, nota, onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /** Uma linha a explicar, quando o nome não chega. */
  nota?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: 56,
        paddingHorizontal: spacing.lg,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.surfacePressed : colors.surface,
      }]}
    >
      <Ionicons name={icon} size={20} color={colors.text} />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text numberOfLines={1} style={[type.body, { fontWeight: '600' }]}>{label}</Text>
        {!!nota && <Text numberOfLines={1} style={type.caption}>{nota}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
    </Pressable>
  );
}
