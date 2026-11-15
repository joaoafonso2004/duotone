import React, { useEffect, useState } from 'react';
import { Switch, Text, TextInput, View, StyleSheet } from 'react-native';
import { relatarProblema } from '../api/relatos';
import { APP_VERSION } from '../lib/buildInfo';
import { avisarErro, avisarFeito } from '../lib/avisoDeRemocao';
import { mensagemDeErro } from '../lib/mensagemDeErro';
import { plataformaDoRelatorio, textoDoRelatorioDeReproducao } from '../lib/relatorioDeReproducao';
import {
  FRASES_DO_RELATO, MAXIMO_DO_COMENTARIO, podeEnviarRelato, relatorioParaEnviar,
} from '../lib/relatoDoProblema';
import { useOfflineMode } from '../hooks/useOfflineMode';
import { useTheme } from '../state/theme';
import { colors, radii, spacing, type } from '../theme';
import { BottomSheet } from './BottomSheet';
import { PillButton } from './PillButton';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * "Report a problem" (15/11): uma descrição obrigatória e, se se quiser, o
 * relatório de reprodução. Vai para o João (`api/relatos.ts`), um pedido só.
 * A mesma folha nas duas plataformas: no PC a `BottomSheet` vira diálogo.
 *
 * O texto escrito fica se a folha fechar sem enviar (fecha-se sem querer); só
 * se apaga depois de enviado.
 */
export function RelatarProblema({ visible, onClose }: Props) {
  const tema = useTheme((s) => s.theme);
  const offline = useOfflineMode();
  const [comentario, setComentario] = useState('');
  const [comRelatorio, setComRelatorio] = useState(true);
  const [aEnviar, setAEnviar] = useState(false);

  useEffect(() => {
    if (visible) setAEnviar(false);
  }, [visible]);

  const enviar = async () => {
    if (!podeEnviarRelato(comentario) || aEnviar) return;
    setAEnviar(true);
    try {
      // O relatório demora até 2 s no PC (os recursos de cada processo).
      const relatorio = comRelatorio ? relatorioParaEnviar(await textoDoRelatorioDeReproducao().catch(() => null)) : null;
      await relatarProblema({
        comentario: comentario.trim(),
        relatorio,
        plataforma: plataformaDoRelatorio(),
        versao: APP_VERSION,
      });
      setComentario('');
      onClose();
      avisarFeito(FRASES_DO_RELATO.enviado);
    } catch (e) {
      avisarErro(mensagemDeErro(e, FRASES_DO_RELATO.falhou));
    } finally {
      setAEnviar(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={[type.title, { marginBottom: spacing.xs }]}>{FRASES_DO_RELATO.titulo}</Text>
      <Text style={[type.caption, { marginBottom: spacing.md }]}>{FRASES_DO_RELATO.explicacao}</Text>
      <TextInput
        value={comentario}
        onChangeText={setComentario}
        placeholder={FRASES_DO_RELATO.placeholder}
        placeholderTextColor={colors.textTertiary}
        multiline
        maxLength={MAXIMO_DO_COMENTARIO}
        textAlignVertical="top"
        autoFocus
        style={[styles.caixa, type.body]}
        accessibilityLabel={FRASES_DO_RELATO.placeholder}
      />
      <View style={styles.linha}>
        <View style={{ flex: 1 }}>
          <Text style={type.body}>{FRASES_DO_RELATO.incluir}</Text>
          <Text style={type.caption}>{FRASES_DO_RELATO.incluirDetalhe}</Text>
        </View>
        <Switch
          value={comRelatorio}
          onValueChange={setComRelatorio}
          trackColor={{ true: tema.color, false: colors.surfaceHigh }}
          accessibilityLabel={FRASES_DO_RELATO.incluir}
        />
      </View>
      <PillButton
        label={FRASES_DO_RELATO.enviar}
        onPress={() => void enviar()}
        loading={aEnviar}
        disabled={!podeEnviarRelato(comentario) || offline}
        style={{ marginTop: spacing.lg }}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  caixa: {
    minHeight: 120,
    maxHeight: 220,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.text,
  },
  linha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
});
