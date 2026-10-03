import { Animated } from 'react-native';

import { amostrasDoDedo } from '../lib/transicaoDoLeitor';

export { deLado, deLadoInverso, molaIOS } from '../lib/transicaoDoLeitor';

/**
 * A transição do leitor do iPhone (2/10): abrir e fechar o Now Playing.
 *
 * Escolhida pelo João na maquete `docs/transicao-do-leitor.html` -- a variante
 * C ("Elevar") para abrir, e o fecho a arrastar das três:
 *
 *  - **Abrir**: a página nasce a crescer (0,86 -> 1) e a subir, a capa faz um
 *    arco do mini-player até ao sítio e ganha a pose 3D no fim, o resto entra
 *    em escada, e a app de trás recua e escurece com os cantos redondos.
 *  - **Fechar a arrastar** (como as transições "zoom" do iOS 18): a página
 *    encolhe para um cartão que segue o dedo -- para os lados só um pouco, com
 *    resistência --, a capa perde a pose, os controlos desvanecem e a app de
 *    trás volta para a frente. Ao largar, o cartão continua com a velocidade do
 *    dedo e a capa aterra exatamente em cima da do mini-player.
 *
 * Os valores vivem aqui, fora do `PlayerRoot`, porque a app de trás (o
 * navegador, no `RootNavigator`) também os lê. Tudo o que se deriva deles é
 * transform, opacidade e raio: corre no motor nativo, a 120 Hz com a chave
 * `CADisableMinimumFrameDurationOnPhone` do Info.plist (app.json).
 */

/** -1 (a capa a voar de uma linha) .. 0 mini-player .. 1 aberto. A mola passa um pouco. */
export const abertura = new Animated.Value(0);
/** O cartão do gesto: deslocação (pt) e escala, à volta do pivô (50%, 40%). */
export const cartaoX = new Animated.Value(0);
export const cartaoY = new Animated.Value(0);
export const cartaoEsc = new Animated.Value(1);
/** Quanto se arrastou, de 0 a 1. */
export const arrasto = new Animated.Value(0);
/** Depois de largar: quanto o cartão já aterrou no mini-player, de 0 a 1. */
export const aterrar = new Animated.Value(0);

/**
 * O dedo, em pontos desde o início do arrasto (3/10). Escrito pelo Gesture
 * Handler na thread da interface (`Animated.event` nativo): o cartão segue o
 * dedo mesmo com o JavaScript ocupado -- era o "encrava e dá snap". As contas
 * do `cartaoDoArrasto` passam a interpolações por amostras, e o que se desenha
 * é o valor de sempre MAIS o do dedo (os `*Visto`). Ao largar, o JavaScript
 * junta os dois nos valores de sempre e põe o dedo a 0, no mesmo fotograma.
 */
export const dedoX = new Animated.Value(0);
export const dedoY = new Animated.Value(0);
/** A altura do ecrã (e o inverso): as contas do arrasto são em frações dela. */
export const alturaDoEcra = new Animated.Value(844);
const inversoDaAltura = new Animated.Value(1 / 844);
export function definirAlturaDoEcra(H: number): void {
  if (!(H > 0)) return;
  alturaDoEcra.setValue(H);
  inversoDaAltura.setValue(1 / H);
}

const amostras = amostrasDoDedo();
const txDoDedo = dedoX.interpolate({ ...amostras.x, extrapolate: 'clamp' });
const fracaoY = Animated.multiply(dedoY, inversoDaAltura);
/** Para baixo, 0,62 do dedo; para cima estica com resistência (o `cartaoDoArrasto`). */
const tyDoDedo = Animated.multiply(fracaoY.interpolate({ ...amostras.yFracao, extrapolate: 'clamp' }), alturaDoEcra);
const gDoDedo = fracaoY.interpolate({ ...amostras.g, extrapolate: 'clamp' });
const escDoDedo = gDoDedo.interpolate({ ...amostras.esc, extrapolate: 'clamp' });

/** O que se desenha: os valores de sempre mais o dedo. */
export const cartaoXVisto = Animated.add(cartaoX, txDoDedo);
export const cartaoYVisto = Animated.add(cartaoY, tyDoDedo);
export const cartaoEscVisto = Animated.multiply(cartaoEsc, escDoDedo);
export const arrastoVisto = Animated.add(arrasto, gDoDedo);

/** Volta tudo ao repouso do gesto (sem mexer na abertura). */
export function reporGesto(): void {
  dedoX.setValue(0);
  dedoY.setValue(0);
  cartaoX.setValue(0);
  cartaoY.setValue(0);
  cartaoEsc.setValue(1);
  arrasto.setValue(0);
  aterrar.setValue(0);
}

type Fonte = Animated.Value | Animated.AnimatedInterpolation<number> | Animated.AnimatedMultiplication<number>;

/**
 * A curva suave (smoothstep) de `a` a `b`, em amostras: o motor nativo só
 * interpola por troços, e cinco chegam para não se ver a diferença.
 * `inverter` dá 1 - curva.
 */
export function suave(v: Fonte, a: number, b: number, inverter = false) {
  const ts = [0, 0.25, 0.5, 0.75, 1];
  return v.interpolate({
    inputRange: ts.map((t) => a + (b - a) * t),
    outputRange: ts.map((t) => {
      const s = t * t * (3 - 2 * t);
      return inverter ? 1 - s : s;
    }),
    extrapolate: 'clamp',
  });
}

const aberto01 = abertura.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });

/** A app de trás: 0 à frente, 1 recuada. Recua ao abrir; volta com o gesto. */
export const recuoDoFundo = Animated.multiply(
  Animated.multiply(
    aberto01,
    arrastoVisto.interpolate({
      inputRange: [0, 0.1875, 0.375, 0.5625, 0.75],
      outputRange: [1, 1 - 0.92 * 0.15625, 1 - 0.92 * 0.5, 1 - 0.92 * 0.84375, 1 - 0.92],
      extrapolate: 'clamp',
    }),
  ),
  suave(aterrar, 0, 0.6, true),
);

/** A pose 3D da capa: chega no fim da abertura, sai com o gesto (o mini é plano). */
export const forcaDaPose = Animated.multiply(
  Animated.multiply(suave(abertura, 0.55, 1), suave(arrastoVisto, 0, 0.55, true)),
  aterrar.interpolate({ inputRange: [0, 1 / 1.6], outputRange: [1, 0], extrapolate: 'clamp' }),
);

/** O que não é a capa nem o título sai primeiro do cartão; o título aguenta mais. */
export const restoDoGesto = Animated.multiply(suave(arrastoVisto, 0.02, 0.42, true), suave(aterrar, 0, 0.3, true));
export const tituloDoGesto = Animated.multiply(suave(arrastoVisto, 0.3, 0.85, true), suave(aterrar, 0, 0.32, true));

/** O mini-player aparece por baixo do cartão: primeiro uma promessa, depois a sério. */
export const miniDoGesto = Animated.add(
  arrastoVisto.interpolate({
    inputRange: [0.15, 0.3625, 0.575, 0.7875, 1],
    outputRange: [0, 0.55 * 0.15625, 0.55 * 0.5, 0.55 * 0.84375, 0.55],
    extrapolate: 'clamp',
  }),
  suave(aterrar, 0.3, 0.92),
);

/**
 * A entrada em escada de um bloco do leitor (`ordem` 0 = o de cima): a
 * opacidade e quanto ainda lhe falta subir (pt), pela abertura.
 */
export function escada(ordem: number) {
  const inicio = 0.4 + ordem * 0.07, dur = 0.42;
  const ts = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const q = ts.map((t) => 1 - Math.pow(1 - t, 3));
  const inputRange = ts.map((t) => inicio + dur * t);
  return {
    opacidade: abertura.interpolate({ inputRange, outputRange: q, extrapolate: 'clamp' }),
    subir: abertura.interpolate({ inputRange, outputRange: q.map((v) => (1 - v) * 22), extrapolate: 'clamp' }),
  };
}

// ---------------------------------------------------------------------------
// Os nós já montados, estáveis entre desenhos: refazer interpolações a cada
// render era religar o grafo nativo por nada (ver o PlayerRoot).
// ---------------------------------------------------------------------------

/** O painel do leitor: aparece com a abertura e desvanece ao aterrar. */
export const folhaOpacidade = Animated.multiply(suave(abertura, 0, 0.42), suave(aterrar, 0.1, 0.62, true));
/**
 * Os cantos do painel: redondos enquanto se mexe, retos em repouso. No gesto o
 * raio vê-se constante: é dividido pela escala do cartão.
 */
export const folhaRaio = Animated.add(
  abertura.interpolate({ inputRange: [0, 0.9375, 1, 1.0625], outputRange: [48, 48, 0, 48], extrapolate: 'clamp' }),
  Animated.divide(
    Animated.add(arrastoVisto, aterrar).interpolate({ inputRange: [0, 0.1], outputRange: [0, 46], extrapolate: 'clamp' }),
    cartaoEscVisto,
  ),
);
/** A página nasce a 0,86 e cresce até 1; no gesto, encolhe com o cartão. */
export const folhaEscala = Animated.multiply(
  abertura.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1], extrapolate: 'extend' }),
  cartaoEscVisto,
);

/**
 * Os blocos do leitor, de cima para baixo: cabeçalho, pontos, título, controlos,
 * rodapé. Entram em escada ao abrir; no gesto saem, e o título aguenta mais.
 */
export const ESCADA = [0, 1, 2, 3, 4].map((i) => {
  const e = escada(i);
  return { opacidade: Animated.multiply(e.opacidade, i === 2 ? tituloDoGesto : restoDoGesto), subir: e.subir };
});

/** O mini-player: some ao abrir (e sobe um pouco a crescer), volta com o gesto. */
export const miniOpacidade = Animated.add(suave(abertura, 0, 0.2, true), miniDoGesto)
  .interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });
// No gesto, o mini-player desce para o SEU sítio, que é onde a capa aterra.
// Preso só à abertura (que fica a 1 até ao fim da aterragem), ficava 12 pt
// acima e maior durante o gesto todo e dava um salto no fim (João, 2/10).
const miniSobe = Animated.multiply(
  Animated.multiply(suave(abertura, 0, 0.3), suave(arrastoVisto, 0.05, 0.4, true)),
  suave(aterrar, 0, 0.3, true),
);
export const miniSubir = miniSobe.interpolate({ inputRange: [0, 1], outputRange: [0, -12] });
export const miniEscala = miniSobe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });

/** A app de trás (RootNavigator): recua para 0,9, com os cantos redondos, e escurece. */
export const escalaDoFundo = recuoDoFundo.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] });
export const raioDoFundo = recuoDoFundo.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 46, 46] });
export const veuDoFundo = recuoDoFundo.interpolate({ inputRange: [0, 1], outputRange: [0, 0.62] });
