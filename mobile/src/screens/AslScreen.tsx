import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";

import { Screen } from "@/components/Screen";
import { GlassCard } from "@/components/GlassCard";
import { PulseRing } from "@/components/PulseRing";
import { WaveformBars } from "@/components/WaveformBars";
import { Tag } from "@/components/Tag";
import { theme } from "@/theme";
import { haptic } from "@/utils/format";
import { api } from "@/services/api";
import { useAudioRecorder } from "@/utils/useAudioRecorder";

type Mode = "sign_to_speech" | "speech_to_sign" | "service";

const FRAME_INTERVAL_MS = 1800;

export default function AslScreen() {
  const [mode, setMode] = useState<Mode>("sign_to_speech");
  const [permission, requestPermission] = useCameraPermissions();
  const [activeSigns, setActiveSigns] = useState<string[]>([]);
  const [recognizing, setRecognizing] = useState(false);
  const [heardText, setHeardText] = useState("");
  const [speechPhase, setSpeechPhase] = useState<"idle" | "recording" | "transcribing">("idle");
  const [speaking, setSpeaking] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cameraRef = useRef<CameraView | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);
  const signsRef = useRef<string[]>([]);
  const { status: recStatus, start, stop } = useAudioRecorder();

  // Keep a ref in sync with signs — the camera loop callback closes over stale
  // state otherwise and we lose the running gloss history.
  useEffect(() => { signsRef.current = activeSigns; }, [activeSigns]);

  // ---------- sign → speech: camera frame loop ----------
  const captureFrame = useCallback(async () => {
    if (inFlightRef.current || !cameraRef.current) return;
    try {
      inFlightRef.current = true;
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        base64: true,
        skipProcessing: true,
      });
      const base64 = (photo as any)?.base64;
      if (!base64) return;
      setRecognizing(true);
      const res: any = await api.recognizeSign(base64, signsRef.current.slice(-6));
      setRecognizing(false);
      const gloss = (res?.gloss || res?.sign || res?.top || "").toString().trim().toUpperCase();
      if (gloss && gloss !== "NONE" && gloss.length < 24 && gloss !== signsRef.current[signsRef.current.length - 1]) {
        setActiveSigns((prev) => [...prev.slice(-14), gloss]);
        haptic.light();
      }
    } catch (e: any) {
      setErr(e?.message || "Vision request failed");
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (mode !== "sign_to_speech") return;
    if (!permission?.granted) return;

    // Kick off the rolling capture.
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(captureFrame, FRAME_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [mode, permission?.granted, captureFrame]);

  // ---------- voice → sign: real mic → whisper ----------
  const onSpeechStartStop = async () => {
    haptic.medium();
    if (recStatus === "recording") {
      setSpeechPhase("transcribing");
      const result = await stop();
      if (!result?.uri) { setSpeechPhase("idle"); return; }
      try {
        const tr: any = await api.transcribe(result.uri, {
          kind: "asl_bridge",
          ext: result.ext,
          mime: result.mime,
          title: "ASL bridge capture",
        });
        setHeardText((tr.text || "").trim());
      } catch (e: any) {
        setErr(e?.message || "Transcribe failed");
      } finally {
        setSpeechPhase("idle");
      }
      return;
    }
    setHeardText("");
    await start();
    setSpeechPhase("recording");
  };

  // ---------- service: speak a phrase aloud via backend TTS ----------
  const speakAloud = async (text: string) => {
    setSpeaking(true);
    haptic.medium();
    try {
      const r: any = await api.tts(text);
      if (Platform.OS === "web" && r?.audioBase64) {
        const audio = new Audio(`data:${r.mime || "audio/mpeg"};base64,${r.audioBase64}`);
        await audio.play().catch(() => {});
      } else if (r?.audioBase64) {
        // Native: decode + play via expo-av. Lazy import so web doesn't pay the cost.
        const { Audio } = await import("expo-av");
        const sound = new Audio.Sound();
        await sound.loadAsync({ uri: `data:${r.mime || "audio/mpeg"};base64,${r.audioBase64}` } as any);
        await sound.playAsync();
      }
    } catch {}
    setTimeout(() => setSpeaking(false), 1800);
  };

  const spokenTranslation = activeSigns.length > 0
    ? activeSigns.join(" ").toLowerCase().replace(/\b./, (c) => c.toUpperCase()) + "."
    : "…waiting for your first sign";

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>ASL BRIDGE</Text>
          <Text style={styles.title}>Two-way translator</Text>
        </View>
      </View>

      <View style={styles.modes}>
        <ModePill active={mode === "sign_to_speech"} label="Sign → Voice" icon="hand-wave" onPress={() => { setMode("sign_to_speech"); setActiveSigns([]); haptic.light(); }} />
        <ModePill active={mode === "speech_to_sign"} label="Voice → Sign" icon="microphone" onPress={() => { setMode("speech_to_sign"); haptic.light(); }} />
        <ModePill active={mode === "service"}        label="Service mode" icon="storefront" onPress={() => { setMode("service"); haptic.light(); }} />
      </View>

      <GlassCard padded={false} intensity="high" style={{ overflow: "hidden" }}>
        <LinearGradient
          colors={["rgba(124,92,255,0.25)", "rgba(52,224,201,0.10)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.stage}>
          {mode === "sign_to_speech" && (
            <>
              {!permission ? (
                <Text style={{ color: theme.colors.textDim }}>Checking camera…</Text>
              ) : !permission.granted ? (
                <View style={{ alignItems: "center", paddingVertical: 20 }}>
                  <MaterialCommunityIcons name="camera-off-outline" size={44} color={theme.colors.textMute} />
                  <Text style={styles.stageTitle}>Camera access needed</Text>
                  <Text style={styles.stageSub}>
                    Grant camera permission and ECHO will watch your signs frame-by-frame
                    via GPT-4o Vision.
                  </Text>
                  <Pressable onPress={requestPermission} style={styles.permBtn}>
                    <Text style={styles.permBtnText}>Enable camera</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={{ alignItems: "center" }}>
                  <View style={styles.cameraWrap}>
                    <CameraView
                      ref={(r) => { cameraRef.current = r; }}
                      style={StyleSheet.absoluteFill}
                      facing="front"
                    />
                    {recognizing ? (
                      <View style={styles.scanBadge}>
                        <ActivityIndicator size="small" color={theme.colors.accent} />
                        <Text style={{ ...theme.type.label, color: theme.colors.accent }}>READING</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.stageTitle}>Camera watching your signs</Text>
                  <Text style={styles.stageSub}>
                    GPT-4o Vision evaluates every {(FRAME_INTERVAL_MS / 1000).toFixed(1)}s frame
                    with the last ~6 signs as context.
                  </Text>
                </View>
              )}
            </>
          )}

          {mode === "speech_to_sign" && (
            <View style={{ alignItems: "center" }}>
              <PulseRing size={200} color={theme.colors.cyan} rings={3} active={speechPhase === "recording"}>
                <AvatarSign />
              </PulseRing>
              <Pressable onPress={onSpeechStartStop} style={[styles.micBtn, speechPhase === "recording" && { backgroundColor: theme.colors.danger }]}>
                {speechPhase === "transcribing" ? (
                  <ActivityIndicator color="#07080F" />
                ) : (
                  <MaterialCommunityIcons name={speechPhase === "recording" ? "stop" : "microphone"} size={18} color="#07080F" />
                )}
                <Text style={styles.micBtnText}>
                  {speechPhase === "recording" ? "Stop & caption" : speechPhase === "transcribing" ? "Transcribing…" : "Tap to listen"}
                </Text>
              </Pressable>
              <Text style={styles.stageSub}>
                Your counterpart speaks — Whisper transcribes and ECHO renders live captions
                alongside the signing avatar.
              </Text>
            </View>
          )}

          {mode === "service" && (
            <View style={{ alignItems: "center" }}>
              <View style={styles.serviceCard}>
                <Text style={styles.serviceHeading}>I am Deaf —{"\n"}please read this 🙏</Text>
                <Text style={styles.serviceSub}>I'll reply in text. Speak normally and I'll see captions.</Text>
                <Pressable
                  onPress={() => speakAloud("I am Deaf. Please read this or respond in text. I will show captions to you.")}
                  style={styles.servicePress}
                >
                  <Ionicons name="volume-high" size={20} color="#07080F" />
                  <Text style={styles.servicePressText}>{speaking ? "Speaking…" : "Tap to speak this aloud"}</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </GlassCard>

      {mode === "sign_to_speech" && (
        <GlassCard style={{ marginTop: 16 }}>
          <Text style={{ ...theme.type.label, color: theme.colors.accent }}>RECOGNIZED ASL GLOSS</Text>
          <View style={styles.signStream}>
            {activeSigns.map((s, i) => (
              <View key={`${s}-${i}`} style={styles.signChip}>
                <Text style={styles.signChipText}>{s}</Text>
              </View>
            ))}
            {activeSigns.length === 0 ? (
              <Text style={{ ...theme.type.bodySm, color: theme.colors.textMute }}>
                No signs yet — start signing into the camera.
              </Text>
            ) : null}
          </View>
          <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.outlineSoft }}>
            <Text style={{ ...theme.type.label, color: theme.colors.textDim }}>SPOKEN TRANSLATION</Text>
            <Text style={{ ...theme.type.title, color: theme.colors.text, marginTop: 4 }}>{spokenTranslation}</Text>
            <WaveformBars bars={22} height={24} color={theme.colors.accent} active={activeSigns.length > 0} />
            {activeSigns.length > 0 ? (
              <Pressable onPress={() => speakAloud(spokenTranslation)} style={[styles.permBtn, { marginTop: 10 }]}>
                <Text style={styles.permBtnText}>{speaking ? "Speaking…" : "Speak aloud"}</Text>
              </Pressable>
            ) : null}
          </View>
        </GlassCard>
      )}

      {mode === "speech_to_sign" && (
        <GlassCard style={{ marginTop: 16 }}>
          <Text style={{ ...theme.type.label, color: theme.colors.cyan }}>HEARD (LIVE CAPTION)</Text>
          <Text style={{ ...theme.type.title, color: theme.colors.text, marginTop: 6, minHeight: 56 }}>
            {heardText || (speechPhase === "recording" ? "Listening…" : "Tap the mic to caption speech.")}
            {speechPhase === "recording" ? <Text style={{ color: theme.colors.cyan }}>▍</Text> : null}
          </Text>
        </GlassCard>
      )}

      {mode === "service" && (
        <GlassCard style={{ marginTop: 16 }}>
          <Text style={{ ...theme.type.label, color: theme.colors.warning }}>QUICK REPLIES</Text>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            {["Thank you", "How much is it?", "Can you repeat that?", "I'm paying with card"].map((q) => (
              <Pressable key={q} onPress={() => speakAloud(q)} style={styles.quick}>
                <Text style={styles.quickText}>{q}</Text>
              </Pressable>
            ))}
          </View>
        </GlassCard>
      )}

      {err ? (
        <View style={{ marginTop: 14 }}>
          <Text style={{ ...theme.type.bodySm, color: theme.colors.danger }}>{err}</Text>
        </View>
      ) : null}

      <View style={{ marginTop: 16, flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
        <Tag label="GPT-4o Vision" color={theme.colors.info} />
        <Tag label="Whisper captions" color={theme.colors.primary} />
        <Tag label="Real-time TTS" color={theme.colors.accent} />
      </View>
    </Screen>
  );
}

const ModePill: React.FC<{ active: boolean; label: string; icon: any; onPress: () => void }> = ({
  active, label, icon, onPress,
}) => (
  <Pressable onPress={onPress} style={[styles.mode, active && styles.modeActive]}>
    <MaterialCommunityIcons name={icon} size={16} color={active ? "#07080F" : theme.colors.text} />
    <Text style={[styles.modeText, { color: active ? "#07080F" : theme.colors.text }]}>{label}</Text>
  </Pressable>
);

const AvatarSign: React.FC = () => (
  <View style={{ width: 120, height: 120, alignItems: "center", justifyContent: "center" }}>
    <View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: theme.colors.cyan, alignItems: "center", justifyContent: "center" }}>
      <MaterialCommunityIcons name="emoticon-outline" size={44} color="#07080F" />
    </View>
    <View style={{ marginTop: -16, width: 90, height: 34, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.16)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" }} />
    <View style={{ marginTop: 6, width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.cyan, opacity: 0.8 }} />
  </View>
);

const styles = StyleSheet.create({
  header: { marginTop: 8, marginBottom: 16 },
  eyebrow: { ...theme.type.label, color: theme.colors.accent },
  title: { ...theme.type.display, color: theme.colors.text, marginTop: 2 },

  modes: { flexDirection: "row", gap: 6, marginBottom: 16 },
  mode: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
    paddingVertical: 10, borderRadius: theme.radius.pill,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: theme.colors.outlineSoft,
  },
  modeActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  modeText: { ...theme.type.label, fontSize: 10 },

  stage: { paddingVertical: 22, paddingHorizontal: 18, alignItems: "center" },
  stageTitle: { ...theme.type.title, color: theme.colors.text, marginTop: 14, textAlign: "center" },
  stageSub: { ...theme.type.bodySm, color: theme.colors.textDim, marginTop: 6, textAlign: "center", maxWidth: 280 },

  cameraWrap: {
    width: 240, height: 240, borderRadius: theme.radius.lg, overflow: "hidden",
    borderWidth: 1, borderColor: "rgba(124,92,255,0.5)", backgroundColor: "#000",
  },
  scanBadge: {
    position: "absolute", bottom: 10, left: 10,
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.radius.pill,
  },

  permBtn: {
    marginTop: 14, paddingHorizontal: 16, paddingVertical: 10, borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.accent,
  },
  permBtnText: { ...theme.type.label, color: "#07080F", textAlign: "center" },

  micBtn: {
    marginTop: 18, flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.cyan,
  },
  micBtnText: { ...theme.type.label, color: "#07080F" },

  signStream: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  signChip: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: "rgba(124,92,255,0.18)",
    borderWidth: 1, borderColor: "rgba(124,92,255,0.5)",
  },
  signChipText: { ...theme.type.label, color: theme.colors.primary, fontSize: 12, letterSpacing: 1.6 },

  serviceCard: {
    padding: 20, borderRadius: theme.radius.lg,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center", maxWidth: 300,
  },
  serviceHeading: { fontSize: 26, fontWeight: "800", color: "#07080F", textAlign: "center" },
  serviceSub: { ...theme.type.body, color: "#30345A", textAlign: "center", marginTop: 8 },
  servicePress: {
    marginTop: 14, flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.accent,
  },
  servicePressText: { ...theme.type.label, color: "#07080F" },

  quick: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1, borderColor: theme.colors.outlineSoft,
  },
  quickText: { ...theme.type.bodySm, color: theme.colors.text },
});
