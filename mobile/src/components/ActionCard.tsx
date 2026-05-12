import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/theme";
import type { CapturedAction } from "@/context/EchoContext";
import { timeAgo } from "@/utils/format";
import { haptic } from "@/utils/format";
import { PressableScale } from "@/components/PressableScale";

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
  /** Strong title strikethrough + dimming when done (e.g. Home calendar strip). */
  emphasizeCompletedStrike?: boolean;
  onToggle?: () => void;
}> = ({ action, emphasizeCompletedStrike, onToggle }) => {
  const icon = iconFor(action.type);
  const priorityColor =
    action.priority === "urgent" ? theme.colors.danger :
    action.priority === "high"   ? theme.colors.warning :
    action.priority === "medium" ? theme.colors.accent  :
                                   theme.colors.info;

  const strikeDone = emphasizeCompletedStrike && action.done;

  return (
    <View
      style={[
        styles.card,
        { borderLeftColor: priorityColor },
        action.done && { opacity: emphasizeCompletedStrike ? 0.5 : 0.55 },
      ]}
    >
      <View style={styles.head}>
        <View style={[styles.iconWrap, { backgroundColor: icon.color + "22", borderColor: icon.color + "66" }]}>
          <Ionicons name={icon.name as any} size={20} color={icon.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, strikeDone && styles.titleStrikeHeavy, action.done && !strikeDone && styles.titleStrikeSoft]}>
            {action.title}
          </Text>
          <Text style={[styles.meta, strikeDone && styles.metaStrike]}>
            {action.type.toUpperCase()} · {timeAgo(action.createdAt)} · {Math.round(action.confidence * 100)}% sure
          </Text>
        </View>
        <PressableScale
          scaleBuffer={0}
          onPress={() => { haptic.light(); onToggle?.(); }}
          hitSlop={10}
          style={[styles.check, action.done && { backgroundColor: theme.colors.success, borderColor: theme.colors.success }]}
        >
          {action.done ? <Ionicons name="checkmark" size={16} color="#0a0a0a" /> : null}
        </PressableScale>
      </View>

      {action.detail ? (
        <Text style={[styles.detail, strikeDone && styles.detailStrike]}>{action.detail}</Text>
      ) : null}

      {action.sourceQuote ? (
        <View style={styles.quoteWrap}>
          <Ionicons name="ear" size={12} color={theme.colors.textMute} />
          <Text style={[styles.quote, strikeDone && styles.quoteStrike]}>&ldquo;{action.sourceQuote}&rdquo;</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(22,25,52,0.45)",
    borderRadius: theme.radius.lg,
    borderWidth: theme.stroke.control,
    borderColor: theme.colors.controlStroke,
    borderLeftWidth: 4,
    padding: 16,
    marginBottom: 12,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: {
    width: 40, height: 40, borderRadius: theme.radius.md,
    borderWidth: theme.stroke.control, alignItems: "center", justifyContent: "center",
  },
  title: { ...theme.type.h3, color: theme.colors.text },
  titleStrikeSoft: { textDecorationLine: "line-through", textDecorationStyle: "solid" },
  titleStrikeHeavy: {
    ...theme.type.title,
    fontSize: 21,
    lineHeight: 27,
    color: theme.colors.textMute,
    textDecorationLine: "line-through",
    textDecorationStyle: "solid",
  },
  meta: { ...theme.type.overline, color: theme.colors.textMute, marginTop: 5, letterSpacing: 0.5 },
  metaStrike: {
    textDecorationLine: "line-through",
    textDecorationStyle: "solid",
    color: theme.colors.textMute,
    opacity: 0.85,
  },
  detail: { ...theme.type.body, color: theme.colors.textDim, marginTop: 10 },
  detailStrike: {
    textDecorationLine: "line-through",
    textDecorationStyle: "solid",
    color: theme.colors.textMute,
  },
  quoteWrap: {
    flexDirection: "row", alignItems: "flex-start", gap: 6,
    marginTop: 10, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.hairline,
  },
  quote: { ...theme.type.bodySm, color: theme.colors.textMute, fontStyle: "italic", flex: 1 },
  quoteStrike: {
    textDecorationLine: "line-through",
    textDecorationStyle: "solid",
    color: theme.colors.textMute,
  },
  check: {
    width: 32, height: 32, borderRadius: theme.radius.md,
    borderWidth: theme.stroke.control, borderColor: theme.colors.controlStroke,
    alignItems: "center", justifyContent: "center",
  },
});
