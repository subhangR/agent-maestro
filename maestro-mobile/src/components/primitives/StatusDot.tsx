// 7px status-colored dot. The `live` variant overlays a reanimated ping ring
// (scale 0.7→1.55, opacity 0.6→0, 1.9s loop on the UI thread) — gated off on
// reduced-motion, where it falls back to a static dot.
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { statusColorToken, useTheme, type StatusKey } from '@/theme';

const DOT = 7;
const RING_INSET = 4;

export interface StatusDotProps {
  status: StatusKey;
  live?: boolean;
}

export function StatusDot({ status, live = false }: StatusDotProps): React.JSX.Element {
  const theme = useTheme();
  const color = theme.colors[statusColorToken[status].solid];
  const ease = theme.motion.easeOut;
  const reduceMotion = useReducedMotion();
  const animate = live && !reduceMotion;

  const progress = useSharedValue(0);
  useEffect(() => {
    if (!animate) {
      progress.value = 0;
      return;
    }
    progress.value = withRepeat(
      withTiming(1, { duration: 1900, easing: Easing.bezier(ease[0], ease[1], ease[2], ease[3]) }),
      -1,
      false,
    );
  }, [animate, progress, ease]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.value, [0, 0.7, 1], [0.7, 1.55, 1.55]) }],
    opacity: interpolate(progress.value, [0, 0.7, 1], [0.6, 0, 0]),
  }));

  return (
    <View style={styles.wrap}>
      {animate && (
        <Animated.View
          pointerEvents="none"
          style={[styles.ring, { borderColor: color }, ringStyle]}
        />
      )}
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create(() => ({
  wrap: {
    width: DOT,
    height: DOT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
  },
  ring: {
    position: 'absolute',
    top: -RING_INSET,
    left: -RING_INSET,
    right: -RING_INSET,
    bottom: -RING_INSET,
    borderRadius: (DOT + RING_INSET * 2) / 2,
    borderWidth: 1.5,
  },
}));
