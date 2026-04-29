import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

import { Screen } from "@/components/Screen";
import { GlassCard } from "@/components/GlassCard";
import { SectionHeader } from "@/components/SectionHeader";
import { Tag } from "@/components/Tag";
import { theme } from "@/theme";
import { haptic } from "@/utils/format";
import { api } from "@/services/api";
import { useAudioRecorder } from "@/utils/useAudioRecorder";

type Phase = "idle" | "recording" | "transcribing" | "summarizing" | "done" | "error";

export default function ClassroomScreen() {
  const nav = useNavigation();
  const [mode, setMode] = useState<"lecture" | "meeting">("lecture");
  const [summary, setSummary] = useState<any | null>(null);
  const [vibe, setVibe] = useState<any | null>(null);
  const [transcript, setTranscript] = useState<string>("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { status, start, stop, durationMs } = useAudioRecorder();

  const recording = status === "recording";

  const onRecord = async () => {
    haptic.medium();
    if (!recording) {
      setSummary(null); setVibe(null); setTranscript(""); setErrorMsg(null);
      await start();
      setPhase("recording");
      return;
    }

    setPhase("transcribing");
    const result = await stop();
    if (!result?.uri) { setPhase("error"); setErrorMsg("Recording was empty"); return; }

    try {
      const tr: any = await api.transcribe(result.uri, {
        kind: mode,
        ext: result.ext,
        mime: result.mime,
        title: `${mode === "lecture" ? "Lecture" : "Meeting"} · ${new Date().toLocaleString()}`,
      });
      const text = (tr.text || "").trim();
      if (!text) { setPhase("error"); setErrorMsg("No speech detected"); return; }
      setTranscript(text);

      setPhase("summarizing");
      const sum = await api.summarize({
        transcript: text,
        kind: mode,
        save: true,
        transcriptId: tr.savedTranscriptId || null,
      });
      setSummary(sum);

      // For meetings, also run the vibe/mood report.
      if (mode === "meeting") {
        try {
          const v = await api.vibe(text);
          setVibe(v);
        } catch { /* non-fatal */ }
      }

      setPhase("done");
      haptic.success();
    } catch (err: any) {
      setPhase("error");
      setErrorMsg(err?.message || "Summarization failed");
    }
  };

  const phaseLabel = (() => {
    switch (phase) {
      case "recording":    return `RECORDING · ${(durationMs / 1000).toFixed(1)}s — tap to stop`;
      case "transcribing": return "TRANSCRIBING WITH WHISPER…";
      case "summarizing":  return "STRUCTURING NOTES WITH GPT-4O…";
      case "done":         return "READY";
      case "error":        return `ERROR — ${errorMsg}`;
      default:             return "TAP RECORD TO START";
    }
  })();

  return (
    <Screen>
      <View style={styles.top}>
        <Pressable onPress={() => nav.goBack()} style={styles.back}>
          <Feather name="chevron-left" size={22} color={theme.colors.text} />
        </Pressable>
        <Tag label="ECHO CLASSROOM" color={theme.colors.warning} />
      </View>

      <Text style={styles.eyebrow}>{mode === "lecture" ? "Live lecture" : "Live meeting"}</Text>
      <Text style={styles.title}>
        Auto {mode === "lecture" ? "notes & flashcards" : "notes, decisions & follow-ups"}
      </Text>

      <View style={styles.modes}>
        {[
          { key: "lecture", label: "Lecture", icon: "school" },
          { key: "meeting", label: "Meeting", icon: "briefcase" },
        ].map((m) => (
          <Pressable
            key={m.key}
            onPress={() => {
              if (recording) return;
              setMode(m.key as any); setSummary(null); setVibe(null); setTranscript(""); haptic.light();
            }}
            style={[styles.mode, mode === m.key && styles.modeActive]}
          >
            <Ionicons name={m.icon as any} size={16} color={mode === m.key ? "#07080F" : theme.colors.text} />
            <Text style={[styles.modeText, { color: mode === m.key ? "#07080F" : theme.colors.text }]}>{m.label}</Text>
          </Pressable>
        ))}
      </View>

      <GlassCard padded={false} style={{ overflow: "hidden" }}>
        <LinearGradient
          colors={["rgba(255,181,71,0.24)", "rgba(255,106,136,0.10)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={{ padding: 18 }}>
          <Text style={{ ...theme.type.title, color: theme.colors.text }}>
            {mode === "lecture" ? "Record your lecture" : "Record your meeting"}
          </Text>
          <Text style={{ ...theme.type.bodySm, color: theme.colors.textDim, marginTop: 4 }}>
            Whisper transcribes every speaker. When you stop, GPT-4o structures your
            {mode === "lecture" ? " notes, pulls key terms, writes flashcards" : " notes, decisions, action items and drafts a follow-up email"}.
          </Text>

          <Pressable onPress={onRecord} disabled={phase === "transcribing" || phase === "summarizing"} style={[
            styles.runBtn,
            recording && { backgroundColor: theme.colors.danger },
            (phase === "transcribing" || phase === "summarizing") && { opacity: 0.7 },
          ]}>
            {phase === "transcribing" || phase === "summarizing" ? (
              <ActivityIndicator color="#07080F" />
            ) : (
              <MaterialCommunityIcons
                name={recording ? "stop" : "microphone"}
                size={18}
                color="#07080F"
              />
            )}
            <Text style={styles.runBtnText}>
              {recording ? "Stop & analyze" : phase === "transcribing" ? "Transcribing…" : phase === "summarizing" ? "Summarizing…" : "Start recording"}
            </Text>
          </Pressable>

          <Text style={{ ...theme.type.label, color: theme.colors.textMute, marginTop: 10 }}>{phaseLabel}</Text>
        </View>
      </GlassCard>

      {transcript ? (
        <>
          <SectionHeader eyebrow="Raw transcript" title={`${transcript.split(/\s+/).length} words captured`} />
          <GlassCard intensity="low">
            <Text style={{ ...theme.type.bodySm, color: theme.colors.textDim }} numberOfLines={12}>
              {transcript}
            </Text>
          </GlassCard>
        </>
      ) : null}

      {summary ? (
        <>
          <SectionHeader eyebrow="Output" title={summary.title || "Summary"} />
          <GlassCard>
            <Text style={{ ...theme.type.body, color: theme.colors.text }}>{summary.tldr}</Text>
          </GlassCard>

          {mode === "lecture" && summary.outline ? (
            <>
              <SectionHeader eyebrow="Outline" title="Structured notes" />
              {summary.outline.map((o: any, i: number) => (
                <GlassCard key={i} intensity="low" style={{ marginBottom: 8 }}>
                  <Text style={{ ...theme.type.h3, color: theme.colors.text, marginBottom: 6 }}>{o.heading}</Text>
                  {o.bullets?.map((b: string, j: number) => (
                    <View key={j} style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
                      <Text style={{ color: theme.colors.accent }}>•</Text>
                      <Text style={{ ...theme.type.body, color: theme.colors.textDim, flex: 1 }}>{b}</Text>
                    </View>
                  ))}
                </GlassCard>
              ))}
            </>
          ) : null}

          {mode === "lecture" && summary.keyTerms ? (
            <>
              <SectionHeader eyebrow="Vocabulary" title="Key terms" />
              {summary.keyTerms.map((k: any, i: number) => (
                <GlassCard key={i} intensity="low" style={{ marginBottom: 8 }}>
                  <Text style={{ ...theme.type.h3, color: theme.colors.accent }}>{k.term}</Text>
                  <Text style={{ ...theme.type.body, color: theme.colors.textDim, marginTop: 4 }}>{k.definition}</Text>
                </GlassCard>
              ))}
            </>
          ) : null}

          {mode === "lecture" && summary.flashcards ? (
            <>
              <SectionHeader eyebrow="Study" title="Flashcards" />
              {summary.flashcards.map((f: any, i: number) => (
                <GlassCard key={i} intensity="low" style={{ marginBottom: 8 }}>
                  <Text style={{ ...theme.type.label, color: theme.colors.textMute }}>Q</Text>
                  <Text style={{ ...theme.type.body, color: theme.colors.text, marginBottom: 8 }}>{f.q}</Text>
                  <Text style={{ ...theme.type.label, color: theme.colors.textMute }}>A</Text>
                  <Text style={{ ...theme.type.body, color: theme.colors.accent }}>{f.a}</Text>
                </GlassCard>
              ))}
            </>
          ) : null}

          {mode === "meeting" && summary.actionItems ? (
            <>
              <SectionHeader eyebrow="Follow-ups" title="Action items" />
              {summary.actionItems.map((a: any, i: number) => (
                <GlassCard key={i} intensity="low" style={{ marginBottom: 8 }}>
                  <Text style={{ ...theme.type.label, color: theme.colors.accent }}>{(a.owner || "").toUpperCase()}</Text>
                  <Text style={{ ...theme.type.body, color: theme.colors.text, marginTop: 2 }}>{a.task}</Text>
                </GlassCard>
              ))}
            </>
          ) : null}

          {mode === "meeting" && summary.followUpEmailDraft ? (
            <>
              <SectionHeader eyebrow="Email draft" title="Auto-drafted follow-up" />
              <GlassCard intensity="low">
                <Text style={{ ...theme.type.body, color: theme.colors.textDim }}>{summary.followUpEmailDraft}</Text>
              </GlassCard>
            </>
          ) : null}

          {mode === "meeting" && vibe ? (
            <>
              <SectionHeader eyebrow="Vibe report" title={vibe.overall || "Mood"} />
              <GlassCard intensity="low">
                <Text style={{ ...theme.type.body, color: theme.colors.text }}>{vibe.summary}</Text>
              </GlassCard>
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, marginBottom: 12 },
  back: {
    width: 38, height: 38, borderRadius: 38,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: theme.colors.outlineSoft,
  },
  eyebrow: { ...theme.type.label, color: theme.colors.warning, marginBottom: 4 },
  title: { ...theme.type.display, color: theme.colors.text },

  modes: { flexDirection: "row", gap: 6, marginTop: 18, marginBottom: 14 },
  mode: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 10, borderRadius: theme.radius.pill,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: theme.colors.outlineSoft,
  },
  modeActive: { backgroundColor: theme.colors.warning, borderColor: theme.colors.warning },
  modeText: { ...theme.type.label },

  runBtn: {
    marginTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.warning,
  },
  runBtnText: { ...theme.type.h3, color: "#07080F" },
});
