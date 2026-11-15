import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { PecaDaGaveta, type ContextoDaPeca } from './PecaDaGaveta';
import { FolhaDaGaveta } from './FolhaDaGaveta';
import { useDestinos } from '../navigation/destinos';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { usePlayer } from '../state/player';
import {
  carregarGaveta, editarGaveta, fecharGaveta, mudarGaveta, useGaveta,
} from '../state/gaveta';
import {
  apagarEspaco, arrumar, ativar, COLUNAS, espacoAtivo, novoEspaco, proximoTamanho, renomear, tirar, trocar,
} from '../lib/gaveta';
import { avisarInfo } from '../lib/avisoDeRemocao';
import { hapticSelection } from '../lib/haptics';
import type { Destino } from '../lib/destinos';
import { colors } from '../theme';

const MARGEM = 12;
const ESPACO = 10;
/** O fundo do painel: um pouco acima do preto da app, para a Home se separar dele. */
export const FUNDO_DA_GAVETA = '#0D0D10';

/**
 * A gaveta da Home do iPhone (6.0.4, `lib/gaveta.ts`): fica POR BAIXO da app,
 * à esquerda, e vê-se quando a app desliza para a direita (`RootNavigator`).
 * As peças entram em cascata a cada abertura; a editar, × tira, ⤢ muda o
 * tamanho e tocar em duas troca-as de sítio.
 */
export function Gaveta({ largura, abertura }: { largura: number; abertura: Animated.AnimatedInterpolation<number> }) {
  const insets = useSafeAreaInsets();
  const reduzido = useReducedMotion();
  const { irPara: irParaNaApp } = useDestinos();
  const { gaveta, aberta, editar, escolhida, aberturas } = useGaveta(useShallow((s) => ({
    gaveta: s.gaveta, aberta: s.aberta, editar: s.editar, escolhida: s.escolhida, aberturas: s.aberturas,
  })));

  useEffect(() => { void carregarGaveta(); }, []);

  // O leitor a abrir por cima (a peça do que está a tocar, um toque no mini): a
  // gaveta fecha por baixo dele, para não ficar aberta quando ele descer.
  useEffect(() => usePlayer.subscribe((s, antes) => {
    if (s.expanded && !antes.expanded) fecharGaveta();
  }), []);

  const espaco = gaveta ? espacoAtivo(gaveta) : null;
  const celula = Math.floor((largura - MARGEM * 2 - ESPACO * (COLUNAS - 1)) / COLUNAS);
  const grelha = useMemo(() => arrumar(espaco?.pecas ?? []), [espaco?.pecas]);

  // A cascata: uma só animação por abertura, e cada peça entra a 30 ms da anterior.
  const entrada = useRef(new Animated.Value(1)).current;
  const total = espaco?.pecas.length ?? 0;
  const duracao = 420 + Math.min(total, 14) * 30;
  useEffect(() => {
    if (!aberturas) return;
    if (reduzido) { entrada.setValue(1); return; }
    entrada.setValue(0);
    Animated.timing(entrada, { toValue: 1, duration: duracao, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberturas]);

  const irPara = useCallback((d: Destino) => { fecharGaveta(); irParaNaApp(d); }, [irParaNaApp]);
  const contexto = useMemo<Omit<ContextoDaPeca, 'largura' | 'altura' | 'escolhida'>>(() => ({
    editar,
    irPara,
    abrirLeitor: () => { fecharGaveta(); usePlayer.getState().setExpanded(true); },
    fechar: () => fecharGaveta(),
    aoEscolher: (id) => {
      const s = useGaveta.getState();
      if (!s.gaveta) return;
      if (!s.escolhida) { useGaveta.setState({ escolhida: id }); return; }
      if (s.escolhida === id) { useGaveta.setState({ escolhida: null }); return; }
      const e = s.gaveta.ativo, a = s.escolhida;
      mudarGaveta((g) => trocar(g, e, a, id));
      useGaveta.setState({ escolhida: null });
    },
    aoTirar: (id) => {
      const g = useGaveta.getState().gaveta;
      if (g) mudarGaveta((x) => tirar(x, g.ativo, id));
      if (useGaveta.getState().escolhida === id) useGaveta.setState({ escolhida: null });
    },
    aoRedimensionar: (id) => {
      const g = useGaveta.getState().gaveta;
      if (g) mudarGaveta((x) => proximoTamanho(x, g.ativo, id));
    },
    aoSegurar: () => editarGaveta(true),
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
    useGaveta.setState({ editar: true, escolhida: null, acrescentar: true });
  };

  // A gaveta desliza um pouco com a abertura: parece vir de trás da Home, e não estar parada.
  const paralaxe = useMemo(() => abertura.interpolate({ inputRange: [0, 1], outputRange: [-36, 0] }), [abertura]);

  return (
    <Animated.View
      accessibilityViewIsModal={aberta}
      accessibilityElementsHidden={!aberta}
      importantForAccessibility={aberta ? 'auto' : 'no-hide-descendants'}
      style={[styles.painel, { width: largura, paddingTop: insets.top + 10, transform: [{ translateX: paralaxe }] }]}
    >
      <View style={styles.cabecalho}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {editar ? (
            <TextInput
              value={nome}
              onChangeText={setNome}
              onEndEditing={() => { if (gaveta) mudarGaveta((g) => renomear(g, g.ativo, nome)); }}
              maxLength={24}
              returnKeyType="done"
              accessibilityLabel="Space name"
              style={[styles.titulo, styles.tituloAEditar]}
              selectionColor={colors.text}
            />
          ) : (
            <Text numberOfLines={1} accessibilityRole="header" style={styles.titulo}>{espaco?.nome ?? 'Your drawer'}</Text>
          )}
          <Text numberOfLines={1} style={styles.legenda}>
            {editar ? (escolhida ? 'Now tap where it goes' : 'Tap two tiles to swap them') : 'Your drawer'}
          </Text>
        </View>
        <Pressable accessibilityRole="button" hitSlop={8}
          onPress={() => { hapticSelection(); editarGaveta(!editar); }}
          style={({ pressed }) => [styles.editar, editar && styles.editarLigado, pressed && { opacity: 0.7 }]}>
          <Text style={[styles.editarTexto, editar && { color: '#060608' }]}>{editar ? 'Done' : 'Edit'}</Text>
        </Pressable>
      </View>

      {gaveta ? (
        <View accessibilityRole="tablist" style={styles.espacos}>
          {gaveta.espacos.map((e) => {
            const ativo = e.id === gaveta.ativo;
            return (
              <Pressable key={e.id} accessibilityRole="tab" accessibilityState={{ selected: ativo }} hitSlop={6}
                onPress={() => { hapticSelection(); mudarGaveta((g) => ativar(g, e.id)); useGaveta.setState({ escolhida: null }); }}
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
        contentContainerStyle={{ paddingHorizontal: MARGEM, paddingTop: 14, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {espaco && espaco.pecas.length === 0 ? (
          <Text style={styles.vazio}>An empty space. Add artists, friends, controls or shortcuts, and make it yours.</Text>
        ) : null}
        <View style={{ height: grelha.linhas ? grelha.linhas * (celula + ESPACO) - ESPACO : 0 }}>
          {espaco?.pecas.map((peca, i) => {
            const lugar = grelha.lugares.find((l) => l.id === peca.id);
            if (!lugar) return null;
            const inicio = Math.min(i, 14) * 30 / duracao;
            const fim = Math.min(1, inicio + 420 / duracao);
            const largura = lugar.colunas * celula + (lugar.colunas - 1) * ESPACO;
            const altura = lugar.linhas * celula + (lugar.linhas - 1) * ESPACO;
            return (
              <Animated.View
                key={peca.id}
                style={{
                  position: 'absolute',
                  left: lugar.coluna * (celula + ESPACO),
                  top: lugar.linha * (celula + ESPACO),
                  zIndex: escolhida === peca.id ? 3 : 1,
                  opacity: entrada.interpolate({ inputRange: [0, inicio, fim, 1], outputRange: [0, 0, 1, 1] }),
                  transform: [
                    { translateX: entrada.interpolate({ inputRange: [0, inicio, fim, 1], outputRange: [-18, -18, 0, 0] }) },
                    { scale: entrada.interpolate({ inputRange: [0, inicio, fim, 1], outputRange: [0.96, 0.96, 1, 1] }) },
                  ],
                }}
              >
                <PecaDaGaveta peca={peca} largura={largura} altura={altura} escolhida={escolhida === peca.id} {...contexto} />
              </Animated.View>
            );
          })}
        </View>

        {editar ? (
          <View style={{ gap: 12, marginTop: grelha.linhas ? 16 : 0 }}>
            <Pressable accessibilityRole="button" onPress={() => { hapticSelection(); useGaveta.setState({ acrescentar: true }); }}
              style={({ pressed }) => [styles.acrescentar, pressed && { opacity: 0.7 }]}>
              <Ionicons name="add" size={18} color={colors.text} />
              <Text style={styles.acrescentarTexto}>Add</Text>
            </Pressable>
            {gaveta && gaveta.espacos.length > 1 && espaco ? (
              <Pressable accessibilityRole="button" hitSlop={6}
                onPress={() => { hapticSelection(); mudarGaveta((g) => apagarEspaco(g, espaco.id)); }}
                style={{ alignSelf: 'center', paddingVertical: 6 }}>
                <Text style={styles.apagar}>Delete this space</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <FolhaDaGaveta />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  painel: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: FUNDO_DA_GAVETA },
  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: MARGEM + 4 },
  titulo: { color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.3, padding: 0 },
  tituloAEditar: { borderBottomWidth: 1, borderBottomColor: 'rgba(233,234,238,0.25)' },
  legenda: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  editar: {
    height: 34, paddingHorizontal: 14, borderRadius: 17, justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(233,234,238,0.22)', backgroundColor: '#16161B',
  },
  editarLigado: { backgroundColor: '#E9EAEE', borderColor: '#E9EAEE' },
  editarTexto: { color: colors.text, fontSize: 13, fontWeight: '700' },
  // Os espaços (15/11): texto, e uma linha de luz de aço por baixo do ativo -- sem pílulas.
  espacos: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 22, marginTop: 14, marginHorizontal: MARGEM + 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(233,234,238,0.12)',
  },
  espaco: { height: 36, justifyContent: 'center', maxWidth: 120 },
  espacoTexto: { color: '#A5A6AB', fontSize: 15, fontWeight: '700', letterSpacing: -0.1 },
  luz: {
    position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, borderRadius: 1, backgroundColor: '#E9EAEE',
    shadowColor: '#E9EAEE', shadowOpacity: 0.6, shadowRadius: 5, shadowOffset: { width: 0, height: 0 },
  },
  mais: { height: 36, width: 26, alignItems: 'center', justifyContent: 'center' },
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
});
