import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { frasesDaImportacao } from '../lib/frasesDaImportacao';
import { importacaoEmDestaque, useImportacoes } from '../state/importacoes';
import { COR, ESP, FONT } from './tokens.web';

const FEITA_MS = 8000;

/**
 * A playlist a entrar por link, no PC (26/9): uma linha na lateral, por baixo
 * da conta, com a barra. As frases são as mesmas do iPhone
 * (lib/frasesDaImportacao.ts); no fim diz o que entrou e sai sozinha.
 */
export function ProgressoDaImportacao() {
  const lista = useImportacoes((s) => s.lista);
  const imp = importacaoEmDestaque(lista);
  const acabou = imp?.estado === 'feita' || imp?.estado === 'falhou';
  useEffect(() => {
    if (!imp || !acabou) return;
    const t = setTimeout(() => useImportacoes.getState().dispensar(imp.id), FEITA_MS);
    return () => clearTimeout(t);
  }, [imp?.id, acabou]);
  if (!imp) return null;
  const { titulo, linha, fracao } = frasesDaImportacao(imp, lista.filter((i) => i.estado === 'na-fila').length);
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={`${titulo}. ${linha}`}
      style={{ marginHorizontal: ESP.md, marginTop: ESP.sm, padding: ESP.md, borderRadius: 10, backgroundColor: 'rgba(233,234,238,0.04)', gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name={imp.estado === 'falhou' ? 'alert-circle-outline' : acabou ? 'checkmark-circle' : 'cloud-download-outline'} size={16} color={COR.textoMedio} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontFamily: FONT.body, fontSize: 12.5, fontWeight: '600', color: COR.texto }}>{titulo}</Text>
          <Text numberOfLines={1} style={{ fontFamily: FONT.body, fontSize: 11.5, color: COR.textoFraco, marginTop: 1 }}>{linha}</Text>
        </View>
        {acabou ? (
          <Pressable accessibilityLabel="Dismiss" onPress={() => useImportacoes.getState().dispensar(imp.id)} hitSlop={8}>
            <Ionicons name="close" size={14} color={COR.textoFraco} />
          </Pressable>
        ) : null}
      </View>
      {!acabou ? (
        <View style={{ height: 3, borderRadius: 2, backgroundColor: 'rgba(233,234,238,0.12)', overflow: 'hidden' }}>
          <View style={{ height: 3, width: `${Math.round((fracao ?? 0.04) * 100)}%`, backgroundColor: COR.texto, transition: 'width 400ms ease' } as any} />
        </View>
      ) : null}
    </View>
  );
}
