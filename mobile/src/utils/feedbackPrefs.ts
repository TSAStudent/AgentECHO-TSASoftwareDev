/** Shared gate for haptics + alert vibration (Settings → Haptic feedback). */
let getHapticsEnabled: () => boolean = () => true;

export function registerHapticsEnabled(get: () => boolean) {
  getHapticsEnabled = get;
}

export function isHapticsEnabled(): boolean {
  try {
    return getHapticsEnabled();
  } catch {
    return true;
  }
}
