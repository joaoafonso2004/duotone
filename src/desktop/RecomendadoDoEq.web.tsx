import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { encontrarModelo, linhaDoRecomendado, procurarModelos } from '../lib/autoeq';
import { escolherModelo, useRecomendado } from '../state/recomendado';
import { COR, ESP, ESTADO, RAIO, TIPO } from './tokens.web';
import { Button, Field } from './ui.web';

/**
 * O Recommended no equalizador do PC (25/10): a linha por baixo dos presets
 * e a lista dos auscultadores. A lista ocupa o lugar das bandas, como o campo
 * do "Save as preset" ocupa o da linha de baixo: um diálogo por cima de outro
 * era mais uma camada para fechar.
 */
export function LinhaDoRecomendado({ aoEscolherModelo }: { aoEscolherModelo: () => void }) {
  const r = useRecomendado((s) => s.recomendacao);
  const linha = linhaDoRecomendado(r, 'pc');
  return (
    <View style={{ minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: ESP.sm }}>
      <Text numberOfLines={1} style={{ ...TIPO.legenda, color: COR.textoMedio, flex: 1, minWidth: 0 }}>
        {linha.texto}
        {linha.destaque ? <Text style={{ color: COR.texto, fontWeight: '600' }}>{linha.destaque}</Text> : null}
      </Text>
      {linha.acao ? (
        <Pressable
          accessibilityRole="button"
          onPress={aoEscolherModelo}
          style={({ hovered }: any) => [
            { minHeight: 24, paddingHorizontal: ESP.sm, borderRadius: RAIO.pilula, justifyContent: 'center' },
            hovered && { backgroundColor: ESTADO.hover },
          ]}
        >
          <Text style={{ ...TIPO.legenda, color: COR.texto, fontWeight: '600', textDecorationLine: 'underline' }}>{linha.acao}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EscolhaDoModelo({ aoFechar }: { aoFechar: () => void }) {
  const r = useRecomendado((s) => s.recomendacao);
  const escolhas = useRecomendado((s) => s.escolhas);
  const [texto, setTexto] = useState('');
  const resultados = useMemo(() => procurarModelos(texto), [texto]);
  const nomeDaSaida = r.saida.nome;
  const escolhido = escolhas[nomeDaSaida] ?? null;
  const peloNome = r.saida.procura ? encontrarModelo(r.saida.procura)?.nome ?? null : null;
  const escolher = (modelo: string | null) => {
    escolherModelo(nomeDaSaida, modelo);
    aoFechar();
  };
  const linha = (modelo: string | null, nome: string, legenda: string | null) => {
    const on = escolhido === modelo;
    return (
      <Pressable
        key={modelo ?? 'automatico'}
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
        onPress={() => escolher(modelo)}
        style={({ hovered }: any) => [
          { flexDirection: 'row', alignItems: 'center', gap: ESP.md, minHeight: 36, paddingHorizontal: ESP.sm, borderRadius: RAIO.ctrl },
          hovered && { backgroundColor: ESTADO.hover },
        ]}
      >
        <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={16} color={on ? COR.texto : COR.textoFraco} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ ...TIPO.corpo, color: COR.texto }}>{nome}</Text>
          {legenda ? <Text numberOfLines={1} style={{ ...TIPO.legenda, color: COR.textoMedio }}>{legenda}</Text> : null}
        </View>
      </Pressable>
    );
  };
  return (
    <View style={{ gap: ESP.sm }}>
      <Text style={{ ...TIPO.legenda, color: COR.textoMedio }}>
        Your headphones · remembered for "{nomeDaSaida}" on this computer.
      </Text>
      <Field
        icon="search"
        placeholder="Search models"
        value={texto}
        onChangeText={setTexto}
        autoFocus
        onKeyPress={(e: any) => { if (e.nativeEvent?.key === 'Escape') aoFechar(); }}
      />
      <ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled">
        {!texto ? linha(null, 'Automatic', peloNome ? `From the name: ${peloNome}` : 'Stays flat until you choose') : null}
        {resultados.map((m) => linha(m.nome, m.nome, null))}
        {texto && !resultados.length ? (
          <Text style={{ ...TIPO.legenda, color: COR.textoMedio, paddingVertical: ESP.md }}>No measured headphones match "{texto}".</Text>
        ) : null}
      </ScrollView>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <Button secondary onPress={aoFechar}>Done</Button>
      </View>
    </View>
  );
}
