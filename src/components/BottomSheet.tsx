import { useNotificationOverlay } from '../hooks/useNotificationOverlay';
import React, { createContext, useContext, useEffect, useRef } from 'react';
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
  useWindowDimensions,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '../theme';

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
}

export function BottomSheet({ visible, onClose, children, gestureBlocked = false, bloqueioRef }: Props) {
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
  const topoNoInicio = useRef(true);
  const podePuxar = (_e: unknown, g: { dx: number; dy: number }) =>
    !bloqueado.current && !bloqueioExterno.current?.current &&
    gestos.controls.size === 0 && topoNoInicio.current &&
    g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx);

  useEffect(() => {
    if (visible) arrasto.setValue(0); // reabrir não pode herdar o arrasto antigo
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
        tecladoPrimeiro.current = Keyboard.isVisible();
        if (tecladoPrimeiro.current) Keyboard.dismiss();
      },
      onPanResponderMove: (_e, g) => {
        if (!tecladoPrimeiro.current && g.dy > 0) arrasto.setValue(g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        // Longe o suficiente OU rápido o suficiente: um piparote curto conta.
        if (!tecladoPrimeiro.current && (g.dy > 90 || g.vy > 0.8)) fechar.current();
        else Animated.spring(arrasto, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
      },
      onPanResponderTerminate: () => {
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
      <View style={StyleSheet.absoluteFill}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <KeyboardAvoidingView
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
            <SheetGestures.Provider value={gestos}>{children}</SheetGestures.Provider>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
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
