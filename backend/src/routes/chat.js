import { Router } from "express";
import { store } from "../store.js";
import { getOpenAI, hasOpenAI } from "../services/openaiClient.js";

const router = Router();

/**
 * Conversational assistant that answers questions *about the user's own data* —
 * "What was I reminded to buy today?", "Did I miss any calls?", "What's on my
 * calendar this week?". It grounds GPT-4o-mini on the live JSON store so the
 * model can't hallucinate events that never happened.
 */
router.post("/", async (req, res) => {
  try {
    const { message, history = [] } = req.body || {};
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message required" });
    }

    const grounding = buildGrounding();

    if (!hasOpenAI()) {
      return res.json({ reply: demoReply(message, grounding), demo: true });
    }

    const openai = getOpenAI();
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: [
            "You are Agent ECHO, an always-on assistant for a Deaf / hard-of-hearing user.",
            "Answer questions only from the JSON context below. If the context doesn't contain the",
            "answer, say so plainly instead of guessing.",
            "Keep replies under 3 short sentences. Use the user's first name when it fits naturally.",
            "",
            "USER CONTEXT (JSON):",
            JSON.stringify(grounding, null, 2),
          ].join("\n"),
        },
        ...history.slice(-10).map((m) => ({ role: m.role, content: String(m.content || "") })),
        { role: "user", content: message },
      ],
    });

    const reply = resp.choices?.[0]?.message?.content?.trim() || "…";
    res.json({ reply });
  } catch (err) {
    console.error("[/api/chat]", err);
    res.status(500).json({ error: err.message });
  }
});

function buildGrounding() {
  const s = store.all();
  const recent = (arr, n) => (arr || []).slice(0, n);
  return {
    now: new Date().toISOString(),
    user: s.profile?.userName,
    pendingActions: recent(s.actions.filter((a) => !a.done), 20),
    recentEvents: recent(s.events, 20),
    upcomingMedications: recent(
      (s.medications || []).filter((m) => m.active).sort((a, b) => (a.nextDose || 0) - (b.nextDose || 0)),
      10,
    ),
    trustedCircle: (s.contacts || []).map((c) => ({ name: c.name, relation: c.relation })),
    recentMeetings: recent(s.meetings, 5).map((m) => ({
      title: m.title,
      kind: m.kind,
      tldr: m.summary?.tldr,
      when: m.createdAt,
    })),
  };
}

function demoReply(msg, g) {
  const lc = msg.toLowerCase();
  if (/appoint|calendar|schedule/.test(lc)) {
    const cal = g.pendingActions.filter((a) => a.type === "calendar");
    if (cal.length) return `You have ${cal.length} upcoming item — ${cal[0].title}.`;
    return "Nothing on your calendar right now.";
  }
  if (/milk|grocer|shop|pick up/.test(lc)) {
    const sh = g.pendingActions.filter((a) => a.type === "shopping");
    if (sh.length) return `Shopping list: ${sh.map((s) => s.title).join(", ")}.`;
    return "Your shopping list is empty.";
  }
  if (/medic|pill|dose/.test(lc)) {
    const m = g.upcomingMedications[0];
    if (m) return `Next medication: ${m.name} — ${m.schedule.toLowerCase()}.`;
    return "No active medications.";
  }
  if (/emergency|sos|circle/.test(lc)) {
    return `Your trusted circle has ${g.trustedCircle.length} contacts on standby.`;
  }
  return `Demo reply — wire OPENAI_API_KEY for GPT-4o. You currently have ${g.pendingActions.length} pending actions and ${g.recentEvents.length} recent sound events.`;
}

export default router;
