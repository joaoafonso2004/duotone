import React, { useEffect, useState } from 'react';
import { Linking, Text } from 'react-native';
import { avisarFeito } from '../lib/avisoDeRemocao';
import { FRASES_DO_SCROBBLING, pareceTokenDoListenBrainz } from '../lib/scrobbling';
import { desligarListenBrainz, ligarListenBrainz, useScrobbling } from '../state/scrobbling';
import { colors, spacing, type } from '../theme';
import { BottomSheet } from './BottomSheet';
import { Input } from './Input';
import { PillButton } from './PillButton';

/**
 * Ligar e desligar o ListenBrainz (16/11, lib/scrobbling.ts), nas Definições das
 * duas plataformas (no PC a folha é um diálogo). O token cola-se uma vez,
 * confirma-se no ListenBrainz e fica só no aparelho.
 */
export function FolhaDoListenBrainz({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const utilizador = useScrobbling((s) => s.utilizador);
  const [token, setToken] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aLigar, setALigar] = useState(false);
  useEffect(() => { if (visible) { setToken(''); setErro(null); } }, [visible]);

  const ligar = async () => {
    const t = token.trim();
    if (!pareceTokenDoListenBrainz(t)) { setErro(FRASES_DO_SCROBBLING.tokenMau); return; }
    setALigar(true);
    const r = await ligarListenBrainz(t);
    setALigar(false);
    if ('utilizador' in r) { avisarFeito(FRASES_DO_SCROBBLING.ligou(r.utilizador)); onClose(); return; }
    setErro(r.erro === 'recusado' ? FRASES_DO_SCROBBLING.tokenRecusado : "Couldn't reach ListenBrainz. Try again.");
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} titulo={FRASES_DO_SCROBBLING.titulo}>
      {utilizador ? (
        <>
          <Text style={[type.body, { marginBottom: spacing.lg }]}>{FRASES_DO_SCROBBLING.ligado(utilizador)}</Text>
          <PillButton
            label={FRASES_DO_SCROBBLING.desligar}
            onPress={() => { void desligarListenBrainz().then(() => { avisarFeito(FRASES_DO_SCROBBLING.desligou); onClose(); }); }}
          />
        </>
      ) : (
        <>
          <Text style={[type.caption, { marginBottom: spacing.md }]}>
            {FRASES_DO_SCROBBLING.ondeEsta}{' '}
            <Text style={{ color: colors.text, textDecorationLine: 'underline' }}
              onPress={() => { void Linking.openURL('https://listenbrainz.org/settings/').catch(() => {}); }}>
              Open it
            </Text>
          </Text>
          <Input
            placeholder={FRASES_DO_SCROBBLING.pedirToken}
            value={token}
            onChangeText={(t) => { setToken(t); setErro(null); }}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => void ligar()}
            onClear={() => setToken('')}
          />
          {erro ? <Text accessibilityRole="alert" style={[type.caption, { color: colors.danger, marginTop: spacing.sm }]}>{erro}</Text> : null}
          <PillButton label="Connect" onPress={() => void ligar()} loading={aLigar} disabled={!token.trim() || aLigar} style={{ marginTop: spacing.lg }} />
        </>
      )}
    </BottomSheet>
  );
}
