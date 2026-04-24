import { Router } from "express";
import { store } from "../store.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json({ meetings: store.list("meetings") });
});

router.get("/:id", (req, res) => {
  const m = store.get("meetings", req.params.id);
  if (!m) return res.status(404).json({ error: "not found" });
  res.json({ meeting: m });
});

router.post("/", (req, res) => {
  const body = req.body || {};
  if (!body.summary && !body.title) return res.status(400).json({ error: "summary or title required" });
  const meeting = store.insert("meetings", {
    title: body.title || body.summary?.title || "Meeting",
    kind: body.kind || "meeting",
    transcriptId: body.transcriptId || null,
    summary: body.summary || null,
    vibe: body.vibe || null,
    createdAt: Date.now(),
  });
  res.status(201).json({ meeting });
});

router.delete("/:id", (req, res) => {
  const ok = store.remove("meetings", req.params.id);
  if (!ok) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

export default router;
