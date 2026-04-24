import { getOpenAI, hasOpenAI } from "./openaiClient.js";

/**
 * Uses GPT-4o vision as a working substitute for a fine-tuned WLASL /
 * How2Sign transformer. The mobile app captures a ~1s burst of frames and
 * sends the keyframe as base64 JPEG. We pass prior recognized signs as
 * context to improve continuity.
 */
const SYSTEM = `You are Agent ECHO's ASL recognizer. Given a still frame of a person signing,
return the most likely single ASL sign they are currently producing. Be extremely
conservative: if the frame is ambiguous, empty, or not clearly signing, return an
empty gloss.

Respond in STRICT JSON:
{
  "gloss": "UPPERCASE ASL GLOSS or empty string",
  "englishGuess": "natural English translation of the likely utterance so far",
  "confidence": 0.0-1.0,
  "notes": "short rationale"
}`;

export async function recognizeSign({ imageBase64, priorSigns = [] }) {
  if (!hasOpenAI()) return demoSign(priorSigns);

  const openai = getOpenAI();
  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.1,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Prior signs (most recent last): ${priorSigns.join(" ") || "(none)"}\nIdentify the current sign.`,
          },
          {
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${imageBase64}`, detail: "low" },
          },
        ],
      },
    ],
  });

  try {
    return JSON.parse(resp.choices[0].message.content);
  } catch {
    return { gloss: "", englishGuess: "", confidence: 0, notes: "parse error" };
  }
}

function demoSign(priorSigns) {
  const demo = ["HELLO", "MY", "NAME", "SARAH", "NICE", "MEET", "YOU"];
  const next = demo[priorSigns.length % demo.length];
  return {
    gloss: next,
    englishGuess: [...priorSigns, next].join(" ").toLowerCase().replace(/^./, (c) => c.toUpperCase()),
    confidence: 0.7,
    notes: "demo",
  };
}
