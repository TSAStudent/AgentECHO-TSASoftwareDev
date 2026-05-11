export function timeAgo(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function clock(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatDurationMs(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 1) return "< 1 min";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}h ${mm}m` : `${h}h`;
}

export const haptic = {
  light: async () => {
    try {
      const H = await import("expo-haptics");
      await H.impactAsync(H.ImpactFeedbackStyle.Light);
    } catch {}
  },
  medium: async () => {
    try {
      const H = await import("expo-haptics");
      await H.impactAsync(H.ImpactFeedbackStyle.Medium);
    } catch {}
  },
  heavy: async () => {
    try {
      const H = await import("expo-haptics");
      await H.impactAsync(H.ImpactFeedbackStyle.Heavy);
    } catch {}
  },
  success: async () => {
    try {
      const H = await import("expo-haptics");
      await H.notificationAsync(H.NotificationFeedbackType.Success);
    } catch {}
  },
  warning: async () => {
    try {
      const H = await import("expo-haptics");
      await H.notificationAsync(H.NotificationFeedbackType.Warning);
    } catch {}
  },
  error: async () => {
    try {
      const H = await import("expo-haptics");
      await H.notificationAsync(H.NotificationFeedbackType.Error);
    } catch {}
  },
};
