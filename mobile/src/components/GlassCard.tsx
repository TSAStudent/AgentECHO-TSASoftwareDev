import React from "react";
import { Platform, StyleSheet, View, ViewProps, ViewStyle } from "react-native";
import { theme } from "@/theme";

type Props = ViewProps & {
  intensity?: "low" | "med" | "high";
  padded?: boolean;
  glow?: boolean;
  accent?: string;
};

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  android: { elevation: 3 },
  default: {},
});

export const GlassCard: React.FC<Props> = ({
  style, children, intensity = "med", padded = true, glow = false, accent, ...rest
}) => {
  const bg =
    intensity === "high" ? "rgba(30,33,58,0.78)" :
    intensity === "low"  ? "rgba(18,21,42,0.48)" :
                           "rgba(22,25,52,0.64)";
  const border = accent ?? theme.colors.hairline;
  return (
    <View
      {...rest}
      style={[
        styles.card,
        cardShadow,
        { backgroundColor: bg, borderColor: border },
        padded && styles.padded,
        glow && {
          shadowColor: accent ?? theme.colors.primary,
          shadowOpacity: Platform.OS === "ios" ? 0.28 : undefined,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 8 },
          ...(Platform.OS === "android" ? { elevation: 8 } : {}),
        },
        style as ViewStyle,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  padded: {
    padding: 20,
  },
});
