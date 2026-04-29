import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { theme } from "@/theme";

export const GradientBackground: React.FC<{ children?: React.ReactNode; style?: ViewStyle }> = ({
  children,
  style,
}) => (
  <View style={[StyleSheet.absoluteFill, style]}>
    <LinearGradient
      colors={["#07080F", "#0C0F24", "#0A0D1C"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
    {/* aurora blobs */}
    <View style={[styles.blob, { backgroundColor: theme.colors.primary, top: -120, left: -80 }]} />
    <View style={[styles.blob, { backgroundColor: theme.colors.accent,  top: 220, right: -100 }]} />
    <View style={[styles.blob, { backgroundColor: theme.colors.info,    bottom: -140, left: -40 }]} />
    {children}
  </View>
);

const styles = StyleSheet.create({
  blob: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 280,
    opacity: 0.14,
  },
});
