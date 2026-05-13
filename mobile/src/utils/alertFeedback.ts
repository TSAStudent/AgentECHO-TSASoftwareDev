import { Platform, Vibration } from "react-native";

import { isHapticsEnabled } from "@/utils/feedbackPrefs";
import { haptic } from "@/utils/format";

/** Device vibration for alerts (Android patterns; iOS short pulses where supported). */
export function vibrateAlertPattern(kind: "light" | "medium" | "heavy") {
  if (!isHapticsEnabled()) return;
  if (Platform.OS === "web") return;
  try {
    if (Platform.OS === "android") {
      const patterns: Record<typeof kind, number | number[]> = {
        light: [0, 90, 50, 90],
        medium: [0, 180, 90, 180],
        heavy: [0, 280, 100, 280, 100, 420],
      };
      Vibration.vibrate(patterns[kind]);
    } else {
      const ms = kind === "light" ? 50 : kind === "medium" ? 120 : 220;
      Vibration.vibrate(ms);
    }
  } catch {
    /* no-op */
  }
}

export type SoundAlertTier = "emergency" | "high" | "medium" | "low";

/** Haptics + vibration for a classified ambient sound (respects Haptic feedback setting). */
export function feedbackForSoundEventTier(tier: SoundAlertTier) {
  void (async () => {
    if (!isHapticsEnabled()) return;
    if (tier === "emergency" || tier === "high") {
      vibrateAlertPattern("heavy");
      await haptic.warning();
    } else {
      vibrateAlertPattern("light");
      await haptic.light();
    }
  })();
}

export function feedbackForAmbientBanner(kind: "safety" | "info") {
  void (async () => {
    if (!isHapticsEnabled()) return;
    if (kind === "safety") {
      vibrateAlertPattern("heavy");
      await haptic.warning();
    } else {
      vibrateAlertPattern("medium");
      await haptic.light();
    }
  })();
}
