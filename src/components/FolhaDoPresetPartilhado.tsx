import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { avisarFeito, avisarInfo } from '../lib/avisoDeRemocao';
import { hapticSelection } from '../lib/haptics';
import { legendaDoPreset } from '../lib/presetPartilhado';
import { chaveDoAspeto } from '../lib/presetsDaAparencia';
import { PreviaAoVivo, type EcraDaPrevia } from '../screens/PersonalizarScreen';
import { useAparencia } from '../state/aparencia';
import { useCapaIOS } from '../state/capaIOS';
import { fecharPresetPartilhado, usePresetPartilhadoAberto } from '../state/presetPartilhadoAberto';
import { usePresetsDaAparencia } from '../state/presetsDaAparencia';
import { colors, spacing } from '../theme';
import { BottomSheet } from './BottomSheet';
import { PillButton } from './PillButton';

/**
 * Um preset da Customise que um amigo mandou (28/11, o João: "partilhar preset do
 * customization com amigos pelo chat, e eles podem guardar e usar").
 *
 * Abre do cartão na conversa (`tocarNoPresetDaMensagem`). Mostra-o na mesma prévia
 * ao vivo da Customise (`PreviaAoVivo`), com a música que toca, antes de se mexer
 * em nada: "Use this look" põe-no já, "Save to my presets" guarda-o (com um nome
 * que ainda não haja). Um preset que já se tem não se guarda outra vez.
 *
 * Só no iPhone (montada no `RootNavigator`): o PC não tem a Customise.
 */
export function FolhaDoPresetPartilhado() {
  const preset = usePresetPartilhadoAberto((s) => s.preset);
  const de = usePresetPartilhadoAberto((s) => s.de);
  const [foco, setFoco] = useState<EcraDaPrevia>('np');
  const [direita, setDireita] = useState<'home' | 'lista'>('home');
  const presets = usePresetsDaAparencia((s) => s.presets);
  // O aspeto de agora, para dizer se o preset já é o que se usa.
  const capaAgora = useCapaIOS((s) => s.style);
  const aspetoAgora = useAparencia((s) => chaveDoAspeto(s, capaAgora));
  useEffect(() => { if (preset) void usePresetsDaAparencia.getState().carregar(); }, [preset]);
  useEffect(() => { setFoco('np'); setDireita('home'); }, [preset]);

  const chave = preset ? chaveDoAspeto(preset.aparencia, preset.capa) : '';
  const jaTens = !!preset && presets.some((p) => chaveDoAspeto(p.aparencia, p.capa) === chave);
  const emUso = !!preset && aspetoAgora === chave;

  const usar = () => {
    if (!preset) return;
    hapticSelection();
    usePresetsDaAparencia.getState().usarRecebido(preset);
    avisarFeito('Look applied', preset.nome);
    fecharPresetPartilhado();
  };
  const guardar = () => {
    if (!preset) return;
    const r = usePresetsDaAparencia.getState().guardarRecebido(preset);
    if (r === 'cheio') { avisarInfo('Your presets are full', 'Delete one in Customise to save this one.'); return; }
    hapticSelection();
    avisarFeito(r === 'guardado' ? 'Preset saved' : 'Already in your presets', preset.nome);
  };

  return (
    <BottomSheet visible={!!preset} onClose={fecharPresetPartilhado}>
      {preset ? (
        <View style={styles.corpo}>
          <View style={styles.cabeca}>
            <Ionicons name="color-wand-outline" size={18} color={colors.textSecondary} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={styles.nome}>{preset.nome}</Text>
              <Text numberOfLines={2} style={styles.legenda}>
                {de ? `From ${de} · ${legendaDoPreset(preset)}` : legendaDoPreset(preset)}
              </Text>
            </View>
          </View>
          <PreviaAoVivo ap={preset.aparencia} capa={preset.capa} foco={foco} direita={direita}
            aoEscolher={(e) => { hapticSelection(); setDireita(e); setFoco(e); }} />
          <View style={styles.botoes}>
            <PillButton label={emUso ? 'In use' : 'Use this look'} onPress={usar} disabled={emUso} />
            <PillButton variant="ghost" label={jaTens ? 'In your presets' : 'Save to my presets'} onPress={guardar} disabled={jaTens} />
          </View>
          <Text style={styles.nota}>Using it changes your look now. Save it to come back to it from Customise.</Text>
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  corpo: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  cabeca: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nome: { fontSize: 17, fontWeight: '700', color: colors.text },
  legenda: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  botoes: { gap: spacing.sm },
  nota: { fontSize: 12, color: colors.textTertiary, textAlign: 'center' },
});
