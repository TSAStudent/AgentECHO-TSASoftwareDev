import { getOpenAI, hasOpenAI } from "./openaiClient.js";

export async function ttsFromText({ text, voice = "alloy" }) {
  if (!hasOpenAI()) {
    return { audioBase64: "", mime: "audio/mpeg", demo: true };
  }
  const openai = getOpenAI();
  const res = await openai.audio.speech.create({
    model: "tts-1",
    voice,
    input: text,
    format: "mp3",
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return { audioBase64: buf.toString("base64"), mime: "audio/mpeg" };
}
