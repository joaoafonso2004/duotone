import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hapticSelection } from '../lib/haptics';
import { partilharRelatorioDeReproducao } from '../lib/relatorioDeReproducao';
import { useNotifications } from '../state/notifications';
import { useSaudeDaReproducao } from '../state/saudeDaReproducao';
import { useTheme } from '../state/theme';
import { colors } from '../theme';

const TITULO = 'Music will stop when the screen locks';
const CORPO = 'YouTube is blocking audio on this network. Downloaded songs still play normally.';

/**
 * O aviso de que a extração está bloqueada, só no iPhone.
 *
 * Quando o YouTube fecha a porta, cada faixa cai no embed oficial, que PARA
 * com o ecrã bloqueado -- e até aqui isso só se descobria com o telemóvel no
 * bolso. Este banner aparece uma vez por episódio (ver
 * `lib/saudeDaReproducao.ts`), diz o que vai acontecer e deixa mandar o
 * relatório a quem o pode perceber. Desaparece sozinho quando uma faixa volta
 * a tocar pela extração.
 *
 * Fica no topo, como os avisos sociais, e cede-lhes o lugar enquanto houver
 * um: esses fecham sozinhos em seis segundos, e os dois no mesmo sítio ficavam
 * um por cima do outro. No PC não existe: lá o player é sempre o IFrame
 * oficial, e não há extração nenhuma para bloquear.
 */
export function AvisoDaReproducao() {
  const aviso = useSaudeDaReproducao((s) => s.aviso);
  const haAvisoSocial = useNotifications((s) => s.banners.length > 0);
  const insets = useSafeAreaInsets();
  const acento = useTheme((s) => s.theme.color);
  const visivel = aviso && !haAvisoSocial;

  useEffect(() => {
    if (visivel) AccessibilityInfo.announceForAccessibility(`${TITULO}. ${CORPO}`);
  }, [visivel]);

  if (!visivel) return null;

  const cartao = (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + 8 }]}>
      <View style={styles.cartao}>
        <View style={styles.conteudo}>
          <View style={styles.icone}>
            <Ionicons name="lock-closed-outline" size={20} color={acento} />
          </View>
          <View style={styles.textos}>
            <Text style={styles.marca}>DUOTONE</Text>
            <Text style={styles.titulo} numberOfLines={2}>{TITULO}</Text>
            <Text style={styles.corpo} numberOfLines={3}>{CORPO}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share playback report"
              hitSlop={8}
              onPress={() => { hapticSelection(); void partilharRelatorioDeReproducao().catch(() => {}); }}
              style={({ pressed }) => [styles.acao, pressed && { opacity: 0.6 }]}
            >
              <Text style={[styles.acaoTexto, { color: acento }]}>Share report</Text>
            </Pressable>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={() => useSaudeDaReproducao.getState().dispensar()}
          style={styles.fechar}
        >
          <Ionicons name="close" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
  // Por cima do leitor e das folhas nativas, sem abrir um modal nem parar o áudio.
  return Platform.OS === 'ios' ? <FullWindowOverlay>{cartao}</FullWindowOverlay> : cartao;
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 12, right: 12, zIndex: 10000, elevation: 30, alignItems: 'center' },
  cartao: {
    width: '100%', maxWidth: 520, flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: colors.surfaceHigh, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 20,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
  },
  conteudo: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 },
  icone: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: colors.surfacePressed,
    alignItems: 'center', justifyContent: 'center',
  },
  textos: { flex: 1, minWidth: 0, gap: 3 },
  marca: { color: colors.textSecondary, fontSize: 9, fontWeight: '700', letterSpacing: 2 },
  titulo: { color: colors.text, fontSize: 14, fontWeight: '700' },
  corpo: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  acao: { alignSelf: 'flex-start', marginTop: 6, minHeight: 28, justifyContent: 'center' },
  acaoTexto: { fontSize: 13, fontWeight: '700' },
  fechar: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
