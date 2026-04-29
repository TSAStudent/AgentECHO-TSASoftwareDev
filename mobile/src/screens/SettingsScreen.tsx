import React, { useEffect, useRef, useState } from "react";
import { Pressable, Switch, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

import { Screen } from "@/components/Screen";
import { GlassCard } from "@/components/GlassCard";
import { SectionHeader } from "@/components/SectionHeader";
import { Tag } from "@/components/Tag";
import { theme } from "@/theme";
import { useEcho } from "@/context/EchoContext";
import { haptic } from "@/utils/format";

export default function SettingsScreen() {
  const nav = useNavigation();
  const { userName, setUserName, preferences, setPreference, isListening } = useEcho();

  // Local draft + 600ms debounced commit so we don't hit the backend on every
  // keystroke. Still syncs to context state so Conversation / Ambient pick up
  // the new name as soon as the user stops typing.
  const [draftName, setDraftName] = useState(userName);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setDraftName(userName); }, [userName]);
  const commitName = (v: string) => {
    setDraftName(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const trimmed = v.trim();
      if (trimmed && trimmed !== userName) setUserName(trimmed);
    }, 600);
  };
  const flushNow = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== userName) setUserName(trimmed);
  };

  return (
    <Screen>
      <View style={styles.top}>
        <Pressable onPress={() => nav.goBack()} style={styles.back}>
          <Feather name="chevron-left" size={22} color={theme.colors.text} />
        </Pressable>
        <Tag
          label={isListening ? "ECHO LIVE" : "ECHO PAUSED"}
          color={isListening ? theme.colors.accent : theme.colors.textMute}
          icon={<Ionicons name={isListening ? "radio" : "pause"} size={10} color={isListening ? theme.colors.accent : theme.colors.textMute} />}
        />
      </View>

      <Text style={styles.eyebrow}>Profile</Text>
      <Text style={styles.title}>Settings</Text>

      <SectionHeader eyebrow="You" title="Name ECHO listens for" />
      <GlassCard>
        <TextInput
          value={draftName}
          onChangeText={commitName}
          onBlur={flushNow}
          onSubmitEditing={flushNow}
          placeholder="Your name"
          placeholderTextColor={theme.colors.textMute}
          autoCapitalize="words"
          autoCorrect={false}
          style={styles.input}
        />
        <Text style={{ ...theme.type.bodySm, color: theme.colors.textDim, marginTop: 8 }}>
          ECHO escalates events where this name is spoken directly to you — and when it's heard
          during ambient listening, any task that follows is auto-added to your captured actions.
        </Text>
      </GlassCard>

      <SectionHeader eyebrow="Notifications" title="How ECHO gets your attention" />
      <GlassCard>
        <Toggle label="Haptic feedback"   value={preferences.haptics}       onChange={(v) => setPreference("haptics", v)} />
        <Toggle label="Flash alerts"      value={preferences.flashAlerts}   onChange={(v) => setPreference("flashAlerts", v)} />
        <Toggle label="Auto-transcribe"   value={preferences.autoTranscribe} onChange={(v) => setPreference("autoTranscribe", v)} />
      </GlassCard>

      <SectionHeader eyebrow="Accessibility" title="Reading & contrast" />
      <GlassCard>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {(["regular", "large", "xl"] as const).map((s) => (
            <Pressable
              key={s}
              onPress={() => { haptic.light(); setPreference("textSize", s); }}
              style={[styles.sizeChip, preferences.textSize === s && { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent }]}
            >
              <Text style={{ ...theme.type.label, color: preferences.textSize === s ? "#07080F" : theme.colors.text }}>
                {s.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>
      </GlassCard>

      <SectionHeader eyebrow="Privacy" title="Data & retention" />
      <GlassCard>
        <Toggle
          label="Allow cloud offload (Whisper, GPT-4)"
          value={preferences.allowCloudOffload}
          onChange={(v) => setPreference("allowCloudOffload", v)}
        />
        <View style={styles.retentionRow}>
          <Text style={{ ...theme.type.body, color: theme.colors.text }}>Auto-delete after</Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {[1, 7, 30].map((d) => (
              <Pressable
                key={d}
                onPress={() => { haptic.light(); setPreference("retentionDays", d); }}
                style={[styles.sizeChip, preferences.retentionDays === d && { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent }]}
              >
                <Text style={{ ...theme.type.label, color: preferences.retentionDays === d ? "#07080F" : theme.colors.text }}>
                  {d}d
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Text style={{ ...theme.type.bodySm, color: theme.colors.textDim, marginTop: 10 }}>
          Raw audio is never stored off-device. Transcripts can be pruned manually at any time from
          the "what was heard" log.
        </Text>
      </GlassCard>

      <SectionHeader eyebrow="Pro features" title="Open routes" />
      <GlassCard>
        <Row icon="school"      label="Classroom / Meeting mode" onPress={() => nav.navigate("Classroom" as never)} />
        <Row icon="medkit"      label="Medical companion"        onPress={() => nav.navigate("Medical"   as never)} />
      </GlassCard>

      <Text style={styles.foot}>Agent ECHO v1.0 · HIPAA-ready architecture · Built with ❤ for the Deaf community.</Text>
    </Screen>
  );
}

const Toggle: React.FC<{ label: string; value: boolean; onChange: (v: boolean) => void }> = ({
  label, value, onChange,
}) => (
  <View style={styles.toggleRow}>
    <Text style={{ ...theme.type.body, color: theme.colors.text }}>{label}</Text>
    <Switch
      value={value}
      onValueChange={(v) => { haptic.light(); onChange(v); }}
      trackColor={{ false: "#2a2f55", true: theme.colors.accent }}
      thumbColor="#fff"
    />
  </View>
);

const Row: React.FC<{ icon: any; label: string; onPress: () => void }> = ({ icon, label, onPress }) => (
  <Pressable onPress={onPress} style={styles.row}>
    <Ionicons name={icon} size={18} color={theme.colors.text} />
    <Text style={{ ...theme.type.body, color: theme.colors.text, flex: 1, marginLeft: 10 }}>{label}</Text>
    <Feather name="chevron-right" size={18} color={theme.colors.textMute} />
  </Pressable>
);

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, marginBottom: 12 },
  back: {
    width: 38, height: 38, borderRadius: 38,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: theme.colors.outlineSoft,
  },
  eyebrow: { ...theme.type.label, color: theme.colors.accent, marginBottom: 4 },
  title:   { ...theme.type.display, color: theme.colors.text },

  input: {
    ...theme.type.title,
    color: theme.colors.text,
    paddingVertical: 4,
  },

  toggleRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: theme.colors.outlineSoft,
  },
  retentionRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: 12,
  },
  sizeChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: theme.colors.outlineSoft,
  },
  row: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: theme.colors.outlineSoft,
  },
  foot: { ...theme.type.bodySm, color: theme.colors.textMute, textAlign: "center", marginTop: 24 },
});
