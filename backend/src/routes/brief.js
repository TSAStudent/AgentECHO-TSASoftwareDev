import { Router } from "express";
import { store } from "../store.js";
import { getOpenAI, hasOpenAI } from "../services/openaiClient.js";

const router = Router();

/**
 * Generates a morning / evening brief tailored to the user — "what you missed"
 * while ECHO was listening. This is the feature a judge remembers: it demos a
 * single-screen summary of the last 12 hours of ambient awareness, captured
 * actions, and medications due soon.
 */
router.get("/", async (req, res) => {
  try {
    const kind = (req.query.kind === "evening" ? "evening" : "morning");
    const context = buildBriefContext(kind);

    if (!hasOpenAI()) {
      return res.json({ ...context, narration: heuristicNarration(context, kind), demo: true });
    }

    const openai = getOpenAI();
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.6,
      messages: [
        {
          role: "system",
          content: [
            "You are Agent ECHO. Produce a short, warm brief (max 4 sentences) that a Deaf user",
            `would want to hear as a ${kind} catch-up. Mention only items that matter: emergency-level`,
            "sound events, pending actions for today, and medications due in the next few hours.",
            "Tone: calm, helpful, second-person ('you'). Do not list bullet points — flowing prose.",
          ].join(" "),
        },
        { role: "user", content: "Context JSON:\n" + JSON.stringify(context) },
      ],
    });
    const narration = resp.choices?.[0]?.message?.content?.trim() || heuristicNarration(context, kind);
    res.json({ ...context, narration });
  } catch (err) {
    console.error("[/api/brief]", err);
    res.status(500).json({ error: err.message });
  }
});

function buildBriefContext(kind) {
  const s = store.all();
  const twelveH = Date.now() - 12 * 60 * 60 * 1000;
  const recentEvents = (s.events || []).filter((e) => (e.timestamp || 0) >= twelveH);
  const pendingActions = (s.actions || []).filter((a) => !a.done);
  const soon = Date.now() + 4 * 60 * 60 * 1000;
  const upcomingMeds = (s.medications || [])
    .filter((m) => m.active && m.nextDose && m.nextDose <= soon)
    .sort((a, b) => a.nextDose - b.nextDose);

  return {
    kind,
    generatedAt: Date.now(),
    userName: s.profile?.userName,
    highlights: {
      emergencyCount: recentEvents.filter((e) => e.tier === "emergency").length,
      notableCount: recentEvents.filter((e) => e.tier === "high").length,
      pendingCount: pendingActions.length,
      medsDueSoon: upcomingMeds.length,
    },
    recentEvents: recentEvents.slice(0, 8),
    pendingActions: pendingActions.slice(0, 6),
    upcomingMedications: upcomingMeds.slice(0, 4),
  };
}

function heuristicNarration(ctx, kind) {
  const parts = [];
  const greet = kind === "morning" ? "Good morning" : "Good evening";
  parts.push(`${greet}${ctx.userName ? ", " + ctx.userName : ""}.`);
  if (ctx.highlights.emergencyCount > 0) {
    parts.push(`${ctx.highlights.emergencyCount} emergency-level sound event${ctx.highlights.emergencyCount === 1 ? "" : "s"} in the last 12 hours — review the timeline.`);
  }
  if (ctx.highlights.pendingCount > 0) {
    parts.push(`You have ${ctx.highlights.pendingCount} pending action${ctx.highlights.pendingCount === 1 ? "" : "s"} — the next is "${ctx.pendingActions[0]?.title}".`);
  }
  if (ctx.highlights.medsDueSoon > 0) {
    parts.push(`${ctx.highlights.medsDueSoon} medication${ctx.highlights.medsDueSoon === 1 ? "" : "s"} due soon.`);
  }
  if (parts.length === 1) parts.push("Nothing urgent — ECHO will tap you if something needs attention.");
  return parts.join(" ");
}

export default router;
