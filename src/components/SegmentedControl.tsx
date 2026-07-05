import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, radii } from '../theme';

interface Props {
  options: string[];
  value: number;
  onChange: (index: number) => void;
  /** cor de destaque por opção (opcional) */
  accents?: (string | undefined)[];
}

export function SegmentedControl({ options, value, onChange, accents }: Props) {
  const [width, setWidth] = useState(0);
  const anim = useRef(new Animated.Value(value)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: value,
      useNativeDriver: true,
      speed: 18,
      bounciness: 6,
    }).start();
  }, [value, anim]);

  const segW = width > 0 ? (width - 4) / options.length : 0;

  return (
    <View
      style={styles.container}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
    >
      {segW > 0 && (
        <Animated.View
          style={[
            styles.thumb,
            {
              width: segW,
              transform: [
                {
                  translateX: anim.interpolate({
                    inputRange: [0, options.length - 1],
                    outputRange: [0, segW * (options.length - 1)],
                  }),
                },
              ],
            },
          ]}
        />
      )}
      {options.map((opt, i) => (
        <Pressable
          key={opt}
          style={styles.segment}
          onPress={() => {
            Haptics.selectionAsync();
            onChange(i);
          }}
        >
          <Text
            style={[
              styles.label,
              i === value && styles.labelActive,
              i === value && accents?.[i] ? { color: accents[i] } : null,
            ]}
          >
            {opt}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    padding: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  thumb: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    left: 2,
    backgroundColor: colors.surfacePressed,
    borderRadius: radii.pill,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  labelActive: {
    color: colors.text,
  },
});
