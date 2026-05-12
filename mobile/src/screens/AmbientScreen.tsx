import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { Modal, Pressable, StyleSheet, Text, View, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Audio } from "expo-av";

import { Screen } from "@/components/Screen";
import { HoverGrowPressable } from "@/components/HoverGrowPressable";
import { GlassCard } from "@/components/GlassCard";
import { WaveformBars } from "@/components/WaveformBars";
import { SectionHeader } from "@/components/SectionHeader";
import { SoundEventItem } from "@/components/SoundEventItem";
import { Tag } from "@/components/Tag";
import { theme } from "@/theme";
import { useEcho, type SoundEvent } from "@/context/EchoContext";
import { clock, formatDurationMs, haptic, timeAgo } from "@/utils/format";
import { api } from "@/services/api";
import { loadListenLogs, type ListenSessionLog } from "@/utils/listenLogsStorage";
import {
  subscribeAmbientListenLogs,
  bumpActiveSessionChunkCount,
  bumpActiveSessionTasksAdded,
  patchActiveAmbientSession,
} from "@/utils/ambientSessionLifecycle";

const DIRECTIONS: Array<SoundEvent["direction"]> = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const CHUNK_MS = 5_000; // rolling chunk length
const PAUSE_BETWEEN_MS = 400; // tiny gap so the mic doesn't overlap
const HIGH_TIERS = new Set(["high", "emergency"]);

/**
 * Ambient listening that actually captures audio from the device microphone,
 * splits it into short rolling chunks, ships each one to the backend for
 * classification, and drops the top label into the event log. This works on
 * both native (expo-av m4a) and web (MediaRecorder → webm) via the recorder
 * hook logic we already use in ConversationScreen, but inlined here because
 * we need very tight start/stop control for the loop.
 */
function escapeRx(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function AmbientScreen() {
  const { isListening, setIsListening, nightMode, setNightMode, soundEvents, pushSoundEvent, clearEvents, userName, ingestPersistedActions } = useEcho();
  const [direction, setDirection] = useState<SoundEvent["direction"]>("N");
  const [lastResult, setLastResult] = useState<string>("");
  const [chunkCount, setChunkCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [capturedFromAmbient, setCapturedFromAmbient] = useState<number>(0);

  const [listenLogs, setListenLogs] = useState<ListenSessionLog[]>([]);
  const [detailLog, setDetailLog] = useState<ListenSessionLog | null>(null);

  const stopFlagRef = useRef(false);
  const loopRef = useRef<Promise<void> | null>(null);
  /** Last ~6 chunk transcripts (~30s) so a name in one chunk + task in the next still extract. */
  const rollingTextsRef = useRef<string[]>([]);
  const latestAmbientCombinedRef = useRef("");

  useEffect(() => {
    const reload = () => loadListenLogs().then(setListenLogs);
    reload();
    return subscribeAmbientListenLogs(reload);
  }, []);

  useEffect(() => {
    if (isListening) setChunkCount(0);
  }, [isListening]);

  // Core loop — runs as a single async task while ambient mode is on.
  const runLoop = useCallback(async () => {
    stopFlagRef.current = false;
    setErrorMsg(null);

    while (!stopFlagRef.current) {
      try {
        const chunk = await recordChunk(CHUNK_MS);
        if (stopFlagRef.current) break;
        if (!chunk) continue;

        const result: any = await api.classifySoundFromUri(chunk.uri, {
          ext: chunk.ext,
          mime: chunk.mime,
          skipLow: true, // don't pollute the log with pure silence or plain speech
          userName,
          persist: false, // pushSoundEvent handles the POST so we don't double-write
        });

        if (result?.top) {
          setLastResult(result.top.display);
          setChunkCount((c) => c + 1);
          void bumpActiveSessionChunkCount();
          const dir = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
          setDirection(dir);

          const text = (result.meta?.text || "").trim();
          if (text) {
            rollingTextsRef.current = [...rollingTextsRef.current, text].slice(-6);
          }
          const combined = rollingTextsRef.current.join(" ").replace(/\s+/g, " ").trim();
          latestAmbientCombinedRef.current = combined;

          const words = combined.split(/\s+/).filter(Boolean);
          const nameRe = userName ? new RegExp(`\\b${escapeRx(userName)}\\b`, "i") : null;
          const nameMentioned = Boolean(nameRe && combined.length >= 8 && nameRe.test(combined));
          const youDirected = /\b(you|your|you'?re|you'?ll|you need to|need you to|for you to)\b/i.test(combined);
          const shouldTryExtract =
            (nameMentioned && combined.length >= 10 && words.length >= 3)
            || (youDirected && combined.length >= 14 && words.length >= 4)
            || (combined.length >= 22 && words.length >= 5);

          // Only render real (non-skipped) classifications in the event log.
          const skipEvent = ["silence", "speech"].includes(result.top.label);
          if (!skipEvent) {
            pushSoundEvent({
              label: result.top.label,
              display: result.top.display,
              tier: result.top.tier,
              icon: result.top.icon,
              confidence: result.top.confidence || 0.7,
              room: null,
              direction: dir,
            });
            if (HIGH_TIERS.has(result.top.tier)) haptic.warning();
            else haptic.light();
          }

          // Extract as soon as transcript crosses the bar — no wait for recording to stop (each chunk may still add text).
          if (shouldTryExtract) {
            const transcript = latestAmbientCombinedRef.current;
            if (transcript && transcript.length >= 10) {
              extractActionsFromAmbient(transcript, userName)
                .then((persisted) => {
                  if (persisted.length === 0) return;
                  const added = ingestPersistedActions(persisted);
                  if (added > 0) {
                    setCapturedFromAmbient((n) => n + added);
                    haptic.success();
                    void bumpActiveSessionTasksAdded(added, transcript);
                  }
                  rollingTextsRef.current = [];
                })
                .catch(() => { /* non-fatal */ });
            }
          }
        }
      } catch (e: any) {
        const msg = e?.message || "Ambient loop error";
        setErrorMsg(msg);
        void patchActiveAmbientSession({ error: msg });
        // brief cooldown on failure so we don't spin
        await sleep(1500);
      }

      await sleep(PAUSE_BETWEEN_MS);
    }
  }, [pushSoundEvent, userName, ingestPersistedActions]);

  // Sync logs + recover mic loop when opening Listen after toggling ambient from Home.
  useFocusEffect(
    useCallback(() => {
      loadListenLogs().then(setListenLogs);
      if (isListening && !loopRef.current) {
        loopRef.current = runLoop().finally(() => {
          loopRef.current = null;
        });
      }
    }, [isListening, runLoop]),
  );

  useEffect(() => {
    if (isListening) {
      if (!loopRef.current) loopRef.current = runLoop().finally(() => { loopRef.current = null; });
    } else {
      stopFlagRef.current = true;
      rollingTextsRef.current = [];
    }
    return () => {
      stopFlagRef.current = true;
    };
  }, [isListening, runLoop]);

  const byTier = {
    emergency: soundEvents.filter((e) => e.tier === "emergency").length,
    high:      soundEvents.filter((e) => e.tier === "high").length,
    medium:    soundEvents.filter((e) => e.tier === "medium").length,
    low:       soundEvents.filter((e) => e.tier === "low").length,
  };

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>AMBIENT LISTENING</Text>
          <Text style={styles.title}>What ECHO hears</Text>
        </View>
        <Pressable
          onPress={() => { haptic.medium(); setIsListening(!isListening); }}
          style={[styles.toggle, { backgroundColor: isListening ? theme.colors.accent : "rgba(255,255,255,0.08)" }]}
        >
          <Ionicons
            name={isListening ? "radio" : "radio-outline"}
            size={16}
            color={isListening ? "#07080F" : theme.colors.text}
          />
          <Text style={{ ...theme.type.label, color: isListening ? "#07080F" : theme.colors.text }}>
            {isListening ? "LIVE" : "PAUSED"}
          </Text>
        </Pressable>
      </View>

      <GlassCard intensity="high" padded={false} style={{ overflow: "hidden" }}>
        <LinearGradient
          colors={["rgba(124,92,255,0.18)", "rgba(52,224,201,0.08)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={{ padding: 18 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <View
              style={[
                styles.radarTile,
                isListening ? styles.radarTileLive : styles.radarTileIdle,
              ]}
            >
              <DirectionIndicator direction={direction || "N"} />
            </View>

            <View style={{ flex: 1, gap: 8 }}>
              <Tag label="WHERE IT’S POINTING" color={theme.colors.accent} />
              <Text style={{ ...theme.type.title, color: theme.colors.text }}>
                {isListening ? (lastResult || `Listening in ${CHUNK_MS / 1000}s slices…`) : "Listening off"}
              </Text>
              <Text style={{ ...theme.type.bodySm, color: theme.colors.textDim }}>
                {isListening
                  ? `${chunkCount} sound clip${chunkCount === 1 ? "" : "s"} checked so far`
                  : "Tap Resume or Night below, LIVE in the header, or on Home — same listening session everywhere."}
              </Text>
              {capturedFromAmbient > 0 ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <Ionicons name="sparkles" size={12} color={theme.colors.accent} />
                  <Text style={{ ...theme.type.label, color: theme.colors.accent }}>
                    {capturedFromAmbient} task{capturedFromAmbient === 1 ? "" : "s"} saved from what we heard (same as Talk)
                  </Text>
                </View>
              ) : null}
              {errorMsg ? (
                <Text style={{ ...theme.type.bodySm, color: theme.colors.danger }}>{errorMsg}</Text>
              ) : null}
              <View style={{ marginTop: 4 }}>
                <WaveformBars bars={30} color={theme.colors.cyan} active={isListening} height={30} />
              </View>
            </View>
          </View>
          <View style={styles.ambientHeroRow}>
            <HoverGrowPressable
              onPress={() => { haptic.medium(); setIsListening(!isListening); }}
              style={[
                styles.ambientHeroBtn,
                Platform.OS === "web" ? { marginHorizontal: 0 } : null,
                {
                  backgroundColor: isListening ? "rgba(255,255,255,0.12)" : theme.colors.accent,
                  borderColor: isListening ? theme.colors.controlStrokeMuted : "rgba(6,32,28,0.55)",
                },
              ]}
            >
              <Ionicons
                name={isListening ? "pause" : "play"}
                size={20}
                color={isListening ? theme.colors.text : "#07080F"}
              />
              <Text style={[styles.ambientHeroBtnText, { color: isListening ? theme.colors.text : "#07080F" }]}>
                {isListening ? "Pause" : "Resume"}
              </Text>
            </HoverGrowPressable>
            <HoverGrowPressable
              onPress={() => { haptic.light(); setNightMode(!nightMode); }}
              style={[
                styles.ambientHeroBtn,
                Platform.OS === "web" ? { marginHorizontal: 0 } : null,
                {
                  backgroundColor: nightMode ? theme.colors.primary : "rgba(255,255,255,0.08)",
                  borderColor: nightMode ? "rgba(200,180,255,0.5)" : theme.colors.controlStroke,
                },
              ]}
            >
              <Ionicons name="moon" size={20} color={theme.colors.text} />
              <Text style={[styles.ambientHeroBtnText, { color: theme.colors.text }]}>
                Night {nightMode ? "on" : "off"}
              </Text>
            </HoverGrowPressable>
          </View>
        </View>
      </GlassCard>

      <View style={styles.statRow}>
        <StatPill label="Emergency" count={byTier.emergency} color={theme.colors.danger} />
        <StatPill label="Priority"  count={byTier.high}      color={theme.colors.warning} />
        <StatPill label="Notable"   count={byTier.medium}    color={theme.colors.accent} />
        <StatPill label="Logged"    count={byTier.low}       color={theme.colors.info} />
      </View>

      <GlassCard style={{ marginTop: 16 }}>
        <Text style={{ ...theme.type.label, color: theme.colors.accent }}>SESSION LOGS</Text>
        <Text style={{ ...theme.type.bodySm, color: theme.colors.textDim, marginTop: 4 }}>
          Each time listening starts (here or from Home), we open a session row. Pausing closes it. Newest at top. Tap a row for details.
        </Text>
        {listenLogs.length === 0 ? (
          <Text style={{ ...theme.type.body, color: theme.colors.textMute, marginTop: 12, textAlign: "center" }}>
            No sessions yet. Start listening once to create your first entry.
          </Text>
        ) : (
          [...listenLogs]
            .sort((a, b) => b.startedAt - a.startedAt)
            .map((log) => {
              const dur = log.endedAt ? log.endedAt - log.startedAt : Date.now() - log.startedAt;
              const open = !log.endedAt;
              return (
                <Pressable
                  key={log.id}
                  onPress={() => { setDetailLog(log); haptic.light(); }}
                  style={styles.logRow}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...theme.type.label, color: theme.colors.accent }}>
                      {open ? "Listening…" : "Session"} · {clock(log.startedAt)}
                    </Text>
                    <Text style={{ ...theme.type.bodySm, color: theme.colors.textDim, marginTop: 4 }}>
                      {open ? "In progress" : formatDurationMs(dur)} · {log.chunkCount} chunk{log.chunkCount === 1 ? "" : "s"} · {log.tasksAdded} task{log.tasksAdded === 1 ? "" : "s"}
                    </Text>
                    <Text style={{ ...theme.type.bodySm, color: theme.colors.textMute, marginTop: 2 }}>
                      Started {timeAgo(log.startedAt)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textMute} />
                </Pressable>
              );
            })
        )}
      </GlassCard>

      <SectionHeader
        eyebrow="Event log"
        title={`${soundEvents.length} detections`}
        action={
          <Pressable onPress={() => { haptic.light(); clearEvents(); }}>
            <Text style={{ ...theme.type.label, color: theme.colors.textMute }}>CLEAR</Text>
          </Pressable>
        }
      />
      {soundEvents.length === 0 ? (
        <GlassCard intensity="low">
          <View style={{ alignItems: "center", paddingVertical: 20 }}>
            <MaterialCommunityIcons name="waveform" size={40} color={theme.colors.textMute} />
            <Text style={{ ...theme.type.body, color: theme.colors.textDim, marginTop: 10, textAlign: "center" }}>
              Quiet for now. Sounds we recognize will show up here as they happen.
            </Text>
          </View>
        </GlassCard>
      ) : (
        soundEvents.map((e) => <SoundEventItem key={e.id} event={e} />)
      )}

      <Modal visible={!!detailLog} transparent animationType="fade" onRequestClose={() => setDetailLog(null)}>
        <Pressable style={styles.modalBg} onPress={() => setDetailLog(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            {detailLog ? (
              <>
                <Text style={{ ...theme.type.label, color: theme.colors.accent }}>SESSION DETAIL</Text>
                <Text style={{ ...theme.type.title, color: theme.colors.text, marginTop: 8 }}>
                  Listening started {clock(detailLog.startedAt)}
                </Text>
                <Text style={{ ...theme.type.bodySm, color: theme.colors.textDim, marginTop: 6 }}>
                  {detailLog.endedAt
                    ? `Stopped ${clock(detailLog.endedAt)} · ${formatDurationMs(detailLog.endedAt - detailLog.startedAt)}`
                    : "Still listening. Session ends when you pause."}
                </Text>
                <Text style={{ ...theme.type.bodySm, color: theme.colors.textMute, marginTop: 4 }}>
                  Relative start: {timeAgo(detailLog.startedAt)}
                </Text>
                <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.outlineSoft }}>
                  <Text style={{ ...theme.type.label, color: theme.colors.textDim }}>STATS</Text>
                  <Text style={{ ...theme.type.body, color: theme.colors.text, marginTop: 6 }}>
                    Chunks analyzed: {detailLog.chunkCount}
                  </Text>
                  <Text style={{ ...theme.type.body, color: theme.colors.text, marginTop: 4 }}>
                    Tasks added to calendar: {detailLog.tasksAdded}
                  </Text>
                  {detailLog.error ? (
                    <Text style={{ ...theme.type.bodySm, color: theme.colors.danger, marginTop: 8 }}>
                      Error: {detailLog.error}
                    </Text>
                  ) : null}
                </View>
                {detailLog.lastSnippet ? (
                  <View style={{ marginTop: 14 }}>
                    <Text style={{ ...theme.type.label, color: theme.colors.textDim }}>LAST TRANSCRIPT SNIPPET</Text>
                    <Text style={{ ...theme.type.bodySm, color: theme.colors.textDim, marginTop: 6, fontStyle: "italic" }}>
                      {detailLog.lastSnippet}
                    </Text>
                  </View>
                ) : null}
                <Pressable
                  onPress={() => setDetailLog(null)}
                  style={{
                    marginTop: 18,
                    paddingVertical: 12,
                    borderRadius: theme.radius.md,
                    backgroundColor: theme.colors.accent,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ ...theme.type.label, color: "#07080F" }}>Close</Text>
                </Pressable>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers — inline recorder so we can do tight loop control without relying */
/*  on the generic useAudioRecorder hook's React state machine.               */
/* -------------------------------------------------------------------------- */

type Chunk = { uri: string; mime: string; ext: string };

async function recordChunk(ms: number): Promise<Chunk | null> {
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
      await sleep(ms);
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
    await sleep(ms);
    await rec.stopAndUnloadAsync();
    const uri = rec.getURI() || "";
    if (!uri) return null;
    return { uri, mime: "audio/mp4", ext: "m4a" };
  } catch {
    return null;
  }
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

function extFromMime(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4"))  return "m4a";
  return "webm";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fire the ambient transcript at the action-extraction endpoint. Only returns
 * actions that cleared the backend's confidence threshold and were actually
 * persisted — anything lower is noise. Floor matches `/api/extract-actions` (0.55).
 */
async function extractActionsFromAmbient(transcript: string, userName: string) {
  try {
    const { persisted } = await api.extractActions({
      transcript,
      userName,
      context:
        "Rolling ambient transcript. Extract tasks for this user when their name is used OR when someone assigns work using 'you/your'. Put dated items on calendar with ISO when (tomorrow, next week, etc.).",
      persist: true,
    });
    return Array.isArray(persisted)
      ? persisted.filter((a: any) => (a.confidence ?? 0) >= 0.55)
      : [];
  } catch {
    return [];
  }
}

const StatPill: React.FC<{ label: string; count: number; color: string }> = ({ label, count, color }) => (
  <View style={[styles.statPill, { borderColor: color + "55", backgroundColor: color + "14" }]}>
    <Text style={[styles.statCount, { color }]}>{count}</Text>
    <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
  </View>
);

const DirectionIndicator: React.FC<{ direction: string }> = ({ direction }) => {
  const angles: Record<string, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
  const angle = angles[direction] ?? 0;
  return (
    <View style={{ width: 80, height: 80, alignItems: "center", justifyContent: "center" }}>
      <View style={{ transform: [{ rotate: `${angle}deg` }] }}>
        <Ionicons name="navigate" size={34} color={theme.colors.accent} />
      </View>
      <Text style={{ ...theme.type.label, color: theme.colors.text, marginTop: 4 }}>{direction}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 8, marginBottom: 16 },
  eyebrow: { ...theme.type.label, color: theme.colors.accent, marginBottom: 4 },
  title:   { ...theme.type.display, color: theme.colors.text },
  toggle: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: theme.radius.pill,
  },
  radarTile: {
    width: 104,
    paddingVertical: 10,
    borderRadius: theme.radius.lg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  radarTileLive: {
    borderColor: theme.colors.accent + "88",
    backgroundColor: theme.colors.accent + "14",
  },
  radarTileIdle: {
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  /** Pause/Resume + Night — narrow pills (max 156), not full-width. */
  ambientHeroRow: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    flexWrap: "wrap",
    gap: 8,
    alignSelf: "stretch",
  },
  ambientHeroBtn: {
    maxWidth: 156,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    borderWidth: theme.stroke.control,
  },
  ambientHeroBtnText: { ...theme.type.label, letterSpacing: 0.35, fontSize: 11 },
  statRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  statPill: {
    flex: 1, padding: 12,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    alignItems: "center",
  },
  statCount: { ...theme.type.title },
  statLabel: { ...theme.type.label, color: theme.colors.textDim, marginTop: 2, fontSize: 9 },

  logRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
  },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(5,6,16,0.78)",
    justifyContent: "center",
    padding: 22,
  },
  modalCard: {
    borderRadius: theme.radius.xl,
    padding: 20,
    backgroundColor: "#121530",
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    maxWidth: 420,
    alignSelf: "center",
    width: "100%",
  },
});
