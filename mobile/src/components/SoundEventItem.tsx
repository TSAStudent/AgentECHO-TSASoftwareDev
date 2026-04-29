import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons, MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { theme, severityColor } from "@/theme";
import type { SoundEvent } from "@/context/EchoContext";
import { timeAgo } from "@/utils/format";

const iconFor = (icon: string, size = 20, color = "#fff") => {
  switch (icon) {
    case "flame":          return <Ionicons name="flame" size={size} color={color} />;
    case "triangle-alert": return <Feather name="alert-triangle" size={size} color={color} />;
    case "megaphone":      return <Ionicons name="megaphone" size={size} color={color} />;
    case "baby":           return <MaterialCommunityIcons name="baby-face-outline" size={size} color={color} />;
    case "dog":            return <MaterialCommunityIcons name="dog" size={size} color={color} />;
    case "bell":           return <Ionicons name="notifications" size={size} color={color} />;
    case "hand":           return <MaterialCommunityIcons name="hand-back-right-outline" size={size} color={color} />;
    case "microwave":      return <MaterialCommunityIcons name="microwave" size={size} color={color} />;
    case "oven":           return <MaterialCommunityIcons name="stove" size={size} color={color} />;
    case "shirt":          return <Ionicons name="shirt" size={size} color={color} />;
    case "droplet":        return <Ionicons name="water" size={size} color={color} />;
    case "phone":          return <Ionicons name="call" size={size} color={color} />;
    case "siren":          return <MaterialCommunityIcons name="alarm-light" size={size} color={color} />;
    case "user":           return <Ionicons name="person" size={size} color={color} />;
    case "message-circle": return <Ionicons name="chatbubble-ellipses" size={size} color={color} />;
    case "moon":           return <Ionicons name="moon" size={size} color={color} />;
    default:               return <Ionicons name="radio" size={size} color={color} />;
  }
};

export const SoundEventItem: React.FC<{ event: SoundEvent; onPress?: () => void }> = ({ event, onPress }) => {
  const color = severityColor(event.tier);
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={[styles.iconWrap, { backgroundColor: color + "22", borderColor: color + "66" }]}>
        {iconFor(event.icon, 22, color)}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{event.display}</Text>
        <Text style={styles.meta}>
          {event.room ? `${event.room} · ` : ""}
          {timeAgo(event.timestamp)}
          {" · "}
          {Math.round(event.confidence * 100)}%
        </Text>
      </View>
      {event.tier === "emergency" || event.tier === "high" ? (
        <View style={[styles.pill, { backgroundColor: color }]}>
          <Text style={styles.pillText}>{event.tier.toUpperCase()}</Text>
        </View>
      ) : (
        <Feather name="chevron-right" size={18} color={theme.colors.textMute} />
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    marginBottom: 8,
  },
  iconWrap: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  title: { ...theme.type.h3, color: theme.colors.text },
  meta:  { ...theme.type.bodySm, color: theme.colors.textDim, marginTop: 2 },
  pill: {
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: theme.radius.pill,
  },
  pillText: { ...theme.type.label, color: "#0a0a0a" },
});
