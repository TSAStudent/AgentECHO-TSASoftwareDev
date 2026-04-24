import { Router } from "express";
import { store } from "../store.js";

const router = Router();

/**
 * Single-shot hydration endpoint. The mobile client calls this on launch to
 * atomically pull every collection it cares about. Saves a round-trip per
 * resource and guarantees the UI renders a coherent snapshot of state.
 */
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
  // The list endpoint returns light-weight previews. Full segments are fetched
  // individually when the user opens one.
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
