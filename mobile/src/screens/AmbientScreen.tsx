import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Audio } from "expo-av";

import { Screen } from "@/components/Screen";
import { GlassCard } from "@/components/GlassCard";
import { PulseRing } from "@/components/PulseRing";
import { WaveformBars } from "@/components/WaveformBars";
import { SectionHeader } from "@/components/SectionHeader";
import { SoundEventItem } from "@/components/SoundEventItem";
import { Tag } from "@/components/Tag";
import { theme } from "@/theme";
import { useEcho, type SoundEvent } from "@/context/EchoContext";
import { haptic } from "@/utils/format";
import { api } from "@/services/api";

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
export default function AmbientScreen() {
  const { isListening, setIsListening, soundEvents, pushSoundEvent, clearEvents, userName, addAction } = useEcho();
  const [direction, setDirection] = useState<SoundEvent["direction"]>("N");
  const [lastResult, setLastResult] = useState<string>("");
  const [chunkCount, setChunkCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [capturedFromAmbient, setCapturedFromAmbient] = useState<number>(0);

  const stopFlagRef = useRef(false);
  const loopRef = useRef<Promise<void> | null>(null);
  /** Last ~6 chunk transcripts (~30s) so a name in one chunk + task in the next still extract. */
  const rollingTextsRef = useRef<string[]>([]);
  const ambientExtractDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestAmbientCombinedRef = useRef("");

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
          const dir = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
          setDirection(dir);

          const text = (result.meta?.text || "").trim();
          if (text) {
            rollingTextsRef.current = [...rollingTextsRef.current, text].slice(-6);
          }
          const combined = rollingTextsRef.current.join(" ").replace(/\s+/g, " ").trim();
          latestAmbientCombinedRef.current = combined;

          const nameRe = userName
            ? new RegExp(`\\b${userName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i")
            : null;
          const words = combined.split(/\s+/).filter(Boolean);
          // Name can fall in chunk N and the actual ask in N+1 — require name in *combined* text, not only this chunk.
          const shouldTryExtract =
            Boolean(userName && nameRe && words.length >= 3 && combined.length >= 6 && nameRe.test(combined));

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

          // Debounce: wait for speech to finish so we send one transcript with name + task across chunks.
          if (shouldTryExtract) {
            if (ambientExtractDebounceRef.current) clearTimeout(ambientExtractDebounceRef.current);
            ambientExtractDebounceRef.current = setTimeout(() => {
              ambientExtractDebounceRef.current = null;
              const transcript = latestAmbientCombinedRef.current;
              if (!userName || !nameRe || !transcript || !nameRe.test(transcript)) return;
              extractActionsFromAmbient(transcript, userName)
                .then((persisted) => {
                  if (persisted.length > 0) {
                    persisted.forEach((a) =>
                      addAction({
                        type: a.type, title: a.title, detail: a.detail,
                        when: a.when, sourceQuote: a.sourceQuote,
                        priority: a.priority, confidence: a.confidence,
                      }),
                    );
                    setCapturedFromAmbient((n) => n + persisted.length);
                    haptic.success();
                    rollingTextsRef.current = [];
                  }
                })
                .catch(() => { /* non-fatal */ });
            }, 1600);
          }
        }
      } catch (e: any) {
        setErrorMsg(e?.message || "Ambient loop error");
        // brief cooldown on failure so we don't spin
        await sleep(1500);
      }

      await sleep(PAUSE_BETWEEN_MS);
    }
  }, [pushSoundEvent, userName, addAction]);

  useEffect(() => {
    if (isListening) {
      if (!loopRef.current) loopRef.current = runLoop().finally(() => { loopRef.current = null; });
    } else {
      stopFlagRef.current = true;
      if (ambientExtractDebounceRef.current) {
        clearTimeout(ambientExtractDebounceRef.current);
        ambientExtractDebounceRef.current = null;
      }
      rollingTextsRef.current = [];
    }
    return () => {
      stopFlagRef.current = true;
      if (ambientExtractDebounceRef.current) {
        clearTimeout(ambientExtractDebounceRef.current);
        ambientExtractDebounceRef.current = null;
      }
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
            <View style={styles.radarWrap}>
              <PulseRing size={120} color={theme.colors.accent} active={isListening} rings={3}>
                <DirectionIndicator direction={direction || "N"} />
              </PulseRing>
            </View>

            <View style={{ flex: 1, gap: 8 }}>
              <Tag label="SPATIAL AWARENESS" color={theme.colors.accent} />
              <Text style={{ ...theme.type.title, color: theme.colors.text }}>
                {isListening ? (lastResult || `Sampling ${CHUNK_MS / 1000}s chunks…`) : "Ambient muted"}
              </Text>
              <Text style={{ ...theme.type.bodySm, color: theme.colors.textDim }}>
                {isListening
                  ? `${chunkCount} chunk${chunkCount === 1 ? "" : "s"} analyzed · Whisper + GPT-4o-mini classification`
                  : "Tap LIVE to start real ambient classification from your mic."}
              </Text>
              {capturedFromAmbient > 0 ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <Ionicons name="sparkles" size={12} color={theme.colors.accent} />
                  <Text style={{ ...theme.type.label, color: theme.colors.accent }}>
                    {capturedFromAmbient} task{capturedFromAmbient === 1 ? "" : "s"} auto-added when {userName} was heard
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
        </View>
      </GlassCard>

      <View style={styles.statRow}>
        <StatPill label="Emergency" count={byTier.emergency} color={theme.colors.danger} />
        <StatPill label="Priority"  count={byTier.high}      color={theme.colors.warning} />
        <StatPill label="Notable"   count={byTier.medium}    color={theme.colors.accent} />
        <StatPill label="Logged"    count={byTier.low}       color={theme.colors.info} />
      </View>

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
              Silence for now. Real-world events will appear here as ECHO picks them up.
            </Text>
          </View>
        </GlassCard>
      ) : (
        soundEvents.map((e) => <SoundEventItem key={e.id} event={e} />)
      )}
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
      context: "Heard in the background during ambient listening",
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
  radarWrap: { width: 120, height: 120, alignItems: "center", justifyContent: "center" },
  statRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  statPill: {
    flex: 1, padding: 12,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    alignItems: "center",
  },
  statCount: { ...theme.type.title },
  statLabel: { ...theme.type.label, color: theme.colors.textDim, marginTop: 2, fontSize: 9 },
});
