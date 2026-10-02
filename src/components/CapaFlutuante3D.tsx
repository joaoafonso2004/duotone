import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Easing, Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { CAPA_FLUTUANTE, ondaSeno } from '../lib/capaFlutuante3D';
import { curvaDoSkip, naCurva, recuoDaCapa, type Sentido } from '../lib/transicaoDaCapa';
import { RECUO_DO_ENCAIXE, curvaDoRecuo } from '../lib/recuoDoEncaixe';
import type { MontagemDaCapa } from '../hooks/useMontagemDaCapa';

// Os materiais saem de scripts/gerar-materiais-da-capa.py.
const SOMBRA_AMBIENTE: ImageSourcePropType = require('../../assets/capa3d-sombra-ambiente.png');
const SOMBRA_DE_CONTACTO: ImageSourcePropType = require('../../assets/capa3d-sombra-contacto.png');

const CURVA = Easing.bezier(0.45, 0, 0.55, 1);
const SENO = ondaSeno();
const COSSENO = ondaSeno(16, 0.25);

type Onda = { inputRange: number[]; outputRange: number[] };
/** Um valor que anima: um `Animated.Value` ou o que sai de o somar e interpolar. */
type Animado = Animated.Value | Animated.AnimatedInterpolation<number> | Animated.AnimatedAddition<number>;
/** O recuo do skip num eixo: a curva vezes o tamanho, mais o que sobrou do anterior. */
const CURVA_DO_SKIP = curvaDoSkip();
/** A pose: o valor dela, ou multiplicado pela força que o leitor lhe dá (ver `forcaDaPose`). */
type ValorDaPose = Animated.Value | Animated.AnimatedMultiplication<number>;
const vezes = (onda: Onda, fator: number, soma = 0) => ({
  inputRange: onda.inputRange,
  outputRange: onda.outputRange.map((v) => v * fator + soma),
});

/**
 * A pose inteira, por esta ordem -- a mesma de `projetar` no lib, que é o que o
 * teste confere contra a referência. Cada face da caixa começa a sua lista de
 * transformações por aqui.
 *
 * A deriva entra ANTES dos ângulos da referência: é a caixa a inclinar-se no ar
 * vista de frente, e não um desvio dos ângulos medidos. Em repouso vale zero, e
 * a pose fica exatamente a do lib.
 */
function criarPostura(
  pose: ValorDaPose, flutuar: Animated.Value, derivar: Animated.Value, size: number,
  voo: Animated.Value, assentar: Animado,
  recuoX: Animado, recuoZ: Animado,
) {
  const c = CAPA_FLUTUANTE;
  const ate = (fim: number) => pose.interpolate({ inputRange: [0, 1], outputRange: [0, fim] });
  const angulo = (graus: number) => pose.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${graus}deg`] });
  // Positivo é para baixo. Uma volta de seno por ciclo, a começar e a acabar no meio.
  // A montar-se não flutua: `voo` sobe de 0 para 1 quando a caixa fica montada.
  const noAr = Animated.multiply(Animated.multiply(flutuar.interpolate(vezes(SENO, c.amplitude)), pose), voo);
  const inclinar = (onda: Onda, graus: number) => Animated.multiply(Animated.multiply(derivar.interpolate(onda), pose), voo)
    .interpolate({ inputRange: [-1, 1], outputRange: [`${-graus}deg`, `${graus}deg`] });
  return [
    { perspective: c.perspectiva * size },
    // O desvio do "Recuo subtil" no sentido do skip (lib/transicaoDaCapa.ts).
    { translateX: Animated.add(ate(c.deslocacaoX * size), recuoX) },
    { translateY: Animated.add(Animated.add(ate(c.deslocacaoY * size), noAr), assentar) },
    // Seno num eixo e cosseno no outro: a inclinação dá a volta, em vez de ir e vir.
    { rotateX: inclinar(COSSENO, c.deriva.rotateX) },
    { rotateY: inclinar(SENO, c.deriva.rotateY) },
    { rotateX: angulo(c.rotateX) },
    { rotateY: angulo(c.rotateY) },
    { rotateZ: angulo(c.rotateZ) },
    { scale: pose.interpolate({ inputRange: [0, 1], outputRange: [1, c.scale] }) },
    // O recuo, ao longo do eixo da PRÓPRIA caixa (depois dos ângulos): a mesma
    // translação Z do cubo, feita com X e duas rotações porque os motores nativos
    // só expõem X e Y. Aqui e não numa vista à volta, que achatava as faces.
    { rotateY: '90deg' },
    { translateX: Animated.multiply(recuoZ, -1) },
    { rotateY: '-90deg' },
  ];
}

/** O que o cubo capa/letras precisa para se desenhar como caixa. */
export type PoseDaCapa3D = {
  postura: ReturnType<typeof criarPostura>;
  /** 0 = plana, 1 = em 3D: a opacidade das laterais. */
  pose: ValorDaPose;
  /** Em pontos. */
  espessura: number;
  /** A montagem com o download (null fora do leitor do iPhone). */
  montagem: MontagemDaCapa | null;
};

type Props = {
  size: number;
  enabled: boolean;
  /**
   * O cubo capa/letras. Recebe a pose quando o 3D está ligado, e desenha-se
   * então como caixa (ver `ArtworkLyricsCube`); sem ela, é o cubo de sempre.
   */
  /** A capa a montar-se com o download (ver `useMontagemDaCapa`). */
  montagem?: MontagemDaCapa | null;
  /**
   * A faixa que está na capa e o sentido com que chegou. Mudar a `chave` faz o
   * "Recuo subtil" (lib/transicaoDaCapa.ts); a primeira não, que é abrir o leitor.
   */
  transicao?: { chave: string; sentido: Sentido } | null;
  /**
   * Quanto da pose 3D se vê, de 0 a 1 (2/10, a transição do leitor): a capa
   * ganha a pose ao abrir e perde-a ao ser arrastada para o mini-player, que é
   * plano. Sem isto, a pose é sempre a inteira.
   */
  forcaDaPose?: Animated.AnimatedNode | null;
  children: (pose3D: PoseDaCapa3D | null) => React.ReactNode;
};

/**
 * A capa como um objeto fino suspenso no ar -- ver `lib/capaFlutuante3D.ts`.
 *
 * Isto desenha o que vive no PLANO DO FUNDO -- a sombra larga e a de contacto,
 * que se dissolvem nele e respiram com a flutuação -- e entrega a pose ao cubo.
 * A caixa (face, verso e laterais) é o cubo que a desenha, porque é ele que tem
 * o gesto: virar para as letras roda a caixa inteira.
 *
 * Nada aqui fica à volta do cubo numa vista que roda: no iPhone isso achatava
 * as faces antes de rodar, e a caixa perdia a profundidade.
 */
export function CapaFlutuante3D({ size, enabled, montagem = null, transicao = null, forcaDaPose = null, children }: Props) {
  const reduced = useReducedMotion();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  // Fases de 0 a 1, uma volta por ciclo. O 0 é o repouso: a meio e sem inclinação.
  const flutuar = useRef(new Animated.Value(0)).current;
  const derivar = useRef(new Animated.Value(0)).current;
  const pose = useRef(new Animated.Value(enabled ? 1 : 0)).current;
  const poseVista = useMemo<ValorDaPose>(
    () => (forcaDaPose ? Animated.multiply(pose, forcaDaPose as Animated.Value) : pose),
    [pose, forcaDaPose],
  );
  // Sem montagem, a caixa está montada e flutua.
  const semMontagem = useRef({ um: new Animated.Value(1), zero: new Animated.Value(0) }).current;
  const voo = montagem?.voo ?? semMontagem.um;
  const assentar = montagem?.assentar ?? semMontagem.zero;
  const encaixe = montagem?.encaixe ?? semMontagem.um;
  const aterrar = montagem?.aterrar ?? semMontagem.um;
  // O "Recuo subtil" (lib/transicaoDaCapa.ts): UMA fase de 0 a 1 que o motor
  // nativo percorre de uma vez, e cada eixo é a curva vezes o seu tamanho. Em
  // repouso a fase está no 1, onde a curva vale zero e a pose é a do lib.
  const fase = useRef(new Animated.Value(1)).current;
  const tamanhos = useRef({
    z: new Animated.Value(0), x: new Animated.Value(0),
    sobraZ: new Animated.Value(0), sobraX: new Animated.Value(0),
  }).current;
  const { recuoX, recuoZ } = useMemo(() => {
    const c = CURVA_DO_SKIP;
    const curva = fase.interpolate({ inputRange: c.inputRange, outputRange: c.curva });
    const largar = fase.interpolate({ inputRange: c.inputRange, outputRange: c.largar });
    const eixo = (tamanho: Animated.Value, sobra: Animated.Value) =>
      Animated.add(Animated.multiply(curva, tamanho), Animated.multiply(largar, sobra));
    return { recuoX: eixo(tamanhos.x, tamanhos.sobraX), recuoZ: eixo(tamanhos.z, tamanhos.sobraZ) };
  }, [fase, tamanhos]);
  /** O recuo a correr: quando começou e com que tamanhos (para o seguinte partir dali). */
  const corrida = useRef<{ inicio: number; z: number; x: number; sobraZ: number; sobraX: number } | null>(null);
  // O recuo do encaixe (lib/recuoDoEncaixe.ts): a face bate e a caixa recua ao
  // longo do mesmo eixo do "Recuo subtil" -- os dois somam-se.
  const recuoTotal = useMemo(() => {
    const curva = curvaDoRecuo();
    const recuoDoEncaixe = encaixe.interpolate({
      inputRange: curva.inputRange,
      outputRange: curva.outputRange.map((y) => -RECUO_DO_ENCAIXE.profundidade * size * y),
    });
    return Animated.add(recuoZ, recuoDoEncaixe);
  }, [encaixe, recuoZ, size]);
  const chaveAnterior = useRef(transicao?.chave ?? null);

  // Uma faixa nova na capa: recua, desvia-se no sentido do skip e volta com uma
  // mola. A primeira chave é abrir o leitor, e isso não é um skip.
  useEffect(() => {
    const chave = transicao?.chave ?? null;
    if (chave === chaveAnterior.current) return;
    chaveAnterior.current = chave;
    const recuo = recuoDaCapa({
      lado: size, sentido: transicao?.sentido ?? 0, capa3D: enabled, reduzirMovimento: reduced,
    });
    if (!recuo || !foreground) return;
    // Skips seguidos: o que sobrava do anterior sai durante a ida deste, e a
    // caixa parte de onde estava, sem saltar. A fase do anterior sabe-se pelo
    // relógio (a animação é por tempo), sem perguntar ao motor nativo.
    const c = CURVA_DO_SKIP, agora = Date.now(), antes = corrida.current;
    let sobraZ = 0, sobraX = 0;
    if (antes) {
      const t = Math.min(1, (agora - antes.inicio) / c.duracaoMs);
      const k = naCurva(c.inputRange, c.curva, t), l = naCurva(c.inputRange, c.largar, t);
      sobraZ = k * antes.z + l * antes.sobraZ;
      sobraX = k * antes.x + l * antes.sobraX;
    }
    fase.stopAnimation();
    tamanhos.z.setValue(recuo.profundidade);
    tamanhos.x.setValue(recuo.desvio);
    tamanhos.sobraZ.setValue(sobraZ);
    tamanhos.sobraX.setValue(sobraX);
    fase.setValue(0);
    const esta = { inicio: agora, z: recuo.profundidade, x: recuo.desvio, sobraZ, sobraX };
    corrida.current = esta;
    Animated.timing(fase, { toValue: 1, duration: c.duracaoMs, easing: Easing.linear, useNativeDriver: true })
      .start(({ finished }) => { if (finished && corrida.current === esta) corrida.current = null; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transicao?.chave]);

  // Ao desmontar, o recuo a meio pára com ela.
  useEffect(() => () => { fase.stopAnimation(); }, [fase]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const animacao = Animated.timing(pose, {
      toValue: enabled ? 1 : 0,
      duration: enabled ? 320 : 180,
      easing: CURVA,
      useNativeDriver: true,
    });
    animacao.start();
    return () => animacao.stop();
  }, [enabled, pose]);

  // A flutuação e a deriva: muito subtis, paradas com Reduzir movimento e em
  // segundo plano.
  //
  // Cada uma é UMA animação de 0 a 1 em ciclo, e a onda sai da interpolação.
  // Não pode ser uma sequência de ida e volta dentro de um loop: o loop repõe, no
  // início de cada volta, o valor com que o Animated.Value foi CRIADO. A
  // flutuação antiga nascia a 0,5 e acabava cada volta em 0 (o ponto mais alto),
  // e a capa saltava do topo para o meio a cada 4,6 s (2.9.3). Aqui a fase nasce
  // e recomeça em 0, e a onda vale o mesmo em 0 e em 1.
  useEffect(() => {
    flutuar.stopAnimation();
    derivar.stopAnimation();
    flutuar.setValue(0);
    derivar.setValue(0);
    if (!enabled || reduced || !foreground) return;
    const flutuacao = Animated.loop(
      Animated.timing(flutuar, { toValue: 1, duration: CAPA_FLUTUANTE.cicloMs, easing: Easing.linear, useNativeDriver: true }),
    );
    const deriva = Animated.loop(
      Animated.timing(derivar, { toValue: 1, duration: CAPA_FLUTUANTE.deriva.cicloMs, easing: Easing.linear, useNativeDriver: true }),
    );
    flutuacao.start();
    deriva.start();
    return () => {
      flutuacao.stop();
      deriva.stop();
    };
  }, [enabled, foreground, flutuar, derivar, reduced]);

  const c = CAPA_FLUTUANTE;
  // Estáveis entre renders: o leitor volta a desenhar a cada segundo da música,
  // e refazer as interpolações a cada vez era religar o grafo nativo por nada.
  const postura = useMemo(
    () => criarPostura(poseVista, flutuar, derivar, size, voo, assentar, recuoX, recuoTotal),
    [poseVista, flutuar, derivar, size, voo, assentar, recuoX, recuoTotal],
  );
  const pose3D = useMemo<PoseDaCapa3D | null>(
    () => (enabled
      ? { postura, pose: poseVista, espessura: c.espessura * size, montagem }
      : null),
    [enabled, postura, poseVista, size, c.espessura, montagem],
  );
  const sombras = useMemo(() => {
    const a = c.sombraAmbiente, k = c.sombraDeContacto;
    // 0 com a capa no ponto mais alto, 1 no mais baixo.
    const baixo = flutuar.interpolate(vezes(SENO, 0.5, 0.5));
    return {
      ambiente: {
        left: a.x * size, top: a.y * size, width: a.largura * size, height: a.altura * size,
        // As sombras escurecem com a montagem: o objeto aterra.
        opacity: Animated.multiply(Animated.multiply(poseVista, aterrar), baixo.interpolate({ inputRange: [0, 1], outputRange: [a.opacidade * 0.85, a.opacidade] })),
        transform: [{ scaleX: baixo.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1] }) }],
      },
      // Mais clara e mais pequena quando a capa sobe: é isso que vende a altura.
      contacto: {
        left: k.x * size, top: k.y * size, width: k.largura * size, height: k.altura * size,
        opacity: Animated.multiply(Animated.multiply(poseVista, aterrar), baixo.interpolate({ inputRange: [0, 1], outputRange: [k.opacidade * 0.55, k.opacidade] })),
        transform: [
          { rotate: `${k.rotacao}deg` },
          { scale: baixo.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
        ],
      },
    };
  }, [poseVista, flutuar, size, aterrar, c.sombraAmbiente, c.sombraDeContacto]);

  return (
    <View style={{ width: size, height: size, overflow: 'visible' }}>
      <Animated.View pointerEvents="none" style={[styles.sombra, sombras.ambiente]}>
        <Image source={SOMBRA_AMBIENTE} resizeMode="stretch" style={styles.cheia} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.sombra, sombras.contacto]}>
        <Image source={SOMBRA_DE_CONTACTO} resizeMode="stretch" style={styles.cheia} />
      </Animated.View>
      {children(pose3D)}
    </View>
  );
}

const styles = StyleSheet.create({
  sombra: { position: 'absolute' },
  cheia: { width: '100%', height: '100%' },
});
