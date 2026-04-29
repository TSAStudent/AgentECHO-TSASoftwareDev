import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { theme } from "@/theme";

export const Tag: React.FC<{ label: string; color?: string; icon?: React.ReactNode }> = ({
  label, color = theme.colors.accent, icon,
}) => (
  <View style={[styles.tag, { borderColor: color + "66", backgroundColor: color + "1A" }]}>
    {icon}
    <Text style={[styles.text, { color }]}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  tag: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    alignSelf: "flex-start",
    gap: 5,
  },
  text: {
    ...theme.type.label,
  },
});
