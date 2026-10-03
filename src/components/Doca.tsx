import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { comAlfa, posicoesDaDoca, ZONA_DA_MUSICA } from '../lib/doca';
import { molaIOS } from '../lib/transicaoDoLeitor';
import { IconesDosSeparadores } from '../navigation/BarraDeSeparadores';
import { definirAlturaDosSeparadores, desvioDaMusica, desvioDoVidro, desvioDosIcones, useAlturaDosSeparadores, useDoca } from '../state/doca';
import { pedirFluidez } from '../state/fluidez';
import { usePlayer } from '../state/player';
import { useTheme } from '../state/theme';

/**
 * A base de baixo do iPhone: o mini-player e os separadores numa peça só de
 * vidro (3/10, variante A de `docs/base-e-barrinhas.html`). Eram duas peças de
 * materiais diferentes -- um cartão opaco pousado numa barra desfocada -- e
 * liam-se como duas coisas coladas.
 *
 * Aqui só o vidro e os separadores; a linha da música é do `PlayerRoot`, por
 * cima (é lá que vivem o gesto, a capa que voa e o resto do leitor). Os dois
 * mexem-se pelos mesmos valores (`state/doca.ts`), no motor nativo:
 *  - fechar a música (deslizar para a direita) desce o vidro até ficar só a
 *    altura dos separadores;
 *  - um ecrã aberto por cima das secções tira os separadores, e a música desce
 *    para o fundo;
 *  - nas Definições, no Library check e no Importar sai tudo (`ECRAS_SEM_BASE`).
 *
 * Vive DENTRO da app de trás (RootNavigator), por cima dos ecrãs: recua com ela
 * quando o leitor abre, como a barra dos separadores recuava.
 */
export function Doca() {
  const insets = useSafeAreaInsets();
  const modo = useDoca((s) => s.modo);
  const separadores = useDoca((s) => s.separadores);
  // Também a fechar (o som a desvanecer) já conta como sem música: o vidro
  // desce com a linha a sair, e não 300 ms depois (3/10).
  const comMusicaNaLoja = usePlayer((s) => !!s.current && !s.closing);
  const aFechar = useDoca((s) => s.aFechar);
  const temMusica = comMusicaNaLoja && !aFechar;
  const alturaDosSeparadores = useAlturaDosSeparadores();
  const reduzido = useReducedMotion();
  const primeira = useRef(true);

  useEffect(() => {
    const alvo = posicoesDaDoca(modo, temMusica, insets.bottom, alturaDosSeparadores);
    const pares: [Animated.Value, number][] = [[desvioDoVidro, alvo.vidro], [desvioDaMusica, alvo.musica], [desvioDosIcones, alvo.icones]];
    if (primeira.current || reduzido) {
      primeira.current = false;
      for (const [valor, para] of pares) valor.setValue(para);
      return;
    }
    // Cada uma à parte, e não num `Animated.parallel`: a da música fica sem
    // quem a use quando a música fecha, e o React Native pára-a -- num
    // `parallel`, parava as outras com ela (ver "A abertura e o raio" no CLAUDE.md).
    const molas = pares.map(([valor, para]) =>
      Animated.spring(valor, { toValue: para, ...molaIOS(0.46, 0.9), useNativeDriver: true }));
    pedirFluidez(800);
    molas.forEach((m) => m.start());
    return () => molas.forEach((m) => m.stop());
  }, [modo, temMusica, insets.bottom, alturaDosSeparadores, reduzido]);

  const altura = ZONA_DA_MUSICA + alturaDosSeparadores + insets.bottom;
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {/* Sem `pointerEvents`: o vidro engole os toques que não acertam num botão,
          para não irem parar à lista por baixo. */}
      <Animated.View style={[styles.vidro, { height: altura, transform: [{ translateY: desvioDoVidro }] }]}>
        <BlurView tint="dark" intensity={60} style={StyleSheet.absoluteFill} />
        <TintaDaDoca />
      </Animated.View>
      <Animated.View
        pointerEvents={modo === 'separadores' ? 'box-none' : 'none'}
        style={[styles.icones, { paddingBottom: insets.bottom, transform: [{ translateY: desvioDosIcones }] }]}
      >
        {/* Medidos aqui: é esta altura que o resto da app usa (auditoria 1.3). */}
        <View onLayout={(e) => definirAlturaDosSeparadores(e.nativeEvent.layout.height)}>
          {separadores ? <IconesDosSeparadores state={separadores.state} navigation={separadores.navigation} /> : null}
        </View>
      </Animated.View>
    </View>
  );
}

/**
 * A cor da capa no topo do vidro -- só com "seguir a cor da capa" ligado
 * (João, 3/10). Desligado, o vidro é neutro. A cor animada (`theme`) e não o
 * destino: a passagem entre capas vê-se, e só este bocado redesenha.
 */
function TintaDaDoca() {
  const segue = useTheme((s) => s.mode === 'cover');
  const cor = useTheme((s) => s.theme.color);
  return (
    <>
      <View style={[StyleSheet.absoluteFill, styles.tinta]} />
      {segue ? (
        <LinearGradient
          colors={[comAlfa(cor, 0.26), comAlfa(cor, 0)]}
          locations={[0, 0.6]}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  vidro: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderCurve: 'continuous',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
  // A tinta escura de sempre (eram 72% na barra), um pouco mais leve: o
  // desfoque passa a ver-se.
  tinta: { backgroundColor: 'rgba(10,10,15,0.66)' },
  icones: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
