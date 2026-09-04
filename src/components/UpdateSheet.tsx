import React, { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  checkForUpdate,
  dismissUpdate,
  PORTFOLIO_URL,
  SIDELOADLY_URL,
  type UpdateInfo,
} from '../lib/updates';
import { colors, radii, spacing, type } from '../theme';
import { BottomSheet } from './BottomSheet';
import { PillButton } from './PillButton';

/** Máximo de linhas das notas mostradas no popup — o resto fica no site. */
const MAX_NOTES = 4;

function summarise(notes: string): string[] {
  return notes
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('<!--'))
    .map((l) =>
      l
        .replace(/^#{1,6}\s*/, '')
        .replace(/^[-*+]\s+/, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/`(.+?)`/g, '$1')
    )
    .slice(0, MAX_NOTES);
}

/**
 * Como se instala a nova versão, que não é a mesma coisa nos dois sistemas.
 *
 * No Windows o site entrega um instalador e acabou. No iOS a app não vem de
 * loja nenhuma: o Sideloadly corre no computador e instala o IPA no iPhone.
 */
const COMO_ATUALIZAR: Record<'ios' | 'windows', string[]> = {
  ios: [
    'Open Sideloadly on your Mac or PC.',
    'Download the new Duotone IPA and install it on your iPhone.',
  ],
  windows: [
    'Open the site and download Duotone.',
    'Run the installer.',
  ],
};

/**
 * Aviso de nova versão disponível.
 *
 * Só aparece na plataforma onde a versão saiu de facto — o versions.json
 * tem entradas separadas para iOS e Windows, e cada build só lê a sua.
 */
export function UpdateSheet() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  // Fechado por omissão: quem já sabe atualizar não quer o passo a passo
  // à frente das notas de versão todas as vezes.
  const [ajuda, setAjuda] = useState(false);

  useEffect(() => {
    let cancelled = false;
    checkForUpdate().then((info) => {
      if (!cancelled) setUpdate(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!update) return null;

  const close = () => setUpdate(null);

  const later = () => {
    // Não volta a insistir nesta versão — mas volta a avisar na próxima.
    void dismissUpdate(update.platform, update.latest);
    close();
  };

  const open = () => {
    void Linking.openURL(update.platform === 'ios' ? SIDELOADLY_URL : PORTFOLIO_URL);
    close();
  };

  const lines = summarise(update.notes);

  return (
    <BottomSheet visible onClose={close}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={type.micro}>
            {update.platform === 'ios' ? 'iOS' : 'Windows'} · {update.current} → {update.latest}
          </Text>
          <Text style={[type.title, { marginTop: spacing.sm, marginBottom: 6 }]}>
            New version available
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ajuda ? 'Hide update instructions' : 'How do I update?'}
          accessibilityState={{ expanded: ajuda }}
          hitSlop={10}
          onPress={() => setAjuda((a) => !a)}
          style={({ pressed }: any) => [{
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: ajuda ? colors.surfaceHigh : 'transparent',
            borderWidth: 1,
            borderColor: ajuda ? colors.borderStrong : colors.border,
            opacity: pressed ? 0.6 : 1,
          }]}
        >
          <Ionicons
            name="help"
            size={17}
            color={ajuda ? colors.text : colors.textSecondary}
          />
        </Pressable>
      </View>

      {ajuda && (
        <View style={{
          backgroundColor: colors.surfaceHigh,
          borderRadius: radii.md,
          borderWidth: 1,
          borderColor: colors.border,
          padding: spacing.md,
          gap: 6,
          marginBottom: spacing.sm,
        }}>
          <Text style={[type.micro, { marginBottom: 2 }]}>HOW TO UPDATE</Text>
          {COMO_ATUALIZAR[update.platform].map((passo, i) => (
            <Text key={i} style={[type.caption, { lineHeight: 19 }]}>
              <Text style={{ color: colors.accent }}>{i + 1}. </Text>
              {passo}
            </Text>
          ))}
        </View>
      )}

      {lines.length > 0 && (
        <View style={{ gap: 4, marginBottom: spacing.sm }}>
          {lines.map((line, i) => (
            <Text key={i} style={[type.caption, { lineHeight: 19 }]}>
              <Text style={{ color: colors.accent }}>— </Text>
              {line}
            </Text>
          ))}
        </View>
      )}

      <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
        <PillButton label={update.platform === 'ios' ? 'Open Sideloadly' : 'Open the site'} variant="primary" onPress={open} />
        <PillButton label="Not now" variant="ghost" onPress={later} />
      </View>
    </BottomSheet>
  );
}
