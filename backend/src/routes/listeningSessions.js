import { Router } from "express";
import { store } from "../store.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json({ sessions: store.list("listeningSessions") });
});

router.post("/", (req, res) => {
  const startedAt = typeof req.body?.startedAt === "number" ? req.body.startedAt : Date.now();
  const session = store.insert("listeningSessions", {
    startedAt,
    endedAt: null,
    durationMs: null,
    chunkCount: 0,
    tasksAddedToCalendar: 0,
    transcriptSnippet: "",
    createdAt: Date.now(),
  });
  store.trim("listeningSessions", 80);
  res.status(201).json({ session });
});

router.patch("/:id", (req, res) => {
  const updated = store.update("listeningSessions", req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: "not found" });
  res.json({ session: updated });
});

export default router;
