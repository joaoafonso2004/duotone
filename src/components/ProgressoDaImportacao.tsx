import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { frasesDaImportacao } from '../lib/frasesDaImportacao';
import { importacaoEmDestaque, useImportacoes } from '../state/importacoes';
import { useNotifications } from '../state/notifications';
import { useTheme } from '../state/theme';
import { colors } from '../theme';

/** Quanto tempo o "já está" fica à vista antes de sair sozinho. */
const FEITA_MS = 8000;

/**
 * A barra de progresso das playlists a entrar (26/9, pedido do João): uma
 * linha no topo, por cima do resto e sem parar nada, enquanto a importação
 * corre em segundo plano. No fim diz quantas entraram e quantas ficaram de
 * fora, e sai sozinha. Cede o topo aos avisos sociais, como o
 * `AvisoDaReproducao`.
 */
export function ProgressoDaImportacao() {
  const lista = useImportacoes((s) => s.lista);
  const imp = importacaoEmDestaque(lista);
  const haAvisoSocial = useNotifications((s) => s.banners.length > 0);
  const insets = useSafeAreaInsets();
  const acento = useTheme((s) => s.theme.color);

  const acabou = imp?.estado === 'feita' || imp?.estado === 'falhou';
  useEffect(() => {
    if (!imp || !acabou) return;
    const t = setTimeout(() => useImportacoes.getState().dispensar(imp.id), FEITA_MS);
    return () => clearTimeout(t);
  }, [imp?.id, acabou]);

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
  return Platform.OS === 'ios' ? <FullWindowOverlay>{cartao}</FullWindowOverlay> : cartao;
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
  corpo: { color: colors.textSecondary, fontSize: 12.5 },
  fechar: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  calha: { height: 4, borderRadius: 2, backgroundColor: colors.surfacePressed, overflow: 'hidden' },
  cheio: { height: 4, borderRadius: 2 },
});
