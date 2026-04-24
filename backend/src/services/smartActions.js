import { getOpenAI, hasOpenAI } from "./openaiClient.js";

const SYSTEM_PROMPT = `You are Agent ECHO's Smart Action Engine for a deaf / hard-of-hearing user.
Your job is to read an ambient conversation transcript and extract actionable items the user would otherwise miss.

ONLY extract an action when you have high confidence. Never hallucinate details.

For each action, produce STRICT JSON:
{
  "actions": [
    {
      "type": "calendar" | "reminder" | "shopping" | "contact" | "medication" | "followup" | "note",
      "title": "short human title",
      "detail": "one-sentence plain summary",
      "when": "ISO 8601 if a datetime was implied, else null",
      "location": "string or null",
      "people": ["names"],
      "sourceQuote": "verbatim span from transcript",
      "confidence": 0.0-1.0,
      "priority": "low" | "medium" | "high" | "urgent"
    }
  ]
}

Rules:
- If the user's name is mentioned ("Hey <userName>") treat that as a direct cue.
- Calendar items need a "when".
- "urgent" priority only for safety (smoke, "help", "call 911").
- If nothing is actionable, return {"actions": []}.`;

export async function extractSmartActions({ transcript, userName, context }) {
  if (!hasOpenAI()) return demoActions(transcript, userName);

  const openai = getOpenAI();
  const now = new Date().toISOString();
  const user = [
    `Current time: ${now}`,
    userName ? `User's name: ${userName}` : null,
    context ? `Context: ${context}` : null,
    "",
    "Transcript:",
    transcript,
  ]
    .filter(Boolean)
    .join("\n");

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: user },
    ],
  });

  try {
    const parsed = JSON.parse(resp.choices[0].message.content);
    return parsed.actions || [];
  } catch {
    return [];
  }
}

function demoActions(transcript, userName) {
  const lc = (transcript || "").toLowerCase();
  const actions = [];
  if (userName && lc.includes((userName || "").toLowerCase())) {
    actions.push({
      type: "calendar",
      title: "Appointment mentioned",
      detail: `Someone addressed ${userName} about an upcoming appointment.`,
      when: null,
      location: null,
      people: [userName],
      sourceQuote: transcript?.slice(0, 140) || "",
      confidence: 0.82,
      priority: "medium",
    });
  }
  if (/\bmilk|eggs|bread|grocery\b/.test(lc)) {
    actions.push({
      type: "shopping",
      title: "Add to shopping list",
      detail: "Overheard a grocery item worth remembering.",
      when: null,
      location: null,
      people: [],
      sourceQuote: transcript,
      confidence: 0.7,
      priority: "low",
    });
  }
  return actions;
}
