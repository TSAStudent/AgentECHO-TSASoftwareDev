import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
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
    {children}
  </View>
);
