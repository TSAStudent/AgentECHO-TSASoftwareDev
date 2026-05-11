import { getOpenAI, hasOpenAI } from "./openaiClient.js";

/** OpenAI TTS speed: 0.25–4.0 (API default is 1.0). Slightly slower for clarity. */
function defaultTtsSpeed() {
  const raw = process.env.TTS_SPEED;
  if (raw == null || raw === "") return 0.86;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(4, Math.max(0.25, n)) : 0.86;
}

export async function ttsFromText({ text, voice = "alloy", speed } = {}) {
  if (!hasOpenAI()) {
    return { audioBase64: "", mime: "audio/mpeg", demo: true };
  }
  const s =
    typeof speed === "number" && Number.isFinite(speed)
      ? Math.min(4, Math.max(0.25, speed))
      : defaultTtsSpeed();
  const openai = getOpenAI();
  const res = await openai.audio.speech.create({
    model: "tts-1",
    voice,
    input: text,
    format: "mp3",
    speed: s,
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return { audioBase64: buf.toString("base64"), mime: "audio/mpeg" };
}
