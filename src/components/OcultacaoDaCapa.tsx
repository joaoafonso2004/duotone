import { Image } from 'expo-image';
import React, { useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { Animated, AppState, Easing, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { lerCelulasDaCapa } from '../lib/celulasDaCapa';
import { COR_DO_DISCO_SEM_CAPA, corDoDisco, curvaDaOcultacao, gradienteDoDisco, OCULTACAO } from '../lib/ocultacao';
import { comecouATapar, tapou } from '../state/esperaDaOcultacao';
import { pedirFluidez } from '../state/fluidez';
import { luasNoEcra } from '../state/passagemAVista';

/** A mesma curva para todas as passagens: só depende das constantes. */
const CURVA = curvaDaOcultacao();

/**
 * A Ocultação no iPhone (25/11, a C2 que ficou por fazer na vaga 3; a variante
 * difusa que o João escolheu para o PC, `docs/ocultacao-maquete.html`): um disco
 * esbatido com a sombra da música que vem passa por cima da capa; quando a tapa,
 * a velha sai, e o disco deixa a nova à vista. A seguinte vem da direita, a
 * anterior da esquerda. As contas são as do PC (`lib/ocultacao.ts`).
 *
 * - **Por baixo** fica a capa de sempre (`children`): a nova entra nela no skip,
 *   como antes, e o expo-image cruza-a sozinho quando a tem.
 * - **Por cima**, a velha: uma imagem que fica SEMPRE montada, com a capa que se
 *   vê e opacidade 0. No skip ela ainda tem a velha, e acende sem esperar por
 *   uma imagem nova (em repouso é a mesma imagem da de baixo, na mesma cache:
 *   não pesa o dobro). Montá-la no skip era trabalho na thread da interface no
 *   instante em que o toque já a prende (~130 ms, `leitor-ios.md`).
 * - **Uma animação nativa** percorre a passagem toda (`curvaDaOcultacao`): a
 *   posição do disco e a velha a sair na totalidade leem a mesma `fase`. Não há
 *   callback a meio, que no skip esperava pelo JavaScript ocupado.
 * - Se a nova ainda não chegou à totalidade, vê-se a velha por baixo do disco a
 *   sair, e o cruzamento de sempre a seguir: é o que havia antes.
 *
 * Quem a põe decide quando vale (`ligada`): à vista, com a capa à frente (não a
 * letra), e nunca no Poster pousado. Aqui decide-se o resto, como no recuo: a
 * primeira faixa não passa (é abrir), nem com Reduzir movimento (fica o
 * cruzamento), nem em segundo plano, nem com as Duas luas (a passagem já se viu).
 * O que corta o disco é quem a contém (`overflow: hidden`, com o raio da capa).
 *
 * **As laterais da capa 3D** (26/11) usam a mesma passagem: o leitor chama o
 * `useOcultacao` e dá-a ao disco (`DiscoDaOcultacao`) e ao cubo, que põe a velha
 * por cima de cada lateral com a mesma opacidade nativa. Antes trocavam por um
 * re-render a meio da passagem (`b3927f1`), e esse trabalho na thread da
 * interface comia-lhe os fotogramas: o disco engasgava ou nem se via.
 */
type EntradaDaOcultacao = {
  /** A faixa: a passagem corre quando muda. */
  chave: string | null;
  /** +1 a seguinte, -1 a anterior (`sentidoDaOcultacao`). */
  sentido: 1 | -1;
  /** O lado da caixa, em pontos, antes de qualquer escala. */
  lado: number;
  /** A capa que se vê agora (a que fica por cima quando vier a próxima). */
  capa: string | null;
  /** De onde se lê a cor da sombra (a capa das listas: mesma cache que o tema). */
  corDe: string | null;
  ligada: boolean;
};

export type PassagemDaOcultacao = {
  /** A capa que sai, enquanto passa; `null` em repouso. */
  velha: string | null;
  /** A opacidade da velha: 1 até à totalidade, 0 depois e em repouso. Nativa. */
  opacidadeDaVelha: Animated.AnimatedInterpolation<number>;
  disco: Animated.AnimatedInterpolation<number>;
  translateX: Animated.AnimatedMultiplication<number>;
  /** Cada passagem tem o seu número; 0 antes da primeira. */
  id: number;
  corDe: string | null;
  lado: number;
};

export function OcultacaoDaCapa({ children, ...entrada }: EntradaDaOcultacao & { children: ReactNode }) {
  const passagem = useOcultacao(entrada);
  return <DiscoDaOcultacao passagem={passagem} capa={entrada.capa}>{children}</DiscoDaOcultacao>;
}

/** A decisão e a animação da passagem, para quem a desenha (o disco, e as laterais da capa 3D). */
export function useOcultacao({ chave, sentido, lado, capa, corDe, ligada }: EntradaDaOcultacao): PassagemDaOcultacao {
  const reduzir = useReducedMotion();
  const fase = useRef(new Animated.Value(1)).current;
  const sinal = useRef(new Animated.Value(1)).current;
  const [, redesenhar] = useReducer((n: number) => n + 1, 0);

  // Decide-se no DESENHO em que a faixa nova chega (como o `salto` do recuo): a
  // velha tem de continuar na imagem de cima nesse mesmo desenho, sem um
  // fotograma com a nova lá.
  const estado = useRef({ chave, capa, velha: null as string | null, inicio: 0, id: 0 });
  const ligadaAntes = useRef(ligada);
  const s = estado.current;
  if (chave !== s.chave) {
    const vale = ligadaAntes.current && ligada && !reduzir && !!s.chave && !!s.capa && !!capa
      && AppState.currentState === 'active' && !luasNoEcra();
    if (vale) {
      // Outra música antes da totalidade: a que está à vista ainda é a velha.
      const antesDaTotalidade = s.velha !== null && Date.now() - s.inicio < OCULTACAO.entradaMs;
      if (!antesDaTotalidade) s.velha = s.capa;
      s.inicio = Date.now();
      s.id += 1;
    } else {
      s.velha = null;
    }
    s.chave = chave;
  }
  s.capa = capa;
  ligadaAntes.current = ligada;

  const id = s.id;
  useLayoutEffect(() => {
    if (!id || estado.current.velha === null) return undefined;
    pedirFluidez(CURVA.duracaoMs + 100);
    // O tom da app troca quando o disco tapa a capa, e não no toque (item 17,
    // `state/esperaDaOcultacao.ts`). A animação é nativa e não avisa a meio: um
    // relógio à mesma hora chega, porque o tom cruza devagar.
    comecouATapar();
    let tapada = false;
    const tapar = () => { if (!tapada) { tapada = true; tapou(); } };
    const relogioDoTom = setTimeout(tapar, OCULTACAO.entradaMs);
    fase.stopAnimation();
    sinal.setValue(sentido);
    fase.setValue(0);
    Animated.timing(fase, { toValue: 1, duration: CURVA.duracaoMs, easing: Easing.linear, useNativeDriver: true })
      .start(({ finished }) => {
        if (!finished || estado.current.id !== id) return;
        // Já de opacidade 0: a imagem de cima passa a ter a capa nova, para a próxima.
        estado.current.velha = null;
        redesenhar();
      });
    return () => { clearTimeout(relogioDoTom); tapar(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const ladoDoDisco = lado * OCULTACAO.ladoDoDisco;
  const nos = useMemo(() => {
    const posicao = fase.interpolate({ inputRange: CURVA.inputRange, outputRange: CURVA.posicao });
    const t = CURVA.totalidade;
    return {
      translateX: Animated.multiply(Animated.multiply(posicao, sinal), ladoDoDisco),
      // A velha por cima até à totalidade; em repouso (fase 1), apagada.
      velha: fase.interpolate({ inputRange: [0, t, t + 0.0001, 1], outputRange: [1, 1, 0, 0] }),
      disco: fase.interpolate({ inputRange: [0, 0.999, 1], outputRange: [OCULTACAO.opacidade, OCULTACAO.opacidade, 0] }),
    };
  }, [fase, sinal, ladoDoDisco]);

  return { velha: s.velha, opacidadeDaVelha: nos.velha, disco: nos.disco, translateX: nos.translateX, id, corDe, lado };
}

/** O disco e a velha por cima da capa (`children`). */
export function DiscoDaOcultacao({ passagem, capa, children }: { passagem: PassagemDaOcultacao; capa: string | null; children: ReactNode }) {
  const { lado } = passagem;
  // A cor fica aqui: chega a meio da passagem, e só o disco se redesenha com ela.
  const [cor, setCor] = useState(COR_DO_DISCO_SEM_CAPA);
  useLayoutEffect(() => {
    if (!passagem.id || passagem.velha === null) return undefined;
    let vivo = true;
    setCor(COR_DO_DISCO_SEM_CAPA);
    // A cor chega quando chega (quase sempre já em cache): o movimento não espera.
    if (passagem.corDe) {
      void lerCelulasDaCapa(passagem.corDe).then((c) => { if (vivo) setCor(corDoDisco(c)); }).catch(() => {});
    }
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passagem.id]);
  const ladoDoDisco = lado * OCULTACAO.ladoDoDisco;
  const nos = { velha: passagem.opacidadeDaVelha, disco: passagem.disco, translateX: passagem.translateX };
  const velha = passagem.velha ?? capa;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {children}
      {velha ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: nos.velha }]}>
          <Image source={{ uri: velha }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={null} />
        </Animated.View>
      ) : null}
      <Animated.View
        style={{
          position: 'absolute', width: ladoDoDisco, height: ladoDoDisco, borderRadius: ladoDoDisco / 2,
          left: (lado - ladoDoDisco) / 2, top: (lado - ladoDoDisco) / 2,
          opacity: nos.disco, experimental_backgroundImage: gradienteDoDisco(cor),
          transform: [{ translateX: nos.translateX }],
        }}
      />
    </View>
  );
}
