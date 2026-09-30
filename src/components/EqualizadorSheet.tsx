import { AdjustmentSyncStatus } from './AdjustmentSyncStatus';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { chaveDaFaixa, ePlano, PLANO } from '../lib/equalizer';
import { usePlayer } from '../state/player';
import { colors, spacing, type } from '../theme';
import { BarraVelocidade } from './BarraVelocidade';
import { BottomSheet, BottomSheetGestureGuard } from './BottomSheet';
import { Equalizador, ReporEqualizador } from './Equalizador';


/**
 * O equalizador no telemóvel: velocidade, perfis e as dez bandas.
 *
 * É o mesmo estado e os mesmos perfis do PC — só a apresentação muda. O que
 * aplica os ganhos aqui é o módulo nativo (`modules/duotone-audio`), e por
 * isso o painel diz a verdade quando ele não está: mostrar deslizadores
 * bonitos que não mexem no som seria pior do que não os mostrar.
 *
 * A forma é a das outras folhas do leitor (a fila, o Jam): um título, uma
 * legenda com o estado, e secções com o rótulo pequeno por cima. Tudo em
 * inglês, como o resto da app.
 */
export function EqualizadorSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const eqGanhos = usePlayer((s) => s.eqGanhos);
  const setEqGanhos = usePlayer((s) => s.setEqGanhos);
  const playbackRate = usePlayer((s) => s.playbackRate);
  const setPlaybackRate = usePlayer((s) => s.setPlaybackRate);
  const eqAtivo = usePlayer((s) => s.eqAtivo);
  const current = usePlayer((s) => s.current);
  const ajustesPorFaixa = usePlayer((s) => s.ajustesPorFaixa);

  // Só se diz "guardado" quando há mesmo registo desta faixa — a mesma conta
  // que a página do PC faz. Sem registo, a faixa toca com o padrão das
  // Definições (`aoTocar` no lib/equalizer.ts), e é isso que se diz.
  const lembrado = !!current && !!ajustesPorFaixa[chaveDaFaixa(current)];
  const estado = !current
    ? { icone: 'musical-notes-outline' as const, texto: 'Nothing playing' }
    : lembrado
      ? { icone: 'checkmark-circle-outline' as const, texto: 'Saved for this song' }
      : { icone: 'options-outline' as const, texto: 'Using your default sound' };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.conteudo}>
        <View>
          <Text accessibilityRole="header" style={type.title}>Equalizer</Text>
          <View style={styles.estado}>
            <Ionicons name={estado.icone} size={14} color={colors.textSecondary} />
            <Text style={[type.caption, { color: colors.textSecondary }]}>{estado.texto}</Text>
          </View>
        </View>

        <BarraVelocidade
          key={current ? chaveDaFaixa(current) : 'sem-faixa'}
          titulo="Speed"
          valor={playbackRate}
          aoMudar={(v) => setPlaybackRate(v)}
        />

        <View>
          <View style={styles.linhaDoTitulo}>
            <Text style={styles.titulo}>Presets</Text>
            <ReporEqualizador
              desativado={ePlano(eqGanhos)}
              aoRepor={() => setEqGanhos(PLANO.slice())}
            />
          </View>
          <View style={{ marginTop: spacing.sm }}>
            <BottomSheetGestureGuard>
              <Equalizador
                ganhos={eqGanhos}
                aoMudar={(novo) => setEqGanhos(novo)}
                moldura
                sangria={spacing.lg}
                // Dizer a verdade em vez de fingir.
                nota={eqAtivo ? undefined : 'Not available in this build'}
              />
            </BottomSheetGestureGuard>
          </View>
          <View style={{ marginTop: spacing.xs }}>
            <AdjustmentSyncStatus />
          </View>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  conteudo: { gap: spacing.xl, paddingBottom: spacing.xs },
  estado: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  linhaDoTitulo: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // O rótulo das secções das folhas (o "IN THE SESSION" do Jam), igual ao
  // "Speed" que a barra desenha.
  titulo: { ...type.micro, letterSpacing: 1.4, fontWeight: '700', color: colors.textTertiary },
});
