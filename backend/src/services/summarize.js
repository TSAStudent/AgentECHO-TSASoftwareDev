import { getOpenAI, hasOpenAI } from "./openaiClient.js";

/** Avoid giant prompts that stall or fail; keep start + end of lecture. */
const MAX_TRANSCRIPT_CHARS = 48_000;

const SYSTEM_LECTURE = `You are Agent ECHO's lecture companion. Given a raw lecture transcript, produce structured notes
for a deaf / hard-of-hearing student who may have missed audio nuance. STRICT JSON:
{
  "title": "short lecture title",
  "tldr": "2-3 sentence summary",
  "outline": [{"heading":"...","bullets":["..."]}],
  "keyTerms": [{"term":"...","definition":"..."}],
  "actionItems": ["..."],
  "flashcards": [{"q":"...","a":"..."}]
}
Constraints: at most 8 outline sections; at most 10 bullets per section; at most 12 key terms; at most 12 flashcards.`;

const SYSTEM_MEETING = `You are Agent ECHO's meeting assistant. Produce JSON:
{
  "title":"...",
  "tldr":"...",
  "decisions":["..."],
  "actionItems":[{"owner":"name or 'you'","task":"...","due":"ISO or null"}],
  "questionsForYou":["..."],
  "followUpEmailDraft":"short plain-text email draft"
}
Constraints: at most 12 decisions; at most 15 action items.`;

function clipTranscriptForSummary(raw) {
  const t = (raw || "").trim();
  if (!t.length) return t;
  if (t.length <= MAX_TRANSCRIPT_CHARS) return t;
  const head = Math.floor(MAX_TRANSCRIPT_CHARS * 0.62);
  const tail = MAX_TRANSCRIPT_CHARS - head - 120;
  const omitted = t.length - head - tail;
  return `${t.slice(0, head)}\n\n[ … middle omitted (${omitted} characters) … ]\n\n${t.slice(-tail)}`;
}

function normalizeLectureSummary(parsed) {
  const p = parsed && typeof parsed === "object" ? parsed : {};
  return {
    title: typeof p.title === "string" && p.title.trim() ? p.title.trim() : "Lecture notes",
    tldr: typeof p.tldr === "string" ? p.tldr : "",
    outline: Array.isArray(p.outline) ? p.outline : [],
    keyTerms: Array.isArray(p.keyTerms) ? p.keyTerms : [],
    actionItems: Array.isArray(p.actionItems) ? p.actionItems : [],
    flashcards: Array.isArray(p.flashcards) ? p.flashcards : [],
  };
}

function normalizeMeetingSummary(parsed) {
  const p = parsed && typeof parsed === "object" ? parsed : {};
  return {
    title: typeof p.title === "string" && p.title.trim() ? p.title.trim() : "Meeting notes",
    tldr: typeof p.tldr === "string" ? p.tldr : "",
    decisions: Array.isArray(p.decisions) ? p.decisions : [],
    actionItems: Array.isArray(p.actionItems) ? p.actionItems : [],
    questionsForYou: Array.isArray(p.questionsForYou) ? p.questionsForYou : [],
    followUpEmailDraft: typeof p.followUpEmailDraft === "string" ? p.followUpEmailDraft : "",
  };
}

export async function summarizeLecture({ transcript, kind }) {
  const clipped = clipTranscriptForSummary(transcript);
  const k = kind === "meeting" ? "meeting" : "lecture";

  if (!hasOpenAI()) {
    return k === "meeting" ? normalizeMeetingSummary(demoSummary(k)) : normalizeLectureSummary(demoSummary(k));
  }

  const openai = getOpenAI();
  const sys = k === "meeting" ? SYSTEM_MEETING : SYSTEM_LECTURE;

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 4096,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: clipped },
    ],
  });

  const raw = resp.choices?.[0]?.message?.content;
  try {
    const parsed = JSON.parse(raw || "{}");
    return k === "meeting" ? normalizeMeetingSummary(parsed) : normalizeLectureSummary(parsed);
  } catch {
    return k === "meeting" ? normalizeMeetingSummary(demoSummary(k)) : normalizeLectureSummary(demoSummary(k));
  }
}

function demoSummary(kind) {
  if (kind === "meeting") {
    return {
      title: "Weekly product sync",
      tldr: "The team aligned on launch blockers and agreed to ship a private beta by Friday.",
      decisions: ["Target private beta launch Friday", "Freeze scope on onboarding flow"],
      actionItems: [
        { owner: "you", task: "Send onboarding mocks to Dana", due: null },
        { owner: "Dana", task: "Review mocks and respond by EOD Thursday", due: null },
      ],
      questionsForYou: ["Do you still need the analytics API before launch?"],
      followUpEmailDraft: "Hi team — following up on today's sync. Agreed to ship the private beta Friday…",
    };
  }
  return {
    title: "Intro to Thermodynamics — Lecture 4",
    tldr: "Covered the first law of thermodynamics and worked through two closed-system examples.",
    outline: [
      { heading: "First Law", bullets: ["ΔU = Q − W", "Sign conventions", "Closed vs open systems"] },
      { heading: "Examples", bullets: ["Adiabatic compression of an ideal gas", "Isothermal expansion work"] },
    ],
    keyTerms: [
      { term: "Internal energy (U)", definition: "Sum of microscopic kinetic + potential energies of particles." },
      { term: "Adiabatic", definition: "No heat exchanged with the surroundings (Q = 0)." },
    ],
    actionItems: ["Problem set 3 due Friday", "Read sections 4.3–4.5"],
    flashcards: [
      { q: "State the first law of thermodynamics.", a: "ΔU = Q − W" },
      { q: "Define 'adiabatic'.", a: "A process with no heat transfer (Q=0)." },
    ],
  };
}
