import { useNotificationOverlay } from '../hooks/useNotificationOverlay';
import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FundoDaFolha } from './FundoDaFolha';
import { CoracaoAnimado } from './CoracaoAnimado';
import { useCoracaoAoCarregar } from '../hooks/useCoracaoAoCarregar';
import { posicaoDoMenu } from '../lib/posicaoDoMenu';
import { useTheme } from '../state/theme';
import { Toque } from './Toque';
import { hapticSelection } from '../lib/haptics';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { ESTADO } from '../lib/movimento';
import { colors, radii, spacing, type } from '../theme';
import type { PlayerAction } from './PlayerActionsSheet';
import { DentroDeUmModal } from './dentroDeUmModal';

export type Ancora = { x: number; y: number; width: number; height: number };

const LARGURA = 232;
/** O menu de uma música (variante B): cabe o cabeçalho e os três quadrados. */
const LARGURA_DA_FAIXA = 286;
const MARGEM = 12;

/**
 * O cabeçalho do menu de uma música (16/10, variante B de
 * `docs/menus-ios.html`): a capa, o nome e o artista, e o coração ao lado --
 * guardar fica a um toque e sai da lista.
 */
export type FaixaDoMenu = {
  capa: string | null;
  titulo: string;
  artista: string;
  coracao?: { guardada: boolean; disponivel: boolean; alternar: () => unknown } | null;
};

/**
 * Um menu que abre junto ao dedo.
 *
 * ## Porque não é a folha de baixo
 *
 * A app já tem folhas, e elas continuam onde estão. A diferença não é de
 * gosto, é de trabalho:
 *
 *   - **folha** quando há uma lista de onde ESCOLHER -- os teus amigos, as
 *     tuas playlists. Precisa de altura, de deslizar, e de vir de um sítio
 *     fixo porque pode ser longa.
 *   - **menu** quando são quatro acções fixas que se lêem de uma vez. Aparece
 *     onde o dedo está e some-se logo a seguir.
 *
 * Uma folha a subir do fundo do ecrã para mostrar quatro linhas percorre
 * seiscentos pixels para entregar duzentos, e o utilizador tem de ir buscar
 * lá abaixo o que pediu aqui em cima. Com a regra escrita, as duas coisas
 * convivem -- é o que o iOS faz. Sem a regra, seriam duas linguagens.
 *
 * ## O que decide onde ele nasce
 *
 * A âncora vem medida em coordenadas de ECRÃ, do botão que o abriu. O menu
 * encosta-se à direita desse botão e desce por baixo dele; se não houver
 * espaço em baixo, sobe. Sem isto nasceria sempre no mesmo sítio e a ligação
 * entre o que se tocou e o que abriu perdia-se.
 */
export function MenuFlutuante({ visivel, ancora, accoes, aoFechar, aoFechado, titulo, faixa, atalhos, aviso }: {
  visivel: boolean;
  /** O menu de uma música: o cabeçalho com a capa e o coração (no lugar do `titulo`). */
  faixa?: FaixaDoMenu | null;
  /** Até três ações em quadrados, por baixo do cabeçalho. */
  atalhos?: PlayerAction[];
  /** Uma linha por baixo do cabeçalho ("Offline · not downloaded"). */
  aviso?: string | null;
  /**
   * De quem é o menu (5/10): o nome da música ou da playlist, numa linha
   * pequena por cima das ações, como o título de um menu do iOS.
   */
  titulo?: string | null;
  ancora: Ancora | null;
  accoes: PlayerAction[];
  aoFechar: () => void;
  /**
   * Chamado quando o menu saiu MESMO do ecrã.
   *
   * É por aqui que se abre uma folha a seguir a uma escolha, e não no toque.
   * Abrir uma no mesmo instante em que este fecha punha o iOS a apresentar
   * uma coisa enquanto outra saía -- e o que ficava era uma janela órfã,
   * invisível, a apanhar todos os toques. O som continuava e a app deixava de
   * reagir ao dedo até ser reiniciada.
   */
  aoFechado?: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const notificationDismiss = useNotificationOverlay(visivel && !!ancora,aoFechar);
  const reduzido = useReducedMotion();
  const entrada = React.useRef(new Animated.Value(0)).current;
  const mostrar = visivel && !!ancora;
  const mostrarRef = React.useRef(mostrar);
  mostrarRef.current = mostrar;
  // Os pais limpam a âncora e as ações ao fechar. Conservar a última escolha
  // mantém o mesmo Modal visível até acabar a saída; sem isto, o onDismiss
  // podia chegar antes de se registar a ação que abre o seletor de imagens.
  const apresentacao = React.useRef({ ancora, accoes, titulo, faixa, atalhos, aviso });
  if (mostrar) apresentacao.current = { ancora, accoes, titulo, faixa, atalhos, aviso };
  const insets = useSafeAreaInsets();
  // O `Modal` só desmonta quando a saída acaba: fechá-lo no toque cortava a
  // animação a meio e o menu desaparecia de um fotograma para o outro.
  const [montado, setMontado] = React.useState(mostrar);
  const aberto = React.useRef(mostrar);

  const fechadoRef = React.useRef(aoFechado);
  fechadoRef.current = aoFechado;
  // O `aoFechado` só corre quando o iOS acabou de fechar a janela do menu (o
  // `onDismiss` do Modal), e não no fim da animação (4/10). No fim da animação
  // o Modal ainda está a sair, e o iOS recusa apresentar outra coisa nesse
  // instante -- sem erro: o seletor de imagens do Edit profile não abria.
  const fechoPendente = React.useRef(false);
  const avisarFechado = React.useCallback(() => {
    if (!fechoPendente.current || mostrarRef.current) return;
    fechoPendente.current = false;
    fechadoRef.current?.();
  }, []);

  React.useEffect(() => {
    if (mostrar) {
      aberto.current = true;
      fechoPendente.current = false;
      setMontado(true);
      if (reduzido) { entrada.setValue(1); return; }
      const mola = Animated.spring(entrada, { toValue: 1, ...ESTADO, useNativeDriver: true });
      mola.start();
      return () => mola.stop();
    }
    if (!aberto.current) return;
    let ativo = true;
    // Desmontar SEMPRE, tenha a animação acabado ou não.
    //
    // Antes o `setMontado(false)` estava dentro do `finished`, e uma animação
    // interrompida deixava o `Modal` montado com opacidade zero -- invisível,
    // e com um `Pressable` do tamanho do ecrã a engolir tudo. A saída é
    // decoração; desaparecer não é, e não pode depender de ela correr até ao
    // fim.
    const desmontar = () => {
      // Parar uma saída ao reabrir ou desmontar também chama o callback da
      // animação. Esse fecho antigo não pode apagar a nova apresentação.
      if (!ativo || mostrarRef.current) return;
      aberto.current = false;
      fechoPendente.current = true;
      setMontado(false);
    };
    if (reduzido) { entrada.setValue(0); desmontar(); return; }
    const saida = Animated.timing(entrada, { toValue: 0, duration: 130, useNativeDriver: true });
    saida.start(desmontar);
    return () => { ativo = false; saida.stop(); };
    // O `montado` NÃO entra aqui: mudá-lo dentro do efeito voltava a
    // dispará-lo, e a limpeza parava a animação que ele próprio tinha
    // começado.
  }, [mostrar, reduzido, entrada]);

  // Android e web não entregam onDismiss. A ação corre depois de o React
  // aplicar visible=false, nunca no mesmo callback que pede o fecho.
  React.useEffect(() => {
    if (!montado && Platform.OS !== 'ios') avisarFechado();
  }, [montado, avisarFechado]);
  React.useEffect(() => () => { fechoPendente.current = false; }, []);

  // Keep the same Modal mounted until its native onDismiss is delivered.
  const aoDispensar = () => {
    if (mostrarRef.current) return;
    notificationDismiss();
    avisarFechado();
  };
  const ancoraVisivel = apresentacao.current.ancora;
  const accoesVisiveis = apresentacao.current.accoes;
  const tituloVisivel = apresentacao.current.titulo;
  const faixaVisivel = apresentacao.current.faixa ?? null;
  const atalhosVisiveis = apresentacao.current.atalhos ?? [];
  const avisoVisivel = apresentacao.current.aviso ?? null;
  if (!montado || !ancoraVisivel) return <Modal visible={false} transparent animationType="none" onDismiss={aoDispensar}/>;

  // Uma linha com motivo leva mais uma linha de texto por baixo, e um grupo
  // novo leva o traço: sem contar isto, o menu achava que cabia em baixo e
  // saía pelo fundo do ecrã.
  const alturaEstimada = accoesVisiveis.length * 46
    + accoesVisiveis.filter((a) => a.motivo || a.nota).length * 18
    + accoesVisiveis.filter((a) => a.inicioDeGrupo).length * (spacing.xs + 1)
    + (faixaVisivel ? 65 : tituloVisivel ? 34 : 0)
    + (avisoVisivel ? 24 : 0)
    + (atalhosVisiveis.length ? 84 : 0)
    + spacing.sm * 2;
  // Dentro da zona segura (16/10, I1): sem lugar em baixo, subia até 12 pt do
  // topo -- por baixo da ilha. Mais alto do que ela, rola por dentro.
  const { topo, altura } = posicaoDoMenu(ancoraVisivel, alturaEstimada, { altura: height, topo: insets.top, fundo: insets.bottom }, MARGEM);
  const rola = altura < alturaEstimada;
  const largura = faixaVisivel ? LARGURA_DA_FAIXA : LARGURA;
  const esquerda = Math.min(
    Math.max(MARGEM, ancoraVisivel.x + ancoraVisivel.width - largura),
    width - largura - MARGEM
  );

  return (
    <Modal onDismiss={aoDispensar} transparent visible statusBarTranslucent animationType="none" onRequestClose={aoFechar}><DentroDeUmModal.Provider value>
      {/* Tocar fora fecha. Ocupa o ecrã todo de propósito: um menu aberto tem
          de se poder dispensar sem se acertar em nada. */}
      <Pressable disabled={!mostrar} style={StyleSheet.absoluteFill} onPress={aoFechar} accessibilityLabel="Close menu">
        <Animated.View style={[StyleSheet.absoluteFill, styles.veu, { opacity: entrada }]} />
      </Pressable>
      <Animated.View
        pointerEvents={mostrar ? 'auto' : 'none'}
        style={[
          styles.menu,
          { top: topo, left: esquerda, width: largura },
          rola && { height: altura },
          {
            opacity: entrada,
            transform: [{ scale: entrada.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
          },
        ]}
      >
        {/* O fundo das folhas (11/10): o grafite, o preto do OLED ou a capa
            desfocada. Era um vidro cinzento-azulado fixo, fora do tema. */}
        <FundoDaFolha semLinha />
        {faixaVisivel ? <CabecalhoDaFaixa faixa={faixaVisivel} ativo={mostrar} /> : tituloVisivel ? <Text numberOfLines={1} style={[type.caption, styles.titulo]}>{tituloVisivel}</Text> : null}
        {avisoVisivel ? (
          <View style={styles.aviso}>
            <Ionicons name="cloud-offline-outline" size={14} color={colors.textSecondary} />
            <Text numberOfLines={1} style={type.caption}>{avisoVisivel}</Text>
          </View>
        ) : null}
        {atalhosVisiveis.length ? (
          <View style={styles.atalhos}>
            {atalhosVisiveis.map((a) => {
              const apagada = !!a.disabled || !!a.motivo;
              return (
                <Toque
                  key={a.label}
                  acende
                  accessibilityRole="button"
                  accessibilityLabel={a.label}
                  accessibilityState={{ disabled: apagada }}
                  disabled={apagada || !mostrar}
                  onPress={() => { hapticSelection(); a.onPress(); }}
                  style={[styles.atalho, apagada && styles.apagada]}
                >
                  <Ionicons name={a.icon} size={21} color={colors.text} />
                  <Text numberOfLines={1} style={styles.rotuloDoAtalho}>{a.label}</Text>
                </Toque>
              );
            })}
          </View>
        ) : null}
        <ScrollView scrollEnabled={rola} showsVerticalScrollIndicator={rola} style={{ flexShrink: 1 }} bounces={false}>
        {accoesVisiveis.map((accao) => {
          // Indisponível fica à vista e diz porquê (lib/menuDaFaixa.ts).
          const apagada = !!accao.disabled || !!accao.motivo;
          return (
            <Toque
              key={accao.label}
              acende
              accessibilityRole="button"
              accessibilityLabel={accao.motivo ? `${accao.label}. ${accao.motivo}` : accao.label}
              accessibilityState={{ disabled: apagada, selected: accao.escolhida }}
              disabled={apagada || !mostrar}
              onPress={() => { hapticSelection(); accao.onPress(); }}
              style={[styles.linha, accao.inicioDeGrupo && styles.grupo]}
            >
              {accao.escolhida === undefined ? (
                <Ionicons
                  name={accao.icon}
                  size={19}
                  color={accao.destructive ? colors.danger : colors.text}
                  style={apagada && styles.apagada}
                />
              ) : (
                <View style={styles.marca}>
                  {accao.escolhida && <Ionicons name="checkmark" size={18} color={colors.text} />}
                </View>
              )}
              <View style={styles.etiqueta}>
                <Text
                  numberOfLines={2}
                  style={[type.body, accao.destructive && { color: colors.danger }, apagada && styles.apagada]}
                >
                  {accao.label}
                </Text>
                {accao.motivo ? <Text numberOfLines={2} style={[type.caption, styles.motivo]}>{accao.motivo}</Text> : null}
              </View>
            </Toque>
          );
        })}
        </ScrollView>
      </Animated.View>
    </DentroDeUmModal.Provider></Modal>
  );
}

const styles = StyleSheet.create({
  veu: { backgroundColor: colors.overlay },
  menu: {
    position: 'absolute',
    borderRadius: radii.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    paddingVertical: spacing.sm,
  },
  linha: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  etiqueta: { flex: 1 },
  marca: { width: 19, alignItems: 'center' },
  apagada: { opacity: 0.4 },
  motivo: { marginTop: 1, color: colors.textSecondary },
  titulo: { paddingHorizontal: spacing.lg, paddingTop: 4, paddingBottom: 8, color: colors.textSecondary, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderStrong },
  grupo: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong, marginTop: spacing.xs },
  cabecalho: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingLeft: spacing.md, paddingRight: spacing.sm, paddingTop: 4, paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderStrong,
  },
  capa: { width: 40, height: 40, borderRadius: 6, backgroundColor: colors.surfaceHigh },
  coracao: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  aviso: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  atalhos: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm + 2, paddingBottom: spacing.xs },
  atalho: {
    flex: 1, height: 64, borderRadius: radii.md, borderCurve: 'continuous', gap: 5,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)',
  },
  rotuloDoAtalho: { fontSize: 12, fontWeight: '500', color: colors.text },
});

/** A capa, o nome e o artista, e o coração que reage ao carregar (`useCoracaoAoCarregar`). */
function CabecalhoDaFaixa({ faixa, ativo }: { faixa: FaixaDoMenu; ativo: boolean }) {
  const acento = useTheme((s) => s.theme.color);
  const c = faixa.coracao;
  const coracao = useCoracaoAoCarregar(!!c?.guardada, () => c?.alternar());
  const pode = !!c && c.disponivel && ativo;
  return (
    <View style={styles.cabecalho}>
      <Image source={faixa.capa ? { uri: faixa.capa } : null} style={styles.capa} contentFit="cover" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[type.body, { fontWeight: '600' }]}>{faixa.titulo}</Text>
        <Text numberOfLines={1} style={type.caption}>{faixa.artista}</Text>
      </View>
      {c ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={coracao.mostrada ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
          accessibilityState={{ disabled: !pode, selected: coracao.mostrada }}
          disabled={!pode}
          onPressIn={() => { hapticSelection(); coracao.onPressIn(); }}
          onPress={coracao.onPress}
          onPressOut={coracao.onPressOut}
          style={[styles.coracao, !c.disponivel && styles.apagada]}
        >
          <CoracaoAnimado guardada={coracao.mostrada} pulso={coracao.pulso} tamanho={22} cor={colors.text} corCheio={acento} />
        </Pressable>
      ) : null}
    </View>
  );
}
