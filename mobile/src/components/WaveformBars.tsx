import React, { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
} from "react-native-reanimated";

type Props = {
  bars?: number;
  height?: number;
  active?: boolean;
  color?: string;
  gap?: number;
  barWidth?: number;
};

export const WaveformBars: React.FC<Props> = ({
  bars = 28, height = 64, active = true, color = "#7C5CFF", gap = 3, barWidth = 3,
}) => {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", height }}>
      {Array.from({ length: bars }).map((_, i) => (
        <Bar key={i} index={i} max={height} active={active} color={color} gap={gap} width={barWidth} bars={bars} />
      ))}
    </View>
  );
};

const Bar: React.FC<{
  index: number;
  max: number;
  active: boolean;
  color: string;
  gap: number;
  width: number;
  bars: number;
}> = ({ index, max, active, color, gap, width, bars }) => {
  const h = useSharedValue(6);
  useEffect(() => {
    if (!active) {
      h.value = withTiming(4, { duration: 200 });
      return;
    }
    const mid = bars / 2;
    const distance = Math.abs(index - mid) / mid;
    const amp = max * (1 - distance * 0.55);
    const base = 6 + Math.random() * 4;
    const dur = 420 + (index % 5) * 90;
    // Set the baseline BEFORE kicking off the animation. The previous version
    // assigned `base` via setTimeout 30ms after starting the animation, which
    // cancelled the running animation (Reanimated treats a plain-number assignment
    // as a cancel) and left every bar frozen at 6–10px. See PulseRing for the
    // correct withDelay/withRepeat pattern.
    h.value = base;
    h.value = withDelay(
      index * 30,
      withRepeat(
        withTiming(amp, { duration: dur, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      ),
    );
  }, [active, index, max, bars, h]);

  const animStyle = useAnimatedStyle(() => ({ height: h.value }));

  return (
    <Animated.View
      style={[
        {
          width,
          marginHorizontal: gap / 2,
          borderRadius: 2,
          backgroundColor: color,
        },
        animStyle,
      ]}
    />
  );
};
