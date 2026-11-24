import { useNavigation, useRoute } from '@react-navigation/native';
import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { Animated, View, type StyleProp, type ViewStyle } from 'react-native';
import { ESPERA_MAXIMA_MS, pedirVoo, TROCA_MS } from '../lib/vooDoQuadrado';
import {
  dadosDoVoo, marcarAlvo, marcarPaginaPronta, medirNoEcra, mudarFase, useVoos,
} from '../state/vooDoQuadrado';

/** O voltar da página que abriu por um quadrado: encolhe até ele (24/11). */
const VoltarDoQuadrado = createContext<(() => void) | null>(null);

/**
 * A página que abriu por um quadrado (24/11, `lib/vooDoQuadrado.ts`). Embrulha o
 * ecrã (`envolverEcra`, na navegação) quando ele traz `voo` nos parâmetros: fica
 * escondida enquanto a capa voa por cima, e acende quando a camada se apaga. Depois
 * a pilha volta à animação de sempre, para o deslizar da borda ser o do iPhone.
 */
export function PaginaDoQuadrado({ voo, navigation, children }: {
  voo: string;
  navigation: { goBack: () => void; setOptions: (o: object) => void };
  children: React.ReactNode;
}) {
  const fase = useVoos((s) => s.fases[voo]);
  const opacidade = useRef(new Animated.Value(fase === 'a-entrar' ? 0 : 1)).current;
  const faseRef = useRef(fase);
  faseRef.current = fase;

  useEffect(() => {
    if (fase !== 'aberta') return;
    Animated.timing(opacidade, { toValue: 1, duration: TROCA_MS, useNativeDriver: true }).start();
    navigation.setOptions({ animation: 'default' });
  }, [fase, navigation, opacidade]);

  // Se a camada nunca a mandar acender (rebentou, ou não havia camada), acende sozinha.
  useEffect(() => {
    const t = setTimeout(() => {
      if (faseRef.current === 'a-entrar') mudarFase(voo, 'aberta');
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
      if (aceite) return;
    }
    navigation.goBack();
  }, [navigation, voo]);

  return (
    <VoltarDoQuadrado.Provider value={voltar}>
      <Animated.View style={{ flex: 1, opacity: opacidade }} onLayout={() => marcarPaginaPronta(voo)}>
        {children}
      </Animated.View>
    </VoltarDoQuadrado.Provider>
  );
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
  const aoMedir = () => {
    if (!voo) return;
    const medir = () => medirNoEcra(ref.current);
    void medir().then((r) => { if (r) marcarAlvo(voo, r, medir); });
  };
  return <View ref={ref} collapsable={false} style={style} onLayout={voo ? aoMedir : undefined}>{children}</View>;
}
