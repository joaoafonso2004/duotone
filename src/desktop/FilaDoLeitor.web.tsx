import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { ROTULO_DO_RADIO, useRadioDaFila } from '../components/RadioQueueControl';
import { FilaArrastavel } from './FilaArrastavel.web';
import { useFilaDoLeitor } from './useFilaDoLeitor.web';
import { styles } from './estilos.web';
import { COR, ESP } from './tokens.web';
import type { CommonPageProps } from './rotas';

type Fila = ReturnType<typeof useFilaDoLeitor>;
const RADIO_HOVER = 'rgba(233,234,238,0.07)';

/** O Radio é o mesmo do iPhone, incluindo o da sala quando há um Jam. */
function RadioNaFila() {
  const radio = useRadioDaFila();
  const ligado = radio.mode === 'on', aPreparar = radio.mode === 'preparing';
  const apagada = !!radio.reason && radio.mode === 'off';
  if (!radio.visivel) return null;
  return <>
    {radio.podeDesfazer ? <Pressable accessibilityRole="button" accessibilityLabel="Undo Radio and restore previous queue"
      onPress={radio.desfazer} style={({ hovered }: any) => [styles.npFilaLimpar, hovered && { backgroundColor: RADIO_HOVER }]}>
      <Text style={[styles.npFilaLimparTexto, { textDecorationLine: 'underline', fontWeight: '400' }]}>Undo</Text>
    </Pressable> : null}
    <Pressable accessibilityRole="switch" accessibilityLabel="Radio" accessibilityHint={radio.reason ?? radio.dica}
      accessibilityState={{ checked: ligado, busy: aPreparar, disabled: apagada }} onPress={radio.alternar}
      style={({ hovered }: any) => [styles.npRadio, ligado && styles.npRadioLigado,
        hovered && !apagada && { backgroundColor: ligado ? 'rgba(233,234,238,0.16)' : RADIO_HOVER },
        apagada && { opacity: 0.45, cursor: 'default' as any }]}>
      {aPreparar ? <ActivityIndicator size={12} color={COR.texto} />
        : <Ionicons name={ligado ? 'radio' : 'radio-outline'} size={15} color={ligado ? COR.texto : COR.textoMedio} />}
      <Text style={[styles.npRadioTexto, (ligado || aPreparar) && { color: COR.texto }]}>
        {aPreparar ? ROTULO_DO_RADIO.aPreparar : ligado ? ROTULO_DO_RADIO.ligado : ROTULO_DO_RADIO.desligado}
      </Text>
    </Pressable>
  </>;
}

export function CabecaDaFila({ fila, compacta = false }: { fila: Fila; compacta?: boolean }) {
  return <View>
    <View style={[styles.npFilaCabeca, compacta && { flexWrap: 'wrap', gap: ESP.sm }]}>
      <Text style={[styles.npFilaHeading, compacta && { fontSize: 14 }]}>Up next</Text>
      <Text style={styles.npFilaContagem}>{fila.upNext.length}</Text>
      <View style={{ flex: 1 }} />
      <RadioNaFila />
      {fila.podeEditar && fila.upNext.length > 0 ? <Pressable accessibilityRole="button"
        accessibilityLabel={fila.aConfirmarLimpar ? `Confirm: clear ${fila.upNext.length} tracks from the queue` : 'Clear the queue'}
        onPress={fila.limpar} style={({ hovered }: any) => [styles.npFilaLimpar, hovered && { backgroundColor: COR.hover }]}>
        <Text style={[styles.npFilaLimparTexto, fila.aConfirmarLimpar && { color: COR.aviso }]}>
          {fila.aConfirmarLimpar ? `Clear ${fila.upNext.length}?` : 'Clear'}
        </Text>
      </Pressable> : null}
    </View>
    {fila.radioErro && !fila.emJam ? <Text accessibilityRole="alert" style={styles.npRadioErro}>{fila.radioErro}</Text> : null}
  </View>;
}

export function LinhasDaFila({ fila, compacta = false }: { fila: Fila; compacta?: boolean }) {
  return <>
    <FilaArrastavel entradas={fila.upNext.slice(0, fila.linhasDaFila)} podeArrastar={fila.podeEditar}
      aoTocar={fila.aoTocar} aoMenu={fila.aoMenu} aoMover={fila.aoMover} compacta={compacta} />
    {fila.notaDoFim && fila.upNext.length <= fila.linhasDaFila ? <Text style={styles.npFilaFim}>{fila.notaDoFim}</Text> : null}
  </>;
}

export function FilaDoLeitor({ more, notify, atual }: Pick<CommonPageProps, 'more' | 'notify'> & { atual: React.ReactNode }) {
  const fila = useFilaDoLeitor({ more, notify });
  return <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ paddingHorizontal: ESP.sm, paddingBottom: ESP.xl }}
    scrollEventThrottle={100} onScroll={fila.aoRolar}>
    {atual}
    <CabecaDaFila fila={fila} compacta />
    <LinhasDaFila fila={fila} compacta />
  </ScrollView>;
}
