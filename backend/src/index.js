import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";

import { store } from "./store.js";
import { transcribeAudio } from "./services/transcribe.js";
import { extractSmartActions } from "./services/smartActions.js";
import { hasDuplicatePending } from "./utils/actionDedupe.js";
import { classifySound } from "./services/soundClassifier.js";
import { summarizeLecture } from "./services/summarize.js";
import { recognizeSign } from "./services/aslVision.js";
import { generateVibeReport } from "./services/vibeReport.js";
import { ttsFromText } from "./services/tts.js";
import { sendEmergencyAlert } from "./services/emergency.js";

import stateRoutes from "./routes/state.js";
import actionsRoutes from "./routes/actions.js";
import contactsRoutes from "./routes/contacts.js";
import eventsRoutes from "./routes/events.js";
import medicationsRoutes from "./routes/medications.js";
import transcriptsRoutes from "./routes/transcripts.js";
import meetingsRoutes from "./routes/meetings.js";
import preferencesRoutes from "./routes/preferences.js";
import profileRoutes from "./routes/profile.js";
import chatRoutes from "./routes/chat.js";
import briefRoutes from "./routes/brief.js";
import mapsRoutes from "./routes/maps.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));

app.use((req, _res, next) => {
  if (req.path !== "/api/health") {
    console.log(`[${new Date().toISOString().slice(11, 19)}] ${req.method} ${req.path}`);
  }
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "agent-echo",
    version: "1.1.0",
    time: new Date().toISOString(),
    integrations: {
      openai:     Boolean(process.env.OPENAI_API_KEY),
      twilio:     Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER),
      hume:       Boolean(process.env.HUME_API_KEY),
      googleMaps: Boolean(process.env.GOOGLE_MAPS_API_KEY),
      anthropic:  Boolean(process.env.ANTHROPIC_API_KEY),
    },
    counts: {
      actions:     store.list("actions").length,
      events:      store.list("events").length,
      contacts:    store.list("contacts").length,
      medications: store.list("medications").length,
      transcripts: store.list("transcripts").length,
      meetings:    store.list("meetings").length,
    },
  });
});

app.use("/api/state",        stateRoutes);
app.use("/api/actions",      actionsRoutes);
app.use("/api/contacts",     contactsRoutes);
app.use("/api/events",       eventsRoutes);
app.use("/api/medications",  medicationsRoutes);
app.use("/api/transcripts",  transcriptsRoutes);
app.use("/api/meetings",     meetingsRoutes);
app.use("/api/preferences",  preferencesRoutes);
app.use("/api/profile",      profileRoutes);
app.use("/api/chat",         chatRoutes);
app.use("/api/brief",        briefRoutes);
app.use("/api/maps",         mapsRoutes);

// Whisper transcription — persists the result to the transcripts store.
app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  try {
    const buffer = req.file?.buffer;
    if (!buffer) return res.status(400).json({ error: "No audio uploaded" });
    const language = req.body.language || undefined;
    const result = await transcribeAudio(buffer, { filename: req.file.originalname, language });

    const shouldSave = req.body.save !== "false";
    let saved = null;
    if (shouldSave && (result.text || result.segments?.length)) {
      saved = store.insert("transcripts", {
        title: req.body.title || `Conversation · ${new Date().toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`,
        text: result.text,
        segments: result.segments || [],
        language: result.language,
        duration: result.duration,
        kind: req.body.kind || "conversation",
        createdAt: Date.now(),
      });
      store.trim("transcripts", 200);
    }

    res.json({ ...result, savedTranscriptId: saved?.id || null });
  } catch (err) {
    console.error("[/api/transcribe]", err);
    res.status(500).json({ error: err.message });
  }
});

// Smart action extraction with optional persistence.
app.post("/api/extract-actions", async (req, res) => {
  try {
    const { transcript, userName, context, persist: shouldPersist = true } = req.body || {};
    if (!transcript) return res.status(400).json({ error: "transcript required" });
    const name = userName || store.all().profile?.userName;
    const actions = await extractSmartActions({ transcript, userName: name, context });
    let persisted = [];
    if (shouldPersist && Array.isArray(actions)) {
      const existing = store.list("actions");
      const pendingPool = [...existing.filter((x) => !x.done)];
      for (const a of actions) {
        if (!a?.title || (a.confidence ?? 1) < 0.55) continue;
        const candidate = {
          type: a.type || "note",
          title: a.title,
          detail: a.detail || "",
          when: a.when ?? null,
        };
        if (hasDuplicatePending(pendingPool, candidate)) continue;
        const row = store.insert("actions", {
          ...candidate,
          sourceQuote: a.sourceQuote || "",
          priority: a.priority || "medium",
          confidence: a.confidence ?? 0.8,
          createdAt: Date.now(),
          done: false,
        });
        pendingPool.push(row);
        persisted.push(row);
      }
    }
    res.json({ actions, persisted });
  } catch (err) {
    console.error("[/api/extract-actions]", err);
    res.status(500).json({ error: err.message });
  }
});

// Environmental sound classifier. `skipLow=true` filters silence/speech.
app.post("/api/classify-sound", upload.single("audio"), async (req, res) => {
  try {
    const userName = req.body?.userName || store.all().profile?.userName || null;
    const filename = req.file?.originalname || "chunk.m4a";
    const result = await classifySound(req.file?.buffer, { userName, filename });

    const persist = req.body?.persist !== "false";
    const skipLow = req.body?.skipLow === "true";
    const skip = skipLow && (result.top?.label === "silence" || result.top?.label === "speech");

    let event = null;
    if (persist && !skip && result.top) {
      event = store.insert("events", {
        label: result.top.label,
        display: result.top.display,
        tier: result.top.tier,
        icon: result.top.icon,
        confidence: result.top.confidence,
        timestamp: Date.now(),
        room: req.body?.room || null,
        direction: req.body?.direction || null,
        acknowledged: false,
        meta: result.meta || null,
      });
      store.trim("events", 500);
    }
    res.json({ ...result, savedEventId: event?.id || null });
  } catch (err) {
    console.error("[/api/classify-sound]", err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Lecture / meeting summary — persisted into meetings collection.
app.post("/api/summarize", async (req, res) => {
  try {
    const { transcript, kind, save = true, transcriptId = null } = req.body || {};
    if (!transcript) return res.status(400).json({ error: "transcript required" });
    const summary = await summarizeLecture({ transcript, kind: kind || "lecture" });
    let meeting = null;
    if (save) {
      meeting = store.insert("meetings", {
        title: summary.title || (kind === "meeting" ? "Meeting" : "Lecture"),
        kind: kind || "lecture",
        transcriptId,
        summary,
        vibe: null,
        createdAt: Date.now(),
      });
    }
    res.json({ ...summary, savedMeetingId: meeting?.id || null });
  } catch (err) {
    console.error("[/api/summarize]", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/asl-recognize", async (req, res) => {
  try {
    const { imageBase64, priorSigns } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: "imageBase64 required" });
    const result = await recognizeSign({ imageBase64, priorSigns });
    res.json(result);
  } catch (err) {
    console.error("[/api/asl-recognize]", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/vibe-report", async (req, res) => {
  try {
    const { transcript, meetingId } = req.body || {};
    if (!transcript) return res.status(400).json({ error: "transcript required" });
    const vibe = await generateVibeReport({ transcript });
    if (meetingId) store.update("meetings", meetingId, { vibe });
    res.json(vibe);
  } catch (err) {
    console.error("[/api/vibe-report]", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/tts", async (req, res) => {
  try {
    const { text, voice, speed } = req.body || {};
    if (!text) return res.status(400).json({ error: "text required" });
    const { audioBase64, mime } = await ttsFromText({ text, voice, speed });
    res.json({ audioBase64, mime });
  } catch (err) {
    console.error("[/api/tts]", err);
    res.status(500).json({ error: err.message });
  }
});

// Falls back to stored Trusted Circle when `contacts` is omitted.
app.post("/api/emergency", async (req, res) => {
  try {
    const body = req.body || {};
    const contacts = Array.isArray(body.contacts) && body.contacts.length > 0
      ? body.contacts
      : store.list("contacts").map((c) => ({ name: c.name, phone: c.phone }));
    const result = await sendEmergencyAlert({
      level: body.level,
      trigger: body.trigger,
      contacts,
      location: body.location,
      message: body.message,
    });
    // Audit-log every SOS dispatch.
    store.insert("events", {
      label: "sos_dispatched",
      display: `Emergency ${result.sent ? "sent" : "attempted"}`,
      tier: "emergency",
      icon: "shield-alert",
      confidence: 1,
      timestamp: Date.now(),
      room: null,
      direction: null,
      acknowledged: false,
      meta: { trigger: body.trigger, level: body.level, result },
    });
    res.json(result);
  } catch (err) {
    console.error("[/api/emergency]", err);
    res.status(500).json({ error: err.message });
  }
});

app.use((err, _req, res, _next) => {
  console.error("[unhandled]", err);
  res.status(500).json({ error: err.message || "Internal error" });
});

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
setInterval(() => {
  const days = store.all().preferences?.retentionDays || 0;
  const n = store.pruneByRetention(days);
  if (n > 0) console.log(`[retention] pruned ${n} record(s) older than ${days}d`);
}, SWEEP_INTERVAL_MS).unref?.();

const PORT = Number(process.env.BACKEND_PORT || 4000);
app.listen(PORT, () => {
  console.log(`\n  Agent ECHO backend listening on http://localhost:${PORT}`);
  console.log(`  OpenAI:     ${process.env.OPENAI_API_KEY ? "enabled" : "DEMO MODE"}`);
  console.log(`  Twilio:     ${process.env.TWILIO_ACCOUNT_SID ? "enabled" : "DEMO MODE"}`);
  console.log(`  Google Maps:${process.env.GOOGLE_MAPS_API_KEY ? " enabled" : " DEMO MODE"}`);
  console.log(`  Persistent: backend/data/echo.json\n`);
});
