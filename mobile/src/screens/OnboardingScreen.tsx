import React from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { GradientBackground } from "@/components/GradientBackground";
import { PulseRing } from "@/components/PulseRing";
import { theme } from "@/theme";
import { haptic } from "@/utils/format";

export default function OnboardingScreen({ navigation }: NativeStackScreenProps<any>) {
  return (
    <View style={{ flex: 1 }}>
      <GradientBackground />
      <View style={styles.container}>
        <View style={styles.hero}>
          <PulseRing size={220} color={theme.colors.accent} rings={4}>
            <LinearGradient
              colors={theme.colors.gradientAurora}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logoCore}
            >
              <MaterialCommunityIcons name="waveform" size={56} color="#07080F" />
            </LinearGradient>
          </PulseRing>
        </View>

        <View style={styles.copy}>
          <Text style={styles.eyebrow}>AGENT ECHO</Text>
          <Text style={styles.title}>Your ears, voice, and{"\n"}executive assistant.</Text>
          <Text style={styles.subtitle}>
            Always-on AI built for the Deaf and hard-of-hearing community.
            ECHO listens, understands context, and quietly acts on your behalf —
            so you never have to open an app again.
          </Text>

          <View style={styles.bullets}>
            {[
              { icon: "ear",                 text: "Ambient sound + name detection" },
              { icon: "sparkles",            text: "Smart action capture from speech" },
              { icon: "hand-left",           text: "Two-way ASL translation" },
              { icon: "shield-checkmark",    text: "Trusted Circle emergency layer" },
            ].map((b) => (
              <View key={b.icon} style={styles.bullet}>
                <Ionicons name={b.icon as any} size={18} color={theme.colors.accent} />
                <Text style={styles.bulletText}>{b.text}</Text>
              </View>
            ))}
          </View>
        </View>

        <Pressable
          onPress={() => { haptic.medium(); navigation.replace("Main"); }}
          style={({ pressed }) => [styles.cta, pressed && { transform: [{ scale: 0.98 }] }]}
        >
          <LinearGradient
            colors={theme.colors.gradientAurora}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.ctaText}>Activate ECHO</Text>
          <Ionicons name="arrow-forward" size={20} color="#07080F" />
        </Pressable>

        <Text style={styles.foot}>
          Everything runs privately on-device by default. You choose when to share.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 80, paddingBottom: 40, justifyContent: "space-between" },
  hero: { alignItems: "center", marginTop: 20 },
  logoCore: {
    width: 150, height: 150, borderRadius: 48,
    alignItems: "center", justifyContent: "center",
    shadowColor: theme.colors.primary, shadowOpacity: 0.8, shadowRadius: 30,
  },
  copy: {},
  eyebrow: { ...theme.type.label, color: theme.colors.accent, marginBottom: 12 },
  title: { ...theme.type.display, color: theme.colors.text, marginBottom: 12 },
  subtitle: { ...theme.type.body, color: theme.colors.textDim },
  bullets: { marginTop: 22, gap: 10 },
  bullet: { flexDirection: "row", alignItems: "center", gap: 10 },
  bulletText: { ...theme.type.body, color: theme.colors.text },
  cta: {
    height: 58, borderRadius: theme.radius.lg,
    overflow: "hidden",
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    shadowColor: theme.colors.primary, shadowOpacity: 0.5, shadowRadius: 24,
  },
  ctaText: { ...theme.type.title, color: "#07080F" },
  foot: { ...theme.type.bodySm, color: theme.colors.textMute, textAlign: "center", marginTop: 16 },
});
