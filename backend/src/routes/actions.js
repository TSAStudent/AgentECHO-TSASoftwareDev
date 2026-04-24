import { Router } from "express";
import { store } from "../store.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json({ actions: store.list("actions") });
});

router.post("/", (req, res) => {
  const body = req.body || {};
  if (!body.title) return res.status(400).json({ error: "title required" });
  const action = store.insert("actions", {
    type: body.type || "note",
    title: body.title,
    detail: body.detail || "",
    when: body.when ?? null,
    sourceQuote: body.sourceQuote || "",
    priority: body.priority || "medium",
    confidence: typeof body.confidence === "number" ? body.confidence : 0.8,
    createdAt: Date.now(),
    done: false,
  });
  res.status(201).json({ action });
});

router.post("/bulk", (req, res) => {
  const items = Array.isArray(req.body?.actions) ? req.body.actions : [];
  const created = items.map((a) =>
    store.insert("actions", {
      type: a.type || "note",
      title: a.title,
      detail: a.detail || "",
      when: a.when ?? null,
      sourceQuote: a.sourceQuote || "",
      priority: a.priority || "medium",
      confidence: typeof a.confidence === "number" ? a.confidence : 0.8,
      createdAt: Date.now(),
      done: false,
    }),
  );
  res.json({ actions: created });
});

router.patch("/:id", (req, res) => {
  const updated = store.update("actions", req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: "not found" });
  res.json({ action: updated });
});

router.delete("/:id", (req, res) => {
  const ok = store.remove("actions", req.params.id);
  if (!ok) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

export default router;
