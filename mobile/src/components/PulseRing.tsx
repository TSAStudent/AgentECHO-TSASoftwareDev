import React, { useEffect } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";

type Props = {
  size?: number;
  color: string;
  active?: boolean;
  style?: ViewStyle;
  rings?: number;
  children?: React.ReactNode;
};

export const PulseRing: React.FC<Props> = ({
  size = 180, color, active = true, style, rings = 3, children,
}) => {
  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      {Array.from({ length: rings }).map((_, i) => (
        <Ring key={i} size={size} color={color} active={active} delay={i * 700} />
      ))}
      <View
        style={[
          StyleSheet.absoluteFillObject,
          {
            borderRadius: size,
            borderWidth: 2,
            borderColor: color + "66",
            alignItems: "center",
            justifyContent: "center",
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
};

const Ring: React.FC<{ size: number; color: string; active: boolean; delay: number }> = ({
  size, color, active, delay,
}) => {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    if (!active) {
      scale.value = withTiming(0.8, { duration: 300 });
      opacity.value = withTiming(0, { duration: 300 });
      return;
    }
    scale.value = withDelay(
      delay,
      withRepeat(
        withTiming(1.35, { duration: 2100, easing: Easing.out(Easing.cubic) }),
        -1,
        false,
      ),
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withTiming(0, { duration: 2100, easing: Easing.out(Easing.cubic) }),
        -1,
        false,
      ),
    );
  }, [active, delay, scale, opacity]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size,
          borderWidth: 2,
          borderColor: color,
        },
        animStyle,
      ]}
    />
  );
};
