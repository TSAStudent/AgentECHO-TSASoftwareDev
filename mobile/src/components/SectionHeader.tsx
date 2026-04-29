import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { theme } from "@/theme";

export const SectionHeader: React.FC<{ eyebrow?: string; title: string; action?: React.ReactNode }> = ({
  eyebrow, title, action,
}) => (
  <View style={styles.row}>
    <View>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
    </View>
    {action}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 12,
    marginTop: 24,
  },
  eyebrow: {
    ...theme.type.label,
    color: theme.colors.accent,
    marginBottom: 4,
  },
  title: {
    ...theme.type.title,
    color: theme.colors.text,
  },
});
