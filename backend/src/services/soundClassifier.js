import { getOpenAI, hasOpenAI } from "./openaiClient.js";

/**
 * Real ambient sound classifier.
 *
 * Whisper is the best general-purpose audio model we have API access to; it
 * accepts m4a/webm/wav/mp3 and, when primed with the right prompt, will ALSO
 * emit bracketed descriptions of non-speech events like "[doorbell ringing]"
 * or "[dog barking]". We exploit that to cover both speech and ambient sound:
 *
 *   1. Transcribe the ~5s chunk with Whisper + a targeted prompt.
 *   2. Look for high-signal patterns in the transcript (user's name,
 *      emergency words, bracketed sound descriptions).
 *   3. Anything left ambiguous is sent to GPT-4o-mini as a text classifier
 *      that maps free-form descriptions onto our 16-label catalog.
 *
 * A deterministic mock is used when OpenAI isn't configured so the UI always
 * has something to render.
 */

const CATALOG = [
  { label: "smoke_alarm",      display: "Smoke alarm",      tier: "emergency", icon: "flame" },
  { label: "glass_breaking",   display: "Glass breaking",   tier: "emergency", icon: "triangle-alert" },
  { label: "scream",           display: "Scream / help",    tier: "emergency", icon: "megaphone" },
  { label: "baby_crying",      display: "Baby crying",      tier: "high",      icon: "baby" },
  { label: "dog_barking",      display: "Dog barking",      tier: "medium",    icon: "dog" },
  { label: "doorbell",         display: "Doorbell",         tier: "medium",    icon: "bell" },
  { label: "knock",            display: "Knocking",         tier: "medium",    icon: "hand" },
  { label: "microwave_beep",   display: "Microwave timer",  tier: "low",       icon: "microwave" },
  { label: "oven_beep",        display: "Oven timer",       tier: "low",       icon: "oven" },
  { label: "washer_done",      display: "Washer finished",  tier: "low",       icon: "shirt" },
  { label: "water_running",    display: "Water running",    tier: "low",       icon: "droplet" },
  { label: "phone_ringing",    display: "Phone ringing",    tier: "medium",    icon: "phone" },
  { label: "siren",            display: "Siren (emergency vehicle)", tier: "high", icon: "siren" },
  { label: "name_called",      display: "Your name called", tier: "high",      icon: "user" },
  { label: "speech",           display: "Conversation",     tier: "low",       icon: "message-circle" },
  { label: "silence",          display: "Silence",          tier: "low",       icon: "moon" },
];

const WHISPER_PROMPT = [
  "This is a short ambient audio clip from a home environment.",
  "Transcribe any speech verbatim.",
  "If non-speech sounds are present, describe them in square brackets — for example:",
  "[doorbell ringing], [smoke alarm beeping], [dog barking], [glass breaking],",
  "[baby crying], [phone ringing], [microwave beeping], [siren], [knocking], [water running], [scream].",
  "If the clip is silent, return an empty string.",
].join(" ");

export async function classifySound(buffer, { userName, filename = "chunk.m4a" } = {}) {
  // No audio? Nothing to do.
  if (!buffer || buffer.length < 256) return demoResult("silence", { demo: !hasOpenAI() });
  if (!hasOpenAI()) return demoBySize(buffer);

  try {
    const openai = getOpenAI();
    const file = await blobFromBuffer(buffer, filename);
    const asr = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      response_format: "verbose_json",
      prompt: WHISPER_PROMPT,
      temperature: 0,
    });

    const text = (asr.text || "").trim();
    const segs = asr.segments || [];
    const avgNoSpeech = segs.length ? segs.reduce((a, s) => a + (s.no_speech_prob || 0), 0) / segs.length : 1;

    // ----- 1. Fast-path silence detection -----
    if (!text || text.length < 2 || avgNoSpeech > 0.85) {
      return makeResult("silence", 0.92, { text });
    }

    // ----- 2. Fast-path keyword/name match -----
    const keyword = keywordMatch(text, userName);
    if (keyword) return keyword;

    // ----- 3. LLM classification of the transcript -----
    const classification = await classifyTranscript(openai, text);
    return classification;
  } catch (err) {
    console.error("[soundClassifier]", err.message);
    return demoBySize(buffer);
  }
}

/**
 * Fast heuristics for the highest-signal, most time-critical events. We want
 * these to fire in <50ms without a second LLM round-trip: a "help" scream or
 * the user hearing their own name should light up the UI instantly.
 */
function keywordMatch(text, userName) {
  const lower = text.toLowerCase();

  // Bracketed descriptors from Whisper's own prompt response.
  const bracket = lower.match(/\[([^\]]+)\]/g);
  if (bracket) {
    for (const b of bracket) {
      const lab = bracketToLabel(b);
      if (lab) return makeResult(lab, 0.88, { text, via: "whisper_bracket" });
    }
  }

  // User's name — only a word-boundary match counts ("Sarah" yes, "Sarahn" no).
  if (userName) {
    const re = new RegExp(`\\b${escapeRegex(userName)}\\b`, "i");
    if (re.test(text)) return makeResult("name_called", 0.95, { text, via: "name" });
  }

  // Urgent speech.
  if (/\b(help|fire|emergency|call\s*911|someone\s*help)\b/i.test(text)) {
    return makeResult("scream", 0.9, { text, via: "urgent_words" });
  }

  return null;
}

function bracketToLabel(b) {
  const s = b.toLowerCase();
  if (/smoke|fire alarm/.test(s)) return "smoke_alarm";
  if (/glass|shatter/.test(s)) return "glass_breaking";
  if (/scream|yell|shout/.test(s)) return "scream";
  if (/baby|crying/.test(s)) return "baby_crying";
  if (/dog|bark/.test(s)) return "dog_barking";
  if (/doorbell|chime/.test(s)) return "doorbell";
  if (/knock/.test(s)) return "knock";
  if (/microwave/.test(s)) return "microwave_beep";
  if (/oven/.test(s)) return "oven_beep";
  if (/washer|laundry/.test(s)) return "washer_done";
  if (/water|faucet|running water/.test(s)) return "water_running";
  if (/phone|ring/.test(s)) return "phone_ringing";
  if (/siren|police|ambulance|firetruck/.test(s)) return "siren";
  return null;
}

async function classifyTranscript(openai, text) {
  const labels = CATALOG.map((c) => c.label).join(", ");
  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content: [
          "Classify an ambient audio transcript into exactly ONE label from this list:",
          labels,
          "Rules:",
          "- If it's a plain conversation, use 'speech'.",
          "- If it's mostly noise or you're unsure, use 'silence'.",
          "- Respond JSON: {\"label\":\"<label>\", \"confidence\":0.0-1.0, \"reason\":\"<short>\"}",
        ].join("\n"),
      },
      { role: "user", content: `Transcript: "${text}"` },
    ],
  });

  try {
    const parsed = JSON.parse(resp.choices[0].message.content);
    const known = CATALOG.some((c) => c.label === parsed.label);
    const label = known ? parsed.label : "speech";
    const confidence = clamp(parsed.confidence, 0.4, 0.98);
    return makeResult(label, confidence, { text, reason: parsed.reason });
  } catch {
    return makeResult("speech", 0.5, { text });
  }
}

function makeResult(label, confidence, meta = {}) {
  const entry = CATALOG.find((c) => c.label === label) || CATALOG.find((c) => c.label === "speech");
  const all = CATALOG.map((c, i) => ({
    ...c,
    confidence: c.label === label ? confidence : Math.max(0.02, 0.35 - Math.abs(i - CATALOG.indexOf(entry)) * 0.04),
  }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
  return {
    top: { ...entry, confidence },
    candidates: all,
    meta,
    timestamp: new Date().toISOString(),
  };
}

function demoBySize(buffer) {
  const size = buffer?.length || 0;
  const idx = size === 0 ? CATALOG.length - 1 : size % CATALOG.length;
  const top = CATALOG[idx];
  const all = CATALOG.map((c, i) => ({
    ...c,
    confidence: Math.max(0.02, 1 - Math.abs(i - idx) * 0.12),
  }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
  return { top: { ...top, confidence: all[0].confidence }, candidates: all, timestamp: new Date().toISOString(), demo: true };
}

function demoResult(label, extra) {
  const entry = CATALOG.find((c) => c.label === label);
  return {
    top: { ...entry, confidence: 0.9 },
    candidates: [{ ...entry, confidence: 0.9 }],
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

async function blobFromBuffer(buffer, filename) {
  const { File } = await import("node:buffer");
  return new File([buffer], filename, { type: mimeFor(filename) });
}

function mimeFor(name) {
  const n = (name || "").toLowerCase();
  if (n.endsWith(".m4a")) return "audio/mp4";
  if (n.endsWith(".mp3")) return "audio/mpeg";
  if (n.endsWith(".wav")) return "audio/wav";
  if (n.endsWith(".webm")) return "audio/webm";
  if (n.endsWith(".ogg")) return "audio/ogg";
  return "audio/mpeg";
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clamp(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

export function catalog() {
  return CATALOG;
}
