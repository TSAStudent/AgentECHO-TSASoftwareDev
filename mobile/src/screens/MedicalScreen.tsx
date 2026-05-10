import React, { useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

import { Screen } from "@/components/Screen";
import { GlassCard } from "@/components/GlassCard";
import { SectionHeader } from "@/components/SectionHeader";
import { Tag } from "@/components/Tag";
import { theme } from "@/theme";
import { useEcho } from "@/context/EchoContext";
import { haptic, timeAgo } from "@/utils/format";
import { useAudioRecorder } from "@/utils/useAudioRecorder";
import { api } from "@/services/api";

type VisitPhase = "idle" | "recording" | "transcribing" | "summarizing" | "error";

export default function MedicalScreen() {
  const nav = useNavigation();
  const { medications, userName, addMedication, takeMedication, removeMedication, addAction } = useEcho();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: "", schedule: "", prescribedBy: "" });
  const { status: recStatus, start, stop, durationMs } = useAudioRecorder();
  const [visitPhase, setVisitPhase] = useState<VisitPhase>("idle");
  const [visitSummary, setVisitSummary] = useState<any | null>(null);
  const [visitTranscript, setVisitTranscript] = useState<string>("");
  const [visitError, setVisitError] = useState<string | null>(null);
  const recording = recStatus === "recording";

  const onRecordVisit = async () => {
    haptic.medium();
    if (!recording) {
      setVisitSummary(null); setVisitTranscript(""); setVisitError(null);
      await start();
      setVisitPhase("recording");
      return;
    }
    setVisitPhase("transcribing");
    const res = await stop();
    if (!res?.uri) { setVisitPhase("error"); setVisitError("Empty recording"); return; }
    try {
      const tr: any = await api.transcribe(res.uri, {
        kind: "medical_visit",
        ext: res.ext,
        mime: res.mime,
        title: `Medical visit · ${new Date().toLocaleString()}`,
      });
      const text = (tr.text || "").trim();
      if (!text) { setVisitPhase("error"); setVisitError("No speech detected"); return; }
      setVisitTranscript(text);

      setVisitPhase("summarizing");
      // Two parallel extractions: structured meeting-style summary + smart actions
      const [summary, extracted] = await Promise.all([
        api.summarize({ transcript: text, kind: "meeting", save: true, transcriptId: tr.savedTranscriptId || null }),
        api.extractActions({ transcript: text, userName, context: "Medical visit", persist: true }),
      ]);
      setVisitSummary(summary);
      if (Array.isArray(extracted?.persisted)) {
        extracted.persisted.forEach((a: any) =>
          addAction({
            type: a.type, title: a.title, detail: a.detail,
            when: a.when, sourceQuote: a.sourceQuote,
            priority: a.priority, confidence: a.confidence,
          }),
        );
      }
      setVisitPhase("idle");
      haptic.success();
    } catch (err: any) {
      setVisitPhase("error");
      setVisitError(err?.message || "Visit analysis failed");
    }
  };

  const phaseLabel = (() => {
    switch (visitPhase) {
      case "recording":    return `RECORDING · ${(durationMs / 1000).toFixed(1)}s — tap to stop`;
      case "transcribing": return "TRANSCRIBING…";
      case "summarizing":  return "EXTRACTING MEDS & FOLLOW-UPS…";
      case "error":        return `ERROR — ${visitError}`;
      default:             return "TAP TO RECORD — stays on-device until you stop.";
    }
  })();

  const onSubmit = () => {
    if (!form.name.trim()) return;
    addMedication({
      name: form.name.trim(),
      schedule: form.schedule.trim() || "Daily",
      prescribedBy: form.prescribedBy.trim() || null,
      nextDose: Date.now() + 1000 * 60 * 60,
    });
    setForm({ name: "", schedule: "", prescribedBy: "" });
    setModalOpen(false);
    haptic.success();
  };

  const active = medications.filter((m) => m.active);
  const nextDose = active
    .map((m) => m.nextDose)
    .filter((x): x is number => typeof x === "number")
    .sort((a, b) => a - b)[0];

  return (
    <Screen>
      <View style={styles.top}>
        <Pressable onPress={() => nav.goBack()} style={styles.back}>
          <Feather name="chevron-left" size={22} color={theme.colors.text} />
        </Pressable>
        <Tag label="HIPAA-READY" color={theme.colors.success} icon={<Ionicons name="lock-closed" size={10} color={theme.colors.success} />} />
      </View>

      <Text style={styles.eyebrow}>Medical Agent</Text>
      <Text style={styles.title}>Appointment companion</Text>

      <GlassCard padded={false} style={{ overflow: "hidden", marginTop: 16 }}>
        <View style={{ padding: 18 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="stethoscope" size={26} color={theme.colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ ...theme.type.title, color: theme.colors.text }}>Record with consent</Text>
              <Text style={{ ...theme.type.bodySm, color: theme.colors.textDim, marginTop: 2 }}>
                Whisper + GPT-4o extract meds, follow-ups, and action items straight to your home screen.
              </Text>
            </View>
          </View>
          <Pressable
            onPress={onRecordVisit}
            disabled={visitPhase === "transcribing" || visitPhase === "summarizing"}
            style={[
              styles.recordBtn,
              recording && { backgroundColor: theme.colors.danger },
              (visitPhase === "transcribing" || visitPhase === "summarizing") && { opacity: 0.7 },
            ]}
          >
            {visitPhase === "transcribing" || visitPhase === "summarizing" ? (
              <ActivityIndicator color="#07080F" />
            ) : (
              <MaterialCommunityIcons name={recording ? "stop" : "microphone"} size={18} color="#07080F" />
            )}
            <Text style={styles.recordBtnText}>
              {recording ? "Stop & analyze" : visitPhase === "transcribing" ? "Transcribing…" : visitPhase === "summarizing" ? "Summarizing…" : "Start recording visit"}
            </Text>
          </Pressable>
          <Text style={{ ...theme.type.label, color: theme.colors.textMute, marginTop: 10 }}>{phaseLabel}</Text>
        </View>
      </GlassCard>

      {visitSummary ? (
        <>
          <SectionHeader eyebrow="This visit" title={visitSummary.title || "Visit summary"} />
          <GlassCard>
            <Text style={{ ...theme.type.label, color: theme.colors.accent }}>TL;DR</Text>
            <Text style={{ ...theme.type.body, color: theme.colors.text, marginTop: 4 }}>{visitSummary.tldr}</Text>
          </GlassCard>
          {Array.isArray(visitSummary.actionItems) && visitSummary.actionItems.length > 0 ? (
            <>
              <SectionHeader eyebrow="Follow-ups" title="Action items extracted" />
              {visitSummary.actionItems.map((a: any, i: number) => (
                <GlassCard key={i} intensity="low" style={{ marginBottom: 8 }}>
                  <Text style={{ ...theme.type.label, color: theme.colors.accent }}>{(a.owner || "YOU").toUpperCase()}</Text>
                  <Text style={{ ...theme.type.body, color: theme.colors.text, marginTop: 2 }}>{a.task}</Text>
                </GlassCard>
              ))}
            </>
          ) : null}
          {visitTranscript ? (
            <>
              <SectionHeader eyebrow="Transcript" title={`${visitTranscript.split(/\s+/).length} words`} />
              <GlassCard intensity="low">
                <Text numberOfLines={8} style={{ ...theme.type.bodySm, color: theme.colors.textDim }}>
                  {visitTranscript}
                </Text>
              </GlassCard>
            </>
          ) : null}
        </>
      ) : null}

      <SectionHeader
        eyebrow="Prescriptions"
        title={`${active.length} active · ${nextDose ? "next " + relativeTime(nextDose) : "no upcoming dose"}`}
        action={
          <Pressable onPress={() => { haptic.light(); setModalOpen(true); }} hitSlop={10}>
            <Feather name="plus" size={18} color={theme.colors.accent} />
          </Pressable>
        }
      />
      {active.length === 0 ? (
        <GlassCard intensity="low">
          <Text style={{ ...theme.type.body, color: theme.colors.textDim, textAlign: "center" }}>
            No medications yet. Tap + to add one, or record a visit so ECHO can extract them.
          </Text>
        </GlassCard>
      ) : (
        active.map((m) => (
          <GlassCard key={m.id} intensity="low" style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={[styles.pillIcon, { backgroundColor: theme.colors.warning + "22", borderColor: theme.colors.warning + "55" }]}>
                <MaterialCommunityIcons name="pill" size={20} color={theme.colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ ...theme.type.h3, color: theme.colors.text }}>{m.name}</Text>
                <Text style={{ ...theme.type.bodySm, color: theme.colors.textDim, marginTop: 2 }}>{m.schedule}</Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 4, alignItems: "center" }}>
                  {m.nextDose ? (
                    <Text style={{ ...theme.type.label, color: theme.colors.success }}>
                      Next · {relativeTime(m.nextDose)}
                    </Text>
                  ) : null}
                  {m.lastTakenAt ? (
                    <Text style={{ ...theme.type.label, color: theme.colors.textMute }}>
                      · Taken {timeAgo(m.lastTakenAt)}
                    </Text>
                  ) : null}
                </View>
              </View>
              <Pressable onPress={() => { haptic.success(); takeMedication(m.id); }} style={styles.takeBtn}>
                <Ionicons name="checkmark" size={14} color="#07080F" />
                <Text style={styles.takeBtnText}>TAKEN</Text>
              </Pressable>
              <Pressable onPress={() => { haptic.light(); removeMedication(m.id); }} hitSlop={10} style={{ marginLeft: 6 }}>
                <Feather name="x" size={16} color={theme.colors.textMute} />
              </Pressable>
            </View>
          </GlassCard>
        ))
      )}

      <SectionHeader eyebrow="Follow-ups" title="On your calendar" />
      <GlassCard intensity="low">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Ionicons name="calendar" size={22} color={theme.colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ ...theme.type.h3, color: theme.colors.text }}>Lab work in 2 weeks</Text>
            <Text style={{ ...theme.type.bodySm, color: theme.colors.textDim, marginTop: 2 }}>
              Reminder set for 24h before.
            </Text>
          </View>
        </View>
      </GlassCard>

      <SectionHeader eyebrow="Two-way mode" title="Medical glossary translator" />
      <GlassCard>
        <Text style={{ ...theme.type.body, color: theme.colors.textDim }}>
          In-visit mode optimizes ASR + ASL translation for medical vocabulary — "hypertension",
          "tachycardia", dosage units — so nothing gets lost between you and your provider.
        </Text>
      </GlassCard>

      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setModalOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={{ ...theme.type.label, color: theme.colors.accent }}>PRESCRIPTION</Text>
            <Text style={{ ...theme.type.title, color: theme.colors.text, marginTop: 4 }}>Add medication</Text>

            <Text style={styles.formLabel}>Name & dose</Text>
            <TextInput
              value={form.name}
              onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
              placeholder="e.g. Lisinopril 10 mg"
              placeholderTextColor={theme.colors.textMute}
              style={styles.input}
            />
            <Text style={styles.formLabel}>Schedule</Text>
            <TextInput
              value={form.schedule}
              onChangeText={(v) => setForm((f) => ({ ...f, schedule: v }))}
              placeholder="e.g. Every morning with water"
              placeholderTextColor={theme.colors.textMute}
              style={styles.input}
            />
            <Text style={styles.formLabel}>Prescribed by (optional)</Text>
            <TextInput
              value={form.prescribedBy}
              onChangeText={(v) => setForm((f) => ({ ...f, prescribedBy: v }))}
              placeholder="e.g. Dr. Lin"
              placeholderTextColor={theme.colors.textMute}
              style={styles.input}
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
              <Pressable onPress={() => setModalOpen(false)} style={[styles.mBtn, styles.mBtnGhost]}>
                <Text style={{ ...theme.type.label, color: theme.colors.text }}>CANCEL</Text>
              </Pressable>
              <Pressable onPress={onSubmit} style={[styles.mBtn, { backgroundColor: theme.colors.success }]}>
                <Text style={{ ...theme.type.label, color: "#07080F" }}>ADD</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function relativeTime(ts: number): string {
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60_000);
  const h = Math.round(abs / 3_600_000);
  const d = Math.round(abs / 86_400_000);
  const unit = abs < 3_600_000 ? `${m}m` : abs < 86_400_000 ? `${h}h` : `${d}d`;
  return diff >= 0 ? `in ${unit}` : `${unit} ago`;
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, marginBottom: 12 },
  back: {
    width: 38, height: 38, borderRadius: 38,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: theme.colors.outlineSoft,
  },
  eyebrow: { ...theme.type.label, color: theme.colors.success, marginBottom: 4 },
  title: { ...theme.type.display, color: theme.colors.text },
  iconWrap: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: theme.colors.success + "20",
    borderWidth: 1, borderColor: theme.colors.success + "55",
    alignItems: "center", justifyContent: "center",
  },
  pillIcon: {
    width: 40, height: 40, borderRadius: 12,
    borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  takeBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: theme.colors.success,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: theme.radius.pill,
  },
  takeBtnText: { ...theme.type.label, color: "#07080F", fontSize: 10 },
  recordBtn: {
    marginTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 12, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.success,
  },
  recordBtnText: { ...theme.type.h3, color: "#07080F" },

  modalBg: {
    flex: 1, backgroundColor: "rgba(5,6,16,0.75)",
    alignItems: "center", justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%", maxWidth: 380,
    backgroundColor: "#121530",
    borderRadius: theme.radius.xl,
    padding: 20,
    borderWidth: 1, borderColor: theme.colors.outlineSoft,
  },
  formLabel: { ...theme.type.label, color: theme.colors.textDim, marginTop: 14, marginBottom: 6 },
  input: {
    ...theme.type.body,
    color: theme.colors.text,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1, borderColor: theme.colors.outlineSoft,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  mBtn: {
    flex: 1, paddingVertical: 12,
    borderRadius: theme.radius.md,
    alignItems: "center",
  },
  mBtnGhost: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: theme.colors.outlineSoft,
  },
});
