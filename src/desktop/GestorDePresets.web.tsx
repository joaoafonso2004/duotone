import React, { useMemo, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { SelectionPill } from '../components/SelectionPill';
import { normalizar, ondaDoEqualizador, GANHO_MAXIMO, type Ganhos } from '../lib/equalizer';
import {
  apagarPreset, criarPreset, definirPresetDoCarro, editarPreset, limparNome, mostrarPreset,
  novoIdDePreset, presetDoCarro, reporPreset, resolverPresets, type Preset,
} from '../lib/presetsDoEqualizador';
import { mudarPresets, usePresets } from '../state/presets';
import { styles } from './estilos.web';
import { BandasDoEqualizador, pillPalette } from './PainelEqualizador.web';
import { COR, ESP, RAIO } from './tokens.web';
import { Button, Dialog, Field, IconButton } from './ui.web';

type Edicao = { id: string | null; modo: 'curva' | 'nome'; nome: string; curva: Ganhos };

/**
 * Os presets do equalizador nas Definições do PC (30/9) -- o mesmo que a folha
 * "Presets" do telemóvel (components/PresetsSheet.tsx), em linhas do cartão
 * "Sound" em vez de uma folha: é assim que as Definições do PC estão feitas.
 *
 * Mesma memória e mesma sincronização (state/presets.ts): o que se mudar aqui
 * chega ao telemóvel, incluindo o preset do carro -- que só se usa no iPhone,
 * mas escolhe-se de qualquer um.
 */
export function GestorDePresets({ ganhosIniciais }: { ganhosIniciais: Ganhos }) {
  const memoria = usePresets((s) => s.memoria);
  const lista = useMemo(() => resolverPresets(memoria), [memoria]);
  const doCarro = presetDoCarro(memoria)?.id ?? null;
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [aApagar, setAApagar] = useState<Preset | null>(null);

  const guardar = () => {
    if (!edicao) return;
    const nome = limparNome(edicao.nome);
    if (edicao.id === null) {
      if (!nome) return;
      mudarPresets((m, agora) => criarPreset(m, novoIdDePreset(agora, Math.random()), nome, edicao.curva, agora));
    } else if (edicao.modo === 'nome') {
      if (!nome) return;
      mudarPresets((m, agora) => editarPreset(m, edicao.id!, { nome }, agora));
    } else {
      mudarPresets((m, agora) => editarPreset(m, edicao.id!, { ganhos: edicao.curva }, agora));
    }
    setEdicao(null);
  };

  const editor = (novo: boolean) => edicao && (
    <View style={[styles.settingLine, { flexDirection: 'column', alignItems: 'stretch', gap: ESP.md, backgroundColor: COR.elevado }]}>
      {novo ? (
        <Field placeholder="Preset name" value={edicao.nome} autoFocus maxLength={30}
          onChangeText={(nome) => setEdicao({ ...edicao, nome })} onSubmitEditing={guardar} />
      ) : null}
      <BandasDoEqualizador ganhos={edicao.curva} aoMudarGanhos={(curva) => setEdicao({ ...edicao, curva })} semPresets />
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: ESP.sm }}>
        <Button secondary onPress={() => setEdicao(null)}>Cancel</Button>
        <Button onPress={guardar} disabled={novo && !limparNome(edicao.nome)}>{novo ? 'Save preset' : 'Save'}</Button>
      </View>
    </View>
  );

  return (
    <>
      <View style={styles.settingLine}>
        <View style={{ flex: 1 }}>
          <Text style={styles.settingLabel}>Presets</Text>
          <Text style={styles.settingDescription}>Choose which ones show in the equaliser. They sync with your phone.</Text>
        </View>
        <Button secondary icon="add" onPress={() => setEdicao({ id: null, modo: 'curva', nome: '', curva: normalizar(ganhosIniciais) })}>
          New preset
        </Button>
      </View>
      {edicao?.id === null ? editor(true) : null}

      {lista.map((p) => {
        const aRenomear = edicao?.id === p.id && edicao.modo === 'nome';
        return (
          <React.Fragment key={p.id}>
            <View style={styles.settingLine}>
              <Miniatura ganhos={p.ganhos} />
              <View style={{ flex: 1 }}>
                {aRenomear ? (
                  <Field value={edicao!.nome} autoFocus maxLength={30}
                    onChangeText={(nome) => setEdicao({ ...edicao!, nome })} onSubmitEditing={guardar} />
                ) : <Text style={styles.settingLabel}>{p.nome}</Text>}
                <Text style={styles.settingDescription}>
                  {p.daApp ? (p.editado ? 'Built-in · edited' : 'Built-in') : 'Yours'}
                </Text>
              </View>
              {aRenomear ? (
                <>
                  <Button secondary onPress={() => setEdicao(null)}>Cancel</Button>
                  <Button onPress={guardar} disabled={!limparNome(edicao!.nome)}>Save</Button>
                </>
              ) : (
                <>
                  <IconButton name="options-outline" label={`Edit ${p.nome}`}
                    onPress={() => setEdicao({ id: p.id, modo: 'curva', nome: p.nome, curva: p.ganhos })} />
                  <IconButton name="create-outline" label={`Rename ${p.nome}`}
                    onPress={() => setEdicao({ id: p.id, modo: 'nome', nome: p.nome, curva: p.ganhos })} />
                  {p.daApp
                    ? (p.editado ? <IconButton name="refresh-outline" label={`Restore the original ${p.nome}`}
                      onPress={() => mudarPresets((m, agora) => reporPreset(m, p.id, agora))} /> : null)
                    : <IconButton name="trash-outline" label={`Delete ${p.nome}`} danger onPress={() => setAApagar(p)} />}
                </>
              )}
              <Switch
                accessibilityLabel={`Show ${p.nome} in the equaliser`}
                value={!p.escondido}
                onValueChange={(v) => mudarPresets((m, agora) => mostrarPreset(m, p.id, v, agora))}
                trackColor={{ false: COR.elevado, true: COR.metalClaro }}
                thumbColor={COR.fundo}
              />
            </View>
            {edicao?.id === p.id && edicao.modo === 'curva' ? editor(false) : null}
          </React.Fragment>
        );
      })}

      <View style={[styles.settingLine, { alignItems: 'flex-start' }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.settingLabel}>In the car</Text>
          <Text style={styles.settingDescription}>
            On your iPhone, with CarPlay or your car's Bluetooth: used for every song while you're connected.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: ESP.xs, marginTop: ESP.sm }}>
            <SelectionPill palette={pillPalette} selected={!doCarro} label="Off"
              onPress={() => mudarPresets((m, agora) => definirPresetDoCarro(m, null, agora))} />
            {lista.map((p) => (
              <SelectionPill key={p.id} palette={pillPalette} selected={doCarro === p.id} label={p.nome}
                onPress={() => mudarPresets((m, agora) => definirPresetDoCarro(m, p.id, agora))} />
            ))}
          </View>
        </View>
      </View>

      <Dialog open={!!aApagar} title="Delete preset?" onClose={() => setAApagar(null)}>
        <Text style={styles.dialogBody}>
          “{aApagar?.nome}” disappears from the equaliser on all your devices. Songs that used it keep their sound.
        </Text>
        <View style={styles.dialogActions}>
          <Button secondary onPress={() => setAApagar(null)}>Cancel</Button>
          <Button danger onPress={() => {
            if (aApagar) mudarPresets((m, agora) => apagarPreset(m, aApagar.id, agora));
            setAApagar(null);
          }}>Delete</Button>
        </View>
      </Dialog>
    </>
  );
}

/** A forma do preset em ponto pequeno, com a escala apertada (±8 dB). */
function Miniatura({ ganhos }: { ganhos: readonly number[] }) {
  const w = 46, h = 28, meio = h / 2;
  const y = ondaDoEqualizador(
    normalizar(ganhos).map((v) => Math.max(-GANHO_MAXIMO, Math.min(GANHO_MAXIMO, v * 2.5))), w, h,
  );
  let d = '';
  for (let x = 0; x <= w; x += 1) d += `${d ? 'L' : 'M'}${x} ${y(x).toFixed(2)} `;
  return (
    <div style={{
      width: w, height: h, borderRadius: RAIO.cartao, overflow: 'hidden', flex: 'none',
      background: COR.elevado, border: `1px solid ${COR.linhaSuave}`,
    }}>
      <svg width={w} height={h} aria-hidden>
        <line x1={0} x2={w} y1={meio} y2={meio} stroke={COR.linha} />
        <path d={`${d}L${w} ${meio} L0 ${meio} Z`} fill="rgba(233,234,238,0.08)" />
        <path d={d} fill="none" stroke={COR.texto} strokeWidth={1.5} strokeLinejoin="round" />
      </svg>
    </div>
  );
}
