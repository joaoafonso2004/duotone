import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { encontrarModelo, linhaDoRecomendado, procurarModelos } from '../lib/autoeq';
import { hapticSelection } from '../lib/haptics';
import { escolherModelo, useRecomendado } from '../state/recomendado';
import { colors, spacing, type } from '../theme';
import { BottomSheetScrollView } from './BottomSheet';
import { Input } from './Input';
import { PillButton } from './PillButton';
import { Toque } from './Toque';

/**
 * O Recommended na folha do equalizador (25/10): a linha por baixo dos
 * presets ("Tuned for Apple AirPods Pro 2 · Change") e a lista para escolher
 * os auscultadores quando o nome da saída não diz o modelo.
 *
 * A lista troca o conteúdo da folha em vez de abrir outra por cima, como o
 * "Save preset" e o preset do aparelho: duas folhas empilhadas no iOS deixam
 * janelas órfãs (ver o `MenuFlutuante`).
 */
export function LinhaDoRecomendado({ aoEscolherModelo }: { aoEscolherModelo: () => void }) {
  const r = useRecomendado((s) => s.recomendacao);
  const linha = linhaDoRecomendado(r, 'ios');
  return (
    <View style={{ minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: -spacing.xs }}>
      <Text numberOfLines={1} style={[type.caption, { flex: 1, minWidth: 0, color: colors.textSecondary }]}>
        {linha.texto}
        {linha.destaque ? <Text style={{ color: colors.text, fontWeight: '600' }}>{linha.destaque}</Text> : null}
      </Text>
      {linha.acao ? (
        <Pressable accessibilityRole="button" hitSlop={10} onPress={() => { hapticSelection(); aoEscolherModelo(); }}>
          <Text style={[type.caption, { color: colors.text, fontWeight: '600', textDecorationLine: 'underline' }]}>{linha.acao}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** O conteúdo da folha "Your headphones": pesquisa, e um modelo por linha. */
export function EscolhaDoModelo({ aoFechar }: { aoFechar: () => void }) {
  const r = useRecomendado((s) => s.recomendacao);
  const escolhas = useRecomendado((s) => s.escolhas);
  const [texto, setTexto] = useState('');
  const resultados = useMemo(() => procurarModelos(texto), [texto]);
  const nomeDaSaida = r.saida.nome;
  const escolhido = escolhas[nomeDaSaida] ?? null;
  // "Automatic": o que o nome da saída diz, quando diz alguma coisa.
  const peloNome = r.saida.procura ? encontrarModelo(r.saida.procura)?.nome ?? null : null;
  const escolher = (modelo: string | null) => {
    hapticSelection();
    escolherModelo(nomeDaSaida, modelo);
    aoFechar();
  };
  const linha = (modelo: string | null, nome: string, legenda: string | null) => {
    const on = escolhido === modelo;
    return (
      <Toque key={modelo ?? 'automatico'} acende accessibilityRole="radio" accessibilityState={{ checked: on }}
        onPress={() => escolher(modelo)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10 }}>
        <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? colors.text : colors.textTertiary} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[type.body, { fontWeight: '600' }]}>{nome}</Text>
          {legenda ? <Text numberOfLines={1} style={type.caption}>{legenda}</Text> : null}
        </View>
      </Toque>
    );
  };
  return (
    <>
      <Text accessibilityRole="header" style={type.title}>Your headphones</Text>
      <Text style={[type.caption, { marginTop: 2, marginBottom: spacing.md }]}>
        Remembered for "{nomeDaSaida}" on this iPhone.
      </Text>
      <Input
        icon="search"
        placeholder="Search models"
        value={texto}
        onChangeText={setTexto}
        onClear={() => setTexto('')}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />
      <BottomSheetScrollView style={{ maxHeight: 360, marginTop: spacing.sm }} keyboardShouldPersistTaps="handled">
        {!texto ? linha(null, 'Automatic', peloNome ? `From the name: ${peloNome}` : 'Stays flat until you choose') : null}
        {resultados.map((m) => linha(m.nome, m.nome, null))}
        {texto && !resultados.length ? (
          <Text style={[type.caption, { paddingVertical: spacing.md }]}>No measured headphones match "{texto}".</Text>
        ) : null}
      </BottomSheetScrollView>
      <View style={{ marginTop: spacing.md }}>
        <PillButton label="Done" variant="ghost" onPress={aoFechar} />
      </View>
    </>
  );
}
