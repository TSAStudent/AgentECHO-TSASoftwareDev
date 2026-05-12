import React from "react";
import { Platform, Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useDerivedValue, useSharedValue, withSpring } from "react-native-reanimated";

const SPRING = { damping: 20, stiffness: 420, mass: 0.45 };

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, "style"> & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * Extra horizontal inset so scale transforms do not paint over siblings (dense rows).
   * Default small buffer; set 0 for full-bleed tiles.
   */
  scaleBuffer?: number;
};

/**
 * Subtle scale on press (all platforms) and on hover (web). Keeps deltas small to avoid overlap.
 */
export function PressableScale({ children, style, scaleBuffer = 2, onPressIn, onPressOut, onHoverIn, onHoverOut, ...rest }: Props) {
  const pressed = useSharedValue(false);
  const hovered = useSharedValue(false);

  /** Tight deltas — larger on-screen buttons need minimal growth to avoid overlap */
  const target = useDerivedValue(() => (pressed.value ? 0.992 : hovered.value ? 1.008 : 1));

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(target.value, SPRING) }],
  }));

  const pad = scaleBuffer ?? 0;

  return (
    <View style={pad ? { paddingHorizontal: pad, paddingVertical: 2 } : undefined}>
      <AnimatedPressable
        {...rest}
        style={[
          Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null,
          style,
          animated,
        ]}
      onPressIn={(e) => {
        pressed.value = true;
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = false;
        onPressOut?.(e);
      }}
      onHoverIn={(e) => {
        if (Platform.OS === "web") hovered.value = true;
        onHoverIn?.(e);
      }}
      onHoverOut={(e) => {
        if (Platform.OS === "web") hovered.value = false;
        onHoverOut?.(e);
      }}
    >
      {children}
    </AnimatedPressable>
    </View>
  );
}
