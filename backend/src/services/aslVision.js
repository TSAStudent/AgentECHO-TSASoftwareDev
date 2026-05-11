import { getOpenAI, hasOpenAI } from "./openaiClient.js";

const MODEL = process.env.ASL_VISION_MODEL || "gpt-4o";

/** Strip data-URL prefix / whitespace so OpenAI always gets raw base64. */
function normalizeImageBase64(b64) {
  if (!b64 || typeof b64 !== "string") return "";
  const s = b64.trim();
  const m = s.match(/^data:image\/[\w+.-]+;base64,(.+)$/i);
  const raw = (m ? m[1] : s).replace(/\s/g, "");
  return raw;
}

function normalizePriorSigns(priorSigns) {
  if (!Array.isArray(priorSigns)) return [];
  return priorSigns
    .map((x) => String(x ?? "").trim().toUpperCase().replace(/\s+/g, "_"))
    .filter(Boolean)
    .slice(-12);
}

/**
 * GPT-4o vision reads single frames from the mobile camera (JPEG).
 * Prior glosses give sequence context for fingerspelling / multi-sign phrases.
 */
const SYSTEM = `You are Agent ECHO's ASL recognition assistant. You receive one still frame from a front-facing camera (possibly mirrored).

Your job:
1. Decide whether BOTH hands (or the dominant signing hand) are clearly visible and the person appears to be signing—not idle, not blocked, not holding an object.
2. If the pose is unclear, hands are missing, or you cannot name the sign confidently, return an EMPTY gloss "" and confidence under 0.25.
3. Otherwise output ONE dominant ASL gloss for THIS frame only: a short English keyword or gloss convention in UPPERCASE with underscores if needed (e.g. HELLO, THANK_YOU, HOW_ARE_YOU, WHAT, NAME, YOU, PLEASE).
4. Do NOT invent glosses. Do NOT output facial expressions as gloss unless they are the signed meaning itself (e.g. HEAD_SHAKE for negation is acceptable only if visually obvious).
5. "englishGuess" must be a natural English sentence representing what the sequence probably means so far: take Prior signs in order, append or revise with the current gloss when confident. Use proper punctuation. If the current frame is unclear but priors exist, you MAY refine englishGuess using priors only and keep gloss "".

Respond in STRICT JSON only:
{
  "gloss": "UPPERCASE_GLOSS_OR_EMPTY_STRING",
  "englishGuess": "full English sentence or empty string if nothing to say yet",
  "confidence": 0.0,
  "notes": "very short rationale"
}`;

function coerceVisionResult(parsed) {
  const NONE = new Set(["", "NONE", "UNKNOWN", "UNSURE", "N/A", "NA", "NULL", "BLANK"]);
  let gloss = String(parsed?.gloss ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (NONE.has(gloss)) gloss = "";

  let englishGuess = String(parsed?.englishGuess ?? parsed?.english ?? "").trim();
  let confidence =
    typeof parsed?.confidence === "number" && Number.isFinite(parsed.confidence)
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0.45;

  if (!gloss && englishGuess && confidence < 0.35) englishGuess = "";

  const notes = String(parsed?.notes ?? "").slice(0, 240);

  return { gloss, englishGuess, confidence, notes };
}

export async function recognizeSign({ imageBase64, priorSigns = [] }) {
  const raw = normalizeImageBase64(imageBase64);
  if (!raw) return { gloss: "", englishGuess: "", confidence: 0, notes: "missing image" };

  if (!hasOpenAI()) return demoSign(normalizePriorSigns(priorSigns));

  const priors = normalizePriorSigns(priorSigns);
  const openai = getOpenAI();

  const resp = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    temperature: 0.15,
    max_tokens: 350,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `Prior signs (oldest → newest): ${priors.length ? priors.join(" → ") : "(none yet)"}\n` +
              `Return JSON for the SINGLE current frame. Prefer empty gloss when uncertain.`,
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${raw}`,
              detail: "high",
            },
          },
        ],
      },
    ],
  });

  try {
    const text = resp.choices?.[0]?.message?.content;
    if (!text) return { gloss: "", englishGuess: "", confidence: 0, notes: "empty model response" };
    return coerceVisionResult(JSON.parse(text));
  } catch {
    return { gloss: "", englishGuess: "", confidence: 0, notes: "parse error" };
  }
}

function demoSign(priors) {
  const demo = ["HELLO", "MY", "NAME", "SARAH", "NICE", "MEET", "YOU"];
  const next = demo[priors.length % demo.length];
  const seq = [...priors, next].join(" ").toLowerCase();
  const englishGuess = seq ? seq.charAt(0).toUpperCase() + seq.slice(1) + "." : "";
  return {
    gloss: next,
    englishGuess,
    confidence: 0.82,
    notes: "demo",
  };
}
