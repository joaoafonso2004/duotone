import { useNavigation, useRoute } from '@react-navigation/native';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';
import { CASCATA, entradaDaLinha, ESPERA_MAXIMA_MS, pedirVoo } from '../lib/vooDoQuadrado';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { pedirFluidez } from '../state/fluidez';
import {
  dadosDoVoo, marcarAlvo, marcarCapaNoAr, marcarPaginaPronta, medirNoEcra, mudarFase, useVoos,
} from '../state/vooDoQuadrado';
import { temVoltaADeslizar, VoltaADeslizar } from './VoltaADeslizar';

/** Se a pilha nunca avisar o fim da entrada (`transitionEnd`), a animação de sempre volta ao fim disto. */
const ENTRADA_SEM_AVISO_MS = 1200;

/** O voltar da página que abriu por um quadrado: encolhe até ele (24/11). */
const VoltarDoQuadrado = createContext<(() => void) | null>(null);
/** A cascata das linhas quando a capa pousa (25/11): a animação da página, de 0 a 1. */
const CascataDaPagina = createContext<Animated.Value | null>(null);

/**
 * A página que abriu por um quadrado (24/11, `lib/vooDoQuadrado.ts`). Embrulha o
 * ecrã (`envolverEcra`, na navegação) quando ele traz `voo` nos parâmetros: fica
 * escondida enquanto a capa voa por cima, e acende quando a camada se apaga. Depois
 * a pilha volta à animação de sempre. Para voltar, puxar para a direita em qualquer
 * ponto encolhe-a até ao cartão (`VoltaADeslizar`, item 7 do plano, 26/11); num
 * binário sem o módulo dela, o deslizar da borda do iPhone, como antes.
 */
export function PaginaDoQuadrado({ voo, navigation, children }: {
  voo: string;
  navigation: {
    goBack: () => void;
    setOptions: (o: object) => void;
    addListener?: (evento: 'transitionEnd', f: (e: { data?: { closing?: boolean } }) => void) => () => void;
  };
  children: React.ReactNode;
}) {
  const fase = useVoos((s) => s.fases[voo]);
  const opacidade = useRef(new Animated.Value(fase === 'a-entrar' ? 0 : 1)).current;
  const cascata = useRef(new Animated.Value(fase === 'a-entrar' ? 0 : 1)).current;
  const faseRef = useRef(fase);
  faseRef.current = fase;
  const reduzido = useReducedMotion();
  // O cartão de onde abriu (a medida da entrada): é para lá que a página encolhe.
  const cartao = useMemo(() => dadosDoVoo(voo)?.de ?? null, [voo]);
  const capaDoCartao = useMemo(() => {
    const d = dadosDoVoo(voo);
    return d?.capa ? { capa: d.capa, raio: d.raio } : null;
  }, [voo]);
  const comVolta = temVoltaADeslizar && !reduzido && cartao !== null;

  /**
   * A entrada sem animação já acabou na pilha nativa (28/11, o vídeo do João: abrir
   * um artista e a página entrava A DESLIZAR por baixo da camada, com a grelha meio
   * transparente por trás). A animação de sempre voltava quando a página se media,
   * e esse `setOptions` às vezes chegava ao nativo ANTES do próprio push, que saía
   * então com o deslizar. Agora só depois do `transitionEnd` da entrada (o
   * `onAppear`, que também vem sem animação), ou de um prazo se ele nunca vier.
   */
  const [entrou, setEntrou] = useState(false);
  useEffect(() => {
    const parar = navigation.addListener?.('transitionEnd', (e) => { if (!e?.data?.closing) setEntrou(true); });
    const prazo = setTimeout(() => setEntrou(true), ENTRADA_SEM_AVISO_MS);
    return () => { parar?.(); clearTimeout(prazo); };
  }, [navigation]);

  useEffect(() => {
    if (fase !== 'aberta') return;
    // Acende de uma vez, por baixo da camada que ainda a tapa toda; é a camada que
    // se apaga por cima (26/11). Eram as duas a fundir-se ao mesmo tempo, e a meio
    // via-se o fundo através das duas: o piscar ao pousar a capa.
    opacidade.setValue(1);
    // E as linhas entram em cascata no mesmo instante (item 3 do plano de 25/11).
    pedirFluidez(CASCATA.duracaoMs + 100);
    Animated.timing(cascata, { toValue: 1, duration: CASCATA.duracaoMs, easing: Easing.linear, useNativeDriver: true }).start();
  }, [fase, opacidade, cascata]);

  useEffect(() => {
    if (fase !== 'aberta' || !entrou) return;
    // Com o voltar a deslizar, o da borda sai: os dois pegavam no mesmo dedo.
    navigation.setOptions(comVolta ? { animation: 'default', gestureEnabled: false } : { animation: 'default' });
  }, [fase, entrou, navigation, comVolta]);

  // Se a camada nunca a mandar acender (rebentou, ou não havia camada), acende sozinha.
  useEffect(() => {
    const t = setTimeout(() => {
      if (faseRef.current === 'a-entrar') { mudarFase(voo, 'aberta'); marcarCapaNoAr(voo, false); }
    }, ESPERA_MAXIMA_MS + 400);
    return () => clearTimeout(t);
  }, [voo]);

  // A página saiu por outra porta (o deslizar da borda): o voo esquece-se.
  useEffect(() => () => { if (faseRef.current === 'aberta') mudarFase(voo, null); }, [voo]);

  const voltar = useCallback(() => {
    if (faseRef.current === 'aberta' && dadosDoVoo(voo)) {
      const aceite = pedirVoo({
        tipo: 'voltar', id: voo,
        // Sai sem animação: a cor da camada já a tapa toda.
        sair: () => { navigation.setOptions({ animation: 'none' }); navigation.goBack(); },
      });
      if (aceite) {
        // Já, e não só no `sair` (26/11, o João: "a seta para trás ainda cria o
        // efeito de página"): no mesmo instante do goBack, a opção e a saída iam no
        // mesmo desenho, e a página saía com a animação antiga -- a de trás entrava
        // a deslizar por baixo da cor a encolher. Até ao `sair` passam pelo menos
        // os 90 ms do tapar: a pilha já tem o "sem animação".
        navigation.setOptions({ animation: 'none' });
        return;
      }
    }
    navigation.goBack();
  }, [navigation, voo]);

  // Sem a página de trás na janela (o pop nativo não começou): sai sem animação.
  const sairJa = useCallback(() => { navigation.setOptions({ animation: 'none' }); navigation.goBack(); }, [navigation]);
  // Voltar a deslizar (27/11): a capa sai da da página, que se esconde enquanto ela anda.
  const medirCapa = useCallback(() => dadosDoVoo(voo)?.medirAlvo?.() ?? Promise.resolve(null), [voo]);
  const esconderCapa = useCallback((sim: boolean) => marcarCapaNoAr(voo, sim), [voo]);

  const pagina = (
    <Animated.View style={{ flex: 1, opacity: opacidade }} onLayout={() => marcarPaginaPronta(voo)}>
      {children}
    </Animated.View>
  );
  return (
    <VoltarDoQuadrado.Provider value={voltar}>
      <CascataDaPagina.Provider value={cascata}>
        {temVoltaADeslizar
          ? <VoltaADeslizar cartao={cartao} capaDoCartao={capaDoCartao} ativa={comVolta && fase === 'aberta'} sair={sairJa}
              medirCapa={medirCapa} esconderCapa={esconderCapa}>{pagina}</VoltaADeslizar>
          : pagina}
      </CascataDaPagina.Provider>
    </VoltarDoQuadrado.Provider>
  );
}

/**
 * Uma linha de uma página que abriu por um quadrado (25/11, item 3 do plano): quando
 * a capa pousa, as primeiras `CASCATA.linhas` sobem 14 pt e acendem uma a uma, todas
 * da mesma animação da página (cada uma com a sua janela). Fora de uma página dessas,
 * ou depois das primeiras, a linha como sempre. Ao rolar não mexe: a animação já
 * acabou e fica em 1.
 */
export function LinhaEmCascata({ indice, children }: { indice: number; children: React.ReactNode }) {
  const cascata = useContext(CascataDaPagina);
  const estilo = useMemo(() => {
    if (!cascata || indice >= CASCATA.linhas) return null;
    const e = entradaDaLinha(indice);
    return {
      opacity: cascata.interpolate({ inputRange: e.inputRange, outputRange: e.opacidade, extrapolate: 'clamp' }),
      transform: [{ translateY: cascata.interpolate({ inputRange: e.inputRange, outputRange: e.desvio, extrapolate: 'clamp' }) }],
    };
  }, [cascata, indice]);
  if (!estilo) return <>{children}</>;
  return <Animated.View style={estilo}>{children}</Animated.View>;
}

/**
 * O voltar de uma página: até ao quadrado de onde abriu, se abriu por um; senão o
 * `goBack` de sempre. Para os botões de voltar das páginas que se abrem assim.
 */
export function useVoltarDaPagina(): () => void {
  const doQuadrado = useContext(VoltarDoQuadrado);
  const navigation = useNavigation();
  return doQuadrado ?? (() => navigation.goBack());
}

/**
 * A capa no topo de uma página que abre por um quadrado: é aqui que a capa que voa
 * pousa, e daqui que volta. Diz onde está quando se mostra.
 */
export function AlvoDoVoo({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const route = useRoute();
  const voo = (route.params as { voo?: string } | undefined)?.voo;
  const ref = useRef<View>(null);
  // Escondida enquanto a capa que voa não pousa: a página já se vê por baixo dela.
  const noAr = useVoos((s) => (voo ? s.noAr[voo] === true : false));
  const aoMedir = () => {
    if (!voo) return;
    const medir = () => medirNoEcra(ref.current);
    const marcar = () => void medir().then((r) => { if (r) marcarAlvo(voo, r, medir); });
    marcar();
    // O que está à volta pode mexer-se no desenho seguinte sem esta vista se mexer
    // dentro do pai, e o `onLayout` não volta (27/11: o espaço de cima da página a
    // medir-se levava a capa 44 pt para cima, e a que voa pousava no sítio antigo).
    requestAnimationFrame(() => requestAnimationFrame(marcar));
  };
  return <View ref={ref} collapsable={false} style={[style, noAr && { opacity: 0 }]} onLayout={voo ? aoMedir : undefined}>{children}</View>;
}
