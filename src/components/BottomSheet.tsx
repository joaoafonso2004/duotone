import { useNotificationOverlay } from '../hooks/useNotificationOverlay';
import React, { createContext, useContext, useEffect, useLayoutEffect, useRef } from 'react';
import { StackActions } from '@react-navigation/native';
import { navigationRef } from '../navigation/RootNavigator';
import {
  abrirFolha, atualizarFolha, marcarFechadaPeloDono, novoIdDeFolha, type DetentesDaFolha,
} from '../state/folhasNativas';
import { DentroDeUmModal, haModalDoRNAberto, useModalDoRNAberto } from './dentroDeUmModal';
import {
  Animated,
  Keyboard,
  ScrollView,
  FlatList,
  type ScrollViewProps,
  type FlatListProps,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { colors, radii, spacing, type } from '../theme';
import { pedirFluidez, segurarFluidez } from '../state/fluidez';

interface Props {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  gestureBlocked?: boolean;
  /**
   * O mesmo que `gestureBlocked`, mas lido na hora do gesto e não do render.
   *
   * Existe pelo arrasto da fila. A prop só chega depois de o React voltar a
   * desenhar, e o dedo não espera: o primeiro movimento a seguir ao toque
   * longo ainda via a folha desbloqueada, e com o dedo a descer uns pixels a
   * folha ficava com o gesto -- arrastava-se a fila inteira em vez da música.
   */
  bloqueioRef?: React.RefObject<boolean>;
  /**
   * No iPhone a folha é NATIVA (4/10, auditoria 3.2): `false` força o `Modal`
   * de sempre. Dentro de um `Modal` do React Native é sempre o de sempre (ver
   * `dentroDeUmModal.ts`).
   */
  nativa?: boolean;
  /** As alturas da folha nativa: o conteúdo (por omissão) ou frações do ecrã. */
  detentes?: DetentesDaFolha;
  /**
   * O título da folha (5/10). No iPhone desenha-se por cima do conteúdo; no PC
   * vai para a barra do diálogo, ao lado do X (`BottomSheet.web.tsx`).
   */
  titulo?: string;
}

/**
 * Interruptor das folhas nativas: `false` volta todas ao `Modal` de sempre
 * (a fila tem a sua rota e não depende dele).
 */
// A apresentação formSheet passou a cortar o conteúdo dos menus no iPhone.
// Usa a apresentação anterior até a medição nativa ser validada no dispositivo.
export const FOLHAS_NATIVAS = false;

export function BottomSheet({ titulo, ...resto }: Props) {
  const props: Props = titulo
    ? { ...resto, children: <><Text style={[type.title, { marginBottom: spacing.md }]}>{titulo}</Text>{resto.children}</> }
    : resto;
  const dentroDeUmModal = useContext(DentroDeUmModal);
  if (Platform.OS === 'ios' && FOLHAS_NATIVAS && !dentroDeUmModal && props.nativa !== false) {
    return <FolhaNativa {...props} />;
  }
  return <FolhaDoModal {...props} />;
}

/** O stack de raiz tem a rota `Folha`? (Sem sessão, ou antes de montar, não.) */
function podeEmpurrarFolha(): boolean {
  if (!navigationRef.isReady()) return false;
  return navigationRef.getRootState()?.routeNames?.includes('Folha') ?? false;
}

function tirarRotaDaFolha(id: string): void {
  if (!navigationRef.isReady()) return;
  const raiz = navigationRef.getRootState();
  const rota = raiz?.routes.find((r) => r.name === 'Folha' && (r.params as { id?: string } | undefined)?.id === id);
  // `pop` com `source` tira ESTA rota e deixa as de cima (uma folha aberta a
  // partir desta não fecha com ela).
  if (raiz && rota) navigationRef.dispatch({ ...StackActions.pop(1), source: rota.key, target: raiz.key });
}

/**
 * A folha nativa: não desenha nada aqui. O conteúdo vai para a loja e a rota
 * `Folha` desenha-o (`state/folhasNativas.ts`, `screens/FolhaScreen.tsx`).
 */
function FolhaNativa(props: Props) {
  const { visible, onClose, children, detentes } = props;
  // Decide-se ao abrir, no próprio desenho (assim o `Modal` nunca aparece um
  // fotograma antes de a folha nativa a substituir): sem rota onde empurrar
  // (sem sessão) ou com um `Modal` do RN à vista, fica o `Modal` de sempre.
  const decisao = useRef<'nativa' | 'modal' | null>(null);
  const antes = useRef(false);
  if (visible && !antes.current) {
    decisao.current = !podeEmpurrarFolha() || haModalDoRNAberto() ? 'modal' : 'nativa';
  }
  antes.current = visible;
  // Só a nativa se regista aqui: o `FolhaDoModal` regista-se a si próprio, e
  // um registo a mais nunca era libertado (a notificação ficava à espera).
  const notificationDismiss = useNotificationOverlay(visible && decisao.current === 'nativa', onClose);
  const fechar = useRef(onClose);
  fechar.current = onClose;
  const conteudo = useRef(children);
  conteudo.current = children;
  const libertar = useRef(notificationDismiss);
  libertar.current = notificationDismiss;
  const idRef = useRef<string | null>(null);

  useEffect(() => {
    if (!visible || decisao.current !== 'nativa') return;
    const id = novoIdDeFolha();
    idRef.current = id;
    abrirFolha({
      id,
      conteudo: conteudo.current,
      aoFechar: () => fechar.current(),
      aoSairDeVez: () => libertar.current(),
    });
    pedirFluidez(800);
    navigationRef.dispatch(StackActions.push('Folha', { id, detentes }));
    return () => {
      idRef.current = null;
      marcarFechadaPeloDono(id);
      tirarRotaDaFolha(id);
    };
    // As alturas contam só ao abrir: mudá-las com a folha aberta não a refaz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Cada desenho de quem abriu leva o conteúdo novo à folha.
  useLayoutEffect(() => {
    if (idRef.current) atualizarFolha(idRef.current, children, () => fechar.current());
  });

  return decisao.current === 'modal' ? <FolhaDoModal {...props} /> : null;
}

function FolhaDoModal({ visible, onClose, children, gestureBlocked = false, bloqueioRef }: Props) {
  useModalDoRNAberto(visible);
  const { height } = useWindowDimensions();
  const notificationDismiss = useNotificationOverlay(visible,onClose);
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  /** Quanto o dedo já arrastou a folha para baixo. */
  const arrasto = useRef(new Animated.Value(0)).current;
  // O PanResponder nasce uma vez; o onClose de hoje tem de lhe chegar por ref.
  const fechar = useRef(onClose);
  fechar.current = onClose;
  const bloqueado = useRef(false); bloqueado.current = gestureBlocked;
  // O PanResponder fecha sobre o primeiro render: o ref de quem chama chega-lhe
  // por outro ref, como o `onClose`.
  const bloqueioExterno = useRef(bloqueioRef); bloqueioExterno.current = bloqueioRef;
  const gestos = useRef({ offsets: new Map<object, number>(), controls: new Set<object>() }).current;
  const tecladoPrimeiro = useRef(false);
  /** Os 120 Hz enquanto o dedo arrasta a folha (state/fluidez.ts). */
  const largarFluidez = useRef<(() => void) | null>(null);
  const topoNoInicio = useRef(true);
  const podePuxar = (_e: unknown, g: { dx: number; dy: number }) =>
    !bloqueado.current && !bloqueioExterno.current?.current &&
    gestos.controls.size === 0 && topoNoInicio.current &&
    g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx);

  useEffect(() => {
    if (visible) arrasto.setValue(0); // reabrir não pode herdar o arrasto antigo
    pedirFluidez(800);
    Animated.spring(anim, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      speed: 16,
      bounciness: 4,
    }).start();
  }, [visible, anim, arrasto]);

  const puxar = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: podePuxar,
      onMoveShouldSetPanResponderCapture: Platform.OS === 'ios' ? podePuxar : undefined,
      onPanResponderGrant: () => {
        largarFluidez.current?.();
        largarFluidez.current = segurarFluidez();
        tecladoPrimeiro.current = Keyboard.isVisible();
        if (tecladoPrimeiro.current) Keyboard.dismiss();
      },
      onPanResponderMove: (_e, g) => {
        if (!tecladoPrimeiro.current && g.dy > 0) arrasto.setValue(g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        largarFluidez.current?.();
        largarFluidez.current = null;
        // Longe o suficiente OU rápido o suficiente: um piparote curto conta.
        if (!tecladoPrimeiro.current && (g.dy > 90 || g.vy > 0.8)) fechar.current();
        else Animated.spring(arrasto, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
      },
      onPanResponderTerminate: () => {
        largarFluidez.current?.();
        largarFluidez.current = null;
        Animated.spring(arrasto, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
      },
    })
  ).current;

  return (
    <Modal onDismiss={notificationDismiss}
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {/* Raiz do Gesture Handler: as barras do equalizador e as linhas que se
          deslizam são dele, e um `Modal` é outra raiz. */}
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <KeyboardAvoidingView
          pointerEvents="box-none"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardContainer}
        >
          <Animated.View
            {...(Platform.OS === 'ios' ? puxar.panHandlers : {})}
            onTouchStart={() => { topoNoInicio.current = [...gestos.offsets.values()].every(y => y <= 1); }}
            style={[
              styles.sheet,
              {
                paddingBottom: insets.bottom + spacing.lg,
                transform: [
                  {
                    translateY: Animated.add(
                      anim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [height * 0.45, 0],
                      }),
                      arrasto
                    ),
                  },
                ],
              },
            ]}
          >
            {/* A zona de agarrar é maior do que o traço que se vê. */}
            <View {...(Platform.OS === 'ios' ? {} : puxar.panHandlers)} style={styles.zonaDaPega}>
              <View style={styles.handle} />
            </View>
            <DentroDeUmModal.Provider value>
              <SheetGestures.Provider value={gestos}>{children}</SheetGestures.Provider>
            </DentroDeUmModal.Provider>
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay,
  },
  keyboardContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    backgroundColor: colors.surfaceHigh,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  zonaDaPega: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
  },
});

// Os filhos registam a posição real sem redesenhar a folha em cada frame.
const SheetGestures = createContext<{ offsets: Map<object, number>; controls: Set<object> } | null>(null);
function useSheetScroll(onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void, enabled = true) {
  const context = useContext(SheetGestures);
  const id = useRef({}).current;
  useEffect(() => {
    if (enabled) context?.offsets.set(id, 0);
    return () => { context?.offsets.delete(id); };
  }, [context, id, enabled]);
  return (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (enabled) context?.offsets.set(id, e.nativeEvent.contentOffset.y);
    onScroll?.(e);
  };
}
export function BottomSheetScrollView({ onScroll, ...props }: ScrollViewProps) {
  const scroll = useSheetScroll(onScroll);
  return <ScrollView keyboardShouldPersistTaps="handled" {...props} onScroll={scroll} scrollEventThrottle={16} />;
}
export function BottomSheetFlatList<T>({ onScroll, ref, dismissScrollEnabled = true, ...props }: FlatListProps<T> & { ref?: React.Ref<FlatList<T>>; dismissScrollEnabled?: boolean }) {
  const scroll = useSheetScroll(onScroll, dismissScrollEnabled);
  return <FlatList {...props} ref={ref} onScroll={scroll} scrollEventThrottle={16} />;
}
/** Um controlo vertical (EQ) é dono do gesto até o dedo levantar. */
export function BottomSheetGestureGuard({ children }: { children: React.ReactNode }) {
  const context = useContext(SheetGestures);
  const id = useRef({}).current;
  useEffect(() => () => { context?.controls.delete(id); }, [context, id]);
  return <View onTouchStart={() => context?.controls.add(id)} onTouchEnd={() => context?.controls.delete(id)}
    onTouchCancel={() => context?.controls.delete(id)}>{children}</View>;
}
