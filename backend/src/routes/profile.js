import { Router } from "express";
import { store } from "../store.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json({ profile: store.all().profile });
});

router.patch("/", (req, res) => {
  const patch = req.body || {};
  const safe = {};
  if (typeof patch.userName === "string" && patch.userName.trim()) {
    safe.userName = patch.userName.trim().slice(0, 80);
  }
  const next = store.patchObject("profile", safe);
  res.json({ profile: next });
});

export default router;
