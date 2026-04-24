import { getOpenAI, hasOpenAI } from "./openaiClient.js";

/**
 * Transcribe audio with Whisper and synthesize a lightweight "diarization"
 * display by chunking into utterances and tagging speakers heuristically.
 * A production deployment would pair this with pyannote; we ship a graceful
 * fallback so the UI always has rich data to render.
 */
export async function transcribeAudio(buffer, { filename = "audio.m4a", language } = {}) {
  if (!hasOpenAI()) {
    return demoTranscript();
  }

  const openai = getOpenAI();
  const file = await blobFromBuffer(buffer, filename);

  const response = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
    language,
  });

  const rawSegments = response.segments || [];
  const speakerLabels = diarize(rawSegments);
  const segments = rawSegments.map((s, i) => ({
    id: i,
    start: s.start,
    end: s.end,
    text: s.text.trim(),
    speaker: speakerLabels[i],
    emotion: guessEmotion(s.text),
  }));

  return {
    text: response.text,
    language: response.language,
    duration: response.duration,
    segments,
  };
}

/**
 * Two-speaker diarization heuristic. A proper deployment would pair this
 * with pyannote; this fallback flips speakers on long pauses or after an
 * explicit question mark (typical turn-taking cue). Returns an array of
 * labels aligned with the input segments.
 */
function diarize(segs) {
  if (!segs || segs.length === 0) return [];
  const labels = new Array(segs.length);
  let current = "Speaker 1";
  labels[0] = current;
  for (let i = 1; i < segs.length; i++) {
    const prev = segs[i - 1];
    const gap = segs[i].start - prev.end;
    const prevEndedQuestion = /\?\s*$/.test(prev.text || "");
    const shouldFlip = gap > 0.9 || prevEndedQuestion;
    if (shouldFlip) current = current === "Speaker 1" ? "Speaker 2" : "Speaker 1";
    labels[i] = current;
  }
  return labels;
}

function guessEmotion(text) {
  const t = text.toLowerCase();
  if (/\b(urgent|emergency|help|fire|danger)\b/.test(t)) return "urgent";
  if (/[!]{1,}|\b(awesome|amazing|great|love|yay)\b/.test(t)) return "enthusiastic";
  if (/\b(sorry|unfortunately|regret|sad)\b/.test(t)) return "apologetic";
  if (/\?\s*$/.test(text)) return "curious";
  if (/\b(not sure|maybe|i guess|kind of)\b/.test(t)) return "uncertain";
  return "neutral";
}

async function blobFromBuffer(buffer, filename) {
  // OpenAI SDK accepts a Node ReadableStream or a File-like object. We use
  // the undici File polyfill available in Node 20+.
  const { File } = await import("node:buffer");
  return new File([buffer], filename, { type: mimeFor(filename) });
}

function mimeFor(name) {
  // `audio/m4a` is not IANA-registered; M4A is AAC-in-MP4 and the standard
  // type is `audio/mp4`. Whisper sometimes rejects the non-standard variant.
  if (name.endsWith(".m4a")) return "audio/mp4";
  if (name.endsWith(".mp3")) return "audio/mpeg";
  if (name.endsWith(".wav")) return "audio/wav";
  if (name.endsWith(".webm")) return "audio/webm";
  if (name.endsWith(".ogg")) return "audio/ogg";
  return "audio/mpeg";
}

function demoTranscript() {
  const segments = [
    { id: 0, start: 0.0,  end: 2.4, text: "Hey Sarah, did you see the email from Dr. Lin?", speaker: "Speaker 1", emotion: "curious" },
    { id: 1, start: 2.5,  end: 4.9, text: "Not yet — what was it about?",                       speaker: "Speaker 2", emotion: "neutral" },
    { id: 2, start: 5.0,  end: 8.2, text: "Your follow-up appointment is Thursday at 3 p.m.",   speaker: "Speaker 1", emotion: "neutral" },
    { id: 3, start: 8.3, end: 10.1, text: "Don't forget to bring the new lab results.",         speaker: "Speaker 1", emotion: "neutral" },
    { id: 4, start:10.2, end: 12.5, text: "Got it, thanks for the reminder!",                   speaker: "Speaker 2", emotion: "enthusiastic" },
  ];
  return {
    text: segments.map((s) => s.text).join(" "),
    language: "en",
    duration: 12.5,
    segments,
    demo: true,
  };
}
