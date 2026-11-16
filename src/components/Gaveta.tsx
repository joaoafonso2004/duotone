import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  PanGestureHandler, State, type PanGestureHandlerGestureEvent, type PanGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { PecaDaGaveta, type ContextoDaPeca } from './PecaDaGaveta';
import { FolhaDaGaveta } from './FolhaDaGaveta';
import { FolhaDaCena } from './FolhaDaCena';
import { FundoEmGradiente } from './FundoEmGradiente';
import { desfoqueLeve } from '../lib/capaGrande';
import { useDestinos } from '../navigation/destinos';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { usePlayer } from '../state/player';
import {
  carregarGaveta, editarGaveta, fecharGaveta, mudarGaveta, useGaveta,
} from '../state/gaveta';
import {
  apagarEspaco, arrumar, ativar, COLUNAS, definirTamanho, espacoAtivo, MAXIMO_DE_PECAS, mover, moverNaLista, novoEspaco,
  posicaoNoPonto, proximoTamanho, renomear, TAMANHOS, tamanhoMaisPerto, tirar, type Espaco, type Lugar, type Peca,
} from '../lib/gaveta';
import { avisarInfo } from '../lib/avisoDeRemocao';
import { hapticImpact, hapticSelection, ImpactFeedbackStyle } from '../lib/haptics';
import { segurarFluidez } from '../state/fluidez';
import type { Destino } from '../lib/destinos';
import { colors } from '../theme';

const MARGEM = 12;
const ESPACO = 10;
/** O fundo do painel: um pouco acima do preto da app, para a Home se separar dele. */
export const FUNDO_DA_GAVETA = '#0D0D10';

/**
 * A gaveta da Home do iPhone (6.0.4, `lib/gaveta.ts`): fica POR BAIXO da app,
 * à esquerda, e vê-se quando a app desliza para a direita (`RootNavigator`).
 * As peças entram em cascata COM a abertura.
 *
 * A edição (16/11, João: "segurar para mover, como no iPhone"): segurar uma
 * peça entra na edição e já a levanta, e o dedo leva-a (as outras abrem-lhe
 * lugar); a editar, arrastar move, o canto de baixo puxa-se para mudar o
 * tamanho, o − tira. Sai-se a tocar num sítio vazio: sem botão Done, e sem
 * título nem frases por cima -- só os espaços.
 */
export function Gaveta({ largura, abertura }: { largura: number; abertura: Animated.AnimatedInterpolation<number> }) {
  const insets = useSafeAreaInsets();
  const reduzido = useReducedMotion();
  const { irPara: irParaNaApp } = useDestinos();
  const { gaveta, aberta, editar } = useGaveta(useShallow((s) => ({
    gaveta: s.gaveta, aberta: s.aberta, editar: s.editar,
  })));
  // O fundo é a cor da capa que está a tocar (15/11, João): a mesma leitura do
  // fundo em gradiente do leitor, a partir da miniatura pequena.
  const capa = usePlayer((s) => s.current?.artworkUrl ?? null);
  const fundo = desfoqueLeve(capa, 64)?.uri ?? null;
  // Enquanto uma peça anda com o dedo, a lista não rola por baixo dela.
  const [aArrastar, setAArrastar] = useState(false);

  useEffect(() => { void carregarGaveta(); }, []);

  // O leitor a abrir por cima (a peça do que está a tocar, um toque no mini): a
  // gaveta fecha por baixo dele, para não ficar aberta quando ele descer.
  useEffect(() => usePlayer.subscribe((s, antes) => {
    if (s.expanded && !antes.expanded) fecharGaveta();
  }), []);

  const espaco = gaveta ? espacoAtivo(gaveta) : null;
  const celula = Math.floor((largura - MARGEM * 2 - ESPACO * (COLUNAS - 1)) / COLUNAS);

  // A cascata VEM DA ABERTURA (15/11): cada peça aparece no seu troço do caminho
  // da gaveta, um pouco depois da anterior, e com o dedo também. Era uma animação
  // à parte que recomeçava do zero a cada abertura: as peças, ainda acesas da
  // vez anterior, apagavam-se de repente e voltavam -- o "pisca" do vídeo do João.
  const total = Math.min(Math.max(espaco?.pecas.length ?? 0, 1), MAXIMO_DE_PECAS);
  const entradas = useMemo(() => Array.from({ length: total }, (_, i) => {
    const a = Math.min(i, 12) * 0.035, b = a + 0.38;
    return {
      opacity: abertura.interpolate({ inputRange: [0, a, b, 1], outputRange: [0, 0, 1, 1] }),
      translateX: abertura.interpolate({ inputRange: [0, a, b, 1], outputRange: [-18, -18, 0, 0] }),
    };
  }), [abertura, total]);

  const irPara = useCallback((d: Destino) => { fecharGaveta(); irParaNaApp(d); }, [irParaNaApp]);
  const contexto = useMemo<Omit<ContextoDaPeca, 'largura' | 'altura'>>(() => ({
    editar,
    irPara,
    abrirLeitor: () => { fecharGaveta(); usePlayer.getState().setExpanded(true); },
    fechar: () => fecharGaveta(),
    aoTirar: (id) => {
      const g = useGaveta.getState().gaveta;
      if (g) mudarGaveta((x) => tirar(x, g.ativo, id));
    },
    aoRedimensionar: (id) => {
      const g = useGaveta.getState().gaveta;
      if (g) mudarGaveta((x) => proximoTamanho(x, g.ativo, id));
    },
    aoMoverUm: (id, sentido) => {
      const g = useGaveta.getState().gaveta;
      if (!g) return;
      const i = espacoAtivo(g).pecas.findIndex((p) => p.id === id);
      if (i >= 0) mudarGaveta((x) => mover(x, g.ativo, id, i + sentido));
    },
    aoSegurar: () => editarGaveta(true),
    aoEditarCena: (pecaId, cena) => useGaveta.setState({ cenaAEditar: { pecaId, cena } }),
  }), [editar, irPara]);

  const [nome, setNome] = useState(espaco?.nome ?? '');
  useEffect(() => { setNome(espaco?.nome ?? ''); }, [espaco?.id, espaco?.nome]);

  const criarEspaco = () => {
    hapticSelection();
    const g = useGaveta.getState().gaveta;
    if (!g) return;
    const novo = novoEspaco(g, '');
    if (!novo) { avisarInfo('You have five spaces', 'Delete one to make another.'); return; }
    mudarGaveta(() => novo);
    useGaveta.setState({ editar: true, acrescentar: true });
  };
  const terminar = () => { hapticSelection(); editarGaveta(false); };

  // A gaveta desliza um pouco com a abertura: parece vir de trás da Home, e não estar parada.
  const paralaxe = useMemo(() => abertura.interpolate({ inputRange: [0, 1], outputRange: [-36, 0] }), [abertura]);
  // Fechada, não existe (16/11): por trás da app fica o preto de sempre, e
  // nenhuma transição (o leitor a fechar, um arrasto) a deixa ver de raspão.
  const presente = useMemo(() => abertura.interpolate({ inputRange: [0, 0.002, 1], outputRange: [0, 1, 1] }), [abertura]);

  return (
    <Animated.View
      accessibilityViewIsModal={aberta}
      accessibilityElementsHidden={!aberta}
      importantForAccessibility={aberta ? 'auto' : 'no-hide-descendants'}
      style={[styles.painel, { width: largura, paddingTop: insets.top + 6, opacity: presente, transform: [{ translateX: paralaxe }] }]}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <FundoEmGradiente uri={fundo} animar={aberta} />
        <View style={[StyleSheet.absoluteFill, styles.veuDoFundo]} />
      </View>
      {/* A editar, um toque num sítio vazio (o cabeçalho, entre as peças, por baixo delas) acaba a edição. */}
      <Pressable style={{ flex: 1 }} disabled={!editar} onPress={terminar} accessible={false}>
        {gaveta ? (
          <View accessibilityRole="tablist" style={styles.espacos}>
            {gaveta.espacos.map((e) => {
              const ativo = e.id === gaveta.ativo;
              // A editar, o nome do espaço ativo escreve-se no próprio separador.
              if (ativo && editar) {
                return (
                  <View key={e.id} style={styles.espaco}>
                    <TextInput
                      value={nome}
                      onChangeText={setNome}
                      onEndEditing={() => { if (gaveta) mudarGaveta((g) => renomear(g, g.ativo, nome)); }}
                      maxLength={24}
                      returnKeyType="done"
                      placeholder="Name"
                      placeholderTextColor={colors.textTertiary}
                      accessibilityLabel="Space name"
                      style={[styles.espacoTexto, styles.nomeAEditar]}
                      selectionColor={colors.text}
                    />
                    <View style={styles.luz} />
                  </View>
                );
              }
              return (
                <Pressable key={e.id} accessibilityRole="tab" accessibilityState={{ selected: ativo }} hitSlop={6}
                  onPress={() => { hapticSelection(); mudarGaveta((g) => ativar(g, e.id)); }}
                  style={styles.espaco}>
                  <Text numberOfLines={1} style={[styles.espacoTexto, ativo && { color: colors.text }]}>{e.nome}</Text>
                  <View style={[styles.luz, !ativo && { opacity: 0 }]} />
                </Pressable>
              );
            })}
            <Pressable accessibilityRole="button" accessibilityLabel="New space" hitSlop={8} onPress={criarEspaco} style={styles.mais}>
              <Ionicons name="add" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
        ) : null}

        <ScrollView
          style={{ flex: 1 }}
          scrollEnabled={!aArrastar}
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: MARGEM, paddingTop: 14, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
        >
          {espaco && espaco.pecas.length === 0 ? (
            <Text style={styles.vazio}>An empty space. Add artists, friends, controls or shortcuts, and make it yours.</Text>
          ) : null}
          {espaco ? (
            <GrelhaDaGaveta espaco={espaco} celula={celula} editar={editar} contexto={contexto} entradas={entradas}
              reduzido={reduzido} aoArrastar={setAArrastar} />
          ) : null}

          {editar || espaco?.pecas.length === 0 ? (
            <View style={{ gap: 12, marginTop: espaco?.pecas.length ? 16 : 0 }}>
              <Pressable accessibilityRole="button" onPress={() => { hapticSelection(); useGaveta.setState({ acrescentar: true }); }}
                style={({ pressed }) => [styles.acrescentar, pressed && { opacity: 0.7 }]}>
                <Ionicons name="add" size={18} color={colors.text} />
                <Text style={styles.acrescentarTexto}>Add</Text>
              </Pressable>
              {editar && gaveta && gaveta.espacos.length > 1 && espaco ? (
                <Pressable accessibilityRole="button" hitSlop={6}
                  onPress={() => { hapticSelection(); mudarGaveta((g) => apagarEspaco(g, espaco.id)); }}
                  style={{ alignSelf: 'center', paddingVertical: 6 }}>
                  <Text style={styles.apagar}>Delete this space</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      </Pressable>

      <FolhaDaGaveta />
      <FolhaDaCena />
    </Animated.View>
  );
}

type Entrada = { opacity: Animated.AnimatedInterpolation<number>; translateX: Animated.AnimatedInterpolation<number> };

/**
 * A grelha de um espaço. A meio de um arrasto (mover ou puxar o canto) a ordem
 * e os tamanhos vivem num rascunho: as outras peças arrumam-se à volta enquanto
 * o dedo anda, e só ao largar a gaveta muda (e se grava, uma vez).
 */
function GrelhaDaGaveta({ espaco, celula, editar, contexto, entradas, reduzido, aoArrastar }: {
  espaco: Espaco;
  celula: number;
  editar: boolean;
  contexto: Omit<ContextoDaPeca, 'largura' | 'altura'>;
  entradas: Entrada[];
  reduzido: boolean;
  aoArrastar: (sim: boolean) => void;
}) {
  const [rascunho, setRascunho] = useState<Peca[] | null>(null);
  // Mudou o espaço por baixo (outro separador, uma peça acrescentada): o rascunho já não serve.
  useEffect(() => { setRascunho(null); }, [espaco.id, espaco.pecas]);
  const lista = rascunho ?? espaco.pecas;
  const grelha = useMemo(() => arrumar(lista), [lista]);
  const passo = celula + ESPACO;
  const atual = useRef({ lista, grelha });
  atual.current = { lista, grelha };
  // Os 120 Hz enquanto o dedo leva uma peça, e um pouco depois (a mola até ao lugar).
  const fluidez = useRef<(() => void) | null>(null);

  const acoes = useMemo<AcoesDoArrasto>(() => ({
    comecar: () => { aoArrastar(true); fluidez.current?.(); fluidez.current = segurarFluidez(700); },
    acabar: () => { aoArrastar(false); fluidez.current?.(); fluidez.current = null; },
    entrarNaEdicao: () => { hapticImpact(ImpactFeedbackStyle.Medium); editarGaveta(true); },
    moverAte: (id, cx, cy) => {
      const { lista: l, grelha: gr } = atual.current;
      const ordem = l.map((p) => p.id);
      const para = posicaoNoPonto(gr.lugares, ordem, cx / passo, cy / passo);
      if (para === ordem.indexOf(id)) return;
      hapticSelection();
      setRascunho(moverNaLista(l, id, para));
    },
    largar: (id) => {
      const para = atual.current.lista.findIndex((p) => p.id === id);
      if (para >= 0) mudarGaveta((g) => mover(g, espaco.id, id, para));
      setRascunho(null);
    },
    puxar: (id, colunas, linhas) => {
      const l = atual.current.lista;
      const p = l.find((x) => x.id === id);
      if (!p) return;
      const t = tamanhoMaisPerto(p.tipo, colunas, linhas);
      if (t === p.tamanho) return;
      hapticSelection();
      setRascunho(l.map((x) => (x.id === id ? ({ ...x, tamanho: t } as Peca) : x)));
    },
    largarCanto: (id) => {
      const p = atual.current.lista.find((x) => x.id === id);
      if (p) mudarGaveta((g) => definirTamanho(g, espaco.id, id, p.tamanho));
      setRascunho(null);
    },
  }), [aoArrastar, espaco.id, passo]);

  return (
    <View style={{ height: grelha.linhas ? grelha.linhas * passo - ESPACO : 0 }}>
      {lista.map((peca, i) => {
        const lugar = grelha.lugares.find((l) => l.id === peca.id);
        if (!lugar) return null;
        const indice = espaco.pecas.findIndex((p) => p.id === peca.id);
        const entrada = entradas[Math.min(Math.max(indice, 0), entradas.length - 1)]!;
        return (
          <PecaNaGrelha key={peca.id} peca={peca} lugar={lugar} celula={celula} passo={passo} editar={editar}
            reduzido={reduzido} entrada={entrada} contexto={contexto} acoes={acoes} fase={i % 2} />
        );
      })}
    </View>
  );
}

type AcoesDoArrasto = {
  comecar: () => void;
  acabar: () => void;
  entrarNaEdicao: () => void;
  /** O centro da peça, em pontos, dentro da grelha. */
  moverAte: (id: string, cx: number, cy: number) => void;
  largar: (id: string) => void;
  /** O tamanho onde o dedo deixou o canto, em células. */
  puxar: (id: string, colunas: number, linhas: number) => void;
  largarCanto: (id: string) => void;
};

/**
 * Uma peça no seu lugar. O lugar anda por `translate` no motor nativo (as
 * outras deslizam quando uma lhes passa por cima); a que se arrasta segue o
 * dedo também no motor nativo, e o JavaScript só decide onde ela cai.
 */
function PecaNaGrelha({ peca, lugar, celula, passo, editar, reduzido, entrada, contexto, acoes, fase }: {
  peca: Peca;
  lugar: Lugar;
  celula: number;
  passo: number;
  editar: boolean;
  reduzido: boolean;
  entrada: Entrada;
  contexto: Omit<ContextoDaPeca, 'largura' | 'altura'>;
  acoes: AcoesDoArrasto;
  fase: number;
}) {
  const x = lugar.coluna * passo;
  const y = lugar.linha * passo;
  const largura = lugar.colunas * celula + (lugar.colunas - 1) * ESPACO;
  const altura = lugar.linhas * celula + (lugar.linhas - 1) * ESPACO;

  const pos = useRef(new Animated.ValueXY({ x, y })).current;
  const dedo = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const levantar = useRef(new Animated.Value(0)).current;
  const abanar = useRef(new Animated.Value(0)).current;
  const arrasto = useRef<{ x0: number; y0: number; dx: number; dy: number } | null>(null);
  const canto = useRef<{ w0: number; h0: number } | null>(null);
  const [largadas, setLargadas] = useState(0);
  const [noAr, setNoAr] = useState(false);
  const aqui = useRef({ x, y, largura, altura, acoes, editar });
  aqui.current = { x, y, largura, altura, acoes, editar };

  // O lugar mudou (outra peça passou por cima, ou esta caiu): desliza para lá.
  // A que está no dedo fica onde o dedo a tem.
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return; }
    if (arrasto.current) return;
    if (reduzido) { pos.setValue({ x, y }); return; }
    Animated.spring(pos, { toValue: { x, y }, useNativeDriver: true, damping: 24, stiffness: 280, mass: 0.9 }).start();
  }, [x, y, largadas, reduzido, pos]);

  // O abanar da edição, como os ícones do iPhone: pouco, e não na que está no dedo.
  useEffect(() => {
    if (!editar || noAr || reduzido) { abanar.stopAnimation(); abanar.setValue(0); return; }
    const meio = 120 + fase * 14;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(abanar, { toValue: fase ? -1 : 1, duration: meio, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(abanar, { toValue: fase ? 1 : -1, duration: meio * 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(abanar, { toValue: 0, duration: meio, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [editar, noAr, reduzido, fase, abanar]);

  useEffect(() => {
    Animated.spring(levantar, { toValue: noAr ? 1 : 0, useNativeDriver: true, damping: 18, stiffness: 320 }).start();
  }, [noAr, levantar]);

  const evento = useMemo(() => Animated.event(
    [{ nativeEvent: { translationX: dedo.x, translationY: dedo.y } }],
    {
      useNativeDriver: true,
      listener: (e: PanGestureHandlerGestureEvent) => {
        const a = arrasto.current;
        if (!a) return;
        a.dx = e.nativeEvent.translationX;
        a.dy = e.nativeEvent.translationY;
        const q = aqui.current;
        q.acoes.moverAte(peca.id, a.x0 + a.dx + q.largura / 2, a.y0 + a.dy + q.altura / 2);
      },
    },
  ), [dedo, peca.id]);

  const aoMudar = useCallback((e: PanGestureHandlerStateChangeEvent) => {
    const { state, oldState } = e.nativeEvent;
    const q = aqui.current;
    if (state === State.BEGAN && q.editar) q.acoes.comecar();
    if (state === State.ACTIVE) {
      // Segurar fora da edição entra nela e já levanta a peça (como no iPhone).
      if (!q.editar) { q.acoes.entrarNaEdicao(); q.acoes.comecar(); } else hapticSelection();
      arrasto.current = { x0: q.x, y0: q.y, dx: 0, dy: 0 };
      setNoAr(true);
      return;
    }
    if (state === State.END || state === State.FAILED || state === State.CANCELLED) {
      const a = arrasto.current;
      if (a && oldState === State.ACTIVE) {
        arrasto.current = null;
        // Fica onde o dedo a largou e desliza dali para o lugar novo.
        pos.setValue({ x: a.x0 + a.dx, y: a.y0 + a.dy });
        dedo.setValue({ x: 0, y: 0 });
        setNoAr(false);
        q.acoes.largar(peca.id);
        setLargadas((n) => n + 1);
      }
      q.acoes.acabar();
    }
  }, [pos, dedo, peca.id]);

  const aoMudarCanto = useCallback((e: PanGestureHandlerStateChangeEvent) => {
    const { state, oldState } = e.nativeEvent;
    const q = aqui.current;
    if (state === State.BEGAN) q.acoes.comecar();
    if (state === State.ACTIVE) { hapticSelection(); canto.current = { w0: q.largura, h0: q.altura }; return; }
    if (state === State.END || state === State.FAILED || state === State.CANCELLED) {
      if (canto.current && oldState === State.ACTIVE) { canto.current = null; q.acoes.largarCanto(peca.id); }
      q.acoes.acabar();
    }
  }, [peca.id]);
  const aoPuxarCanto = useCallback((e: PanGestureHandlerGestureEvent) => {
    const c = canto.current;
    if (!c) return;
    const w = c.w0 + e.nativeEvent.translationX, h = c.h0 + e.nativeEvent.translationY;
    aqui.current.acoes.puxar(peca.id, (w + ESPACO) / passo, (h + ESPACO) / passo);
  }, [peca.id, passo]);

  const escala = levantar.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const rodar = abanar.interpolate({ inputRange: [-1, 1], outputRange: ['-1.1deg', '1.1deg'] });

  return (
    <Animated.View
      style={{
        position: 'absolute', left: 0, top: 0, width: largura, height: altura,
        zIndex: noAr ? 10 : 1,
        opacity: entrada.opacity,
        transform: [
          { translateX: Animated.add(Animated.add(pos.x, dedo.x), reduzido ? 0 : entrada.translateX) },
          { translateY: Animated.add(pos.y, dedo.y) },
          { scale: escala },
          { rotate: rodar },
        ],
        shadowColor: '#000', shadowOpacity: noAr ? 0.5 : 0, shadowRadius: 18, shadowOffset: { width: 0, height: 12 },
      }}
    >
      <PanGestureHandler
        onGestureEvent={evento}
        onHandlerStateChange={aoMudar}
        {...(editar ? { activeOffsetX: [-6, 6], activeOffsetY: [-6, 6] } : { activateAfterLongPress: 380 })}
        shouldCancelWhenOutside={false}
      >
        <Animated.View style={{ width: largura, height: altura }}>
          <PecaDaGaveta peca={peca} largura={largura} altura={altura} {...contexto} />
        </Animated.View>
      </PanGestureHandler>
      {/* O canto de puxar, como os widgets do iPhone: arrastar muda o tamanho; tocar passa ao seguinte. */}
      {editar && podeMudarDeTamanho(peca) ? (
        <PanGestureHandler onGestureEvent={aoPuxarCanto} onHandlerStateChange={aoMudarCanto} activeOffsetX={[-4, 4]} activeOffsetY={[-4, 4]}>
          <Animated.View style={styles.canto} hitSlop={{ top: 14, left: 14, right: 8, bottom: 8 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Resize" hitSlop={10}
              onPress={() => { hapticSelection(); contexto.aoRedimensionar(peca.id); }} style={styles.cantoToque}>
              <View style={styles.arco} />
            </Pressable>
          </Animated.View>
        </PanGestureHandler>
      ) : null}
    </Animated.View>
  );
}

/** Só as peças com mais de um tamanho têm o canto de puxar. */
function podeMudarDeTamanho(p: Peca): boolean {
  return TAMANHOS[p.tipo].length > 1;
}

const styles = StyleSheet.create({
  painel: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: FUNDO_DA_GAVETA, overflow: 'hidden' },
  // Um véu leve por cima da cor da capa: as peças e o texto leem-se sempre.
  veuDoFundo: { backgroundColor: 'rgba(13,13,16,0.35)' },
  // Os espaços (15/11): texto, e uma linha de luz de aço por baixo do ativo -- sem pílulas.
  // Desde 16/11 são o cabeçalho inteiro: o nome do espaço ativo já está aqui.
  espacos: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 22, marginHorizontal: MARGEM + 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(233,234,238,0.12)',
  },
  espaco: { height: 40, justifyContent: 'center', maxWidth: 140 },
  espacoTexto: { color: '#A5A6AB', fontSize: 17, fontWeight: '700', letterSpacing: -0.2 },
  nomeAEditar: { color: colors.text, padding: 0, minWidth: 60 },
  luz: {
    position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, borderRadius: 1, backgroundColor: '#E9EAEE',
    shadowColor: '#E9EAEE', shadowOpacity: 0.6, shadowRadius: 5, shadowOffset: { width: 0, height: 0 },
  },
  mais: { height: 40, width: 26, alignItems: 'center', justifyContent: 'center' },
  vazio: {
    color: colors.textSecondary, fontSize: 14, lineHeight: 20, padding: 18, borderRadius: 18, marginBottom: 12,
    borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(233,234,238,0.18)',
  },
  acrescentar: {
    height: 46, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(233,234,238,0.25)',
  },
  acrescentarTexto: { color: colors.text, fontSize: 15, fontWeight: '700' },
  apagar: { color: colors.danger, fontSize: 14, fontWeight: '600' },
  canto: { position: 'absolute', right: -3, bottom: -3, width: 30, height: 30 },
  cantoToque: { flex: 1, alignItems: 'flex-end', justifyContent: 'flex-end' },
  // Um quarto de círculo branco no canto, como o puxador dos widgets do iPhone.
  arco: {
    width: 20, height: 20, borderRightWidth: 3.5, borderBottomWidth: 3.5, borderColor: '#E9EAEE',
    borderBottomRightRadius: 16, marginRight: 3, marginBottom: 3,
  },
});
