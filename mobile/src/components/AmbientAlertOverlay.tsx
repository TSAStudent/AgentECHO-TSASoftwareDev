import React, { useEffect, useRef } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { theme } from "@/theme";
import { useEcho } from "@/context/EchoContext";
import { navigateToSafetyTab } from "@/navigation/rootNavigationRef";
import { haptic } from "@/utils/format";
import { feedbackForAmbientBanner } from "@/utils/alertFeedback";

const INFO_AUTO_DISMISS_MS = 12_000;

/**
 * Full-screen takeover when ambient listening flags an important sound.
 */
export function AmbientAlertOverlay() {
  const insets = useSafeAreaInsets();
  const { ambientBanner, dismissAmbientBanner } = useEcho();
  const lastSafetyPulse = useRef<string | null>(null);
  const lastInfoPulse = useRef<string | null>(null);
  const infoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ambientBanner) return;
    if (ambientBanner.kind === "safety" && lastSafetyPulse.current !== ambientBanner.id) {
      lastSafetyPulse.current = ambientBanner.id;
      feedbackForAmbientBanner("safety");
    }
    if (ambientBanner.kind === "info") {
      if (lastInfoPulse.current !== ambientBanner.id) {
        lastInfoPulse.current = ambientBanner.id;
        feedbackForAmbientBanner("info");
      }
      if (infoTimerRef.current) clearTimeout(infoTimerRef.current);
      infoTimerRef.current = setTimeout(() => dismissAmbientBanner(), INFO_AUTO_DISMISS_MS);
      return () => {
        if (infoTimerRef.current) clearTimeout(infoTimerRef.current);
      };
    }
    return undefined;
  }, [ambientBanner, dismissAmbientBanner]);

  if (!ambientBanner) return null;

  const isSafety = ambientBanner.kind === "safety";

  const goSafety = () => {
    haptic.medium();
    dismissAmbientBanner();
    navigateToSafetyTab();
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => {
      if (!isSafety) dismissAmbientBanner();
    }}>
      <View style={styles.root}>
        <Pressable
          style={[StyleSheet.absoluteFillObject, styles.backdropTint, isSafety && styles.backdropTintSafety]}
          pointerEvents={isSafety ? "none" : "auto"}
          onPress={() => {
            if (!isSafety) {
              haptic.light();
              dismissAmbientBanner();
            }
          }}
        />
        <LinearGradient
          colors={
            isSafety
              ? ["rgba(180,40,60,0.42)", "rgba(12,14,28,0.96)", "rgba(5,6,16,0.98)"]
              : ["rgba(52,224,201,0.14)", "rgba(14,18,40,0.94)", "rgba(5,6,16,0.97)"]
          }
          locations={[0, 0.45, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        <View
          style={[
            styles.panelWrap,
            {
              paddingTop: Math.max(insets.top, 16) + 8,
              paddingBottom: Math.max(insets.bottom, 24) + 16,
            },
          ]}
          pointerEvents="box-none"
        >
          <View style={[styles.panel, !isSafety && styles.panelBleed]} pointerEvents="auto">
            <View style={styles.topRow}>
              <Text style={styles.eyebrow}>{isSafety ? "Safety" : "Something we heard"}</Text>
              <Pressable
                hitSlop={14}
                onPress={() => { haptic.light(); dismissAmbientBanner(); }}
                style={styles.iconBtn}
              >
                <Ionicons name="close" size={26} color={theme.colors.textDim} />
              </Pressable>
            </View>

            <Text style={[styles.headline, isSafety && styles.headlineSafety]}>{ambientBanner.headline}</Text>
            <Text style={styles.detail}>{ambientBanner.detail}</Text>

            <View style={[styles.actions, { marginTop: 32 }]}>
              {isSafety ? (
                <Pressable onPress={goSafety} style={styles.btnPrimary}>
                  <Ionicons name="shield-checkmark" size={20} color="#07080F" />
                  <Text style={styles.btnPrimaryText}>Get safety</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => { haptic.light(); dismissAmbientBanner(); }}
                style={[styles.btnGhost, !isSafety && styles.btnGhostWide]}
              >
                <Text style={styles.btnGhostText}>{isSafety ? "I’m OK · dismiss" : "Dismiss"}</Text>
              </Pressable>
            </View>

            {!isSafety ? (
              <Text style={styles.hint}>Tap the dimmed edge above or below, or use Dismiss.</Text>
            ) : (
              <Text style={styles.hint}>Treat seriously until you know it’s a false alarm.</Text>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdropTint: {
    backgroundColor: "rgba(5,6,16,0.88)",
  },
  backdropTintSafety: {
    backgroundColor: "rgba(48,10,18,0.9)",
  },
  panelWrap: {
    flex: 1,
    paddingHorizontal: 16,
  },
  panel: {
    flex: 1,
    justifyContent: "center",
    borderRadius: theme.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.hairline,
    backgroundColor: "rgba(17,20,42,0.82)",
    paddingHorizontal: 22,
    paddingVertical: 26,
    overflow: "hidden",
  },
  /** Narrow vertical gutters so “tap outside” still works on info alerts. */
  panelBleed: {
    marginVertical: 22,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  iconBtn: { padding: 4 },
  eyebrow: {
    ...theme.type.overline,
    color: theme.colors.textMute,
    letterSpacing: 0.75,
  },
  headline: {
    ...theme.type.display,
    fontSize: 28,
    lineHeight: 34,
    color: theme.colors.text,
  },
  headlineSafety: { color: "#FFD6DC" },
  detail: {
    ...theme.type.body,
    fontSize: 17,
    lineHeight: 26,
    color: theme.colors.textDim,
    marginTop: 14,
  },
  actions: { gap: 12 },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.danger,
  },
  btnPrimaryText: { ...theme.type.label, fontSize: 15, color: "#07080F" },
  btnGhost: {
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.hairline,
    alignItems: "center",
  },
  btnGhostWide: { width: "100%" },
  btnGhostText: { ...theme.type.label, color: theme.colors.text },
  hint: {
    ...theme.type.bodySm,
    color: theme.colors.textMute,
    marginTop: 18,
    textAlign: "center",
  },
});
