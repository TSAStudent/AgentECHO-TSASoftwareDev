import React from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { GradientBackground } from "@/components/GradientBackground";
import { theme, palette } from "@/theme";
import { haptic } from "@/utils/format";

/** Logo + CTA: dark blue lifted from `gradientNight` so it reads with ink bg + cards. */
const ONBOARD_SOLID = palette.gradientNight[2];

const BULLETS: { icon: keyof typeof Ionicons.glyphMap; text: string; color: string }[] = [
  { icon: "ear", text: "Ambient sound + name detection", color: theme.colors.primary },
  { icon: "sparkles", text: "Smart action capture from speech", color: theme.colors.info },
  { icon: "hand-left", text: "Sign ↔ voice bridge", color: theme.colors.primary },
  { icon: "shield-checkmark", text: "Trusted Circle emergency layer", color: theme.colors.danger },
];

export default function OnboardingScreen({ navigation }: NativeStackScreenProps<any>) {
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <GradientBackground />
      <LinearGradient
        colors={["rgba(26,32,80,0.35)", "transparent", "rgba(11,14,34,0.45)"]}
        locations={[0, 0.5, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.container}>
        <View style={styles.hero}>
          <View style={styles.logoCore}>
            <MaterialCommunityIcons name="waveform" size={56} color={theme.colors.text} />
          </View>
        </View>

        <View style={styles.copy}>
          <Text style={styles.eyebrow}>Agent ECHO</Text>
          <Text style={styles.title}>Sound and speech that stay in your corner.</Text>
          <Text style={styles.subtitle}>
            Built with Deaf and hard-of-hearing folks in mind. ECHO catches sound and speech in the
            background, turns it into useful cues and tasks, and keeps things calm so you're not
            living inside menus.
          </Text>

          <View style={styles.bulletCard}>
            {BULLETS.map((b) => (
              <View key={b.text} style={styles.bullet}>
                <Ionicons name={b.icon} size={18} color={b.color} />
                <Text style={styles.bulletText}>{b.text}</Text>
              </View>
            ))}
          </View>
        </View>

        <Pressable
          onPress={() => { haptic.medium(); navigation.replace("Main"); }}
          style={({ pressed }) => [
            styles.cta,
            {
              borderColor: theme.colors.controlStroke,
              transform: pressed ? [{ scale: 0.98 }] : undefined,
            },
          ]}
        >
          <Text style={styles.ctaText}>Activate ECHO</Text>
          <Ionicons name="arrow-forward" size={20} color={theme.colors.text} />
        </Pressable>

        <Text style={styles.foot}>
          Runs on your device first. You choose if anything is shared beyond it.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 40,
    justifyContent: "space-between",
  },
  hero: { alignItems: "center", marginTop: 8 },
  logoCore: {
    width: 150,
    height: 150,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ONBOARD_SOLID,
    borderWidth: theme.stroke.control,
    borderColor: theme.colors.controlStroke,
    shadowColor: theme.colors.info,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
  },
  copy: { flexShrink: 1 },
  eyebrow: {
    ...theme.type.overline,
    color: theme.colors.primary,
    marginBottom: 10,
  },
  title: {
    ...theme.type.display,
    color: theme.colors.text,
    marginBottom: 14,
    letterSpacing: -0.4,
  },
  subtitle: {
    ...theme.type.body,
    color: theme.colors.textDim,
    lineHeight: 23,
  },
  bulletCard: {
    marginTop: 20,
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.card,
    borderWidth: theme.stroke.control,
    borderColor: theme.colors.outlineSoft,
  },
  bullet: { flexDirection: "row", alignItems: "center", gap: 12 },
  bulletText: { ...theme.type.bodySm, color: theme.colors.text, flex: 1 },
  cta: {
    height: 58,
    borderRadius: theme.radius.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: theme.stroke.control,
    backgroundColor: ONBOARD_SOLID,
    shadowColor: theme.colors.info,
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  ctaText: { ...theme.type.title, color: theme.colors.text },
  foot: {
    ...theme.type.bodySm,
    color: theme.colors.textMute,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 20,
  },
});
