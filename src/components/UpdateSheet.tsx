import React, { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import {
  checkForUpdate,
  dismissUpdate,
  PORTFOLIO_URL,
  type UpdateInfo,
} from '../lib/updates';
import { colors, spacing, type } from '../theme';
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
 * Aviso de nova versão disponível.
 *
 * Só aparece na plataforma onde a versão saiu de facto — o versions.json
 * tem entradas separadas para iOS e Windows, e cada build só lê a sua.
 */
export function UpdateSheet() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

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
    void Linking.openURL(PORTFOLIO_URL);
    close();
  };

  const lines = summarise(update.notes);

  return (
    <BottomSheet visible onClose={close}>
      <Text style={type.micro}>
        {update.platform === 'ios' ? 'iOS' : 'Windows'} · {update.current} → {update.latest}
      </Text>
      <Text style={[type.title, { marginTop: spacing.sm, marginBottom: 6 }]}>
        Nova versão disponível
      </Text>

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
        <PillButton label="Open the site" variant="primary" onPress={open} />
        <PillButton label="Not now" variant="ghost" onPress={later} />
      </View>
    </BottomSheet>
  );
}
