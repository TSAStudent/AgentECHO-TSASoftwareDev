import { getOpenAI, hasOpenAI } from "./openaiClient.js";

const SYSTEM_LECTURE = `You are Agent ECHO's lecture companion. Given a raw lecture transcript, produce structured notes
for a deaf / hard-of-hearing student who may have missed audio nuance. STRICT JSON:
{
  "title": "short lecture title",
  "tldr": "2-3 sentence summary",
  "outline": [{"heading":"...","bullets":["..."]}],
  "keyTerms": [{"term":"...","definition":"..."}],
  "actionItems": ["..."],
  "flashcards": [{"q":"...","a":"..."}]
}`;

const SYSTEM_MEETING = `You are Agent ECHO's meeting assistant. Produce JSON:
{
  "title":"...",
  "tldr":"...",
  "decisions":["..."],
  "actionItems":[{"owner":"name or 'you'","task":"...","due":"ISO or null"}],
  "questionsForYou":["..."],
  "followUpEmailDraft":"short plain-text email draft"
}`;

export async function summarizeLecture({ transcript, kind }) {
  if (!hasOpenAI()) return demoSummary(kind);

  const openai = getOpenAI();
  const sys = kind === "meeting" ? SYSTEM_MEETING : SYSTEM_LECTURE;

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.3,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: transcript },
    ],
  });
  try {
    return JSON.parse(resp.choices[0].message.content);
  } catch {
    return demoSummary(kind);
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
