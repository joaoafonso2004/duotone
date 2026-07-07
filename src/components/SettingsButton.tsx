import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Pressable } from 'react-native';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { colors } from '../theme';

/** Botão de engrenagem, consistente em todas as tabs, para abrir Definições. */
export function SettingsButton() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <Pressable
      hitSlop={10}
      onPress={() => navigation.navigate('Settings')}
      accessibilityLabel="Settings"
      accessibilityRole="button"
    >
      <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
    </Pressable>
  );
}
