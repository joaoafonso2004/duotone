import { Image } from 'expo-image';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Easing, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { duracaoDasLuas, LUAS, passagemAindaVale, TROCA_DO_CROSSFADE } from '../lib/duasLuas';
import { ESTADO } from '../lib/movimento';
import { capaGrande } from '../state/capasGrandes';
import { pedirFluidez } from '../state/fluidez';
import { esquecerPassagem, marcarLuasNoEcra, usePassagemAVista, type PassagemAVista } from '../state/passagemAVista';
import { usePlayer } from '../state/player';
import { colors } from '../theme';
import { BandaDeLuz } from './BandaDeLuz';
import type { PoseDaCapa3D } from './CapaFlutuante3D';

type Moldura = {
  size: number;
  raio: number;
  pose3D: PoseDaCapa3D | null;
  /** A capa que está à vista: a da música que sai. */
  capaDaQueSai: string | null;
};

/**
 * As Duas luas no leitor do iPhone (C9, `lib/duasLuas.ts`). O cubo da capa não sabe de
 * nada: durante uma passagem as luas desenham-se por cima dele, com a mesma pose, e
 * ele fica escondido por baixo, sem desmontar. Fora de uma passagem isto é uma vista à
 * volta do cubo e um `if`. Só com o leitor aberto, a capa à frente (não a letra) e a
 * app à vista: fechado ou bloqueado, a passagem soa como sempre e não há nada a correr.
 *
 * A vista à volta do cubo não se achata (`collapsable`): esconder o cubo mudava-lhe a
 * árvore nativa, e reconstruir as faces é o que engasgava o leitor.
 */
export function CapaComLuas({ aVista, letras, children, ...moldura }: Moldura & {
  aVista: boolean;
  letras: boolean;
  children: React.ReactNode;
}) {
  const anunciada = usePassagemAVista();
  const [ativa, setAtiva] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (e) => setAtiva(e === 'active'));
    return () => sub.remove();
  }, []);
  const [emCena, setEmCena] = useState<PassagemAVista | null>(null);
  const [cuboEscondido, setCuboEscondido] = useState(false);
  const podeVer = aVista && !letras && ativa;
  // Só a passagem em cena acaba a cena: a animação de uma que foi substituída ainda chama.
  const cena = useRef(emCena);
  cena.current = emCena;
  const acabar = useCallback((id: number) => {
    if (cena.current?.id !== id) return;
    setEmCena(null);
    setCuboEscondido(false);
  }, []);
  useEffect(() => {
    if (!podeVer) { setEmCena(null); setCuboEscondido(false); return; }
    if (anunciada && passagemAindaVale(anunciada, Date.now())) setEmCena(anunciada);
  }, [anunciada, podeVer]);
  return <>
    <View collapsable={false} style={[StyleSheet.absoluteFill, cuboEscondido && styles.escondido]}>{children}</View>
    {emCena ? <Luas key={emCena.id} p={emCena} desfeita={anunciada?.id !== emCena.id} {...moldura}
      aoEsconderCubo={setCuboEscondido} aoAcabar={acabar} /> : null}
  </>;
}

function Luas({ p, desfeita, size, raio, pose3D, capaDaQueSai, aoEsconderCubo, aoAcabar }: Moldura & {
  p: PassagemAVista;
  desfeita: boolean;
  aoEsconderCubo: (v: boolean) => void;
  aoAcabar: (id: number) => void;
}) {
  const reduzido = useReducedMotion();
  const aTocar = usePlayer((s) => s.isPlaying);
  const atual = usePlayer((s) => s.current?.sourceId ?? null);
  // Presas ao começar: a capa à vista muda quando a fila avança, e a da que sai tem de ficar.
  const capas = useRef({ sai: capaDaQueSai, entra: capaGrande(p.para) ?? p.para.artworkUrl ?? null }).current;
  const duracao = duracaoDasLuas(p.duracaoMs);
  const trocaEm = p.automix?.trocaEm ?? TROCA_DO_CROSSFADE;
  const [fase, setFase] = useState<'espera' | 'a-passar' | 'a-entregar'>('espera');
  const [trocou, setTrocou] = useState(false);
  const v = useRef({
    t: new Animated.Value(0), entrada: new Animated.Value(0), saida: new Animated.Value(0), camada: new Animated.Value(1),
    pulso: new Animated.Value(0), forte: new Animated.Value(0), mola: new Animated.Value(1),
  }).current;
  // Onde a passagem ia quando uma pausa a parou (no crossfade, o som fica à espera).
  const ondeIa = useRef<number | null>(null);
  const aApagar = useRef(false);

  useEffect(() => () => marcarLuasNoEcra(false), []);

  // O AutoMix anuncia a passagem até 3 s antes: até lá a capa é a de sempre.
  useEffect(() => {
    const falta = p.comecaEm - Date.now();
    if (falta <= 0) { setFase('a-passar'); return; }
    const id = setTimeout(() => setFase('a-passar'), falta);
    return () => clearTimeout(id);
  }, [p.comecaEm]);

  const aPassar = fase === 'a-passar';

  // A da frente cruza com o cubo, e ele esconde-se. Aberta a meio, já está lá.
  useEffect(() => {
    if (!aPassar) return;
    marcarLuasNoEcra(true);
    if (Date.now() - p.comecaEm > LUAS.entregaMs) { v.entrada.setValue(1); aoEsconderCubo(true); return; }
    Animated.timing(v.entrada, { toValue: 1, duration: LUAS.cruzarMs, useNativeDriver: true }).start();
    const id = setTimeout(() => aoEsconderCubo(true), LUAS.cruzarMs);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aPassar]);

  // A passagem: linear, como o volume. Uma pausa pára-a onde vai.
  useEffect(() => {
    if (!aPassar || desfeita || !aTocar) return;
    const desde = ondeIa.current ?? Math.min(1, Math.max(0, (Date.now() - p.comecaEm) / duracao));
    v.t.setValue(desde);
    const resta = (1 - desde) * duracao;
    pedirFluidez(resta + LUAS.saida.ms + LUAS.entregaMs);
    Animated.timing(v.t, { toValue: 1, duration: resta, easing: Easing.linear, useNativeDriver: true })
      .start(({ finished }) => { if (finished) setFase('a-entregar'); });
    const faltaATroca = (trocaEm - desde) * duracao;
    const id = setTimeout(() => setTrocou(true), Math.max(0, faltaATroca));
    return () => {
      clearTimeout(id);
      v.t.stopAnimation((onde) => { ondeIa.current = onde; });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aPassar, aTocar, desfeita]);

  // Os anéis: o fraco em cada batida, o forte em cada tempo forte. O início da passagem
  // na batida é um tempo forte, por isso a fase é a do instante em que ela começa.
  useEffect(() => {
    const anel = p.automix?.anel;
    if (!aPassar || !anel || reduzido) return;
    const decorrido = Math.max(0, Date.now() - p.comecaEm);
    const feitas = Math.ceil(decorrido / anel.batidaMs);
    const atraso = feitas * anel.batidaMs - decorrido;
    const pulsar = (valor: Animated.Value, cada: number, voltas: number) => {
      if (voltas <= 0) return null;
      const a = Animated.sequence([
        Animated.delay(atraso),
        Animated.loop(Animated.timing(valor, { toValue: 1, duration: anel.batidaMs * cada, easing: Easing.linear, useNativeDriver: true }), { iterations: voltas }),
      ]);
      a.start();
      return a;
    };
    const fraco = pulsar(v.pulso, 1, anel.batidas - feitas);
    const forte = pulsar(v.forte, 4, Math.ceil((anel.batidas - feitas) / 4));
    return () => { fraco?.stop(); forte?.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aPassar]);

  // A troca dos graves: a que entra chega à frente e assenta. Num crossfade só troca.
  useEffect(() => {
    if (!trocou || !p.automix || reduzido) return;
    v.mola.setValue(0.97);
    pedirFluidez(600);
    Animated.spring(v.mola, { toValue: 1, ...ESTADO, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trocou]);

  const apagar = (ms: number) => {
    if (aApagar.current) return;
    aApagar.current = true;
    aoEsconderCubo(false);
    Animated.timing(v.camada, { toValue: 0, duration: ms, useNativeDriver: true }).start(() => {
      marcarLuasNoEcra(false);
      esquecerPassagem(p.id);
      aoAcabar(p.id);
    });
  };

  // No fim, a velha sai para a esquerda.
  useEffect(() => {
    if (fase !== 'a-entregar' || reduzido) return;
    pedirFluidez(LUAS.saida.ms);
    Animated.timing(v.saida, { toValue: 1, duration: LUAS.saida.ms, easing: Easing.bezier(0.5, 0, 0.75, 0), useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase]);

  // A música mudou antes de a passagem acabar (um "seguinte" a meio): as luas não ficam a fingir.
  const filaAvancou = atual !== p.de;
  useEffect(() => {
    if (!filaAvancou || !aPassar || Date.now() >= p.comecaEm + p.duracaoMs - 500) return;
    setTrocou(true);
    v.t.stopAnimation();
    Animated.timing(v.t, { toValue: 1, duration: LUAS.saida.ms, easing: Easing.linear, useNativeDriver: true })
      .start(({ finished }) => { if (finished) setFase('a-entregar'); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filaAvancou]);

  // E a nova devolve o lugar ao cubo quando a capa dele já trocou por baixo.
  useEffect(() => {
    if (fase !== 'a-entregar') return;
    const id = setTimeout(() => apagar(LUAS.apagarMs), filaAvancou ? LUAS.entregaMs : LUAS.esperaPelaFilaMs);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, filaAvancou]);

  // Desfeita: a capa de sempre volta a ver-se por baixo.
  useEffect(() => {
    if (!desfeita) return;
    if (fase === 'espera') { aoAcabar(p.id); return; }
    apagar(LUAS.apagarMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desfeita]);

  const estilos = useMemo(() => {
    const { deslocacao: d, escala: e, sombra: s, nascer: n, saida } = LUAS;
    const comPose = (translateX: unknown, scale: unknown): any[] => (pose3D
      ? [pose3D.postura[0], { translateX }, ...pose3D.postura.slice(1), { scale }]
      : [{ translateX }, { scale }]);
    if (reduzido) {
      // Com menos movimento as capas cruzam por opacidade, e não saem do sítio.
      return {
        sai: { opacity: v.entrada, transform: comPose(0, 1) }, entra: { opacity: v.t, transform: comPose(0, 1) },
        sombraSai: 0, sombraEntra: 0,
      };
    }
    const x = (de: number, ate: number) => v.t.interpolate({ inputRange: [0, 1], outputRange: [de * size, ate * size] });
    const escala = (de: number, ate: number) => v.t.interpolate({ inputRange: [0, 1], outputRange: [de, ate] });
    return {
      sai: {
        opacity: Animated.multiply(v.entrada, v.saida.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })),
        transform: comPose(
          Animated.add(x(0, -d), v.saida.interpolate({ inputRange: [0, 1], outputRange: [0, (d - saida.deslocacao) * size] })),
          Animated.multiply(escala(1, e), v.saida.interpolate({ inputRange: [0, 1], outputRange: [1, saida.escala / e] })),
        ),
      },
      entra: {
        opacity: v.t.interpolate({ inputRange: [0, n, 1], outputRange: [0, 1, 1] }),
        transform: comPose(x(d, 0), Animated.multiply(escala(e, 1), v.mola)),
      },
      sombraSai: v.t.interpolate({ inputRange: [0, 1], outputRange: [0, s] }),
      sombraEntra: v.t.interpolate({ inputRange: [0, 1], outputRange: [s, 0] }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pose3D, size, reduzido]);

  const aneis = useMemo(() => {
    const anel = p.automix?.anel;
    if (!anel) return null;
    const subir = Math.min(0.5, LUAS.subirDoAnelMs / anel.batidaMs);
    return {
      fraco: {
        opacity: v.pulso.interpolate({ inputRange: [0, subir, 1], outputRange: [0, 0.5, 0] }),
        transform: [{ scale: v.pulso.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) }],
      },
      forte: {
        opacity: v.forte.interpolate({ inputRange: [0, subir / 4, 1], outputRange: [0, 0.8, 0] }),
        transform: [{ scale: v.forte.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] }) }],
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.automix?.anel?.batidaMs]);

  if (fase === 'espera') return null;
  const canto = { borderRadius: raio };
  return (
    <Animated.View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { opacity: v.camada }]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.lua, canto, estilos.sai, { zIndex: trocou ? 1 : 2 }]}>
        <View style={[StyleSheet.absoluteFill, styles.corte, canto]}>
          {capas.sai ? <Image source={{ uri: capas.sai }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" /> : null}
          <Animated.View style={[StyleSheet.absoluteFill, styles.sombra, { opacity: estilos.sombraSai }]} />
        </View>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.lua, canto, estilos.entra, { zIndex: trocou ? 2 : 1 }]}>
        <View style={[StyleSheet.absoluteFill, styles.corte, canto]}>
          {capas.entra ? <Image source={{ uri: capas.entra }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" /> : null}
          <Animated.View style={[StyleSheet.absoluteFill, styles.sombra, { opacity: estilos.sombraEntra }]} />
          {trocou && p.automix ? <BandaDeLuz direcao="avancar" chave={p.id} /> : null}
        </View>
        {aneis && !reduzido ? <>
          <Animated.View style={[styles.anel, { borderRadius: raio + 8 }, aneis.fraco]} />
          <Animated.View style={[styles.anelForte, { borderRadius: raio + 14 }, aneis.forte]} />
        </> : null}
      </Animated.View>
    </Animated.View>
  );
}

/**
 * O andamento e a tonalidade da passagem (`124 → 128 BPM · 8A → 9A`), enquanto ficam à
 * vista: 3 s a contar do instante em que ela começa. Só com o AutoMix.
 */
export function useLegendaDaPassagem(aVista: boolean): string | null {
  const p = usePassagemAVista();
  const [texto, setTexto] = useState<string | null>(null);
  useEffect(() => {
    const legenda = p?.automix?.legenda;
    const agora = Date.now();
    if (!aVista || !p || !legenda || agora >= p.comecaEm + LUAS.legendaMs) { setTexto(null); return; }
    const mostrar = setTimeout(() => setTexto(legenda), Math.max(0, p.comecaEm - agora));
    const tirar = setTimeout(() => setTexto(null), p.comecaEm + LUAS.legendaMs - agora);
    return () => { clearTimeout(mostrar); clearTimeout(tirar); };
  }, [p, aVista]);
  return texto;
}

/** Em cima dos pontos da capa: é o sítio entre a capa e o título, e não empurra nada. */
export function LegendaDaPassagem({ texto }: { texto: string }) {
  const opacidade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const entrar = Animated.timing(opacidade, { toValue: 1, duration: 300, useNativeDriver: true });
    entrar.start();
    return () => entrar.stop();
  }, [opacidade]);
  return <Animated.Text numberOfLines={1} style={[styles.legenda, { opacity: opacidade }]}>{texto}</Animated.Text>;
}

const styles = StyleSheet.create({
  escondido: { opacity: 0 },
  // Com a cor por baixo, o iOS sabe o contorno da sombra e não a recalcula em cada fotograma.
  lua: {
    backgroundColor: colors.bg,
    shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 30, shadowOffset: { width: 0, height: 20 },
  },
  corte: { overflow: 'hidden' },
  sombra: { backgroundColor: colors.bg },
  anel: {
    position: 'absolute', top: -8, left: -8, right: -8, bottom: -8,
    borderWidth: 1.5, borderColor: 'rgba(233,234,238,0.75)',
  },
  anelForte: {
    position: 'absolute', top: -14, left: -14, right: -14, bottom: -14,
    borderWidth: 2, borderColor: 'rgba(233,234,238,0.75)',
  },
  legenda: {
    position: 'absolute', left: 0, right: 0, top: -6,
    textAlign: 'center', color: colors.text, fontSize: 13, lineHeight: 16, fontWeight: '600',
    letterSpacing: 0.2, fontVariant: ['tabular-nums'],
  },
});
