import { Router } from "express";
import { store } from "../store.js";

const router = Router();

const MAX_EVENTS = 500;

router.get("/", (_req, res) => {
  res.json({ events: store.list("events") });
});

router.post("/", (req, res) => {
  const body = req.body || {};
  if (!body.label || !body.display) return res.status(400).json({ error: "label and display required" });
  const event = store.insert("events", {
    label: body.label,
    display: body.display,
    tier: body.tier || "low",
    icon: body.icon || "waveform",
    confidence: typeof body.confidence === "number" ? body.confidence : 0.7,
    timestamp: body.timestamp || Date.now(),
    room: body.room || null,
    direction: body.direction || null,
    acknowledged: false,
  });
  store.trim("events", MAX_EVENTS);
  res.status(201).json({ event });
});

router.patch("/:id", (req, res) => {
  const updated = store.update("events", req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: "not found" });
  res.json({ event: updated });
});

router.delete("/", (_req, res) => {
  store.clear("events");
  res.json({ ok: true });
});

router.delete("/:id", (req, res) => {
  const ok = store.remove("events", req.params.id);
  if (!ok) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

export default router;
