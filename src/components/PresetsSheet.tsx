import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';
import { normalizar } from '../lib/equalizer';
import { hapticNotification, hapticSelection } from '../lib/haptics';
import { ESCALA } from '../lib/movimento';
import {
  apagarPreset, criarPreset, definirPresetDoCarro, eBluetooth, editarPreset, limparNome,
  linhaDoCarro, marcarBluetoothDoCarro, mostrarPreset, novoIdDePreset, PORTA_DO_CARPLAY,
  presetDoCarro, reporPreset, resolverPresets, type Preset,
} from '../lib/presetsDoEqualizador';
import { useSaidaDeAudio } from '../state/carro';
import { mudarPresets, usePresets } from '../state/presets';
import { colors, radii, spacing, type } from '../theme';
import { BottomSheet, BottomSheetGestureGuard, BottomSheetScrollView } from './BottomSheet';
import { Equalizador, MiniaturaDaCurva } from './Equalizador';
import { Input } from './Input';
import { PillButton } from './PillButton';
import { PlayerActionsContent, type PlayerAction } from './PlayerActionsSheet';
import { Toque } from './Toque';

type Painel =
  | { tipo: 'lista' }
  | { tipo: 'accoes'; id: string }
  | { tipo: 'curva'; id: string | null }
  | { tipo: 'nome'; id: string }
  | { tipo: 'apagar'; id: string }
  | { tipo: 'carro' };

/**
 * Os presets do equalizador, nas Definições (30/9): quais aparecem na fila do
 * equalizador, os teus, os da app mudados, e qual vale no carro.
 *
 * **Uma folha, vários painéis** -- como a fila, que mostra o menu de uma
 * música dentro dela em vez de abrir outra por cima. O menu de cada preset é o
 * mesmo `PlayerActionsContent` desse menu, e as confirmações e os nomes usam o
 * `Input` e os `PillButton` do `ConfirmSheet` e do `PromptSheet`: são as peças
 * de sempre, só arrumadas num sítio novo.
 *
 * Os interruptores são os das Definições (`ToggleRow`): brancos quando ligados.
 */
export function PresetsSheet({
  visible,
  onClose,
  ganhosIniciais,
}: {
  visible: boolean;
  onClose: () => void;
  /** Por onde começa um preset novo: a curva que se tem à frente. */
  ganhosIniciais: readonly number[];
}) {
  const { height } = useWindowDimensions();
  const memoria = usePresets((s) => s.memoria);
  const saida = useSaidaDeAudio((s) => s.saida);
  const lista = useMemo(() => resolverPresets(memoria), [memoria]);
  const [painel, setPainel] = useState<Painel>({ tipo: 'lista' });
  const [nome, setNome] = useState('');
  const [curva, setCurva] = useState<number[]>(() => normalizar(ganhosIniciais));

  const fechar = () => { setPainel({ tipo: 'lista' }); onClose(); };
  const voltar = () => setPainel({ tipo: 'lista' });
  const presetDe = (id: string) => lista.find((p) => p.id === id) ?? null;

  const abrirCurva = (p: Preset | null) => {
    setNome(p ? p.nome : '');
    setCurva(normalizar(p ? p.ganhos : ganhosIniciais));
    setPainel({ tipo: 'curva', id: p?.id ?? null });
  };

  let conteudo: React.ReactNode;

  if (painel.tipo === 'accoes') {
    const p = presetDe(painel.id);
    const accoes: PlayerAction[] = p ? [
      { label: 'Edit curve', icon: 'options-outline', onPress: () => abrirCurva(p) },
      { label: 'Rename', icon: 'create-outline', onPress: () => { setNome(p.nome); setPainel({ tipo: 'nome', id: p.id }); } },
      ...(p.daApp
        ? [{
          label: 'Restore original', icon: 'refresh-outline' as const,
          motivo: p.editado ? null : 'Already the original',
          onPress: () => { mudarPresets((m, agora) => reporPreset(m, p.id, agora)); voltar(); },
        }]
        : [{ label: 'Delete', icon: 'trash-outline' as const, destructive: true, onPress: () => setPainel({ tipo: 'apagar', id: p.id }) }]),
      { label: 'Back to presets', icon: 'arrow-back', inicioDeGrupo: true, onPress: voltar },
    ] : [];
    conteudo = p ? <PlayerActionsContent title={p.nome} actions={accoes} /> : null;
  } else if (painel.tipo === 'curva') {
    const p = painel.id ? presetDe(painel.id) : null;
    const novo = !painel.id;
    const nomeLimpo = limparNome(nome);
    const guardar = () => {
      if (novo) {
        if (!nomeLimpo) return;
        mudarPresets((m, agora) => criarPreset(m, novoIdDePreset(agora, Math.random()), nomeLimpo, curva, agora));
      } else if (p) {
        mudarPresets((m, agora) => editarPreset(m, p.id, { ganhos: curva }, agora));
      }
      hapticNotification();
      voltar();
    };
    conteudo = (
      <View>
        <Text accessibilityRole="header" style={type.title}>{novo ? 'New preset' : p?.nome}</Text>
        <Text style={[type.caption, styles.legenda]}>
          {novo ? 'Starts from the curve you have now' : p?.daApp ? 'Restore the original from its menu at any time' : 'Changes reach all your devices'}
        </Text>
        {novo ? (
          <Input
            placeholder="Preset name"
            value={nome}
            onChangeText={setNome}
            maxLength={30}
            returnKeyType="done"
            onClear={() => setNome('')}
            containerStyle={{ marginBottom: spacing.md }}
          />
        ) : null}
        <BottomSheetGestureGuard>
          <Equalizador ganhos={curva} aoMudar={setCurva} semPresets moldura />
        </BottomSheetGestureGuard>
        <View style={styles.botoes}>
          <PillButton label={novo ? 'Save preset' : 'Save'} onPress={guardar} disabled={novo && !nomeLimpo} />
          <PillButton label="Cancel" variant="ghost" onPress={voltar} />
        </View>
      </View>
    );
  } else if (painel.tipo === 'nome') {
    const p = presetDe(painel.id);
    const guardar = () => {
      if (!p || !limparNome(nome)) return;
      mudarPresets((m, agora) => editarPreset(m, p.id, { nome }, agora));
      voltar();
    };
    conteudo = (
      <View>
        <Text accessibilityRole="header" style={[type.title, { marginBottom: spacing.lg }]}>Rename</Text>
        <Input
          placeholder="Preset name"
          value={nome}
          onChangeText={setNome}
          autoFocus
          maxLength={30}
          returnKeyType="done"
          onSubmitEditing={guardar}
          onClear={() => setNome('')}
        />
        <View style={styles.botoes}>
          <PillButton label="Save" onPress={guardar} disabled={!limparNome(nome)} />
          <PillButton label="Cancel" variant="ghost" onPress={voltar} />
        </View>
      </View>
    );
  } else if (painel.tipo === 'apagar') {
    const p = presetDe(painel.id);
    conteudo = (
      <View>
        <Text accessibilityRole="header" style={[type.title, { marginBottom: 6 }]}>Delete “{p?.nome}”?</Text>
        <Text style={[type.caption, { lineHeight: 19 }]}>
          It disappears from the equalizer on all your devices. Songs that used it keep their sound.
        </Text>
        <View style={styles.botoes}>
          <PillButton
            label="Delete"
            variant="danger"
            onPress={() => {
              if (p) mudarPresets((m, agora) => apagarPreset(m, p.id, agora));
              hapticNotification();
              voltar();
            }}
          />
          <PillButton label="Cancel" variant="ghost" onPress={voltar} />
        </View>
      </View>
    );
  } else if (painel.tipo === 'carro') {
    const carro = linhaDoCarro(memoria);
    const escolhido = presetDoCarro(memoria)?.id ?? null;
    const bluetoothAgora = eBluetooth(saida) ? saida!.nome.trim() : null;
    const bluetooths = [
      ...(bluetoothAgora ? [bluetoothAgora] : []),
      ...carro.bluetooth.filter((n) => n !== bluetoothAgora),
    ];
    const escolher = (id: string | null) => {
      hapticSelection();
      mudarPresets((m, agora) => definirPresetDoCarro(m, id, agora));
    };
    conteudo = (
      <BottomSheetScrollView style={{ maxHeight: height * 0.8 }} contentContainerStyle={{ paddingBottom: spacing.sm }}>
        <Text accessibilityRole="header" style={type.title}>In the car</Text>
        <Text style={[type.caption, styles.legenda]}>
          Used for every song while you're connected to the car. Back to normal when you get out.
        </Text>

        <Text style={styles.seccao}>PRESET</Text>
        <Toque acende accessibilityRole="radio" accessibilityState={{ checked: !escolhido }}
          onPress={() => escolher(null)} style={styles.linha}>
          <Ionicons name={!escolhido ? 'radio-button-on' : 'radio-button-off'} size={22} color={!escolhido ? colors.text : colors.textTertiary} />
          <View style={styles.meio}>
            <Text style={styles.nome}>Off</Text>
            <Text style={styles.estado}>Keep each song's own EQ</Text>
          </View>
        </Toque>
        {lista.map((p) => {
          const on = escolhido === p.id;
          return (
            <Toque key={p.id} acende accessibilityRole="radio" accessibilityState={{ checked: on }}
              onPress={() => escolher(p.id)} style={styles.linha}>
              <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? colors.text : colors.textTertiary} />
              <MiniaturaDaCurva ganhos={p.ganhos} />
              <View style={styles.meio}>
                <Text numberOfLines={1} style={styles.nome}>{p.nome}</Text>
                {!p.daApp ? <Text style={styles.estado}>Yours</Text> : null}
              </View>
            </Toque>
          );
        })}

        <Text style={styles.seccao}>YOUR CAR</Text>
        <View style={styles.linha}>
          <View style={styles.icone}><Ionicons name="car-outline" size={18} color={colors.text} /></View>
          <View style={styles.meio}>
            <Text style={styles.nome}>CarPlay</Text>
            <Text style={styles.estado}>{saida?.tipo === PORTA_DO_CARPLAY ? 'Connected now' : 'Detected automatically'}</Text>
          </View>
        </View>
        {bluetooths.map((n) => {
          const marcado = carro.bluetooth.includes(n);
          return (
            <View key={n} style={styles.linha}>
              <View style={styles.icone}><Ionicons name="bluetooth" size={17} color={colors.text} /></View>
              <View style={styles.meio}>
                <Text numberOfLines={1} style={styles.nome}>{n}</Text>
                <Text style={styles.estado}>{n === bluetoothAgora ? 'Bluetooth · connected now' : 'Bluetooth'}</Text>
              </View>
              <Switch
                accessibilityLabel={`${n} is my car`}
                value={marcado}
                onValueChange={(v) => { hapticSelection(); mudarPresets((m, agora) => marcarBluetoothDoCarro(m, n, v, agora)); }}
                trackColor={{ false: colors.surfacePressed, true: colors.text }}
                thumbColor="#fff"
              />
            </View>
          );
        })}
        {!bluetoothAgora ? (
          <Text style={[type.caption, styles.dica]}>
            Car without CarPlay? Connect to its Bluetooth and it shows up here to mark once.
          </Text>
        ) : null}
        <View style={styles.botoes}>
          <PillButton label="Done" variant="ghost" onPress={voltar} />
        </View>
      </BottomSheetScrollView>
    );
  } else {
    const teus = lista.filter((p) => !p.daApp);
    const daApp = lista.filter((p) => p.daApp);
    const doCarro = presetDoCarro(memoria);
    const carro = linhaDoCarro(memoria);
    const linhaDoPreset = (p: Preset) => (
      <View key={p.id} style={styles.linha}>
        <MiniaturaDaCurva ganhos={p.ganhos} />
        <View style={styles.meio}>
          <Text numberOfLines={1} style={styles.nome}>{p.nome}</Text>
          {p.editado ? <Text style={styles.estado}>Edited</Text> : null}
        </View>
        <Toque
          escala={ESCALA.icone}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Options for ${p.nome}`}
          onPress={() => { hapticSelection(); setPainel({ tipo: 'accoes', id: p.id }); }}
          style={styles.opcoes}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
        </Toque>
        <Switch
          accessibilityLabel={`Show ${p.nome} in the equalizer`}
          value={!p.escondido}
          onValueChange={(v) => { hapticSelection(); mudarPresets((m, agora) => mostrarPreset(m, p.id, v, agora)); }}
          trackColor={{ false: colors.surfacePressed, true: colors.text }}
          thumbColor="#fff"
        />
      </View>
    );
    conteudo = (
      <BottomSheetScrollView style={{ maxHeight: height * 0.8 }} contentContainerStyle={{ paddingBottom: spacing.sm }}>
        <Text accessibilityRole="header" style={type.title}>Presets</Text>
        <Text style={[type.caption, styles.legenda]}>Choose which ones show in the equalizer</Text>

        <Text style={styles.seccao}>AUTOMATIC</Text>
        <Toque acende accessibilityRole="button" onPress={() => { hapticSelection(); setPainel({ tipo: 'carro' }); }} style={styles.linha}>
          <View style={styles.icone}><Ionicons name="car-outline" size={18} color={colors.text} /></View>
          <View style={styles.meio}>
            <Text style={styles.nome}>In the car</Text>
            <Text numberOfLines={1} style={styles.estado}>
              {carro.bluetooth.length ? `CarPlay or ${carro.bluetooth.join(', ')}` : 'CarPlay'}
            </Text>
          </View>
          <Text style={[type.caption, { color: colors.textSecondary }]}>{doCarro ? doCarro.nome : 'Off'}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </Toque>

        <Text style={styles.seccao}>YOURS</Text>
        {teus.length === 0 ? (
          <Text style={[type.caption, styles.dica]}>Save a curve from the equalizer, or start one here.</Text>
        ) : teus.map(linhaDoPreset)}
        <View style={[styles.botoes, { marginTop: spacing.sm }]}>
          <PillButton label="New preset" variant="ghost" small onPress={() => abrirCurva(null)} />
        </View>

        <Text style={styles.seccao}>BUILT-IN</Text>
        {daApp.map(linhaDoPreset)}
      </BottomSheetScrollView>
    );
  }

  return <BottomSheet visible={visible} onClose={fechar}>{conteudo}</BottomSheet>;
}

const styles = StyleSheet.create({
  legenda: { marginTop: 2, marginBottom: spacing.sm },
  // O rótulo das secções das folhas (FolhaDaSessao).
  seccao: {
    ...type.micro,
    letterSpacing: 1.4,
    color: colors.textTertiary,
    fontWeight: '700',
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  // A linha das folhas (FolhaDaSessao), com o que cabe à direita.
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  meio: { flex: 1, minWidth: 0 },
  nome: { ...type.body, fontWeight: '600' },
  estado: { ...type.micro, color: colors.textSecondary, marginTop: 1 },
  icone: {
    width: 34,
    height: 34,
    borderRadius: radii.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  opcoes: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  botoes: { gap: spacing.sm, marginTop: spacing.lg },
  dica: { color: colors.textTertiary, paddingVertical: spacing.xs },
});
