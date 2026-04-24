import { Router } from "express";
import { store } from "../store.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json({ contacts: store.list("contacts") });
});

router.post("/", (req, res) => {
  const { name, phone, relation } = req.body || {};
  if (!name || !phone) return res.status(400).json({ error: "name and phone required" });
  const normalized = normalizePhone(phone);
  if (!normalized) return res.status(400).json({ error: "phone must be E.164 (e.g. +15551234567)" });
  const contact = store.insert("contacts", { name, phone: normalized, relation: relation || null }, { prepend: false });
  res.status(201).json({ contact });
});

router.patch("/:id", (req, res) => {
  const patch = { ...(req.body || {}) };
  if (patch.phone) {
    const normalized = normalizePhone(patch.phone);
    if (!normalized) return res.status(400).json({ error: "phone must be E.164" });
    patch.phone = normalized;
  }
  const updated = store.update("contacts", req.params.id, patch);
  if (!updated) return res.status(404).json({ error: "not found" });
  res.json({ contact: updated });
});

router.delete("/:id", (req, res) => {
  const ok = store.remove("contacts", req.params.id);
  if (!ok) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

/**
 * Accept US-style "555 010 1234", "(555) 010-1234", "+1 555 010 1234" etc.
 * Anything already in E.164 is preserved; a bare 10-digit US number gets a `+1`.
 */
function normalizePhone(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  if (/^\+\d{8,15}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

export default router;
