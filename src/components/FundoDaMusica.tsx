import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useCorDoAmbiente } from '../hooks/useCorDoAmbiente';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { comAlfa } from '../lib/doca';
import { useAparencia } from '../state/aparencia';
import { usePlayer } from '../state/player';

/**
 * O fundo da app a seguir a música (27/11, opção da Customise, desligada de origem).
 *
 * O João perguntou por pôr o fundo do Now Playing (o da capa) na app toda. A
 * imagem desfocada em todas as páginas tirava contraste às listas; ficou a COR da
 * capa (`useCorDoAmbiente`, já puxada para o escuro para o branco se ler) a lavar o
 * topo das páginas, a desvanecer até meio. Quando a música muda, a cor nova acende
 * por cima da antiga em 0,9 s, no motor nativo. As páginas com cor própria (um
 * artista, um álbum) desenham-na por cima, como antes.
 *
 * Vive no `RootNavigator`, por cima do fundo escuro e por baixo das páginas (que
 * são transparentes): um desenho por música, e mais nada.
 */
export function FundoDaMusica({ imediato = false }: {
  /** A primeira cor já inteira, sem acender (a barra de cima das páginas, `FundoDasPaginas`). */
  imediato?: boolean;
} = {}) {
  const ligado = useAparencia((s) => s.fundoDaMusica);
  const arte = usePlayer((s) => s.current?.artworkUrl ?? null);
  const cor = useCorDoAmbiente(ligado && arte ? capaParaLista(arte) : null);
  // A de baixo é a cor anterior, inteira; a de cima é a nova, a acender.
  const [par, setPar] = useState<{ baixo: string | null; cima: string | null }>({ baixo: null, cima: null });
  useEffect(() => {
    if (!ligado || !cor) return;
    setPar((p) => (p.cima === cor ? p : { baixo: p.cima, cima: cor }));
  }, [ligado, cor]);
  if (!ligado) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {par.baixo ? <Lavagem cor={par.baixo} /> : null}
      {par.cima && imediato && !par.baixo ? <Lavagem cor={par.cima} />
        : par.cima ? <CamadaQueAcende key={par.cima} cor={par.cima} /> : null}
    </View>
  );
}

function Lavagem({ cor }: { cor: string }) {
  return (
    <LinearGradient
      colors={[comAlfa(cor, 0.55), comAlfa(cor, 0.22), comAlfa(cor, 0)]}
      locations={[0, 0.28, 0.6]}
      style={StyleSheet.absoluteFill}
    />
  );
}

/** Cada cor nova é uma camada nova, que nasce apagada e acende sozinha. */
function CamadaQueAcende({ cor }: { cor: string }) {
  const reduzido = useReducedMotion();
  const opacidade = useRef(new Animated.Value(reduzido ? 1 : 0)).current;
  useEffect(() => {
    if (reduzido) return undefined;
    const a = Animated.timing(opacidade, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [opacidade, reduzido]);
  return <Animated.View style={[StyleSheet.absoluteFill, { opacity: opacidade }]}><Lavagem cor={cor} /></Animated.View>;
}
