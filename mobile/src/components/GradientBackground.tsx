import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

/** Deep base + faint brand wash (same palette, reads intentional not flat). */
export const GradientBackground: React.FC<{ children?: React.ReactNode; style?: ViewStyle }> = ({
  children,
  style,
}) => (
  <View style={[StyleSheet.absoluteFill, style]} pointerEvents="box-none">
    <LinearGradient
      colors={["#07080F", "#0A0D18", "#080B14"]}
      locations={[0, 0.45, 1]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
    <LinearGradient
      colors={["rgba(124,92,255,0.14)", "transparent"]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.85, y: 0.55 }}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
    <LinearGradient
      colors={["transparent", "rgba(52,224,201,0.07)"]}
      start={{ x: 0.2, y: 0.35 }}
      end={{ x: 1, y: 1 }}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
    {children}
  </View>
);
