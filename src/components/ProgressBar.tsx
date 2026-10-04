import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  PanGestureHandler, State,
  type PanGestureHandlerGestureEvent, type PanGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { BARRA_A_ARRASTAR, BOTAO_DA_BARRA, ESTADO, SOLTAR } from '../lib/movimento';
import { colors } from '../theme';
import { getTempoRestante, setTempoRestante } from '../lib/prefs';
import { ondeVai, proximoTrajeto, type Trajeto } from '../lib/barraSuave';
import {
  RITMOS, bateuNaPonta, comecarArrasto, eToque, fracaoNoArrasto, mudarDeRitmo, ritmoDoArrasto, type Arrasto,
} from '../lib/arrastarBarra';
import { hapticImpact, hapticSelection } from '../lib/haptics';
import { segurarFluidez } from '../state/fluidez';

/** O deslizar da barra até ao ponto tocado (um toque salta, mas vê-se ir). */
const DESLIZAR_MS = 280;

/**
 * A fração da música como um valor animado no lado NATIVO (27/9,
 * lib/barraSuave.ts): cada posição que chega lança uma animação linear até
 * onde a música vai estar daqui a um segundo, por isso a barra desliza em vez
 * de saltar de segundo em segundo. Com `fixa` (o dedo na barra) não mexe.
 *
 * `deslizarAte` (3/10): até esse instante, um salto na posição (um toque na
 * barra) desliza em vez de aparecer lá de repente.
 */
export function useFracaoSuave(
  positionMs: number,
  durationMs: number,
  aTocar: boolean,
  ritmo: number,
  fixa: number | null = null,
  deslizarAte?: React.MutableRefObject<number>,
): { valor: Animated.Value; ondeEsta: () => number | null } {
  const valor = useRef(new Animated.Value(0)).current;
  const trajeto = useRef<Trajeto | null>(null);
  useEffect(() => {
    if (fixa != null) {
      valor.stopAnimation();
      valor.setValue(fixa);
      trajeto.current = null;
      return;
    }
    const { trajeto: novo, saltar } = proximoTrajeto({
      anterior: trajeto.current, agora: Date.now(), posicaoMs: positionMs, duracaoMs: durationMs, aTocar, ritmo,
    });
    trajeto.current = novo;
    valor.stopAnimation();
    if (saltar && deslizarAte && Date.now() < deslizarAte.current) {
      deslizarAte.current = 0;
      const resto = Math.max(0, novo.duracao - DESLIZAR_MS);
      Animated.timing(valor, { toValue: novo.de, duration: DESLIZAR_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true })
        .start(({ finished }) => {
          if (finished && resto > 0) {
            Animated.timing(valor, { toValue: novo.para, duration: resto, easing: Easing.linear, useNativeDriver: true }).start();
          }
        });
      return;
    }
    if (saltar) valor.setValue(novo.de);
    if (novo.duracao > 0) {
      Animated.timing(valor, {
        toValue: novo.para, duration: novo.duracao, easing: Easing.linear, useNativeDriver: true,
      }).start();
    }
  }, [positionMs, durationMs, aTocar, ritmo, fixa, valor]);
  const ondeEsta = useCallback(() => ondeVai(trajeto.current, Date.now()), []);
  return { valor, ondeEsta };
}

interface Props {
  positionMs: number;
  durationMs: number;
  /** A tocar: a barra desliza entre as posições que chegam. Parada, fica onde está. */
  aTocar?: boolean;
  /** A velocidade de reprodução, para a barra andar ao ritmo da música. */
  ritmo?: number;
  onSeek?: (ms: number) => void;
  /** Avisa quando o utilizador começa/pára de arrastar (para desativar o
   *  scroll da página por baixo, que ficava a competir com o gesto). */
  onScrubbingChange?: (scrubbing: boolean) => void;
}

/**
 * A área de toque invisível por cima e por baixo da pista. Exportada porque o
 * Now Playing a desconta: o espaço que se VÊ entre o artista e a barra começa
 * na pista, não na caixa.
 */
export const TOQUE_DA_BARRA = 12;

function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * O que falta, com o sinal de menos tipográfico (U+2212), como o Apple Music.
 * Arredonda para CIMA, ao contrário do decorrido: assim os dois somam sempre a
 * duração ("1:00" + "−2:41" numa música de 3:41) em vez de ficarem um segundo
 * aquém.
 */
function fmtRestante(posicaoMs: number, duracaoMs: number): string {
  const resto = Math.max(0, Math.ceil((duracaoMs - posicaoMs) / 1000 - 1e-6));
  return `−${fmt(resto * 1000)}`;
}

/**
 * Total ou restante, partilhado entre leitores (só há um de cada vez) e lido
 * do disco uma vez.
 */
let restanteGuardado: boolean | null = null;
const ouvintesDoRestante = new Set<(v: boolean) => void>();
function useTempoRestante(): [boolean, () => void] {
  const [restante, setRestante] = useState(restanteGuardado ?? false);
  useEffect(() => {
    ouvintesDoRestante.add(setRestante);
    if (restanteGuardado === null) {
      void getTempoRestante().then((v) => {
        restanteGuardado = v;
        for (const f of ouvintesDoRestante) f(v);
      }).catch(() => {});
    }
    return () => { ouvintesDoRestante.delete(setRestante); };
  }, []);
  const alternar = () => {
    const v = !(restanteGuardado ?? false);
    restanteGuardado = v;
    for (const f of ouvintesDoRestante) f(v);
    void setTempoRestante(v).catch(() => {});
  };
  return [restante, alternar];
}

/**
 * A barra de progresso do leitor (3/10, variante B de `docs/barra-home-folhas.html`;
 * contas em `lib/arrastarBarra.ts`).
 *
 * Agarrar não mexe na música: só o movimento conta. Descer o dedo abranda
 * (meia velocidade, um quarto, ajuste fino). Um toque rápido salta para o ponto
 * tocado, a deslizar. Vibra ao agarrar, ao mudar de ritmo e nas pontas.
 *
 * Dois gestos na MESMA área, em simultâneo:
 *  - o de dentro escreve a translação do dedo num valor do motor nativo
 *    (`Animated.event` nativo): a barra segue o dedo mesmo com o JavaScript
 *    ocupado, como o fechar do leitor;
 *  - o de fora chega ao JavaScript, que só intervém quando muda o ritmo (volta
 *    a contar de onde a barra está, para não saltar), no tempo mostrado (só
 *    quando muda o segundo), nas vibrações e ao largar.
 * Um gesto com `Animated.event` nativo não entrega os movimentos ao JavaScript,
 * e por isso são dois e não um.
 */
export function ProgressBar({ positionMs, durationMs, aTocar = false, ritmo = 1, onSeek, onScrubbingChange }: Props) {
  const [width, setWidth] = useState(0);
  const reduzido = useReducedMotion();
  /**
   * 0 em repouso, 1 debaixo do dedo.
   *
   * Antes a barra trocava de geometria de um fotograma para o outro: o
   * botao saltava de 10 para 16 px e a margem mudava com ele. Era a troca
   * de fotograma mais visivel da app, porque acontece exactamente no
   * momento em que o dedo esta pousado a olhar para ali.
   */
  const agarrado = useRef(new Animated.Value(0)).current;
  const onScrubbingRef = useRef(onScrubbingChange);
  onScrubbingRef.current = onScrubbingChange;
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;
  const durationRef = useRef(durationMs);
  durationRef.current = durationMs;
  const positionRef = useRef(positionMs);
  positionRef.current = positionMs;
  const widthRef = useRef(0);
  widthRef.current = width;
  const deslizarAte = useRef(0);
  const { valor: fracaoAnimada, ondeEsta } = useFracaoSuave(positionMs, durationMs, aTocar, ritmo, null, deslizarAte);

  // O dedo, no motor nativo. A barra a arrastar mostra
  // base + (dedoX - origemX) × fator / largura -- a mesma conta do
  // `fracaoNoArrasto`; o JavaScript só muda base/origem/fator.
  const nos = useRef<ReturnType<typeof criarNos> | null>(null);
  if (!nos.current) nos.current = criarNos();
  const { dedoX, base, origemX, fator, inversoDaLargura, modo, doDedo } = nos.current;
  useEffect(() => { inversoDaLargura.setValue(width > 0 ? 1 / width : 0); }, [width, inversoDaLargura]);

  const [aArrastar, setAArrastar] = useState(false);
  const [ritmoVisto, setRitmoVisto] = useState(0);
  const [segundoArrastado, setSegundoArrastado] = useState<number | null>(null);
  const arrasto = useRef<Arrasto | null>(null);
  /** Os 120 Hz enquanto o dedo está na barra (state/fluidez.ts). */
  const largarFluidez = useRef<(() => void) | null>(null);
  const ultima = useRef(0);
  const inicio = useRef(0);
  const refDeFora = useRef(null);
  const refDeDentro = useRef(null);

  const mostrarSegundo = (fracao: number) => {
    const s = Math.floor((fracao * durationRef.current) / 1000);
    setSegundoArrastado((antes) => (antes === s ? antes : s));
  };

  const agarrar = () => {
    if (arrasto.current) return;
    const durMs = durationRef.current;
    const agora = ondeEsta() ?? (durMs > 0 ? positionRef.current / durMs : 0);
    arrasto.current = comecarArrasto(agora);
    ultima.current = arrasto.current.base;
    inicio.current = Date.now();
    dedoX.setValue(0);
    base.setValue(arrasto.current.base);
    origemX.setValue(0);
    fator.setValue(1);
    modo.setValue(1);
    hapticSelection();
    largarFluidez.current?.();
    largarFluidez.current = segurarFluidez(500);
    setAArrastar(true);
    setRitmoVisto(0);
    mostrarSegundo(arrasto.current.base);
    onScrubbingRef.current?.(true);
  };

  const soltar = (fracaoFinal: number | null) => {
    if (!arrasto.current) return;
    arrasto.current = null;
    largarFluidez.current?.();
    largarFluidez.current = null;
    // Onde se largou passa a ser onde a música está: o valor da música vai
    // para lá NO MESMO instante em que deixa de se ver o dedo.
    if (fracaoFinal != null) {
      fracaoAnimada.stopAnimation();
      fracaoAnimada.setValue(fracaoFinal);
    }
    modo.setValue(0);
    dedoX.setValue(0);
    setAArrastar(false);
    setRitmoVisto(0);
    setSegundoArrastado(null);
    onScrubbingRef.current?.(false);
    if (fracaoFinal != null && durationRef.current > 0) onSeekRef.current?.(fracaoFinal * durationRef.current);
  };

  // O gesto de fora: o ritmo, o tempo e as vibrações (no JavaScript).
  const aoMexer = (e: PanGestureHandlerGestureEvent) => {
    const a = arrasto.current;
    if (!a) return;
    const { translationX, translationY } = e.nativeEvent;
    const novoRitmo = ritmoDoArrasto(translationY);
    if (novoRitmo !== a.ritmo) {
      const rebase = mudarDeRitmo(a, translationX, widthRef.current, novoRitmo);
      arrasto.current = rebase;
      base.setValue(rebase.base);
      origemX.setValue(rebase.origemX);
      fator.setValue(RITMOS[novoRitmo].fator);
      hapticSelection();
      setRitmoVisto(novoRitmo);
    }
    const f = fracaoNoArrasto(arrasto.current!, translationX, widthRef.current);
    if (bateuNaPonta(ultima.current, f)) hapticImpact();
    ultima.current = f;
    mostrarSegundo(f);
  };

  const aoMudarDeEstado = (e: PanGestureHandlerStateChangeEvent) => {
    const { state, oldState, translationX, translationY, x } = e.nativeEvent;
    if (state === State.BEGAN) { agarrar(); return; }
    if (state === State.ACTIVE) return;
    // Acabou: arrastou (larga onde está), foi um toque (salta para lá), ou
    // outro gesto ficou com ele (fica tudo como estava).
    if (oldState === State.ACTIVE && state === State.END && arrasto.current) {
      soltar(fracaoNoArrasto(arrasto.current, translationX, widthRef.current));
      return;
    }
    if (state !== State.CANCELLED && eToque(translationX, translationY, Date.now() - inicio.current) && widthRef.current > 0) {
      const alvo = Math.min(1, Math.max(0, x / widthRef.current));
      soltar(null);
      deslizarAte.current = Date.now() + 600;
      if (durationRef.current > 0) onSeekRef.current?.(alvo * durationRef.current);
      return;
    }
    soltar(null);
  };

  // O gesto de dentro: só a translação, no motor nativo.
  const eventoDoDedo = useMemo(
    () => Animated.event([{ nativeEvent: { translationX: dedoX } }], { useNativeDriver: true }),
    [dedoX],
  );

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  // O que se vê: a música, ou o dedo enquanto se arrasta (`modo`).
  const mostrada = useMemo(
    () => Animated.add(Animated.multiply(fracaoAnimada, Animated.subtract(1, modo)), Animated.multiply(doDedo, modo)),
    [fracaoAnimada, modo, doDedo],
  );
  // Por transformação, que anima no lado nativo: a largura (`width: x%`) é
  // layout e só mudava quando a posição chegava.
  const { avancoDoPreenchimento, avancoDoBotao } = useMemo(() => ({
    avancoDoPreenchimento: mostrada.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] }),
    avancoDoBotao: mostrada.interpolate({ inputRange: [0, 1], outputRange: [0, width] }),
  }), [mostrada, width]);

  useEffect(() => {
    // Agarrar e imediato; largar e que volta com mola. Mesma assimetria do
    // resto da app -- ver src/lib/movimento.ts.
    Animated.spring(agarrado, {
      toValue: aArrastar ? 1 : 0,
      ...(aArrastar ? ESTADO : SOLTAR),
      useNativeDriver: true,
    }).start();
  }, [aArrastar, agarrado]);

  const espessura = reduzido
    ? 1
    : agarrado.interpolate({ inputRange: [0, 1], outputRange: [1, BARRA_A_ARRASTAR] });
  const tamanhoDoBotao = agarrado.interpolate({
    inputRange: [0, 1],
    outputRange: [BOTAO_DA_BARRA.repouso, 1],
  });

  const shownMs = segundoArrastado != null ? segundoArrastado * 1000 : positionMs;
  const nomeDoRitmo = RITMOS[ritmoVisto].nome;
  const [restante, alternarRestante] = useTempoRestante();

  return (
    <View style={styles.wrap}>
      <PanGestureHandler
        ref={refDeFora}
        simultaneousHandlers={refDeDentro}
        activeOffsetX={[-4, 4]}
        failOffsetY={[-10, 10]}
        onGestureEvent={aoMexer}
        onHandlerStateChange={aoMudarDeEstado}
      >
        <Animated.View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Song position"
          accessibilityValue={{ text: `${fmt(positionMs)} of ${fmt(durationMs)}` }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => {
            const passo = e.nativeEvent.actionName === 'increment' ? 10_000 : -10_000;
            onSeekRef.current?.(Math.min(durationMs, Math.max(0, positionMs + passo)));
          }}
        >
          <PanGestureHandler
            ref={refDeDentro}
            simultaneousHandlers={refDeFora}
            activeOffsetX={[-4, 4]}
            failOffsetY={[-10, 10]}
            onGestureEvent={eventoDoDedo}
          >
            {/* hitSlop maior em cima/baixo para ser fácil de agarrar */}
            <Animated.View style={styles.hit}>
              {/* A pista e o botao sao IRMAOS e nao pai/filho: a pista engorda por
                  `scaleY`, e se o botao vivesse la dentro engordava com ela. */}
              <View style={styles.pista} onLayout={onLayout}>
                <Animated.View style={[styles.track, { transform: [{ scaleY: espessura }] }]}>
                  <Animated.View style={[styles.fill, { width, transform: [{ translateX: avancoDoPreenchimento }] }]} />
                </Animated.View>
                <Animated.View
                  style={[
                    styles.knob,
                    { transform: [{ translateX: avancoDoBotao }, { scale: tamanhoDoBotao }] },
                  ]}
                />
              </View>
            </Animated.View>
          </PanGestureHandler>
        </Animated.View>
      </PanGestureHandler>
      <View style={styles.times}>
        {/* O tempo decorrido é o que se lê -- "onde vou" pergunta-se muito mais
            do que "quanto dura". Ficavam os dois no mesmo cinzento fraco, e
            nenhum se lia. A geometria não mudou: só o contraste. */}
        <Text style={[styles.time, styles.decorrido, aArrastar && styles.aArrastar]}>
          {fmt(shownMs)}
        </Text>
        {/* Tocar troca o total pelo que falta (e volta). Acompanha o arrasto. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={restante ? 'Show total time' : 'Show remaining time'}
          hitSlop={{ top: 10, bottom: 10, left: 16, right: 10 }}
          onPress={alternarRestante}
        >
          <Text style={styles.time}>{restante ? fmtRestante(shownMs, durationMs) : fmt(durationMs)}</Text>
        </Pressable>
        {/* O ritmo a que se arrasta, entre os dois tempos, só quando abranda. */}
        <Text pointerEvents="none" style={[styles.ritmo, !nomeDoRitmo && styles.escondido]} accessibilityElementsHidden>
          {nomeDoRitmo || ' '}
        </Text>
      </View>
    </View>
  );
}

function criarNos() {
  const dedoX = new Animated.Value(0);
  const base = new Animated.Value(0);
  const origemX = new Animated.Value(0);
  const fator = new Animated.Value(1);
  const inversoDaLargura = new Animated.Value(0);
  const modo = new Animated.Value(0);
  const doDedo = Animated.add(
    base,
    Animated.multiply(Animated.multiply(Animated.subtract(dedoX, origemX), fator), inversoDaLargura),
  ).interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  return { dedoX, base, origemX, fator, inversoDaLargura, modo, doDedo };
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  // Fora do fluxo: aparecer não empurra nada (fica entre os dois tempos).
  ritmo: {
    position: 'absolute',
    left: 48,
    right: 48,
    top: 0,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  escondido: { opacity: 0 },
  hit: {
    paddingVertical: TOQUE_DA_BARRA,
    justifyContent: 'center',
  },
  // A caixa que da a largura e onde o botao se posiciona. Sem altura
  // propria: e a pista que a define, e o botao sai dela para os lados.
  pista: {
    justifyContent: 'center',
  },
  track: {
    height: 4,
    borderRadius: 2,
    // O preenchimento anda por `translateX` a partir de fora da pista.
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.14)',
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
    backgroundColor: colors.text,
  },
  // Desenhado sempre no tamanho GRANDE e encolhido por escala. Assim a
  // margem que o centra nao tem de mudar com o estado -- e escalar e a
  // volta do centro, por isso ele nao se desloca ao crescer.
  knob: {
    position: 'absolute',
    left: 0,
    width: BOTAO_DA_BARRA.grande,
    height: BOTAO_DA_BARRA.grande,
    borderRadius: BOTAO_DA_BARRA.grande / 2,
    backgroundColor: colors.text,
    marginLeft: -BOTAO_DA_BARRA.grande / 2,
  },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  time: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  decorrido: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  // A arrastar, o número que muda passa a ser o mais legível do ecrã: é a
  // confirmação de para onde se vai, sem precisar de balão nenhum.
  aArrastar: {
    color: colors.text,
  },
});
