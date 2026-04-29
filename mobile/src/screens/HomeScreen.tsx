import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

import { Screen } from "@/components/Screen";
import { GlassCard } from "@/components/GlassCard";
import { PulseRing } from "@/components/PulseRing";
import { WaveformBars } from "@/components/WaveformBars";
import { SectionHeader } from "@/components/SectionHeader";
import { SoundEventItem } from "@/components/SoundEventItem";
import { ActionCard } from "@/components/ActionCard";
import { Tag } from "@/components/Tag";
import { theme } from "@/theme";
import { useEcho } from "@/context/EchoContext";
import { haptic, timeAgo } from "@/utils/format";

export default function HomeScreen() {
  const {
    isListening, nightMode, userName,
    soundEvents, actions, toggleActionDone,
    setIsListening, setNightMode, setUserName,
  } = useEcho();
  const nav = useNavigation<any>();
  const [nameModal, setNameModal] = useState(false);
  const [draftName, setDraftName] = useState(userName);

  const recentEvents = soundEvents.slice(0, 3);
  const pendingActions = actions.filter((a) => !a.done).slice(0, 2);
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 5 ? "Late night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <Screen>
      <View style={styles.top}>
        <Pressable
          onPress={() => { setDraftName(userName); setNameModal(true); haptic.light(); }}
          hitSlop={8}
          style={{ flexShrink: 1 }}
        >
          <Text style={styles.greet}>{greeting},</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={styles.name}>{userName}.</Text>
            <Feather name="edit-2" size={16} color={theme.colors.textDim} />
          </View>
        </Pressable>
        <Pressable style={styles.iconButton} onPress={() => nav.navigate("Settings")} hitSlop={10}>
          <Ionicons name="settings-outline" size={22} color={theme.colors.text} />
        </Pressable>
      </View>

      {/* Listening hero */}
      <GlassCard style={styles.hero} intensity="high" padded={false}>
        <LinearGradient
          colors={isListening ? (theme.colors.gradientAurora as any) : (theme.colors.gradientCalm as any)}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroTint}
        />
        <View style={styles.heroInner}>
          <View style={styles.heroRingWrap}>
            <PulseRing size={140} color={isListening ? theme.colors.accent : theme.colors.textMute} active={isListening} rings={3}>
              <View style={styles.heroCore}>
                <MaterialCommunityIcons
                  name={isListening ? "waveform" : "waveform"}
                  size={36}
                  color={theme.colors.text}
                />
              </View>
            </PulseRing>
          </View>

          <View style={{ flex: 1 }}>
            <Tag
              label={isListening ? "ECHO IS LISTENING" : "ECHO PAUSED"}
              color={isListening ? theme.colors.accent : theme.colors.textMute}
              icon={<Ionicons name={isListening ? "ear" : "pause"} size={12} color={isListening ? theme.colors.accent : theme.colors.textMute} />}
            />
            <Text style={styles.heroTitle}>
              {isListening ? "Ambient mode active" : "Listening paused"}
            </Text>
            <Text style={styles.heroSub}>
              {isListening
                ? `${soundEvents.length} events captured today · ${pendingActions.length} pending actions`
                : "Tap the button to resume ambient awareness."}
            </Text>

            <View style={styles.heroWave}>
              <WaveformBars bars={34} height={32} color={theme.colors.cyan} active={isListening} />
            </View>

            <View style={styles.heroButtons}>
              <Pressable
                onPress={() => { haptic.medium(); setIsListening(!isListening); }}
                style={[styles.heroBtn, { backgroundColor: isListening ? "rgba(255,255,255,0.12)" : theme.colors.accent }]}
              >
                <Ionicons
                  name={isListening ? "pause" : "play"}
                  size={16}
                  color={isListening ? theme.colors.text : "#07080F"}
                />
                <Text
                  style={[
                    styles.heroBtnText,
                    { color: isListening ? theme.colors.text : "#07080F" },
                  ]}
                >
                  {isListening ? "Pause" : "Resume"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => { haptic.light(); setNightMode(!nightMode); }}
                style={[styles.heroBtn, { backgroundColor: nightMode ? theme.colors.primary : "rgba(255,255,255,0.08)" }]}
              >
                <Ionicons name="moon" size={14} color={theme.colors.text} />
                <Text style={[styles.heroBtnText, { color: theme.colors.text }]}>
                  Night {nightMode ? "on" : "off"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </GlassCard>

      {/* Quick access */}
      <View style={styles.grid}>
        <QuickTile
          icon={<Ionicons name="chatbubbles" size={22} color={theme.colors.cyan} />}
          label="Conversation"
          sub="Live caption + diarization"
          onPress={() => nav.navigate("Talk")}
        />
        <QuickTile
          icon={<MaterialCommunityIcons name="hand-wave" size={22} color={theme.colors.primary} />}
          label="ASL Bridge"
          sub="Two-way translator"
          onPress={() => nav.navigate("ASL")}
        />
        <QuickTile
          icon={<Ionicons name="school" size={22} color={theme.colors.warning} />}
          label="Class / Meeting"
          sub="Auto notes + flashcards"
          onPress={() => nav.navigate("Classroom")}
        />
        <QuickTile
          icon={<MaterialCommunityIcons name="stethoscope" size={22} color={theme.colors.success} />}
          label="Medical"
          sub="Appointment companion"
          onPress={() => nav.navigate("Medical")}
        />
      </View>

      {/* Smart actions */}
      <SectionHeader
        eyebrow="Smart Action Engine"
        title="Captured for you"
        action={
          <Pressable onPress={() => nav.navigate("Listen")}>
            <Text style={styles.link}>See all</Text>
          </Pressable>
        }
      />
      {pendingActions.length === 0 ? (
        <EmptyHint text="Nothing captured right now. When someone speaks your name or makes a plan, ECHO will record it here." />
      ) : (
        pendingActions.map((a) => (
          <ActionCard key={a.id} action={a} onToggle={() => toggleActionDone(a.id)} onSchedule={() => haptic.success()} />
        ))
      )}

      {/* Recent sounds */}
      <SectionHeader eyebrow="Ambient Awareness" title="Recent sounds" />
      {recentEvents.map((e) => (
        <SoundEventItem key={e.id} event={e} />
      ))}

      {/* Trusted Circle teaser */}
      <SectionHeader eyebrow="Safety" title="Trusted Circle" />
      <GlassCard>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={[styles.shieldIcon]}>
            <Ionicons name="shield-checkmark" size={22} color={theme.colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ ...theme.type.h3, color: theme.colors.text }}>Emergency ready</Text>
            <Text style={{ ...theme.type.bodySm, color: theme.colors.textDim, marginTop: 2 }}>
              3 contacts on standby · Location sharing ready
            </Text>
          </View>
          <Pressable onPress={() => nav.navigate("SOS")} style={styles.openBtn}>
            <Feather name="arrow-up-right" size={16} color={theme.colors.text} />
          </Pressable>
        </View>
      </GlassCard>

      <Text style={styles.foot}>
        ECHO last indexed ambient audio {timeAgo(Date.now() - 1000 * 30)}. Everything is encrypted and
        auto-deleted after {7} days unless you pin it.
      </Text>

      <Modal visible={nameModal} transparent animationType="fade" onRequestClose={() => setNameModal(false)}>
        <Pressable style={styles.modalBg} onPress={() => setNameModal(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={{ ...theme.type.label, color: theme.colors.accent }}>PROFILE</Text>
            <Text style={{ ...theme.type.title, color: theme.colors.text, marginTop: 4 }}>
              Name ECHO listens for
            </Text>
            <Text style={{ ...theme.type.bodySm, color: theme.colors.textDim, marginTop: 6 }}>
              When this name is spoken — in a conversation, in the background, or across the room —
              ECHO escalates the moment and extracts anything that sounds like a task.
            </Text>
            <TextInput
              value={draftName}
              onChangeText={setDraftName}
              placeholder="Your name"
              placeholderTextColor={theme.colors.textMute}
              autoFocus
              autoCorrect={false}
              autoCapitalize="words"
              style={styles.nameInput}
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
              <Pressable onPress={() => setNameModal(false)} style={[styles.mBtn, styles.mBtnGhost]}>
                <Text style={{ ...theme.type.label, color: theme.colors.text }}>CANCEL</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const v = draftName.trim();
                  if (!v) return;
                  setUserName(v);
                  setNameModal(false);
                  haptic.success();
                }}
                style={[styles.mBtn, { backgroundColor: theme.colors.accent }]}
              >
                <Text style={{ ...theme.type.label, color: "#07080F" }}>SAVE</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const QuickTile: React.FC<{ icon: React.ReactNode; label: string; sub: string; onPress: () => void }> = ({
  icon, label, sub, onPress,
}) => (
  <Pressable style={styles.tile} onPress={() => { haptic.light(); onPress(); }}>
    <View style={styles.tileIcon}>{icon}</View>
    <Text style={styles.tileLabel}>{label}</Text>
    <Text style={styles.tileSub}>{sub}</Text>
  </Pressable>
);

const EmptyHint: React.FC<{ text: string }> = ({ text }) => (
  <GlassCard intensity="low">
    <Text style={{ ...theme.type.body, color: theme.colors.textDim, textAlign: "center" }}>{text}</Text>
  </GlassCard>
);

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, marginBottom: 18 },
  greet: { ...theme.type.body, color: theme.colors.textDim },
  name: { ...theme.type.display, color: theme.colors.text },
  iconButton: {
    width: 42, height: 42, borderRadius: 42,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: theme.colors.outlineSoft,
  },

  hero: { overflow: "hidden" },
  heroTint: { ...StyleSheet.absoluteFillObject, opacity: 0.25 },
  heroInner: { flexDirection: "row", gap: 14, padding: 18, alignItems: "center" },
  heroRingWrap: { width: 140, height: 140, alignItems: "center", justifyContent: "center" },
  heroCore: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: "rgba(10,13,30,0.65)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
  },
  heroTitle: { ...theme.type.title, color: theme.colors.text, marginTop: 8 },
  heroSub:   { ...theme.type.bodySm, color: theme.colors.textDim, marginTop: 4 },
  heroWave: { marginTop: 10, marginBottom: 14 },
  heroButtons: { flexDirection: "row", gap: 8 },
  heroBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: theme.radius.pill,
  },
  heroBtnText: { ...theme.type.label },

  grid: {
    flexDirection: "row", flexWrap: "wrap", gap: 10,
    marginTop: 20,
  },
  tile: {
    flexBasis: "48%",
    flexGrow: 1,
    padding: 14,
    borderRadius: theme.radius.lg,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1, borderColor: theme.colors.outlineSoft,
  },
  tileIcon: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1, borderColor: theme.colors.outlineSoft,
    alignItems: "center", justifyContent: "center",
    marginBottom: 10,
  },
  tileLabel: { ...theme.type.h3, color: theme.colors.text },
  tileSub:   { ...theme.type.bodySm, color: theme.colors.textDim, marginTop: 2 },

  link: { ...theme.type.label, color: theme.colors.accent },
  shieldIcon: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: theme.colors.accent + "18",
    borderWidth: 1, borderColor: theme.colors.accent + "55",
    alignItems: "center", justifyContent: "center",
  },
  openBtn: {
    width: 34, height: 34, borderRadius: 34,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: theme.colors.outlineSoft,
  },
  foot: { ...theme.type.bodySm, color: theme.colors.textMute, marginTop: 24, textAlign: "center" },

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
  nameInput: {
    ...theme.type.title,
    color: theme.colors.text,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1, borderColor: theme.colors.outlineSoft,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12, paddingVertical: 10,
    marginTop: 14,
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
