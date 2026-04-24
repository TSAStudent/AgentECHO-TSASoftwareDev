import { Router } from "express";
import { store } from "../store.js";

const router = Router();

const MAX_TRANSCRIPTS = 200;

router.get("/", (_req, res) => {
  res.json({ transcripts: store.list("transcripts") });
});

router.get("/:id", (req, res) => {
  const t = store.get("transcripts", req.params.id);
  if (!t) return res.status(404).json({ error: "not found" });
  res.json({ transcript: t });
});

router.post("/", (req, res) => {
  const { title, text, segments, language, duration, kind } = req.body || {};
  if (!text && !segments) return res.status(400).json({ error: "text or segments required" });
  const t = store.insert("transcripts", {
    title: title || defaultTitle(kind),
    text: text || (segments || []).map((s) => s.text).join(" "),
    segments: segments || [],
    language: language || "en",
    duration: duration || 0,
    kind: kind || "conversation",
    createdAt: Date.now(),
  });
  store.trim("transcripts", MAX_TRANSCRIPTS);
  res.status(201).json({ transcript: t });
});

router.delete("/:id", (req, res) => {
  const ok = store.remove("transcripts", req.params.id);
  if (!ok) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

function defaultTitle(kind) {
  const when = new Date().toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  if (kind === "meeting") return `Meeting · ${when}`;
  if (kind === "lecture") return `Lecture · ${when}`;
  if (kind === "visit")   return `Medical visit · ${when}`;
  return `Conversation · ${when}`;
}

export default router;
