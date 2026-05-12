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
    marginBottom: 16,
    marginTop: 28,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.hairline,
  },
  eyebrow: {
    ...theme.type.overline,
    color: theme.colors.accent,
    marginBottom: 5,
    opacity: 0.92,
  },
  title: {
    ...theme.type.title,
    color: theme.colors.text,
    fontWeight: "600",
  },
});
