import { Router } from "express";
import { store } from "../store.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json({ preferences: store.all().preferences });
});

router.patch("/", (req, res) => {
  const patch = req.body || {};
  const safe = {};
  const allow = [
    "haptics",
    "flashAlerts",
    "autoTranscribe",
    "allowCloudOffload",
    "isListening",
    "nightMode",
  ];
  for (const k of allow) if (k in patch) safe[k] = Boolean(patch[k]);
  if ("textSize" in patch && ["regular", "large", "xl"].includes(patch.textSize)) safe.textSize = patch.textSize;
  if ("retentionDays" in patch && Number.isFinite(Number(patch.retentionDays))) {
    safe.retentionDays = Math.max(0, Math.min(365, Number(patch.retentionDays)));
  }
  const next = store.patchObject("preferences", safe);
  res.json({ preferences: next });
});

export default router;
