import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  PanGestureHandler, State,
  type PanGestureHandlerGestureEvent, type PanGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import {
  arredondar, daFraccao, eNormal, formatar, paraFraccao, PASSO_GROSSO,
  RATE_MAXIMO, RATE_MINIMO,
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
 * O valor acompanha o dedo; o áudio recebe apenas o valor final ao largar.
 * Isto evita dezenas de reavaliações do AVPlayer num único gesto.
 *
 * Do Gesture Handler (4/10), com `minDist` 0, como as barras do equalizador:
 * é dono do dedo desde o toque. Com o PanResponder, a folha nativa do iOS (a
 * do equalizador, onde esta barra vive) e a página das Definições roubavam o
 * arrasto.
 */
export function BarraVelocidade({
  valor,
  aoMudar,
  titulo,
}: {
  valor: number;
  aoMudar: (v: number) => void;
  /**
   * Com título, a forma da folha do equalizador: o título, o valor e o Reset
   * numa linha por cima, a barra com a largura toda, e a escala por baixo.
   * Sem ele, a das Definições: o valor à direita da barra e o Reset por baixo.
   */
  titulo?: string;
}) {
  const [largura, setLargura] = useState(0);
  const [previa, setPrevia] = useState<number | null>(null);
  const previaRef = useRef<number | null>(null);
  const valorRef = useRef(arredondar(valor));
  valorRef.current = arredondar(valor);
  const actual = previa ?? arredondar(valor);
  // Uma mudança externa durante o gesto cancela a escolha ainda não aplicada.
  useEffect(() => { previaRef.current=null; setPrevia(null); }, [valor]);
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
  const aplicar = (x: number) => {
    const w = larguraRef.current;
    if (!w) return;
    const novo = daFraccao(x / w, PASSO_GROSSO);
    if (novo === ultimoRef.current) return;
    ultimoRef.current = novo;
    hapticSelection();
    previaRef.current=novo;
    setPrevia(novo);
  };

  // O `x` do Gesture Handler é relativo à própria barra, em todo o gesto.
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
    if (state === State.END) {
      if (previaRef.current === null) return;
      aplicar(x);
      const novo = previaRef.current;
      previaRef.current = null; setPrevia(null);
      // Uma alteração no áudio e na persistência por gesto, não por degrau.
      if (novo !== valorRef.current) aoMudarRef.current(novo);
      return;
    }
    if (state === State.CANCELLED || state === State.FAILED) { previaRef.current = null; setPrevia(null); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const normal = eNormal(actual);
  // A mesma pilula do Reset do equalizador (`ReporEqualizador`), que vive ao
  // lado desta barra na folha e nas Definicoes.
  const estiloDoRepor = {
    minHeight: 28, paddingHorizontal: spacing.md, justifyContent: 'center' as const,
    borderRadius: radii.pill, borderWidth: 1, borderColor: colors.borderStrong,
  };
  const textoDoRepor = { fontSize: 12, fontWeight: '600' as const, color: colors.textSecondary };
  const barra = (
    <PanGestureHandler minDist={0} onGestureEvent={aoMexer} onHandlerStateChange={aoMudarDeEstado}>
    <View
      onLayout={(e) => setLargura(e.nativeEvent.layout.width)}
      collapsable={false}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Playback speed"
      // Os limites saem do `playbackRate.ts` e nao escritos a mao: sao os
      // mesmos que o `arredondar` impoe, e dois numeros repetidos aqui
      // passavam a mentir ao leitor de ecra no dia em que la mudassem.
      accessibilityValue={{min:RATE_MINIMO,max:RATE_MAXIMO,now:actual,text:formatar(actual)}}
      accessibilityActions={[{name:'increment',label:'Faster'},{name:'decrement',label:'Slower'}]}
      onAccessibilityAction={event => {
        const direction=event.nativeEvent.actionName === 'increment' ? 1 : event.nativeEvent.actionName === 'decrement' ? -1 : 0;
        if (!direction) return;
        const novo=arredondar(valorRef.current+direction*PASSO_GROSSO);
        if (novo !== valorRef.current) { hapticSelection();aoMudarRef.current(novo); }
      }}
      // Numa linha cresce para o lado; sozinha numa coluna, um `flex: 1`
      // punha-lhe a base a zero e a barra ficava sem altura.
      style={[{ height: ALTURA_TOQUE, justifyContent: 'center' }, titulo ? null : { flex: 1 }]}
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
    </PanGestureHandler>
  );

  if (titulo) {
    const escala = [type.micro, { fontSize: 10, letterSpacing: 0, textTransform: 'none' as const, color: colors.textTertiary }];
    return (
      <View>
        {/* Altura fixa: o Reset aparece e desaparece sem a barra saltar
            debaixo do dedo -- a mesma razão do lugar reservado em baixo. */}
        <View style={{ minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[type.micro, { letterSpacing: 1.4, fontWeight: '700', color: colors.textTertiary }]}>{titulo}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            {!normal && (
              <Pressable
                accessibilityLabel="Reset playback speed to normal"
                hitSlop={6}
                onPress={() => { hapticSelection(); aoMudar(1); }}
                style={({ pressed }) => ({ ...estiloDoRepor, opacity: pressed ? 0.7 : 1 })}
              >
                <Text style={textoDoRepor}>Reset</Text>
              </Pressable>
            )}
            <Text style={[type.body, { fontWeight: '600', fontVariant: ['tabular-nums'], color: normal ? colors.textSecondary : colors.text }]}>
              {formatar(actual)}
            </Text>
          </View>
        </View>
        {barra}
        <View pointerEvents="none" style={{ height: 14 }}>
          <Text style={[escala, { position: 'absolute', left: 0 }]}>{formatar(RATE_MINIMO)}</Text>
          <Text style={[escala, { position: 'absolute', left: `${paraFraccao(1) * 100}%`, width: 30, marginLeft: -15, textAlign: 'center' }]}>
            {formatar(1)}
          </Text>
          <Text style={[escala, { position: 'absolute', right: 0 }]}>{formatar(RATE_MAXIMO)}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        {barra}
        <Text style={[type.body, { color: normal ? colors.textSecondary : colors.text, width: 58, textAlign: 'right' }]}>
          {formatar(actual)}
        </Text>
      </View>
      {/* O lugar do "repor" está SEMPRE reservado, mesmo quando o botão não
          aparece: sem isso a linha mudava de altura ao sair do 1×, e a barra
          saltava debaixo do dedo a meio de um arrasto. */}
      <View style={{ height: 30, justifyContent: 'center' }}>
        {!normal && (
          <Pressable
            accessibilityLabel="Reset playback speed to normal"
            onPress={() => { hapticSelection(); aoMudar(1); }}
            style={({ pressed }) => ({ ...estiloDoRepor, alignSelf: 'flex-start', opacity: pressed ? 0.7 : 1 })}
          >
            {/* Reset e nao Repor: e a palavra que a app ja usa em todo o lado,
                incluindo no "Reset password" deste mesmo ecra. */}
            <Text style={textoDoRepor}>Reset</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
