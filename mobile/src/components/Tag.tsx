import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { theme } from "@/theme";

export const Tag: React.FC<{ label: string; color?: string; icon?: React.ReactNode }> = ({
  label, color = theme.colors.accent, icon,
}) => (
  <View style={[styles.tag, { borderColor: color + "55", backgroundColor: color + "14" }]}>
    {icon}
    <Text style={[styles.text, { color }]}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  tag: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: "flex-start",
    gap: 6,
  },
  text: {
    ...theme.type.overline,
    letterSpacing: 0.65,
  },
});
