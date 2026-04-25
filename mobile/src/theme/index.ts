/**
 * Agent ECHO design system.
 *
 * Design goals:
 *   - Deaf-first accessibility: high contrast, very large touch targets,
 *     motion-rich visual feedback so missing audio is replaced by color,
 *     brightness, and haptics.
 *   - Premium "calm intelligence" feel: a near-black base with an aurora
 *     gradient accent (violet -> teal -> cyan) reserved for live events.
 *   - Severity encoded by color + glyph + motion so users who also have
 *     color-vision differences still get the signal.
 */

export const palette = {
  ink: "#07080F",
  inkSoft: "#0D1020",
  surface: "#11142A",
  surfaceHi: "#171B33",
  outline: "#242B4B",
  outlineSoft: "#1A2040",

  text: "#F5F7FF",
  textDim: "#A6ADCF",
  textMute: "#6F759A",

  primary: "#7C5CFF",    // violet
  primarySoft: "#3B2F7A",
  accent: "#34E0C9",     // teal
  accentSoft: "#0E4A44",
  info: "#6EA8FE",
  cyan: "#64F0FF",

  success: "#3DDC97",
  warning: "#FFB547",
  danger: "#FF5C7A",
  dangerDeep: "#8B0F2C",

  gradientAurora: ["#7C5CFF", "#34E0C9", "#64F0FF"] as const,
  gradientNight:  ["#0B0E22", "#121638", "#1A2050"] as const,
  gradientDanger: ["#FF5C7A", "#B0104E"] as const,
  gradientWarm:   ["#FFB547", "#FF6A88"] as const,
  gradientCalm:   ["#3A2F7A", "#1D2A66"] as const,
};

export const theme = {
  colors: {
    ...palette,
    bg: palette.ink,
    card: palette.surface,
  },
  radius: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 22,
    xl: 28,
    pill: 999,
  },
  spacing: (n: number) => n * 4,
  type: {
    display: { fontSize: 34, lineHeight: 40, fontWeight: "800" as const, letterSpacing: -0.5 },
    title:   { fontSize: 22, lineHeight: 28, fontWeight: "700" as const, letterSpacing: -0.2 },
    h3:      { fontSize: 17, lineHeight: 22, fontWeight: "700" as const },
    body:    { fontSize: 15, lineHeight: 21, fontWeight: "500" as const },
    bodySm:  { fontSize: 13, lineHeight: 18, fontWeight: "500" as const },
    label:   { fontSize: 11, lineHeight: 14, fontWeight: "700" as const, letterSpacing: 1.2, textTransform: "uppercase" as const },
    mono:    { fontSize: 12, lineHeight: 16, fontFamily: "Menlo" as const },
  },
};

export type Theme = typeof theme;

export const severityColor = (tier: string) => {
  switch (tier) {
    case "emergency": return palette.danger;
    case "high":      return palette.warning;
    case "medium":    return palette.accent;
    case "low":
    default:          return palette.info;
  }
};
