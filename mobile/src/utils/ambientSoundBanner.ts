export type AmbientBanner = {
  /** Matches the optimistic sound event id for stable keys */
  id: string;
  kind: "safety" | "info";
  headline: string;
  detail: string;
  label: string;
};

/** Short lines aligned with Safety tier cards (no em dash). */
const SAFETY_DETAIL: Partial<Record<string, string>> = {
  smoke_alarm:
    "Smoke or danger-style alarm heard. ECHO can flash, buzz, text contacts, and help you reach 911 from Safety.",
  glass_breaking:
    "Possible break-in sound. Use Safety for SOS and your trusted contacts.",
  scream:
    "ECHO can flash, buzz, and SMS your trusted circle from Safety.",
  siren:
    "Vehicle or emergency siren. Safety has haptics and direction cues.",
  baby_crying:
    "Baby audio picked up. Check in when you can. Safety is there if you need SOS.",
};

const INFO_DETAIL: Partial<Record<string, string>> = {
  doorbell: "Someone may be at the door. Check your doorbell or peephole when ready.",
  knock: "Knocking detected. Might be someone at the door.",
  phone_ringing: "Phone ringing detected nearby.",
  dog_barking: "Dog barking nearby.",
  name_called: "Your name may have been said nearby.",
};

/**
 * Ambient-only banners: urgent sounds get a Safety CTA; everyday sounds get a light notice.
 * Skips speech/silence/low tier to avoid spam.
 */
type SoundClassInput = {
  label: string;
  display: string;
  tier: "emergency" | "high" | "medium" | "low";
};

export function ambientBannerFromSound(e: SoundClassInput, eventId: string): AmbientBanner | null {
  const { label, display, tier } = e;
  if (label === "speech" || label === "silence") return null;
  if (tier === "low") return null;

  const base = { id: eventId, label, headline: display };

  if (tier === "emergency") {
    return {
      ...base,
      kind: "safety",
      detail: SAFETY_DETAIL[label] ?? "Open Safety for SOS, trusted contacts, and tools.",
    };
  }

  if (tier === "high") {
    if (label === "name_called") {
      return {
        ...base,
        kind: "info",
        detail: INFO_DETAIL.name_called ?? "",
      };
    }
    return {
      ...base,
      kind: "safety",
      detail: SAFETY_DETAIL[label] ?? "Open Safety for haptics, maps, and SOS.",
    };
  }

  if (tier === "medium") {
    return {
      ...base,
      kind: "info",
      detail: INFO_DETAIL[label] ?? "Detected while ambient listening was on.",
    };
  }

  return null;
}
