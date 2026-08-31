import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';
import {
  BANDAS, chaveDaFaixa, GANHO_MAXIMO, normalizar, perfilDe, PERFIS, PLANO,
} from '../lib/equalizer';
import { hapticSelection } from '../lib/haptics';
import { usePlayer } from '../state/player';
import { colors, radii, spacing, type } from '../theme';
import { BarraVelocidade } from './BarraVelocidade';
import { BottomSheet } from './BottomSheet';

const ALTURA = 128;
const LARGURA_BANDA = 30;

/**
 * Um deslizador vertical de uma banda.
 *
 * **Vertical, como em qualquer equalizador gráfico.** É a forma que diz "isto
 * é uma curva de frequências" antes de se ler uma única etiqueta; dez linhas
 * horizontais leriam-se como uma lista de definições.
 *
 * O preenchimento sai do MEIO e vai até ao valor, porque um EQ mostra o desvio
 * ao neutro e não um nível a contar de baixo — a mesma decisão do painel do PC.
 */
function DeslizadorDeBanda({
  valor,
  etiqueta,
  aoMudar,
}: {
  valor: number;
  etiqueta: string;
  aoMudar: (v: number) => void;
}) {
  const alturaRef = useRef(ALTURA);
  const aoMudarRef = useRef(aoMudar);
  aoMudarRef.current = aoMudar;
  const ultimoRef = useRef(valor);
  ultimoRef.current = valor;
  const inicioRef = useRef(0);

  const aplicar = (y: number) => {
    const h = alturaRef.current;
    if (!h) return;
    // Em cima é +12 dB, em baixo é −12.
    const f = 1 - Math.max(0, Math.min(1, y / h));
    // Meio dB por degrau: mais fino do que isso não se ouve nem se acerta.
    const novo = Math.round((f * 2 - 1) * GANHO_MAXIMO * 2) / 2;
    if (novo === ultimoRef.current) return;
    ultimoRef.current = novo;
    hapticSelection();
    aoMudarRef.current(novo);
  };

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    // Sem isto, um gesto vertical numa banda fugia para o scroll do painel —
    // que é exatamente a direção em que se mexe um deslizador destes.
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      inicioRef.current = e.nativeEvent.locationY;
      aplicar(inicioRef.current);
    },
    onPanResponderMove: (_e, gesto) => aplicar(inicioRef.current + gesto.dy),
  }), []);

  const fraccao = 1 - (valor + GANHO_MAXIMO) / (GANHO_MAXIMO * 2);

  return (
    <View style={{ alignItems: 'center', gap: spacing.xs, width: LARGURA_BANDA }}>
      <View
        {...responder.panHandlers}
        onLayout={(e) => { alturaRef.current = e.nativeEvent.layout.height; }}
        collapsable={false}
        style={{ height: ALTURA, width: LARGURA_BANDA, justifyContent: 'center' }}
      >
        <View style={{
          position: 'absolute', left: LARGURA_BANDA / 2 - 1.5,
          width: 3, height: '100%', borderRadius: radii.pill,
          backgroundColor: colors.border,
        }} />
        {valor !== 0 && (
          <View style={{
            position: 'absolute', left: LARGURA_BANDA / 2 - 1.5, width: 3,
            top: valor > 0 ? `${fraccao * 100}%` : '50%',
            height: `${Math.abs(fraccao - 0.5) * 100}%`,
            backgroundColor: colors.text, borderRadius: radii.pill,
          }} />
        )}
        <View style={{
          position: 'absolute', left: LARGURA_BANDA / 2 - 7,
          top: `${fraccao * 100}%`, marginTop: -7,
          width: 14, height: 14, borderRadius: radii.pill,
          backgroundColor: colors.text,
        }} />
      </View>
      <Text style={[type.micro, { color: colors.textTertiary }]}>{etiqueta}</Text>
    </View>
  );
}

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

  const g = normalizar(eqGanhos);
  const perfil = perfilDe(g);
  // Só se diz "guardado" quando há mesmo registo desta faixa — a mesma conta
  // que a página do PC faz.
  const lembrado = !!current && !!ajustesPorFaixa[chaveDaFaixa(current)];

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ gap: spacing.xl, paddingBottom: spacing.md }}>
        <View style={{ gap: spacing.sm }}>
          <Text style={[type.micro, { color: colors.textTertiary }]}>VELOCIDADE</Text>
          <BarraVelocidade valor={playbackRate} aoMudar={(v) => setPlaybackRate(v)} />
        </View>

        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[type.micro, { color: colors.textTertiary }]}>EQUALIZADOR</Text>
            {/* Dizer a verdade em vez de fingir. */}
            {!eqAtivo && (
              <Text style={[type.micro, { color: colors.textTertiary }]}>INDISPONÍVEL NESTA VERSÃO</Text>
            )}
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {PERFIS.map((p) => {
              const escolhido = perfil?.id === p.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => { hapticSelection(); setEqGanhos(normalizar(p.ganhos)); }}
                  style={{
                    minHeight: 32, paddingHorizontal: spacing.md, justifyContent: 'center',
                    borderRadius: radii.pill, borderWidth: 1,
                    borderColor: escolhido ? 'transparent' : colors.border,
                    backgroundColor: escolhido ? colors.surfaceHigh : 'transparent',
                  }}
                >
                  <Text style={[type.caption, { color: escolhido ? colors.text : colors.textSecondary }]}>
                    {p.nome}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm }}>
            {BANDAS.map((hz, i) => (
              <DeslizadorDeBanda
                key={hz}
                valor={g[i]}
                etiqueta={hz >= 1000 ? `${hz / 1000}k` : String(hz)}
                aoMudar={(v) => {
                  const novo = g.slice();
                  novo[i] = v;
                  setEqGanhos(normalizar(novo));
                }}
              />
            ))}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs }}>
            <Text style={[type.micro, { color: colors.textTertiary }]}>
              {lembrado ? 'GUARDADO PARA ESTA FAIXA' : ''}
            </Text>
            <Pressable
              onPress={() => { hapticSelection(); setEqGanhos(PLANO.slice()); }}
              style={{ minHeight: 28, paddingHorizontal: spacing.sm, justifyContent: 'center', borderRadius: radii.pill }}
            >
              <Text style={[type.micro, { color: colors.textSecondary }]}>RESET</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </BottomSheet>
  );
}
