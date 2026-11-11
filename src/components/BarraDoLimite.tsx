import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import {
  PanGestureHandler, State,
  type PanGestureHandlerGestureEvent, type PanGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import {
  bytesDoDegrau, DEGRAUS_MB, degrauDoLimite, LIMITE_DE_ORIGEM, rotuloDoLimite,
} from '../lib/limiteDoAudio';
import { hapticSelection } from '../lib/haptics';
import { colors, radii, spacing, type } from '../theme';

const ALTURA_TOQUE = 40;
const TRILHO = 4;
const BOLA = 18;
const ULTIMO = DEGRAUS_MB.length - 1;

/**
 * A barra do teto do áudio guardado (11/11), nas Definições do iPhone.
 *
 * O mesmo gesto e o mesmo desenho da barra da velocidade (`BarraVelocidade`):
 * Gesture Handler com `minDist` 0, para a página das Definições não roubar o
 * arrasto, um toque háptico por degrau, e o valor acompanha o dedo mas só se
 * aplica ao largar -- um gesto que passa pelos 10 MB a caminho dos 2 GB não
 * pode apagar nada pelo caminho.
 *
 * A marca é a dos 300 MB de origem, como a do 1× na velocidade.
 */
export function BarraDoLimite({ valor, aoMudar }: {
  /** Em bytes; `Infinity` é sem limite. */
  valor: number;
  aoMudar: (bytes: number) => void;
}) {
  const [largura, setLargura] = useState(0);
  const [previa, setPrevia] = useState<number | null>(null);
  const previaRef = useRef<number | null>(null);
  const degrauDoValor = degrauDoLimite(valor);
  const valorRef = useRef(degrauDoValor);
  valorRef.current = degrauDoValor;
  // Uma mudança de fora (o "Cancel" da confirmação) volta a mostrar o valor.
  useEffect(() => { previaRef.current = null; setPrevia(null); }, [valor]);
  const actual = previa ?? degrauDoValor;
  const fraccao = actual / ULTIMO;

  // Os callbacks do gesto são criados uma vez: o que muda passa por refs.
  const larguraRef = useRef(0);
  larguraRef.current = largura;
  const aoMudarRef = useRef(aoMudar);
  aoMudarRef.current = aoMudar;
  const ultimoRef = useRef(actual);
  ultimoRef.current = actual;
  const aplicar = (x: number) => {
    const w = larguraRef.current;
    if (!w) return;
    const novo = Math.max(0, Math.min(ULTIMO, Math.round((x / w) * ULTIMO)));
    if (novo === ultimoRef.current) return;
    ultimoRef.current = novo;
    hapticSelection();
    previaRef.current = novo;
    setPrevia(novo);
  };

  const aoMexer = useMemo(() => (e: PanGestureHandlerGestureEvent) => {
    if (previaRef.current !== null) aplicar(e.nativeEvent.x);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const aoMudarDeEstado = useMemo(() => (e: PanGestureHandlerStateChangeEvent) => {
    const { state, x } = e.nativeEvent;
    if (state === State.BEGAN || state === State.ACTIVE) {
      if (previaRef.current === null) {
        previaRef.current = valorRef.current;
        aplicar(x);
      }
      return;
    }
    // FAILED depois do BEGAN é um toque parado (o mesmo da velocidade, 11/10).
    if (state === State.END || state === State.FAILED) {
      if (previaRef.current === null) return;
      aplicar(x);
      const novo = previaRef.current;
      previaRef.current = null; setPrevia(null);
      if (novo !== valorRef.current) aoMudarRef.current(bytesDoDegrau(novo));
      return;
    }
    if (state === State.CANCELLED) { previaRef.current = null; setPrevia(null); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rotulo = rotuloDoLimite(bytesDoDegrau(actual));
  const deOrigem = actual === degrauDoLimite(LIMITE_DE_ORIGEM);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <PanGestureHandler minDist={0} onGestureEvent={aoMexer} onHandlerStateChange={aoMudarDeEstado}>
        <View
          onLayout={(e: any) => setLargura(e.nativeEvent.layout.width)}
          collapsable={false}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Storage limit"
          accessibilityValue={{ text: rotulo }}
          accessibilityActions={[{ name: 'increment', label: 'More' }, { name: 'decrement', label: 'Less' }]}
          onAccessibilityAction={(event) => {
            const passo = event.nativeEvent.actionName === 'increment' ? 1 : event.nativeEvent.actionName === 'decrement' ? -1 : 0;
            const novo = Math.max(0, Math.min(ULTIMO, valorRef.current + passo));
            if (passo && novo !== valorRef.current) { hapticSelection(); aoMudarRef.current(bytesDoDegrau(novo)); }
          }}
          style={{ flex: 1, height: ALTURA_TOQUE, justifyContent: 'center' }}
        >
          <View style={{ height: TRILHO, borderRadius: radii.pill, backgroundColor: colors.border, overflow: 'hidden' }}>
            <View style={{ height: TRILHO, width: `${fraccao * 100}%`, backgroundColor: colors.text }} />
          </View>
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: `${(degrauDoLimite(LIMITE_DE_ORIGEM) / ULTIMO) * 100}%`,
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
      </PanGestureHandler>
      {/* Largura fixa, para a barra não mudar de tamanho debaixo do dedo
          entre "10 MB" e "Unlimited". */}
      <Text style={[type.body, { color: deOrigem ? colors.textSecondary : colors.text, width: 84, textAlign: 'right', fontVariant: ['tabular-nums'] }]}>
        {rotulo}
      </Text>
    </View>
  );
}
