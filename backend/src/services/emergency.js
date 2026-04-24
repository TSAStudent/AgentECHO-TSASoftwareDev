import twilio from "twilio";

function getTwilio() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !auth) return null;
  return twilio(sid, auth);
}

/**
 * Tiered emergency alert.
 *   level: "silent" | "nudge" | "alert" | "sos"
 *   trigger: "smoke_alarm", "scream", "panic_button", ...
 *   contacts: [{ name, phone }]
 *   location: { lat, lng, accuracy }
 */
export async function sendEmergencyAlert({ level, trigger, contacts, location, message }) {
  const client = getTwilio();
  const from = process.env.TWILIO_FROM_NUMBER;
  const body = buildBody({ level, trigger, location, message });

  if (!client || !from) {
    return {
      sent: false,
      reason: "Twilio not configured — running in demo mode.",
      preview: body,
      contacts,
      demo: true,
    };
  }

  const results = [];
  for (const c of contacts || []) {
    try {
      const msg = await client.messages.create({ from, to: c.phone, body });
      results.push({ name: c.name, phone: c.phone, sid: msg.sid, status: msg.status });
    } catch (err) {
      results.push({ name: c.name, phone: c.phone, error: err.message });
    }
  }
  // If the caller passed an empty trusted circle (e.g. user deleted every
  // contact), nothing was actually delivered — surface that honestly so the
  // UI can warn them instead of saying "Sent to Trusted Circle."
  const successCount = results.filter((r) => r.sid && !r.error).length;
  return {
    sent: successCount > 0,
    preview: body,
    results,
    reason: successCount === 0 ? "No contacts in Trusted Circle — add someone first." : undefined,
  };
}

function buildBody({ level, trigger, location, message }) {
  const lines = [];
  lines.push(`[Agent ECHO ${levelLabel(level)}]`);
  if (message) lines.push(message);
  else lines.push(defaultMessage(trigger));
  // Use `!= null` rather than a truthy check so that lat=0 or lng=0 (valid
  // coordinates) still attach a live-location link to the SMS.
  if (location?.lat != null && location?.lng != null) {
    lines.push(`Live location: https://maps.google.com/?q=${location.lat},${location.lng}`);
  }
  lines.push("Reply HELP if you're on the way.");
  return lines.join("\n");
}

function levelLabel(l) {
  switch (l) {
    case "sos":    return "SOS";
    case "alert":  return "ALERT";
    case "nudge":  return "HEADS-UP";
    default:       return "ALERT";
  }
}

function defaultMessage(trigger) {
  switch (trigger) {
    case "smoke_alarm": return "A smoke alarm was detected in my home.";
    case "glass_breaking": return "Glass breaking was detected in my home.";
    case "scream": return "A scream was detected nearby.";
    case "panic_button": return "I pressed the panic button in Agent ECHO.";
    default: return "I may need help. This is an automated alert from Agent ECHO.";
  }
}
