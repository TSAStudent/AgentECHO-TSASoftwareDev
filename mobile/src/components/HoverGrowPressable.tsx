import React from "react";
import { Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const SPRING = { damping: 20, stiffness: 420, mass: 0.5 };
/** Small enough that default web margins keep the scaled control inside typical layouts. */
const HOVER_SCALE = 1.022;

/** Reserve space on web so hover scale is less likely to clip at scroll/screen edges. */
const WEB_HOVER_INSET: ViewStyle = {
  marginHorizontal: 3,
  marginVertical: 4,
  maxWidth: "100%",
};

type Props = Omit<PressableProps, "style"> & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Same as `Pressable`. On **web**, eases slightly larger on hover (no press shrink).
 * Applies light margins + `maxWidth: "100%"` on web so growth stays on-screen; your `style` can override margins.
 */
export function HoverGrowPressable({ children, style, onHoverIn, onHoverOut, ...rest }: Props) {
  const hovered = useSharedValue(false);
  const isWeb = Platform.OS === "web";

  const grow = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(isWeb && hovered.value ? HOVER_SCALE : 1, SPRING) }],
  }));

  return (
    <AnimatedPressable
      {...rest}
      style={[
        isWeb ? WEB_HOVER_INSET : null,
        style,
        isWeb ? ({ cursor: "pointer" } as ViewStyle) : null,
        grow,
      ]}
      onHoverIn={(e) => {
        if (isWeb) hovered.value = true;
        onHoverIn?.(e);
      }}
      onHoverOut={(e) => {
        if (isWeb) hovered.value = false;
        onHoverOut?.(e);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}
