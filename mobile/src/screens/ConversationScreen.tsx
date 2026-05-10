import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Audio } from "expo-av";

import { Screen } from "@/components/Screen";
import { GlassCard } from "@/components/GlassCard";
import { WaveformBars } from "@/components/WaveformBars";
import { Tag } from "@/components/Tag";
import { theme } from "@/theme";
import { useEcho } from "@/context/EchoContext";
import { haptic, clock } from "@/utils/format";
import { api } from "@/services/api";

type Line = {
  id: string;
  speaker: string;
  text: string;
  at: number;
  emotion?: "neutral" | "enthusiastic" | "urgent" | "apologetic" | "curious" | "uncertain";
  forYou?: boolean;
};

/** Rolling chunk for live captions; shorter = faster updates, more Whisper calls. */
const CHUNK_MS = 2300;
const GAP_MS = 150;    // tiny gap between chunks while we kick off the next recorder

const emotionColor = (e?: Line["emotion"]) => {
  switch (e) {
    case "urgent":       return theme.colors.danger;
    case "enthusiastic": return theme.colors.success;
    case "apologetic":   return theme.colors.warning;
    case "curious":      return theme.colors.info;
    case "uncertain":    return theme.colors.textMute;
    default:             return theme.colors.textDim;
  }
};

export default function ConversationScreen() {
  const { userName, addAction } = useEcho();
  const [lines, setLines] = useState<Line[]>([]);
  const [live, setLive] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chunkCount, setChunkCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const stopFlagRef = useRef(false);
  const loopRef = useRef<Promise<void> | null>(null);
  const transcriptRef = useRef<string>("");
  const startedAtRef = useRef<number>(0);
  const scrollRef = useRef<ScrollView>(null);

  // timer for "hh:mm:ss" indicator
  useEffect(() => {
    if (!live) return;
    const iv = setInterval(() => setElapsed(Date.now() - startedAtRef.current), 250);
    return () => clearInterval(iv);
  }, [live]);

  // cleanup on unmount: make sure any running loop exits
  useEffect(() => () => { stopFlagRef.current = true; }, []);

  /** Core rolling loop. Each iteration: record CHUNK_MS of audio, ship it to
   *  Whisper (save=false so we don't create 100 transcript rows), append
   *  segments. Continues until stop flag flips. */
  const runLoop = useCallback(async () => {
    stopFlagRef.current = false;
    setChunkCount(0);

    while (!stopFlagRef.current) {
      const chunk = await recordChunk(CHUNK_MS, () => stopFlagRef.current);
      if (stopFlagRef.current) break;
      if (!chunk) { await sleep(500); continue; }

      // Transcribe off the main loop so the next recording can start immediately.
      transcribeInBackground(chunk, userName, (segs, text) => {
        if (!text || text.length < 2) return;
        transcriptRef.current = [transcriptRef.current, text].filter(Boolean).join(" ");

        const now = Date.now();
        const fresh: Line[] = (segs.length > 0 ? segs : [{ speaker: "Speaker 1", text, emotion: "neutral" }])
          .map((s: any, i: number) => ({
            id: `c_${now}_${i}`,
            speaker: s.speaker || "Speaker 1",
            text: s.text || "",
            at: now,
            emotion: s.emotion || "neutral",
            forYou: isForYou(s.text || "", userName),
          }));

        setLines((prev) => [...prev, ...fresh]);
        setChunkCount((c) => c + 1);
        if (fresh.some((f) => f.forYou)) haptic.medium();
      });

      await sleep(GAP_MS);
    }
  }, [userName]);

  const onToggle = async () => {
    haptic.light();
    if (live) {
      stopFlagRef.current = true;
      setLive(false);
      return;
    }

    // Fresh session
    setLines([]);
    transcriptRef.current = "";
    setError(null);
    setChunkCount(0);
    startedAtRef.current = Date.now();
    setElapsed(0);
    setLive(true);
    if (!loopRef.current) {
      loopRef.current = runLoop()
        .catch((e) => setError(e?.message || "Capture loop error"))
        .finally(() => { loopRef.current = null; });
    }
  };

  const onCapture = async () => {
    const transcript = transcriptRef.current || lines.map((l) => `${l.speaker}: ${l.text}`).join("\n");
    if (!transcript.trim()) return;
    setCapturing(true);
    haptic.light();
    try {
      const { persisted } = await api.extractActions({
        transcript,
        userName,
        context: "Captured from live conversation",
        persist: true,
      });
      if (Array.isArray(persisted)) {
        persisted.forEach((a: any) => {
          addAction({
            type: a.type, title: a.title, detail: a.detail,
            when: a.when, sourceQuote: a.sourceQuote,
            priority: a.priority, confidence: a.confidence,
          });
        });
      }
      haptic.success();
    } catch {
      haptic.warning();
    } finally {
      setCapturing(false);
    }
  };

  const onClear = () => {
    setLines([]);
    transcriptRef.current = "";
    setChunkCount(0);
    haptic.light();
  };

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 40);
  }, [lines.length]);

  const statusLabel = useMemo(() => {
    if (error) return `ERROR — ${error}`;
    if (live)  return `LIVE · ${fmtDuration(elapsed)} · ${chunkCount} chunk${chunkCount === 1 ? "" : "s"} transcribed`;
    if (processing) return "FINISHING LAST CHUNK…";
    if (lines.length === 0) return "TAP MIC TO START LIVE CAPTIONS";
    return "PAUSED · Tap to resume";
  }, [live, processing, lines.length, error, elapsed, chunkCount]);

  return (
    <Screen scroll={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>CONVERSATION MODE</Text>
          <Text style={styles.title}>Live captions</Text>
        </View>
        <View style={[styles.live, { backgroundColor: live ? theme.colors.danger : theme.colors.outline }]}>
          <View style={[styles.liveDot, { opacity: live ? 1 : 0.3 }]} />
          <Text style={styles.liveText}>{live ? "REC" : "IDLE"}</Text>
        </View>
      </View>

      <GlassCard padded={false} style={{ overflow: "hidden", marginBottom: 12 }}>
        <LinearGradient
          colors={["rgba(100,240,255,0.14)", "rgba(124,92,255,0.08)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable onPress={onToggle} style={[styles.micRing, live && styles.micRingActive]}>
            <MaterialCommunityIcons
              name={live ? "stop" : "microphone"}
              size={24}
              color={live ? theme.colors.danger : theme.colors.cyan}
            />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ ...theme.type.h3, color: theme.colors.text }}>
              {live ? "Listening live" : lines.length > 0 ? `${lines.length} caption${lines.length === 1 ? "" : "s"}` : "Ready"}
            </Text>
            <Text style={{ ...theme.type.bodySm, color: error ? theme.colors.danger : theme.colors.textDim }}>
              {statusLabel}
            </Text>
          </View>
          <WaveformBars bars={16} height={28} color={theme.colors.cyan} active={live} />
        </View>
      </GlassCard>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {lines.length === 0 ? (
          <GlassCard intensity="low">
            <Text style={{ ...theme.type.body, color: theme.colors.textDim, textAlign: "center" }}>
              Tap the microphone and speak — ECHO will stream captions as you go, label speakers,
              and infer emotion. Anything said to {userName} gets highlighted.
            </Text>
          </GlassCard>
        ) : null}
        {lines.map((l) => {
          const isYou = l.speaker === "You" || l.speaker.toLowerCase() === userName.toLowerCase();
          return (
            <View
              key={l.id}
              style={[
                styles.bubble,
                isYou ? styles.bubbleYou : styles.bubbleOther,
                l.forYou && { borderColor: theme.colors.accent, borderWidth: 1.5 },
              ]}
            >
              <View style={styles.bubbleTop}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={[styles.avatar, { backgroundColor: avatarColor(l.speaker) }]}>
                    <Text style={styles.avatarText}>{l.speaker[0]?.toUpperCase() || "?"}</Text>
                  </View>
                  <Text style={styles.speaker}>{l.speaker}</Text>
                  <Text style={styles.time}>· {clock(l.at)}</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {l.forYou ? (
                    <Tag label="FOR YOU" color={theme.colors.accent} icon={<Ionicons name="person" size={10} color={theme.colors.accent} />} />
                  ) : null}
                  {l.emotion && l.emotion !== "neutral" ? (
                    <Tag label={l.emotion.toUpperCase()} color={emotionColor(l.emotion)} />
                  ) : null}
                </View>
              </View>
              <Text style={styles.lineText}>{l.text}</Text>
            </View>
          );
        })}
        {live ? (
          <View style={[styles.bubble, styles.bubbleOther, { opacity: 0.6 }]}>
            <Text style={{ ...theme.type.label, color: theme.colors.textMute }}>
              <ActivityIndicator size="small" color={theme.colors.cyan} /> capturing next {CHUNK_MS / 1000}s…
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable onPress={onClear} style={styles.footBtnGhost}>
          <Ionicons name="refresh" size={16} color={theme.colors.text} />
          <Text style={styles.footBtnText}>Clear</Text>
        </Pressable>
        <Pressable
          onPress={onCapture}
          disabled={capturing || lines.length === 0}
          style={[styles.footBtn, (capturing || lines.length === 0) && { opacity: 0.5 }]}
        >
          {capturing ? (
            <ActivityIndicator color="#07080F" />
          ) : (
            <Ionicons name="sparkles" size={16} color="#07080F" />
          )}
          <Text style={[styles.footBtnText, { color: "#07080F" }]}>
            {capturing ? "Capturing…" : "Capture actions"}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/*  helpers                                                                   */
/* -------------------------------------------------------------------------- */

type Chunk = { uri: string; ext: string; mime: string };

async function recordChunk(ms: number, shouldStop: () => boolean): Promise<Chunk | null> {
  if (Platform.OS === "web") {
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices) return null;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickWebMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const done = new Promise<Blob>((resolve) => { rec.onstop = () => resolve(new Blob(chunks, { type: mime || "audio/webm" })); });
      rec.start();
      await sleepUntil(ms, shouldStop);
      rec.stop();
      const blob = await done;
      stream.getTracks().forEach((t) => t.stop());
      const uri = URL.createObjectURL(blob);
      return { uri, mime: blob.type || mime || "audio/webm", ext: extFromMime(blob.type || mime || "audio/webm") };
    } catch {
      return null;
    }
  }

  try {
    const perm = await Audio.requestPermissionsAsync();
    if (!perm.granted) return null;
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      interruptionModeIOS: 1,
      interruptionModeAndroid: 1,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    } as any);
    const rec = new Audio.Recording();
    await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await rec.startAsync();
    await sleepUntil(ms, shouldStop);
    await rec.stopAndUnloadAsync();
    const uri = rec.getURI() || "";
    if (!uri) return null;
    return { uri, mime: "audio/mp4", ext: "m4a" };
  } catch {
    return null;
  }
}

/** Fire-and-forget transcription so the next chunk can start recording
 *  immediately. We deliberately set save=false — persisting every 4s chunk
 *  would produce hundreds of transcript rows per session. */
function transcribeInBackground(
  chunk: Chunk,
  userName: string,
  onDone: (segments: any[], text: string) => void,
) {
  (async () => {
    try {
      const form = await buildForm(chunk, "chunk");
      form.append("kind", "conversation_live");
      form.append("save", "false");
      const res = await fetch(`${api.url}/api/transcribe`, { method: "POST", body: form });
      if (!res.ok) return;
      const data: any = await res.json();
      onDone(Array.isArray(data.segments) ? data.segments : [], (data.text || "").trim());
    } catch {
      // swallow — next chunk will come along
    }
  })();
}

async function buildForm(chunk: Chunk, base: string): Promise<FormData> {
  const form = new FormData();
  const name = `${base}.${chunk.ext}`;
  if (chunk.uri.startsWith("blob:") || chunk.uri.startsWith("data:") || chunk.uri.startsWith("http")) {
    const resp = await fetch(chunk.uri);
    const blob = await resp.blob();
    const file = typeof File !== "undefined" ? new File([blob], name, { type: chunk.mime }) : blob;
    form.append("audio", file as any, name);
    return form;
  }
  // @ts-ignore — RN FormData
  form.append("audio", { uri: chunk.uri, name, type: chunk.mime });
  return form;
}

function pickWebMime(): string | undefined {
  if (typeof window === "undefined" || !(window as any).MediaRecorder) return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const c of candidates) {
    // @ts-ignore
    if (MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return undefined;
}

function extFromMime(mime: string) {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4"))  return "m4a";
  return "webm";
}

async function sleepUntil(ms: number, shouldStop: () => boolean) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (shouldStop()) return;
    await sleep(Math.min(150, end - Date.now()));
  }
}
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function isForYou(text: string, userName: string): boolean {
  if (!text || !userName) return false;
  const re = new RegExp(`\\b${escapeRegex(userName)}\\b`, "i");
  return re.test(text);
}
function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function avatarColor(name: string) {
  const pool = [theme.colors.primary, theme.colors.accent, theme.colors.cyan, theme.colors.warning, theme.colors.success];
  const hash = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  return pool[hash % pool.length];
}
function fmtDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 16, marginTop: 8 },
  eyebrow: { ...theme.type.label, color: theme.colors.accent },
  title:   { ...theme.type.display, color: theme.colors.text, marginTop: 2 },
  live:    { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: theme.radius.pill },
  liveDot: { width: 8, height: 8, borderRadius: 8, backgroundColor: "#fff" },
  liveText: { ...theme.type.label, color: "#fff" },

  micRing: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: "rgba(100,240,255,0.1)",
    borderWidth: 1, borderColor: "rgba(100,240,255,0.4)",
    alignItems: "center", justifyContent: "center",
  },
  micRingActive: {
    backgroundColor: "rgba(255,92,92,0.16)",
    borderColor: "rgba(255,92,92,0.6)",
  },

  bubble: {
    padding: 12, borderRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.colors.outlineSoft,
    marginBottom: 8,
  },
  bubbleYou: { backgroundColor: "rgba(124,92,255,0.18)", alignSelf: "flex-end", maxWidth: "88%" },
  bubbleOther: { backgroundColor: "rgba(255,255,255,0.04)", alignSelf: "flex-start", maxWidth: "88%" },
  bubbleTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 6 },
  avatar: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  avatarText: { ...theme.type.label, color: "#07080F" },
  speaker: { ...theme.type.label, color: theme.colors.text },
  time:    { ...theme.type.label, color: theme.colors.textMute },
  lineText: { ...theme.type.body, color: theme.colors.text, fontSize: 16, lineHeight: 22 },

  footer: { flexDirection: "row", gap: 10, paddingVertical: 14, paddingBottom: 100 },
  footBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 14, borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.accent,
  },
  footBtnGhost: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 14, paddingHorizontal: 18,
    borderRadius: theme.radius.lg,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: theme.colors.outlineSoft,
  },
  footBtnText: { ...theme.type.h3, color: theme.colors.text },
});
