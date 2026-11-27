import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { PanGestureHandler, State, type PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import { initialWindowMetrics } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { VistaDaVolta, type InstanciaDaVolta } from '../../modules/duotone-volta';
import { ArtworkCollage } from './ArtworkCollage';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { raioDosCantosDoEcra } from '../lib/gaveta';
import { amostrasDaVolta, capaDaVolta, decidirVolta, VEU_MAXIMO, VOLTA, type CapaDoVoo, type Retangulo } from '../lib/vooDoQuadrado';
import { useAparencia } from '../state/aparencia';
import { pedirFluidez, segurarFluidez } from '../state/fluidez';
import { medirNoEcra } from '../state/vooDoQuadrado';
import { colors, radii } from '../theme';

/** O binário tem o módulo que segura a página de trás (sem ele, o deslizar da borda de sempre). */
export const temVoltaADeslizar = VistaDaVolta !== null;

type Estado = 'parada' | 'arrasto' | 'a-acabar';

/**
 * Voltar a deslizar em qualquer ponto, a encolher para o cartão (26/11, item 7 do
 * plano, `docs/maquetes-da-lista-2026-11-25.html#m7`). Numa página que abriu por um
 * quadrado, puxar para a direita encolhe-a com o dedo em direção ao cartão de onde
 * veio: o recorte vai do ecrã ao cartão, os cantos dos do ecrã aos do cartão, o
 * conteúdo apaga-se, e a página de trás aparece por baixo, escurecida. Largar depois
 * de 22 % da largura (ou num gesto rápido) acaba de encolher e volta; antes, a
 * página volta a abrir.
 *
 * O dedo escreve no driver nativo (`Animated.event` do `PanGestureHandler`, como a
 * gaveta e o fechar do leitor); o JavaScript só decide no fim. A página de trás
 * volta à janela por um pop interativo da pilha nativa (`modules/duotone-volta`):
 * começa quando o gesto pega e acaba quando a animação acaba. Se não começar, a
 * página encolhe na mesma sobre o fundo da app e sai sem animação no fim.
 *
 * Só para a direita e na horizontal: na vertical falha (a lista rola), e as
 * prateleiras que rolam de lado ficam com o gesto delas.
 *
 * E acaba na capa do cartão (26/11, o João: "arrastar cria só um retângulo
 * escuro"): o círculo de um artista, o quadrado de uma playlist. A capa sai do
 * sítio onde está na página, com o tamanho que lá tem, e encolhe até ao cartão
 * (27/11, `capaDaVolta`: cobria o recorte inteiro e ficava gigante). Vai dentro do
 * recorte, que a corta, numa caixa sem a escala dele: só cresce por igual, e os
 * cantos, que vão dos da página aos do cartão, são redondos a sério.
 */
export function VoltaADeslizar({ cartao, capaDoCartao = null, ativa, sair, medirCapa, esconderCapa, children }: {
  /** O cartão de onde a página abriu, na janela (a medida da entrada). */
  cartao: Retangulo | null;
  /** A capa desse cartão e o raio dos cantos dele: é nela que a página acaba. */
  capaDoCartao?: { capa: CapaDoVoo; raio: number } | null;
  ativa: boolean;
  /** Sem a página de trás (o pop nativo não começou): sair sem animação. */
  sair: () => void;
  /** Onde está agora a capa da página, na janela (`AlvoDoVoo`): é dali que a capa sai. */
  medirCapa?: () => Promise<Retangulo | null>;
  /** Esconde a capa da página enquanto a que sai dela anda (senão viam-se duas). */
  esconderCapa?: (sim: boolean) => void;
  children: React.ReactNode;
}) {
  const ecra = useWindowDimensions();
  const reduzido = useReducedMotion();
  const oled = useAparencia((s) => s.fundoApp) === 'oled';
  const [estado, setEstado] = useState<Estado>('parada');
  const [origem, setOrigem] = useState<Retangulo | null>(null);
  /** A capa da página quando o gesto pegou, na página (`null`: fora da vista; `undefined`: a medir). */
  const [capaNaPagina, setCapaNaPagina] = useState<Retangulo | null | undefined>(undefined);
  const estadoRef = useRef<Estado>('parada');
  estadoRef.current = estado;
  const raiz = useRef<View>(null);
  const vista = useRef<InstanciaDaVolta>(null);
  const inicio = useRef<Promise<boolean> | null>(null);
  const largarFluidez = useRef<(() => void) | null>(null);
  const montada = useRef(true);
  useEffect(() => () => { montada.current = false; largarFluidez.current?.(); }, []);

  /** O dedo (pt para a direita), o fim (0 a 1, depois de largar) e o tapar (1 enquanto há gesto). */
  const dedo = useRef(new Animated.Value(0)).current;
  const fim = useRef(new Animated.Value(0)).current;
  const tapa = useRef(new Animated.Value(0)).current;
  const evento = useMemo(() => Animated.event([{ nativeEvent: { translationX: dedo } }], { useNativeDriver: true }), [dedo]);

  // Onde está a página na janela: o cartão mede-se na janela, o recorte na página.
  const medir = useCallback(() => {
    void medirNoEcra(raiz.current).then((r) => {
      if (r && montada.current) setOrigem((o) => (o && o.x === r.x && o.y === r.y && o.width === r.width && o.height === r.height ? o : r));
    });
  }, []);

  const raioDoEcra = raioDosCantosDoEcra(ecra.width, initialWindowMetrics?.insets.bottom ?? 0);
  const desenho = useMemo(() => {
    if (!cartao || !origem || origem.width <= 0 || origem.height <= 0) return null;
    const pagina = { width: origem.width, height: origem.height };
    const noCartao = { x: cartao.x - origem.x, y: cartao.y - origem.y, width: cartao.width, height: cartao.height };
    const a = amostrasDaVolta(pagina, noCartao, raioDoEcra);
    // O encolher do dedo, até ao máximo; depois de largar, o fim leva-o até 1.
    const doDedo = dedo.interpolate({
      inputRange: [0, (pagina.width * VOLTA.maximo) / VOLTA.ganho], outputRange: [0, VOLTA.maximo], extrapolate: 'clamp',
    });
    const p = Animated.add(doDedo, Animated.multiply(Animated.subtract(1, doDedo), fim));
    // A página segue o dedo a 25 %, e volta ao sítio enquanto acaba de encolher.
    const segue = Animated.multiply(
      dedo.interpolate({ inputRange: [0, 1], outputRange: [0, VOLTA.segue], extrapolateLeft: 'clamp', extrapolateRight: 'extend' }),
      Animated.subtract(1, fim),
    );
    const tx = p.interpolate({ inputRange: [0, 1], outputRange: [0, a.tx] });
    const ty = p.interpolate({ inputRange: [0, 1], outputRange: [0, a.ty] });
    const sx = p.interpolate({ inputRange: [0, 1], outputRange: [1, a.sx] });
    const sy = p.interpolate({ inputRange: [0, 1], outputRange: [1, a.sy] });
    const tapado = tapa.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });
    return {
      marco: {
        borderRadius: p.interpolate({ inputRange: a.p, outputRange: a.raio }),
        transform: [{ translateX: Animated.add(tx, segue) }, { translateY: ty }, { scaleX: sx }, { scaleY: sy }],
      },
      // O conteúdo com a escala ao contrário: fica do tamanho dele, só o recorte encolhe.
      dentro: {
        opacity: p.interpolate({ inputRange: [0, 1 / VOLTA.apagar], outputRange: [1, 0], extrapolate: 'clamp' }),
        transform: [
          { translateX: Animated.divide(Animated.multiply(tx, -1), sx) },
          { translateY: Animated.divide(Animated.multiply(ty, -1), sy) },
          { scaleX: Animated.divide(1, sx) },
          { scaleY: Animated.divide(1, sy) },
        ],
      },
      // A cor da página por baixo do conteúdo (as páginas são transparentes, sobre o
      // fundo da app): tapa a de trás dentro do recorte, e apaga-se no fim.
      fundo: {
        opacity: Animated.multiply(tapado, p.interpolate({ inputRange: [VOLTA.corApagaDesde, 1], outputRange: [1, 0], extrapolate: 'clamp' })),
      },
      veu: { opacity: Animated.multiply(tapado, p.interpolate({ inputRange: [0, 1], outputRange: [VEU_MAXIMO, 0], extrapolate: 'clamp' })) },
      // Sem a escala do recorte, como o conteúdo, mas sem se apagar: é aqui que
      // anda a capa (em coordenadas da página, a seguir o dedo como ele).
      semEscala: {
        transform: [
          { translateX: Animated.divide(Animated.multiply(tx, -1), sx) },
          { translateY: Animated.divide(Animated.multiply(ty, -1), sy) },
          { scaleX: Animated.divide(1, sx) },
          { scaleY: Animated.divide(1, sy) },
        ],
      },
      p,
      noCartao,
    };
  }, [cartao, origem, raioDoEcra, dedo, fim, tapa]);

  // A capa que sai da página e encolhe até ao cartão (27/11, `capaDaVolta`). À
  // parte do recorte: chega um fotograma depois de o gesto pegar (a medida), e o
  // recorte já está a andar.
  const capa = useMemo(() => {
    if (!desenho || !origem || !capaDoCartao || capaNaPagina === undefined) return null;
    const { p, noCartao } = desenho;
    const circulo = capaDoCartao.capa.forma === 'circulo';
    const g = capaDaVolta(capaNaPagina, noCartao, { width: origem.width, height: origem.height }, capaDoCartao.capa.forma);
    const escala = p.interpolate({ inputRange: [0, 1], outputRange: [1, g.escala] });
    // Os cantos vistos: os da capa da página (a foto de um artista não os tem) aos do cartão.
    const raioVisto = p.interpolate({ inputRange: [0, 1], outputRange: [circulo ? 0 : radii.lg, circulo ? noCartao.width / 2 : capaDoCartao.raio] });
    return {
      levanta: g.entrada === null,
      caixa: g.caixa,
      estilo: {
        borderRadius: Animated.divide(raioVisto, escala),
        opacity: g.entrada ? p.interpolate({ inputRange: g.entrada, outputRange: [0, 1], extrapolate: 'clamp' }) : 1,
        transform: [
          { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [0, g.dx] }) },
          { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [0, g.dy] }) },
          { scale: escala },
        ],
      },
    };
  }, [desenho, origem, capaDoCartao, capaNaPagina]);
  // Levantada, a da página esconde-se no mesmo desenho em que esta aparece por cima
  // (antes de se pintar: num efeito normal viam-se as duas um fotograma).
  useLayoutEffect(() => {
    if (!capa?.levanta) return undefined;
    esconderCapa?.(true);
    return () => esconderCapa?.(false);
  }, [capa?.levanta, esconderCapa]);

  const repor = useCallback(() => {
    dedo.setValue(0); fim.setValue(0); tapa.setValue(0);
    inicio.current = null;
    setCapaNaPagina(undefined);
    setEstado('parada');
  }, [dedo, fim, tapa]);

  const terminar = useCallback(async (volta: boolean) => {
    const nativa = (await inicio.current?.catch(() => false)) ?? false;
    if (volta) {
      // A pilha tira a página sem animação: já está do tamanho do cartão e apagada.
      const saiu = nativa && (await vista.current?.acabar?.(false).catch(() => false));
      if (!saiu) { sair(); return; }
      // A pilha avisa a navegação, que desmonta a página. Se ao fim de 1 s ela
      // ainda aqui estiver, o pop não se fez: volta a mostrar-se (nunca um
      // segundo goBack, que tirava a de trás).
      setTimeout(() => { if (montada.current) repor(); }, 1000);
      return;
    }
    // Volta a abrir: a de trás sai da janela antes de a página voltar a ser transparente.
    if (nativa) await vista.current?.acabar?.(true).catch(() => false);
    repor();
  }, [sair, repor]);

  const aoMudar = useCallback((e: PanGestureHandlerStateChangeEvent) => {
    const { state, oldState, translationX, velocityX } = e.nativeEvent;
    if (state === State.ACTIVE) {
      if (estadoRef.current !== 'parada') return;
      estadoRef.current = 'arrasto';
      setEstado('arrasto');
      tapa.setValue(1);
      largarFluidez.current?.();
      largarFluidez.current = segurarFluidez(900);
      inicio.current = vista.current?.comecar?.() ?? Promise.resolve(false);
      // De onde sai a capa: a da página, onde ela está agora (a lista pode ter rolado).
      const o = origem;
      void (medirCapa?.() ?? Promise.resolve(null)).then((r) => {
        if (!montada.current || estadoRef.current === 'parada') return;
        setCapaNaPagina(r && o ? { x: r.x - o.x, y: r.y - o.y, width: r.width, height: r.height } : null);
      }, () => { if (montada.current && estadoRef.current !== 'parada') setCapaNaPagina(null); });
      return;
    }
    if (oldState !== State.ACTIVE || estadoRef.current !== 'arrasto') return;
    largarFluidez.current?.();
    largarFluidez.current = null;
    estadoRef.current = 'a-acabar';
    setEstado('a-acabar');
    const volta = decidirVolta(translationX, velocityX, origem?.width ?? ecra.width);
    pedirFluidez((volta ? VOLTA.acabarMs : VOLTA.reabrirMs) + 200);
    const curva = Easing.out(Easing.cubic);
    if (volta) {
      Animated.timing(fim, { toValue: 1, duration: VOLTA.acabarMs, easing: curva, useNativeDriver: true })
        .start(() => { void terminar(true); });
    } else {
      Animated.timing(dedo, { toValue: 0, duration: VOLTA.reabrirMs, easing: curva, useNativeDriver: true })
        .start(() => { void terminar(false); });
    }
  }, [dedo, fim, tapa, origem, ecra.width, terminar, medirCapa]);

  const ligada = ativa && !reduzido && desenho !== null;
  const aMexer = estado !== 'parada';
  const Vista = VistaDaVolta;

  // A árvore é sempre a mesma (com ou sem medida, a mexer ou não): mudar os pais
  // dos filhos voltava a montar a página inteira.
  return (
    <PanGestureHandler
      // Desligar a meio cancelava o gesto: só fica desligado enquanto acaba.
      enabled={ligada && estado !== 'a-acabar'}
      activeOffsetX={VOLTA.pegaEm}
      failOffsetX={-8}
      failOffsetY={[-VOLTA.falhaNaVertical, VOLTA.falhaNaVertical]}
      onGestureEvent={evento}
      onHandlerStateChange={aoMudar}
    >
      <Animated.View style={styles.cheia}>
        <View ref={raiz} collapsable={false} pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={medir} />
        {Vista ? <Vista ref={vista} pointerEvents="none" style={styles.vista} /> : null}
        {aMexer && desenho ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.veu, desenho.veu]} /> : null}
        <Animated.View style={[StyleSheet.absoluteFill, desenho?.marco, aMexer && styles.recorta]}>
          {desenho ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: oled ? '#000' : colors.bg }, desenho.fundo]} /> : null}
          <Animated.View style={[StyleSheet.absoluteFill, desenho?.dentro]}>{children}</Animated.View>
          {aMexer && desenho && capa && capaDoCartao ? (
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, desenho.semEscala]}>
              <Animated.View style={[styles.capa, { left: capa.caixa.x, top: capa.caixa.y, width: capa.caixa.width, height: capa.caixa.height }, capa.estilo]}>
                {capaDoCartao.capa.forma === 'circulo'
                  ? <Image source={{ uri: capaParaLista(capaDoCartao.capa.capas[0]) ?? capaDoCartao.capa.capas[0] }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  : <ArtworkCollage artworks={[...capaDoCartao.capa.capas]} size={capa.caixa.width} />}
              </Animated.View>
            </Animated.View>
          ) : null}
        </Animated.View>
      </Animated.View>
    </PanGestureHandler>
  );
}

const styles = StyleSheet.create({
  cheia: { flex: 1 },
  vista: { position: 'absolute', width: 1, height: 1, left: 0, top: 0, opacity: 0 },
  veu: { backgroundColor: '#000' },
  recorta: { overflow: 'hidden' },
  capa: { position: 'absolute', overflow: 'hidden' },
});
