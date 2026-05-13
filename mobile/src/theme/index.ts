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
    hairline: "rgba(245,247,255,0.08)",
    hairlineStrong: "rgba(245,247,255,0.12)",
    controlStroke: "rgba(110,120,190,0.45)",
    controlStrokeMuted: "rgba(245,247,255,0.16)",
  },
  stroke: {
    control: 2,
  },
  radius: {
    xs: 10,
    sm: 16,
    md: 20,
    lg: 26,
    xl: 32,
    pill: 999,
  },
  spacing: (n: number) => n * 4,
  type: {
    display: { fontSize: 31, lineHeight: 37, fontWeight: "700" as const, letterSpacing: -0.45 },
    title:   { fontSize: 20, lineHeight: 26, fontWeight: "600" as const, letterSpacing: -0.18 },
    h3:      { fontSize: 17, lineHeight: 23, fontWeight: "600" as const },
    body:    { fontSize: 15, lineHeight: 22, fontWeight: "400" as const },
    bodySm:  { fontSize: 13, lineHeight: 19, fontWeight: "400" as const },
    label:   { fontSize: 11, lineHeight: 14, fontWeight: "600" as const, letterSpacing: 0.55, textTransform: "uppercase" as const },
    overline: { fontSize: 10, lineHeight: 13, fontWeight: "600" as const, letterSpacing: 0.85, textTransform: "uppercase" as const },
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
