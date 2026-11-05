import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { frasesDaImportacao } from '../lib/frasesDaImportacao';
import { importacaoEmDestaque, useImportacoes } from '../state/importacoes';
import { useNotifications } from '../state/notifications';
import { useTheme } from '../state/theme';
import { colors, spacing, type } from '../theme';
import { BottomSheet } from './BottomSheet';

/** Quanto tempo o "já está" fica à vista antes de sair sozinho. */
const FEITA_MS = 8000;

/**
 * A barra de progresso das playlists a entrar (26/9, pedido do João): uma
 * linha no topo, por cima do resto e sem parar nada, enquanto a importação
 * corre em segundo plano. No fim diz quantas entraram e quantas ficaram de
 * fora, e sai sozinha -- menos quando ficaram músicas de fora (5/11): aí
 * fica, e um toque mostra quais. Cede o topo aos avisos sociais, como o
 * `AvisoDaReproducao`.
 */
export function ProgressoDaImportacao() {
  const lista = useImportacoes((s) => s.lista);
  const imp = importacaoEmDestaque(lista);
  const haAvisoSocial = useNotifications((s) => s.banners.length > 0);
  const insets = useSafeAreaInsets();
  const acento = useTheme((s) => s.theme.color);

  const [verFaltas, setVerFaltas] = useState(false);
  const acabou = imp?.estado === 'feita' || imp?.estado === 'falhou';
  const faltaram = imp?.resultado?.faltaram ?? [];
  useEffect(() => {
    if (!imp || !acabou || faltaram.length) return;
    const t = setTimeout(() => useImportacoes.getState().dispensar(imp.id), FEITA_MS);
    return () => clearTimeout(t);
  }, [imp?.id, acabou, faltaram.length]);

  if (!imp || haAvisoSocial) return null;
  const { titulo, linha, fracao } = frasesDaImportacao(imp, lista.filter((i) => i.estado === 'na-fila').length);

  const cartao = (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + 8 }]}>
      <View style={styles.cartao} accessibilityRole="progressbar" accessibilityLabel={`${titulo}. ${linha}`}
        accessibilityValue={fracao == null ? undefined : { min: 0, max: 100, now: Math.round(fracao * 100) }}>
        <View style={styles.linha}>
          <Ionicons
            name={imp.estado === 'falhou' ? 'alert-circle-outline' : acabou ? 'checkmark-circle' : 'cloud-download-outline'}
            size={20}
            color={imp.estado === 'falhou' ? colors.textSecondary : acento}
          />
          <View style={styles.textos}>
            <Text style={styles.titulo} numberOfLines={1}>{titulo}</Text>
            <Text style={styles.corpo} numberOfLines={1}>{linha}</Text>
            {acabou && faltaram.length ? (
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setVerFaltas(true)}>
                <Text style={[styles.corpo, { color: colors.text, fontWeight: '600', textDecorationLine: 'underline' }]}>See the songs not found</Text>
              </Pressable>
            ) : null}
          </View>
          {acabou ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={10}
              onPress={() => useImportacoes.getState().dispensar(imp.id)} style={styles.fechar}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
        {!acabou ? (
          <View style={styles.calha}>
            <View style={[styles.cheio, { backgroundColor: acento, width: `${Math.round((fracao ?? 0.04) * 100)}%` }]} />
          </View>
        ) : null}
      </View>
    </View>
  );
  const faltas = (
    <BottomSheet visible={verFaltas} onClose={() => setVerFaltas(false)} titulo={`Not found (${faltaram.length})`}>
      <Text style={[type.caption, { marginBottom: spacing.md }]}>No good match turned up for these, so they were left out. You can search for them and add them by hand.</Text>
      <ScrollView style={{ maxHeight: 380 }}>
        {faltaram.map((n, i) => <Text key={i} selectable numberOfLines={1} style={[type.body, { paddingVertical: 6 }]}>{n}</Text>)}
      </ScrollView>
    </BottomSheet>
  );
  return <>{Platform.OS === 'ios' ? <FullWindowOverlay>{cartao}</FullWindowOverlay> : cartao}{faltas}</>;
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 12, right: 12, zIndex: 10000, elevation: 30, alignItems: 'center' },
  cartao: {
    width: '100%', maxWidth: 520, backgroundColor: colors.surfaceHigh, borderWidth: 1, borderColor: colors.borderStrong,
    borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, gap: 10,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
  },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  textos: { flex: 1, minWidth: 0, gap: 2 },
  titulo: { color: colors.text, fontSize: 14, fontWeight: '700' },
  corpo: { color: colors.textSecondary, fontSize: type.caption.fontSize },
  fechar: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  calha: { height: 4, borderRadius: 2, backgroundColor: colors.surfacePressed, overflow: 'hidden' },
  cheio: { height: 4, borderRadius: 2 },
});
