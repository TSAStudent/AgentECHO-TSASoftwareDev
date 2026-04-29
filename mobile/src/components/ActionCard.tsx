import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/theme";
import type { CapturedAction } from "@/context/EchoContext";
import { timeAgo } from "@/utils/format";
import { haptic } from "@/utils/format";

const iconFor = (type: CapturedAction["type"]) => {
  switch (type) {
    case "calendar":   return { name: "calendar",    color: theme.colors.primary };
    case "reminder":   return { name: "alarm",       color: theme.colors.info };
    case "shopping":   return { name: "cart",        color: theme.colors.accent };
    case "contact":    return { name: "person-add",  color: theme.colors.cyan };
    case "medication": return { name: "medkit",      color: theme.colors.warning };
    case "followup":   return { name: "mail",        color: theme.colors.success };
    default:           return { name: "document-text", color: theme.colors.textDim };
  }
};

export const ActionCard: React.FC<{
  action: CapturedAction;
  onToggle?: () => void;
  onSchedule?: () => void;
}> = ({ action, onToggle, onSchedule }) => {
  const icon = iconFor(action.type);
  const priorityColor =
    action.priority === "urgent" ? theme.colors.danger :
    action.priority === "high"   ? theme.colors.warning :
    action.priority === "medium" ? theme.colors.accent  :
                                   theme.colors.info;

  return (
    <View style={[styles.card, { borderLeftColor: priorityColor }, action.done && { opacity: 0.55 }]}>
      <View style={styles.head}>
        <View style={[styles.iconWrap, { backgroundColor: icon.color + "22", borderColor: icon.color + "66" }]}>
          <Ionicons name={icon.name as any} size={20} color={icon.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, action.done && { textDecorationLine: "line-through" }]}>{action.title}</Text>
          <Text style={styles.meta}>
            {action.type.toUpperCase()} · {timeAgo(action.createdAt)} · {Math.round(action.confidence * 100)}% sure
          </Text>
        </View>
        <Pressable
          onPress={() => { haptic.light(); onToggle?.(); }}
          hitSlop={10}
          style={[styles.check, action.done && { backgroundColor: theme.colors.success, borderColor: theme.colors.success }]}
        >
          {action.done ? <Ionicons name="checkmark" size={16} color="#0a0a0a" /> : null}
        </Pressable>
      </View>

      {action.detail ? <Text style={styles.detail}>{action.detail}</Text> : null}

      {action.sourceQuote ? (
        <View style={styles.quoteWrap}>
          <Ionicons name="ear" size={12} color={theme.colors.textMute} />
          <Text style={styles.quote}>&ldquo;{action.sourceQuote}&rdquo;</Text>
        </View>
      ) : null}

      {onSchedule && !action.done ? (
        <Pressable style={styles.action} onPress={onSchedule}>
          <Ionicons name="add" size={14} color={theme.colors.primary} />
          <Text style={styles.actionText}>Add to Calendar</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    borderLeftWidth: 4,
    padding: 14,
    marginBottom: 10,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconWrap: {
    width: 38, height: 38, borderRadius: 12,
    borderWidth: 1, alignItems: "center", justifyContent: "center",
  },
  title: { ...theme.type.h3, color: theme.colors.text },
  meta:  { ...theme.type.label, color: theme.colors.textMute, marginTop: 4 },
  detail: { ...theme.type.body, color: theme.colors.textDim, marginTop: 10 },
  quoteWrap: {
    flexDirection: "row", alignItems: "flex-start", gap: 6,
    marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: theme.colors.outlineSoft,
  },
  quote: { ...theme.type.bodySm, color: theme.colors.textMute, fontStyle: "italic", flex: 1 },
  check: {
    width: 26, height: 26, borderRadius: 26,
    borderWidth: 1.5, borderColor: theme.colors.outline,
    alignItems: "center", justifyContent: "center",
  },
  action: {
    flexDirection: "row", alignItems: "center", gap: 4,
    marginTop: 10, alignSelf: "flex-start",
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primary + "22",
    borderWidth: 1, borderColor: theme.colors.primary + "44",
  },
  actionText: { ...theme.type.label, color: theme.colors.primary },
});
