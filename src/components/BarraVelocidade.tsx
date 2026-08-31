import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';
import {
  arredondar, daFraccao, eNormal, formatar, paraFraccao, PASSO_GROSSO,
} from '../lib/playbackRate';
import { hapticSelection } from '../lib/haptics';
import { colors, radii, spacing, type } from '../theme';

const ALTURA_TOQUE = 40;
const TRILHO = 4;
const BOLA = 18;

/**
 * A barra da velocidade no telemóvel.
 *
 * Substitui os botões −/1×/+, que para atravessar de 0,5 a 2 davam trinta
 * toques. A matemática é a MESMA do PC (`lib/playbackRate.ts`) — o que muda é
 * só o gesto.
 *
 * **Anda de 0,05 e não de 0,01.** No PC essa distinção existe porque há teclado
 * para pedir o valor exato; aqui não há, e um polegar não acerta em 0,01 — a
 * 0,01 seriam 151 posições numa barra de uns 300 px, dois pixels cada. Com 0,05
 * são 31 posições, cerca de dez pixels, que é o que um dedo distingue.
 *
 * Feito com `PanResponder`, que vem no React Native: a app não tem biblioteca
 * de gestos nem de slider, e não vale a pena trazer uma para isto.
 */
export function BarraVelocidade({
  valor,
  aoMudar,
}: {
  valor: number;
  aoMudar: (v: number) => void;
}) {
  const [largura, setLargura] = useState(0);
  const actual = arredondar(valor);
  const fraccao = paraFraccao(actual);

  // O PanResponder é criado UMA vez (o gesto não pode ser reconstruído a meio),
  // por isso tudo o que muda entre renders passa por refs — senão os callbacks
  // ficavam presos aos valores do primeiro render.
  const larguraRef = useRef(0);
  larguraRef.current = largura;
  const aoMudarRef = useRef(aoMudar);
  aoMudarRef.current = aoMudar;
  // Para o toque háptico disparar uma vez por degrau, e não a cada pixel.
  const ultimoRef = useRef(actual);
  ultimoRef.current = actual;
  // Onde o dedo tocou, relativo à barra. O resto do gesto é isto mais o
  // deslocamento acumulado — `locationX` durante o movimento vem relativo ao
  // que estiver por baixo do dedo, e não à barra, por isso não serve.
  const inicioRef = useRef(0);

  const aplicar = (x: number) => {
    const w = larguraRef.current;
    if (!w) return;
    const novo = daFraccao(x / w, PASSO_GROSSO);
    if (novo === ultimoRef.current) return;
    ultimoRef.current = novo;
    hapticSelection();
    aoMudarRef.current(novo);
  };

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    // Um gesto que comece aqui não pode virar scroll a meio: a barra é
    // horizontal e a lista das Definições é vertical, e sem isto arrastar na
    // diagonal fugia para a lista.
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      inicioRef.current = e.nativeEvent.locationX;
      aplicar(inicioRef.current);
    },
    onPanResponderMove: (_e, gesto) => aplicar(inicioRef.current + gesto.dx),
  }), []);

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View
          {...responder.panHandlers}
          onLayout={(e) => setLargura(e.nativeEvent.layout.width)}
          collapsable={false}
          style={{ flex: 1, height: ALTURA_TOQUE, justifyContent: 'center' }}
        >
          <View style={{ height: TRILHO, borderRadius: radii.pill, backgroundColor: colors.border, overflow: 'hidden' }}>
            <View style={{ height: TRILHO, width: `${fraccao * 100}%`, backgroundColor: colors.text }} />
          </View>
          {/* A marca do 1×: sem ela não se encontra o normal a olho. */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: `${paraFraccao(1) * 100}%`,
              width: 1, height: 10, marginLeft: -0.5,
              backgroundColor: colors.textTertiary,
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: `${fraccao * 100}%`,
              width: BOLA, height: BOLA, marginLeft: -BOLA / 2,
              borderRadius: radii.pill, backgroundColor: colors.text,
            }}
          />
        </View>
        <Text style={[type.body, { color: eNormal(actual) ? colors.textSecondary : colors.text, width: 58, textAlign: 'right' }]}>
          {formatar(actual)}
        </Text>
      </View>
      {/* O lugar do "repor" está SEMPRE reservado, mesmo quando o botão não
          aparece: sem isso a linha mudava de altura ao sair do 1×, e a barra
          saltava debaixo do dedo a meio de um arrasto. */}
      <View style={{ height: 26, justifyContent: 'center' }}>
        {!eNormal(actual) && (
          <Pressable
            accessibilityLabel="Reset playback speed to normal"
            onPress={() => { hapticSelection(); aoMudar(1); }}
            style={{ alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: spacing.sm, borderRadius: radii.pill }}
          >
            {/* RESET e nao REPOR: e a palavra que a app ja usa em todo o lado,
                incluindo no "Reset password" deste mesmo ecra. */}
            <Text style={[type.micro, { color: colors.textSecondary }]}>RESET</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
