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
- If the user's name is mentioned ("Hey <userName>") treat that as a direct cue; also extract tasks clearly meant for them even if phrased indirectly ("tell <userName> to …", "remind her/him/them" when the subject is the user).
- In ambient / background transcripts, also treat second-person address ("you", "your", "you need to", "can you") as directed at this user when it clearly assigns them a task or deadline — extract those as calendar/reminder with appropriate "when".
- For calendar or reminder types you MUST set "when" to an ISO 8601 datetime in the user's local sense whenever any time is implied. Use the provided "Current time" as anchor. Map phrases like "tomorrow", "tomorrow morning", "next week", "next Monday", "in 3 days", "tonight at 8" into concrete ISO datetimes (best-effort timezone: assume same zone as Current time unless a zone is stated).
- If only a day is known without clock time, pick a sensible default (09:00 local) and still output ISO.
- Calendar items should always include "when" when any date or relative time appears; use type "note" only when no time can be inferred.
- "urgent" priority only for safety (smoke, "help", "call 911").
- If nothing is actionable, return {"actions": []}.`;

const MEDICAL_VISIT_ADDENDUM = `
MEDICAL VISIT MODE — Context is a clinical appointment or recap (Doctor/nurse speech about care):
- NEW prescriptions, dose changes, discontinued meds explained as instructions to the patient, PRN use clarified → type "medication".
  • title: drug name + strength/form when stated (e.g. "Lisinopril 10 mg", "Albuterol inhaler").
  • detail: SIG / how often / with food / key cautions / prescriber name if given.
  • when: ISO 8601 for next dose or medication start if inferable; if only "twice daily" etc., anchor first reminder to tomorrow at 09:00 local from Current time.
  • priority: "high" for new Rx or strong changes, else "medium".
- Labs / blood work / UA / cultures / "send you for draw", fasting panels (CBC, CMP/BMP, A1c, lipids, thyroid), metabolic panels → type "calendar".
  • title: start with "Lab:" plus panel name when known (e.g. "Lab: fasting CMP").
  • detail: fasting rules (e.g. fast 8–12h), water OK, where/when hints from transcript.
  • when: REQUIRED — resolve relative phrases ("in two weeks", "Tuesday morning") against Current time; default clock 09:00 if only a date.
- Imaging ordered (X-ray, MRI, CT, ultrasound) → type "calendar", title prefix "Imaging:", same when rules.
- Return-office visits ("see you in 6 weeks") → type "calendar" with clear title.
- Separate rows per distinct drug and per distinct lab/order — do not merge unrelated items.`;

function medicalContext(context) {
  const c = (context || "").toLowerCase();
  return (
    c.includes("medical")
    || c.includes("appointment companion")
    || c.includes("clinical")
    || c.includes("doctor visit")
    || c.includes("clinic")
  );
}

export async function extractSmartActions({ transcript, userName, context }) {
  const mc = medicalContext(context);
  if (!hasOpenAI()) return demoActions(transcript, userName, mc);

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

  const systemPrompt = mc ? `${SYSTEM_PROMPT}\n${MEDICAL_VISIT_ADDENDUM}` : SYSTEM_PROMPT;

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages: [
      { role: "system", content: systemPrompt },
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

function demoActions(transcript, userName, isMedical) {
  const lc = (transcript || "").toLowerCase();
  const actions = [];
  const demoWhen = new Date(Date.now() + 86400000);
  demoWhen.setHours(9, 0, 0, 0);

  if (isMedical) {
    if (/\b(prescribe|prescription|mg\b|mcg\b|tablet|capsule|take\s+|started\s+on|lisinopril|metformin|ibuprofen|steroid|antibiotic|refill)\b/i.test(lc)) {
      actions.push({
        type: "medication",
        title: "Demo Rx · discuss with your clinician",
        detail: "ECHO demo extracted a medication mention — verify with your prescriber.",
        when: demoWhen.toISOString(),
        location: null,
        people: [],
        sourceQuote: (transcript || "").slice(0, 160),
        confidence: 0.72,
        priority: "medium",
      });
    }
    if (/\b(lab|labs|blood\s*work|draw\b|fasting|cbc\b|cmp\b|bmp\b|a1c|lipid|panel|cultures?|urinalysis)\b/i.test(lc)) {
      actions.push({
        type: "calendar",
        title: "Lab: blood work (demo)",
        detail: "Confirm fasting and scheduling with your clinic.",
        when: demoWhen.toISOString(),
        location: null,
        people: [],
        sourceQuote: (transcript || "").slice(0, 160),
        confidence: 0.7,
        priority: "high",
      });
    }
  }

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
