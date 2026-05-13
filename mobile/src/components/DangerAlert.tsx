import React, { useEffect, useRef } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { theme } from "@/theme";
import { haptic } from "@/utils/format";
import { vibrateAlertPattern } from "@/utils/alertFeedback";

export type DangerAlertPayload = {
  label: string;
  display: string;
  tier: "emergency" | "high" | "medium" | "low";
  icon: string;
  confidence: number;
  direction?: string | null;
  detectedAt: number;
};

type Props = {
  alert: DangerAlertPayload | null;
  onDismiss: () => void;
  onCallSos: () => void;
};

const dangerIcon = (icon: string, size = 44, color = "#fff") => {
  switch (icon) {
    case "flame":          return <Ionicons name="flame" size={size} color={color} />;
    case "siren":          return <MaterialCommunityIcons name="alarm-light" size={size} color={color} />;
    case "megaphone":      return <Ionicons name="megaphone" size={size} color={color} />;
    case "triangle-alert": return <Feather name="alert-triangle" size={size} color={color} />;
    default:               return <Feather name="alert-octagon" size={size} color={color} />;
  }
};

const adviceFor = (label: string): string => {
  switch (label) {
    case "smoke_alarm":
      return "Possible fire. Move to fresh air, check for smoke, and exit if unsafe.";
    case "siren":
      return "Emergency vehicle nearby. Be alert to traffic and surroundings.";
    case "scream":
      return "Someone may be in distress. Check on the source if it's safe.";
    case "glass_breaking":
      return "Possible break-in or accident. Stay away from the area and check safety.";
    case "gunshot":
      return "Possible gunfire detected. Take cover, get away, and call 911.";
    case "explosion":
      return "Loud blast detected. Move to safety and assess the area.";
    case "car_alarm":
      return "Vehicle alarm in range. Could indicate tampering — check if relevant.";
    default:
      return "Stay alert and check your surroundings.";
  }
};

export const DangerAlert: React.FC<Props> = ({ alert, onDismiss, onCallSos }) => {
  const visible = !!alert;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    vibrateAlertPattern("heavy");
    haptic.heavy();
    const burst = setTimeout(() => haptic.heavy(), 220);
    const burst2 = setTimeout(() => haptic.warning(), 460);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      clearTimeout(burst);
      clearTimeout(burst2);
      loop.stop();
    };
  }, [visible, pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <LinearGradient
          colors={[theme.colors.dangerDeep, "rgba(11,12,28,0.92)"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View style={[styles.halo, { opacity: haloOpacity, transform: [{ scale }] }]} />

        <View style={styles.card}>
          <View style={styles.iconWrap}>
            {alert ? dangerIcon(alert.icon, 52, "#FFE4EC") : null}
          </View>

          <Text style={styles.eyebrow}>DANGER DETECTED</Text>
          <Text style={styles.title}>{alert?.display || "Dangerous sound"}</Text>
          <Text style={styles.confidence}>
            {alert ? `${Math.round((alert.confidence || 0) * 100)}% match` : ""}
            {alert?.direction ? `  ·  from the ${alert.direction}` : ""}
          </Text>

          <Text style={styles.advice}>{alert ? adviceFor(alert.label) : ""}</Text>

          <View style={styles.actions}>
            <Pressable onPress={onDismiss} style={[styles.btn, styles.btnGhost]}>
              <Feather name="check" size={16} color={theme.colors.text} />
              <Text style={[styles.btnText, { color: theme.colors.text }]}>I'm safe</Text>
            </Pressable>
            <Pressable onPress={onCallSos} style={[styles.btn, styles.btnSos]}>
              <Ionicons name="shield" size={16} color="#0A0712" />
              <Text style={[styles.btnText, { color: "#0A0712" }]}>Open SOS</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
  },
  halo: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 320,
    backgroundColor: theme.colors.danger,
    top: "50%",
    marginTop: -160,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: theme.radius.xl,
    backgroundColor: "rgba(20,8,18,0.92)",
    borderWidth: 1,
    borderColor: theme.colors.danger,
    padding: 22,
    alignItems: "center",
    shadowColor: theme.colors.danger,
    shadowOpacity: 0.6,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
  },
  iconWrap: {
    width: 88, height: 88, borderRadius: 88,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,92,122,0.2)",
    borderWidth: 2, borderColor: theme.colors.danger,
    marginBottom: 14,
  },
  eyebrow: {
    ...theme.type.label,
    color: theme.colors.danger,
    letterSpacing: 2,
    marginBottom: 4,
  },
  title: {
    ...theme.type.display,
    color: theme.colors.text,
    textAlign: "center",
  },
  confidence: {
    ...theme.type.bodySm,
    color: "#FFB6C5",
    marginTop: 4,
  },
  advice: {
    ...theme.type.body,
    color: theme.colors.text,
    textAlign: "center",
    marginTop: 14,
    opacity: 0.92,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 22,
    width: "100%",
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
  },
  btnGhost: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  btnSos: {
    backgroundColor: theme.colors.danger,
  },
  btnText: { ...theme.type.h3 },
});
