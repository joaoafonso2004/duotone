import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { frasesDaImportacao } from '../lib/frasesDaImportacao';
import { importacaoEmDestaque, useImportacoes } from '../state/importacoes';
import { COR, ESP, ESTADO, RAIO, TIPO } from './tokens.web';
import { Dialog } from './ui.web';

const { createPortal } = require('react-dom') as { createPortal: (filho: React.ReactNode, onde: Element) => React.ReactElement };

const FEITA_MS = 8000;

/**
 * A playlist a entrar, no PC (26/9): uma linha na lateral, por baixo da
 * conta, com a barra. As frases são as mesmas do iPhone
 * (lib/frasesDaImportacao.ts); no fim diz o que entrou e sai sozinha -- menos
 * quando ficaram músicas de fora (5/11): aí fica, e "N not found" mostra quais.
 */
export function ProgressoDaImportacao() {
  const lista = useImportacoes((s) => s.lista);
  const imp = importacaoEmDestaque(lista);
  const [verFaltas, setVerFaltas] = useState(false);
  const acabou = imp?.estado === 'feita' || imp?.estado === 'falhou';
  const faltaram = imp?.resultado?.faltaram ?? [];
  useEffect(() => {
    if (!imp || !acabou || faltaram.length) return;
    const t = setTimeout(() => useImportacoes.getState().dispensar(imp.id), FEITA_MS);
    return () => clearTimeout(t);
  }, [imp?.id, acabou, faltaram.length]);
  if (!imp) return null;
  const { titulo, linha, fracao } = frasesDaImportacao(imp, lista.filter((i) => i.estado === 'na-fila').length);
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={`${titulo}. ${linha}`}
      style={{ marginHorizontal: ESP.md, marginTop: ESP.sm, padding: ESP.md, borderRadius: RAIO.cartao, backgroundColor: 'rgba(233,234,238,0.04)', gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name={imp.estado === 'falhou' ? 'alert-circle-outline' : acabou ? 'checkmark-circle' : 'cloud-download-outline'} size={16} color={COR.textoMedio} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ ...TIPO.legenda, fontWeight: '600', color: COR.texto }}>{titulo}</Text>
          <Text numberOfLines={1} style={{ ...TIPO.legenda, color: COR.textoFraco, marginTop: 1 }}>{linha}</Text>
        </View>
        {acabou ? (
          <Pressable accessibilityLabel="Dismiss" onPress={() => useImportacoes.getState().dispensar(imp.id)} hitSlop={8}>
            <Ionicons name="close" size={14} color={COR.textoFraco} />
          </Pressable>
        ) : null}
      </View>
      {!acabou ? (
        <View style={{ height: 3, borderRadius: 2, backgroundColor: 'rgba(233,234,238,0.12)', overflow: 'hidden' }}>
          <View style={{ height: 3, width: `${Math.round((fracao ?? 0.04) * 100)}%`, backgroundColor: COR.texto, transition: 'width 400ms var(--dt-curva)' } as any} />
        </View>
      ) : null}
      {acabou && faltaram.length ? (
        <Pressable accessibilityRole="button" onPress={() => setVerFaltas(true)}
          style={({ hovered }: any) => [{ alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: 6, marginLeft: 20, borderRadius: RAIO.ctrl }, hovered && { backgroundColor: ESTADO.hover }]}>
          <Text style={{ ...TIPO.legenda, color: COR.texto, fontWeight: '600', textDecorationLine: 'underline' }}>See the songs not found</Text>
        </Pressable>
      ) : null}
      {/* Num portal para o `body`, como os outros diálogos da lateral: dentro
          dela ficava preso aos 232 px e por baixo do conteúdo. Só existe aberto. */}
      {verFaltas && typeof document !== 'undefined' ? createPortal(
        <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 300 } as any}>
          <Dialog open title={`Not found (${faltaram.length})`} onClose={() => setVerFaltas(false)}>
            <Text style={{ ...TIPO.legenda, color: COR.textoMedio, marginBottom: ESP.md }}>No good match turned up for these, so they were left out. You can search for them and add them by hand.</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {faltaram.map((n, i) => <Text key={i} selectable numberOfLines={1} style={{ ...TIPO.corpo, color: COR.texto, paddingVertical: 5 }}>{n}</Text>)}
            </ScrollView>
          </Dialog>
        </View>,
        document.body,
      ) : null}
    </View>
  );
}
