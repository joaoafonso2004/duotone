import React, { useEffect, useRef } from 'react';
import {
  Animated,
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
}

export function BottomSheet({ visible, onClose, children }: Props) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  /** Quanto o dedo já arrastou a folha para baixo. */
  const arrasto = useRef(new Animated.Value(0)).current;
  // O PanResponder nasce uma vez; o onClose de hoje tem de lhe chegar por ref.
  const fechar = useRef(onClose);
  fechar.current = onClose;

  useEffect(() => {
    if (visible) arrasto.setValue(0); // reabrir não pode herdar o arrasto antigo
    Animated.spring(anim, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      speed: 16,
      bounciness: 4,
    }).start();
  }, [visible, anim, arrasto]);

  /**
   * Arrastar para baixo fecha.
   *
   * Vive só na pega e não na folha inteira de propósito: o conteúdo costuma
   * ser uma lista que rola, e um responder por cima dela roubava-lhe o dedo.
   */
  const puxar = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) arrasto.setValue(g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        // Longe o suficiente OU rápido o suficiente: um piparote curto conta.
        if (g.dy > 90 || g.vy > 0.8) fechar.current();
        else Animated.spring(arrasto, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(arrasto, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
      },
    })
  ).current;

  return (
    <Modal
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
            <View {...puxar.panHandlers} style={styles.zonaDaPega}>
              <View style={styles.handle} />
            </View>
            {children}
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
