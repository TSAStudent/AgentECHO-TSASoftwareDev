import React from "react";
import { StyleSheet, View, ViewProps, ViewStyle } from "react-native";
import { theme } from "@/theme";

type Props = ViewProps & {
  intensity?: "low" | "med" | "high";
  padded?: boolean;
  glow?: boolean;
  accent?: string;
};

export const GlassCard: React.FC<Props> = ({
  style, children, intensity = "med", padded = true, glow = false, accent, ...rest
}) => {
  const bg =
    intensity === "high" ? "rgba(32,36,68,0.72)" :
    intensity === "low"  ? "rgba(20,24,48,0.45)" :
                           "rgba(24,28,58,0.60)";
  const border = accent ?? theme.colors.outlineSoft;
  return (
    <View
      {...rest}
      style={[
        styles.card,
        { backgroundColor: bg, borderColor: border },
        padded && styles.padded,
        glow && { shadowColor: accent ?? theme.colors.primary, shadowOpacity: 0.4, shadowRadius: 22, shadowOffset: { width: 0, height: 8 } },
        style as ViewStyle,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  padded: {
    padding: 18,
  },
});
