import {AdjustmentSyncStatus} from './AdjustmentSyncStatus';
import React from 'react';
import { Text, View } from 'react-native';
import { chaveDaFaixa, PLANO } from '../lib/equalizer';
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
  // que a página do PC faz.
  const lembrado = !!current && !!ajustesPorFaixa[chaveDaFaixa(current)];

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ gap: spacing.xl, paddingBottom: spacing.md }}>
        <View style={{ gap: spacing.sm }}>
          <Text style={[type.micro, { color: colors.textTertiary }]}>VELOCIDADE</Text>
          <BarraVelocidade key={current ? chaveDaFaixa(current) : 'sem-faixa'} valor={playbackRate} aoMudar={(v) => setPlaybackRate(v)} />
        </View>

        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[type.micro, { color: colors.textTertiary }]}>EQUALIZADOR</Text>
            {/* Dizer a verdade em vez de fingir. */}
            {!eqAtivo && (
              <Text style={[type.micro, { color: colors.textTertiary }]}>NOT AVAILABLE IN THIS BUILD</Text>
            )}
          </View>

          <BottomSheetGestureGuard><Equalizador ganhos={eqGanhos} aoMudar={(novo) => setEqGanhos(novo)} /></BottomSheetGestureGuard>

<AdjustmentSyncStatus />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs }}>
            <Text style={[type.micro, { color: colors.textTertiary }]}>
              {lembrado ? 'SAVED FOR THIS TRACK' : ''}
            </Text>
            <ReporEqualizador aoRepor={() => setEqGanhos(PLANO.slice())} />
          </View>
        </View>
      </View>
    </BottomSheet>
  );
}
