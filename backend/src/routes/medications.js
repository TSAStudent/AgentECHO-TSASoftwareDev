import { Router } from "express";
import { store } from "../store.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json({ medications: store.list("medications") });
});

router.post("/", (req, res) => {
  const { name, schedule, nextDose, prescribedBy } = req.body || {};
  if (!name) return res.status(400).json({ error: "name required" });
  const med = store.insert(
    "medications",
    {
      name,
      schedule: schedule || "As needed",
      nextDose: typeof nextDose === "number" ? nextDose : null,
      prescribedBy: prescribedBy || null,
      active: true,
      createdAt: Date.now(),
    },
    { prepend: false },
  );
  res.status(201).json({ medication: med });
});

router.patch("/:id", (req, res) => {
  const updated = store.update("medications", req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: "not found" });
  res.json({ medication: updated });
});

router.post("/:id/taken", (req, res) => {
  const existing = store.get("medications", req.params.id);
  if (!existing) return res.status(404).json({ error: "not found" });
  const next = computeNextDose(existing.schedule);
  const updated = store.update("medications", req.params.id, {
    lastTakenAt: Date.now(),
    nextDose: next,
  });
  res.json({ medication: updated });
});

router.delete("/:id", (req, res) => {
  const ok = store.remove("medications", req.params.id);
  if (!ok) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

/**
 * Very forgiving schedule parser so a user can type natural instructions.
 * Recognizes "daily", "every morning", "every N hours", "twice a day", etc.
 * Falls back to 24h cadence.
 */
function computeNextDose(schedule) {
  const s = String(schedule || "").toLowerCase();
  const hrs = (() => {
    if (/every\s+(\d+)\s*hours?/.test(s)) return Number(RegExp.$1);
    if (/twice\s+a\s+day|2x\s*day|bid/.test(s)) return 12;
    if (/three\s+times\s+a\s+day|3x\s*day|tid/.test(s)) return 8;
    if (/four\s+times\s+a\s+day|4x\s*day|qid/.test(s)) return 6;
    if (/every\s+other\s+day|qod/.test(s)) return 48;
    if (/weekly|once\s+a\s+week/.test(s)) return 24 * 7;
    return 24;
  })();
  return Date.now() + hrs * 60 * 60 * 1000;
}

export default router;
