import { Router } from "express";
import { store } from "../store.js";

const router = Router();

// Single-shot hydration: pulls every collection in one round-trip.
router.get("/", (_req, res) => {
  const s = store.all();
  const removed = store.pruneByRetention(s.preferences?.retentionDays);
  res.json({
    profile: s.profile,
    preferences: s.preferences,
    actions: s.actions,
    events: s.events,
    contacts: s.contacts,
    medications: s.medications,
    transcripts: (s.transcripts || []).map(stripTranscriptSegments),
    meetings: s.meetings,
    stats: {
      totalActions: s.actions.length,
      pendingActions: s.actions.filter((a) => !a.done).length,
      totalEvents: s.events.length,
      emergencyEvents: s.events.filter((e) => e.tier === "emergency").length,
      retentionPrunedThisLoad: removed,
    },
    serverTime: Date.now(),
  });
});

router.post("/reset", (_req, res) => {
  const fresh = store.reset();
  res.json({ ok: true, state: fresh });
});

function stripTranscriptSegments(t) {
  return {
    id: t.id,
    title: t.title,
    kind: t.kind,
    preview: (t.text || "").slice(0, 140),
    language: t.language,
    duration: t.duration,
    createdAt: t.createdAt,
  };
}

export default router;
