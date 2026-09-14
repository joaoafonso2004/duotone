import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Easing } from 'react-native';
import { arranqueAtual } from '../lib/arranqueDaFaixa';
import {
  alvosDasPecas, estadoPreso, faseDoArranque,
  type FaseDoArranque, type LeituraDoDownload, type Preso,
} from '../lib/montagemDaCapa';
import { cachedAudioFile, estadoDoDownload, ouvirDownloads } from '../lib/youtubeCache';
import { usePlayer } from '../state/player';
import { useReducedMotion } from './useReducedMotion';

const ENCAIXAR_MS = 420;
/** Quanto demora a aproximação entre bocados: longa, para quase nunca chegar ao fim. */
const APROXIMAR_MS = 5400;
const SAIDA = Easing.out(Easing.cubic);

/** O que a caixa 3D precisa para se montar (ver `lib/montagemDaCapa.ts`). */
export type MontagemDaCapa = {
  /** Aresta esquerda, aresta de baixo e face: 0 longe, 1 no sítio. */
  pecas: [Animated.Value, Animated.Value, Animated.Value];
  opacidades: [Animated.Value, Animated.Value, Animated.Value];
  /** Quanto a peça `proxima` recua enquanto o download está preso a meio. */
  recuo: Animated.AnimatedMultiplication<number>;
  proxima: number | null;
  /** O contorno do lugar da face, antes de ela pousar. */
  contorno: Animated.Value;
  /** A luz que dá a volta ao contorno antes de haver download. */
  luz: { fase: Animated.Value; opacidade: Animated.AnimatedAddition<number> };
  /** 0 a montar, 1 a flutuar. */
  voo: Animated.Value;
  /** O assentar da caixa quando fica montada, em pontos. */
  assentar: Animated.Value;
  /** Quanto da caixa já está montada, para as sombras. */
  aterrar: Animated.AnimatedInterpolation<number>;
  preso: Preso;
};

/**
 * A montagem da capa 3D e a deteção de um arranque preso, para a faixa atual.
 *
 * Tudo com o driver nativo; o JS só decide para onde vai cada peça quando chega
 * um bocado (o `youtubeCache` avisa) ou o leitor muda, e verifica o preso uma
 * vez por segundo enquanto a faixa não está pronta. Montada, pára tudo.
 *
 * `animar` desliga as animações (modo Simple, leitor fechado) mas não a deteção:
 * o botão do relatório serve nos dois estilos.
 */
export function useMontagemDaCapa(sourceId: string | null, animar: boolean): MontagemDaCapa {
  const reduzido = useReducedMotion();
  const [preso, setPreso] = useState<Preso>(null);
  const [proxima, setProxima] = useState<number | null>(null);

  const valores = useRef<{
    pecas: [Animated.Value, Animated.Value, Animated.Value];
    opacidades: [Animated.Value, Animated.Value, Animated.Value];
    contorno: Animated.Value; luzFase: Animated.Value; luzBase: Animated.Value; luzPulso: Animated.Value;
    respira: Animated.Value; recuoAtivo: Animated.Value; voo: Animated.Value; assentar: Animated.Value;
  } | null>(null);
  if (!valores.current) {
    // Montada por omissão: sem faixa, ou antes do primeiro efeito, a caixa está inteira.
    valores.current = {
      pecas: [new Animated.Value(1), new Animated.Value(1), new Animated.Value(1)],
      opacidades: [new Animated.Value(1), new Animated.Value(1), new Animated.Value(1)],
      contorno: new Animated.Value(0),
      // Fases de 0 a 1 em ciclo: nascem em 0, e 0 e 1 valem o mesmo (ver a
      // flutuação em CapaFlutuante3D -- o loop repõe o valor com que nasceram).
      luzFase: new Animated.Value(0),
      luzBase: new Animated.Value(0),
      luzPulso: new Animated.Value(0),
      respira: new Animated.Value(0),
      recuoAtivo: new Animated.Value(0),
      voo: new Animated.Value(1),
      assentar: new Animated.Value(0),
    };
  }
  const a = valores.current;

  const derivados = useMemo(() => {
    const pulso = a.respira.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 0.9, 0.3] });
    const respiraDoRecuo = a.respira.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.08, 0.14, 0.08] });
    return {
      recuo: Animated.multiply(a.recuoAtivo, respiraDoRecuo),
      luzOpacidade: Animated.add(a.luzBase, Animated.multiply(a.luzPulso, pulso)),
      aterrar: Animated.divide(Animated.add(Animated.add(a.pecas[0], a.pecas[1]), a.pecas[2]), 3)
        .interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
    };
  }, [a]);

  useEffect(() => {
    if (!sourceId) return;
    const id = sourceId;
    const quieto = reduzido || !animar;
    const emCurso: (Animated.CompositeAnimation | null)[] = [null, null, null];
    let orbita: Animated.CompositeAnimation | null = null;
    let respiracao: Animated.CompositeAnimation | null = null;
    let terminado = false;
    let relogio: ReturnType<typeof setInterval> | null = null;
    let pararOuvirDownloads = () => {};
    let pararOuvirLeitor = () => {};

    const para = (valor: Animated.Value, toValue: number, duration: number) => {
      if (quieto) { valor.setValue(toValue); return; }
      Animated.timing(valor, { toValue, duration, easing: SAIDA, useNativeDriver: true }).start();
    };
    const orbitar = (sim: boolean) => {
      if (sim && !quieto) {
        if (orbita) return;
        a.luzFase.setValue(0);
        orbita = Animated.loop(Animated.timing(a.luzFase, { toValue: 1, duration: 2200, easing: Easing.linear, useNativeDriver: true }));
        orbita.start();
      } else if (orbita) {
        orbita.stop();
        orbita = null;
      }
    };
    const respirar = (sim: boolean) => {
      if (sim && !quieto) {
        if (respiracao) return;
        a.respira.setValue(0);
        respiracao = Animated.loop(Animated.timing(a.respira, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: true }));
        respiracao.start();
      } else if (respiracao) {
        respiracao.stop();
        respiracao = null;
      }
    };
    const pararTudo = () => {
      terminado = true;
      if (relogio) clearInterval(relogio);
      pararOuvirDownloads();
      pararOuvirLeitor();
      emCurso.forEach((x) => x?.stop());
      orbitar(false);
      respirar(false);
    };

    // Já em disco: a caixa aparece montada, sem animação. É o caso da maioria.
    if (cachedAudioFile(id)?.exists === true) {
      a.pecas.forEach((p) => p.setValue(1));
      a.opacidades.forEach((o) => o.setValue(1));
      a.contorno.setValue(0); a.luzBase.setValue(0); a.luzPulso.setValue(0);
      a.recuoAtivo.setValue(0); a.voo.setValue(1); a.assentar.setValue(0);
      setPreso(null);
      setProxima(null);
      return pararTudo;
    }

    a.pecas.forEach((p) => p.setValue(0));
    a.opacidades.forEach((o) => o.setValue(0));
    a.voo.setValue(0); a.assentar.setValue(0); a.recuoAtivo.setValue(0); a.luzPulso.setValue(0);
    a.contorno.setValue(0);
    a.luzBase.setValue(0);

    const pedidoLocal = Date.now();
    let bocadosVistos = 0;
    const encaixadas = [false, false, false];
    const feito = [{ passo: -1, limite: -1 }, { passo: -1, limite: -1 }, { passo: -1, limite: -1 }];
    let presoAtual: Preso = null;
    let faseAtual: FaseDoArranque | null = null;
    let proximaAtual: number | null = null;

    const terminar = () => {
      if (terminado) return;
      pararTudo();
      [0, 1, 2].forEach((i, k) => {
        emCurso[i]?.stop();
        if (quieto) { a.pecas[i].setValue(1); a.opacidades[i].setValue(1); return; }
        Animated.timing(a.pecas[i], { toValue: 1, duration: ENCAIXAR_MS, delay: k * 90, easing: SAIDA, useNativeDriver: true }).start();
        para(a.opacidades[i], 1, 250);
      });
      para(a.contorno, 0, 300); para(a.luzBase, 0, 250); para(a.luzPulso, 0, 250); para(a.recuoAtivo, 0, 250);
      if (quieto) {
        a.voo.setValue(1);
      } else {
        // Montada: assenta 2 pt e volta a flutuar aos poucos.
        Animated.sequence([
          Animated.delay(ENCAIXAR_MS + 180),
          Animated.timing(a.assentar, { toValue: 2, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(a.assentar, { toValue: 0, duration: 260, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]).start();
        Animated.sequence([
          Animated.delay(ENCAIXAR_MS + 250),
          Animated.timing(a.voo, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]).start();
      }
      setPreso(null);
      setProxima(null);
    };

    const avaliar = () => {
      if (terminado) return;
      const st = usePlayer.getState();
      if (st.current?.sourceId !== id) return;
      const d = estadoDoDownload(id);
      if (d) bocadosVistos = Math.max(bocadosVistos, d.bocados);
      const noDisco = cachedAudioFile(id)?.exists === true;
      const pronta = noDisco || (st.activeBackend !== 'resolving' && !st.buffering);
      const leitura: LeituraDoDownload = d ? { ...d, bocados: Math.max(d.bocados, bocadosVistos) } : null;
      const fase = faseDoArranque({ emDiscoAoComecar: false, pronta, download: leitura });
      if (fase === 'pronta') { terminar(); return; }

      const arranque = arranqueAtual();
      const pedidoEm = arranque?.videoId === id ? arranque.pedidoEm : pedidoLocal;
      // Em segundo plano o relógio não conta: não se vê o ecrã, e voltar podia
      // encontrar um "preso" que era só a app suspensa.
      const novoPreso = AppState.currentState === 'active'
        ? estadoPreso({ fase, agora: Date.now(), pedidoEm, download: leitura })
        : presoAtual;
      const alvos = alvosDasPecas(fase, leitura);
      const retomar = presoAtual === 'preso-a-meio' && novoPreso !== 'preso-a-meio';

      alvos.forEach((alvo, i) => {
        if (alvo.encaixada) {
          if (!encaixadas[i]) {
            encaixadas[i] = true;
            emCurso[i]?.stop();
            if (quieto) { a.pecas[i].setValue(1); a.opacidades[i].setValue(1); return; }
            emCurso[i] = Animated.timing(a.pecas[i], { toValue: 1, duration: ENCAIXAR_MS, easing: SAIDA, useNativeDriver: true });
            emCurso[i]!.start();
            para(a.opacidades[i], 1, 250);
          }
          return;
        }
        if (!alvo.visivel) return;
        // Só para a frente: se o bocado encolher (um 403 do CDN), os passos
        // recalculados podiam ficar atrás dos que já se mostraram.
        const passoNovo = alvo.passo > feito[i].passo;
        if (!passoNovo && alvo.limite <= feito[i].limite && !retomar) return;
        const passo = Math.max(alvo.passo, feito[i].passo, 0);
        const limite = Math.max(alvo.limite, feito[i].limite);
        feito[i] = { passo, limite };
        emCurso[i]?.stop();
        if (quieto) { a.pecas[i].setValue(passo); a.opacidades[i].setValue(0.25); return; }
        // O bocado põe-na no passo depressa; depois aproxima-se devagar do limite.
        const passos: Animated.CompositeAnimation[] = [];
        if (passoNovo && passo > 0) {
          passos.push(Animated.timing(a.pecas[i], { toValue: passo, duration: ENCAIXAR_MS, easing: SAIDA, useNativeDriver: true }));
        }
        passos.push(Animated.timing(a.pecas[i], { toValue: limite, duration: APROXIMAR_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }));
        emCurso[i] = Animated.sequence(passos);
        emCurso[i]!.start();
        para(a.opacidades[i], Math.min(1, 0.15 + limite * 1.1), 1200);
      });

      const indice = alvos.findIndex((x) => !x.encaixada && x.visivel);
      const novaProxima = indice >= 0 ? indice : null;
      if (novaProxima !== proximaAtual) { proximaAtual = novaProxima; setProxima(novaProxima); }

      if (novoPreso === presoAtual && fase === faseAtual) return;
      // O contorno e a luz: antes de haver download, a luz dá a volta ao lugar
      // da face; se não começar, pára e pulsa.
      if (fase === 'a-preparar') {
        para(a.contorno, 0.16, 300);
        if (novoPreso === 'nao-comecou') {
          orbitar(false); para(a.luzBase, 0, 300); para(a.luzPulso, 1, 300); respirar(true);
        } else {
          orbitar(true); para(a.luzBase, quieto ? 0 : 0.9, 300); para(a.luzPulso, 0, 300);
        }
      } else {
        orbitar(false); para(a.luzBase, 0, 250); para(a.luzPulso, 0, 250); para(a.contorno, 0.13, 300);
      }
      if (novoPreso === 'preso-a-meio') {
        if (proximaAtual !== null) emCurso[proximaAtual]?.stop();
        para(a.recuoAtivo, 1, 500);
        respirar(true);
      } else {
        para(a.recuoAtivo, 0, 400);
        if (novoPreso !== 'nao-comecou') respirar(false);
      }
      presoAtual = novoPreso;
      faseAtual = fase;
      setPreso(novoPreso);
    };

    pararOuvirDownloads = ouvirDownloads(avaliar);
    pararOuvirLeitor = usePlayer.subscribe((s, p) => {
      if (s.activeBackend !== p.activeBackend || s.buffering !== p.buffering || s.current !== p.current) avaliar();
    });
    relogio = setInterval(() => { if (AppState.currentState === 'active') avaliar(); }, 1000);
    avaliar();
    return pararTudo;
  }, [sourceId, animar, reduzido, a]);

  return useMemo<MontagemDaCapa>(() => ({
    pecas: a.pecas,
    opacidades: a.opacidades,
    recuo: derivados.recuo,
    proxima,
    contorno: a.contorno,
    luz: { fase: a.luzFase, opacidade: derivados.luzOpacidade },
    voo: a.voo,
    assentar: a.assentar,
    aterrar: derivados.aterrar,
    preso,
  }), [a, derivados, proxima, preso]);
}
