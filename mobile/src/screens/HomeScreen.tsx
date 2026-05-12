import React, { useEffect, useMemo, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { PressableScale } from "@/components/PressableScale";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

import { Screen, SCREEN_SCROLL_H_PAD } from "@/components/Screen";
import { GlassCard } from "@/components/GlassCard";
import { WaveformBars } from "@/components/WaveformBars";
import { SectionHeader } from "@/components/SectionHeader";
import { SoundEventItem } from "@/components/SoundEventItem";
import { ActionCard } from "@/components/ActionCard";
import {
  CapturedWeekStrip,
  actionDayStart,
  startOfLocalDay,
  weekContaining,
} from "@/components/CapturedWeekStrip";
import { Tag } from "@/components/Tag";
import { theme } from "@/theme";
import { useEcho } from "@/context/EchoContext";
import { haptic, timeAgo } from "@/utils/format";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const QUICK_TILE_HOVER_SPRING = { damping: 18, stiffness: 440, mass: 0.48 };
/** Web hover scale — kept modest so inset slots absorb paint without touching neighbors. */
const QUICK_TILE_HOVER_SCALE = 1.04;

export default function HomeScreen() {
  const {
    isListening, nightMode, userName,
    soundEvents, actions, toggleActionDone,
    setIsListening, setNightMode, setUserName,
    trustedCircle,
  } = useEcho();
  const nav = useNavigation<any>();
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  /** Laptop / large tablet: room for larger tile copy and icons. */
  const isWideLayout = windowWidth >= 768;
  const tileRowBleedStyle = useMemo((): ViewStyle => {
    if (isWeb) {
      return {
        width: windowWidth,
        marginLeft: -(insets.left + SCREEN_SCROLL_H_PAD),
        marginRight: -(insets.right + SCREEN_SCROLL_H_PAD),
        alignSelf: "center",
      };
    }
    return { marginHorizontal: -SCREEN_SCROLL_H_PAD, alignSelf: "stretch" };
  }, [isWeb, windowWidth, insets.left, insets.right]);

  const [nameModal, setNameModal] = useState(false);
  const [draftName, setDraftName] = useState(userName);
  const todayStart = startOfLocalDay(new Date());
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(todayStart);
  const [hoverDay, setHoverDay] = useState<number | null>(null);

  const weekDays = useMemo(() => {
    const d = new Date(todayStart);
    d.setDate(d.getDate() + weekOffset * 7);
    return weekContaining(startOfLocalDay(d));
  }, [todayStart, weekOffset]);

  useEffect(() => {
    if (weekDays.includes(selectedDay)) return;
    const pick = weekDays.find((d) => d === todayStart) ?? weekDays[0];
    setSelectedDay(pick);
  }, [weekDays, selectedDay, todayStart]);

  const displayDay = hoverDay ?? selectedDay;
  const dayActions = useMemo(() => {
    const forDay = actions.filter((a) => actionDayStart(a) === displayDay);
    const open = forDay.filter((a) => !a.done);
    const done = forDay.filter((a) => a.done);
    return [...open, ...done];
  }, [actions, displayDay]);

  const recentEvents = soundEvents.slice(0, 3);
  const pendingAny = actions.filter((a) => !a.done);
  const standbyCount = trustedCircle.length;
  const standbySubtitle =
    standbyCount === 0
      ? "No contacts on standby · Open Safety to add people · Location sharing ready"
      : `${standbyCount} contact${standbyCount === 1 ? "" : "s"} on standby · Location sharing ready`;
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 5 ? "Late night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <Screen>
      <View style={styles.top}>
        <PressableScale
          scaleBuffer={1}
          onPress={() => { setDraftName(userName); setNameModal(true); haptic.light(); }}
          hitSlop={8}
          style={{ flexShrink: 1 }}
        >
          <Text style={styles.greet}>{greeting},</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={styles.name}>{userName}.</Text>
            <Feather name="edit-2" size={16} color={theme.colors.textDim} />
          </View>
        </PressableScale>
        <PressableScale scaleBuffer={2} style={styles.iconButton} onPress={() => nav.navigate("Settings")} hitSlop={10}>
          <Ionicons name="settings-outline" size={22} color={theme.colors.text} />
        </PressableScale>
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
          <View
            style={[
              styles.heroIconTile,
              isListening ? styles.heroIconTileLive : styles.heroIconTileIdle,
            ]}
          >
            <MaterialCommunityIcons name="waveform" size={36} color={theme.colors.text} />
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
            <Text style={styles.heroCaption}>
              Ambient hearing keeps the mic on quietly so speech and sounds around you can show up as alerts and tasks.
            </Text>
            {isListening ? (
              <Text style={styles.heroSub}>
                {soundEvents.length} events captured today · {pendingAny.length} open tasks
              </Text>
            ) : null}

            <View style={styles.heroWave}>
              <WaveformBars bars={34} height={32} color={theme.colors.cyan} active={isListening} />
            </View>

            <View style={styles.heroButtons}>
              <PressableScale
                scaleBuffer={3}
                onPress={() => { haptic.medium(); setIsListening(!isListening); }}
                style={[
                  styles.heroBtn,
                  {
                    backgroundColor: isListening ? "rgba(255,255,255,0.12)" : theme.colors.accent,
                    borderColor: isListening ? theme.colors.controlStrokeMuted : "rgba(6,32,28,0.55)",
                  },
                ]}
              >
                <Ionicons
                  name={isListening ? "pause" : "play"}
                  size={18}
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
              </PressableScale>
              <PressableScale
                scaleBuffer={3}
                onPress={() => { haptic.light(); setNightMode(!nightMode); }}
                style={[
                  styles.heroBtn,
                  {
                    backgroundColor: nightMode ? theme.colors.primary : "rgba(255,255,255,0.08)",
                    borderColor: nightMode ? "rgba(200,180,255,0.5)" : theme.colors.controlStroke,
                  },
                ]}
              >
                <Ionicons name="moon" size={17} color={theme.colors.text} />
                <Text style={[styles.heroBtnText, { color: theme.colors.text }]}>
                  Night {nightMode ? "on" : "off"}
                </Text>
              </PressableScale>
            </View>
          </View>
        </View>
      </GlassCard>

      {/* Quick access — four separate tiles with small gaps */}
      <View style={[styles.quickAccessRow, tileRowBleedStyle]}>
        <QuickTile
          wide={isWideLayout}
          icon={<Ionicons name="chatbubbles" size={isWideLayout ? 26 : 20} color={theme.colors.cyan} />}
          label="Conversation"
          sub="Who said what, live"
          onPress={() => nav.navigate("Talk")}
        />
        <QuickTile
          wide={isWideLayout}
          icon={<MaterialCommunityIcons name="hand-wave" size={isWideLayout ? 26 : 20} color={theme.colors.primary} />}
          label="ASL Bridge"
          sub="Sign and voice both ways"
          onPress={() => nav.navigate("ASL")}
        />
        <QuickTile
          wide={isWideLayout}
          icon={<Ionicons name="school" size={isWideLayout ? 26 : 20} color={theme.colors.warning} />}
          label="Class / Meeting"
          sub="Notes, cards, recap"
          onPress={() => nav.navigate("Classroom")}
        />
        <QuickTile
          wide={isWideLayout}
          icon={<MaterialCommunityIcons name="stethoscope" size={isWideLayout ? 26 : 20} color={theme.colors.success} />}
          label="Medical"
          sub="Appointment companion"
          onPress={() => nav.navigate("Medical")}
        />
      </View>

      {/* Smart actions */}
      <SectionHeader
        eyebrow="Tasks"
        title="Captured for you"
        action={
          <PressableScale onPress={() => nav.navigate("Listen")} scaleBuffer={0} style={{ paddingVertical: 6, paddingHorizontal: 4 }}>
            <Text style={styles.link}>See all</Text>
          </PressableScale>
        }
      />
      <GlassCard intensity="low" style={{ marginBottom: 12, marginHorizontal: -18, alignSelf: "stretch" }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, paddingHorizontal: 18 }}>
          <Text style={{ ...theme.type.label, color: theme.colors.textDim }}>WEEK VIEW</Text>
          <View style={{ flexDirection: "row", gap: 14 }}>
            <PressableScale onPress={() => { setWeekOffset((w) => w - 1); haptic.light(); }} hitSlop={8}>
              <Feather name="chevron-left" size={18} color={theme.colors.accent} />
            </PressableScale>
            <PressableScale
              onPress={() => {
                setWeekOffset(0);
                setSelectedDay(todayStart);
                setHoverDay(null);
                haptic.light();
              }}
              hitSlop={8}
            >
              <Text style={{ ...theme.type.label, color: theme.colors.accent }}>This week</Text>
            </PressableScale>
            <PressableScale onPress={() => { setWeekOffset((w) => w + 1); haptic.light(); }} hitSlop={8}>
              <Feather name="chevron-right" size={18} color={theme.colors.accent} />
            </PressableScale>
          </View>
        </View>
        <CapturedWeekStrip
          actions={actions}
          weekDays={weekDays}
          selectedDay={selectedDay}
          hoverDay={hoverDay}
          onSelectDay={(d) => { setSelectedDay(d); setHoverDay(null); haptic.light(); }}
          onHoverDay={setHoverDay}
        />
      </GlassCard>
      {dayActions.length === 0 ? (
        <EmptyHint text="Nothing on this day yet. Use Talk or Listen and we’ll add tasks when we catch plans, your name, or phrases like “tomorrow.”" />
      ) : (
        dayActions.map((a) => (
          <ActionCard
            key={a.id}
            action={a}
            emphasizeCompletedStrike
            onToggle={() => toggleActionDone(a.id)}
          />
        ))
      )}

      {/* Recent sounds */}
      <SectionHeader eyebrow="Around you" title="Recent sounds" />
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
              {standbySubtitle}
            </Text>
          </View>
          <PressableScale onPress={() => nav.navigate("SOS")} style={styles.openBtn}>
            <Feather name="arrow-up-right" size={18} color={theme.colors.text} />
          </PressableScale>
        </View>
      </GlassCard>

      <Text style={styles.foot}>
        Last ambient update {timeAgo(Date.now() - 1000 * 30)}. Your audio is encrypted and drops after{" "}
        {7} days unless you keep it.
      </Text>

      <Modal visible={nameModal} transparent animationType="fade" onRequestClose={() => setNameModal(false)}>
        <Pressable style={styles.modalBg} onPress={() => setNameModal(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={{ ...theme.type.label, color: theme.colors.accent }}>PROFILE</Text>
            <Text style={{ ...theme.type.title, color: theme.colors.text, marginTop: 4 }}>
              Name ECHO listens for
            </Text>
            <Text style={{ ...theme.type.bodySm, color: theme.colors.textDim, marginTop: 6 }}>
              If someone says this name (chat, background noise, or across the room), we flag it and turn nearby mentions into tasks when it makes sense.
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
            <View style={{ flexDirection: "row", gap: 14, marginTop: 18 }}>
              <PressableScale onPress={() => setNameModal(false)} style={[styles.mBtn, styles.mBtnGhost]}>
                <Text style={{ ...theme.type.label, color: theme.colors.text }}>CANCEL</Text>
              </PressableScale>
              <PressableScale
                onPress={() => {
                  const v = draftName.trim();
                  if (!v) return;
                  setUserName(v);
                  setNameModal(false);
                  haptic.success();
                }}
                style={[styles.mBtn, { backgroundColor: theme.colors.accent, borderColor: "rgba(6,32,28,0.55)" }]}
              >
                <Text style={{ ...theme.type.label, color: "#07080F" }}>SAVE</Text>
              </PressableScale>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const QuickTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  sub: string;
  onPress: () => void;
  wide?: boolean;
}> = ({ icon, label, sub, onPress, wide }) => {
  const isWeb = Platform.OS === "web";
  const hovered = useSharedValue(false);

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: withSpring(isWeb && hovered.value ? QUICK_TILE_HOVER_SCALE : 1, QUICK_TILE_HOVER_SPRING) },
    ],
  }));

  return (
    <View style={styles.quickAccessTileSlot}>
      <AnimatedPressable
        style={[
          styles.quickAccessBtn,
          wide && styles.quickAccessBtnWide,
          scaleStyle,
          isWeb ? ({ cursor: "pointer" } as ViewStyle) : null,
        ]}
        onPress={() => { haptic.light(); onPress(); }}
        onHoverIn={() => {
          if (isWeb) hovered.value = true;
        }}
        onHoverOut={() => {
          if (isWeb) hovered.value = false;
        }}
      >
        <View style={[styles.tileIcon, wide && styles.tileIconWide]}>{icon}</View>
        <Text style={[styles.tileLabel, wide && styles.tileLabelWide]} numberOfLines={wide ? 2 : 3}>
          {label}
        </Text>
        <Text style={[styles.tileSub, wide && styles.tileSubWide]} numberOfLines={wide ? 2 : 3}>
          {sub}
        </Text>
      </AnimatedPressable>
    </View>
  );
};

const EmptyHint: React.FC<{ text: string }> = ({ text }) => (
  <GlassCard intensity="low">
    <Text style={{ ...theme.type.body, color: theme.colors.textDim, textAlign: "center" }}>{text}</Text>
  </GlassCard>
);

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4, marginBottom: 22 },
  greet: { ...theme.type.bodySm, color: theme.colors.textDim, letterSpacing: 0.2 },
  name: { ...theme.type.display, color: theme.colors.text, marginTop: 2 },
  iconButton: {
    width: 48, height: 48, borderRadius: theme.radius.md,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: theme.stroke.control,
    borderColor: theme.colors.controlStroke,
  },

  hero: { overflow: "hidden", borderRadius: theme.radius.lg },
  heroTint: { ...StyleSheet.absoluteFillObject, opacity: 0.22 },
  heroInner: { flexDirection: "row", gap: 16, padding: 20, alignItems: "center" },
  heroIconTile: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.lg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: theme.stroke.control,
    backgroundColor: "rgba(12,14,28,0.75)",
  },
  heroIconTileLive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accent + "16",
  },
  heroIconTileIdle: {
    borderColor: theme.colors.controlStroke,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  heroTitle: { ...theme.type.title, color: theme.colors.text, marginTop: 10, fontSize: 21, lineHeight: 27 },
  heroCaption: {
    ...theme.type.bodySm,
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.textMute,
    marginTop: 8,
  },
  heroSub: { ...theme.type.bodySm, color: theme.colors.textDim, marginTop: 10 },
  heroWave: { marginTop: 12, marginBottom: 16 },
  heroButtons: { flexDirection: "row", gap: 12, justifyContent: "flex-start" },
  heroBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 50,
    borderRadius: theme.radius.pill,
    borderWidth: theme.stroke.control,
  },
  heroBtnText: { ...theme.type.label, letterSpacing: 0.45, fontSize: 12 },

  quickAccessRow: {
    flexDirection: "row",
    marginTop: 22,
    width: "100%",
    alignItems: "stretch",
    gap: 8,
  },
  /** Inset around each tile so hover scale paints inside the column, not over siblings. */
  quickAccessTileSlot: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    paddingHorizontal: 5,
    paddingVertical: 4,
  },
  /** Equal-width tiles; outer row `gap` + slot padding keep scaled hover clear of neighbors. */
  quickAccessBtn: {
    flex: 1,
    width: "100%",
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 4,
    backgroundColor: "rgba(22,25,52,0.72)",
    borderRadius: theme.radius.md,
    borderWidth: theme.stroke.control,
    borderColor: theme.colors.controlStroke,
  },
  quickAccessBtnWide: {
    paddingVertical: 20,
    paddingHorizontal: 10,
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: theme.stroke.control,
    borderColor: theme.colors.controlStrokeMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  tileIconWide: {
    width: 52,
    height: 52,
    marginBottom: 10,
  },
  tileLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    color: theme.colors.text,
    textAlign: "center",
    letterSpacing: -0.1,
  },
  tileLabelWide: {
    fontSize: 15,
    lineHeight: 19,
    letterSpacing: -0.2,
  },
  tileSub: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "400",
    color: theme.colors.textDim,
    marginTop: 4,
    textAlign: "center",
  },
  tileSubWide: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },

  link: { ...theme.type.label, color: theme.colors.accent, letterSpacing: 0.5 },
  shieldIcon: {
    width: 48, height: 48, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent + "14",
    borderWidth: theme.stroke.control,
    borderColor: theme.colors.accent + "66",
    alignItems: "center",
    justifyContent: "center",
  },
  openBtn: {
    width: 42, height: 42, borderRadius: theme.radius.md,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: theme.stroke.control,
    borderColor: theme.colors.controlStroke,
  },
  foot: { ...theme.type.bodySm, color: theme.colors.textMute, marginTop: 24, textAlign: "center" },

  modalBg: {
    flex: 1, backgroundColor: "rgba(5,6,16,0.75)",
    alignItems: "center", justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%", maxWidth: 380,
    backgroundColor: theme.colors.surfaceHi,
    borderRadius: theme.radius.lg,
    padding: 22,
    borderWidth: theme.stroke.control,
    borderColor: theme.colors.controlStroke,
  },
  nameInput: {
    ...theme.type.title,
    color: theme.colors.text,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: theme.stroke.control,
    borderColor: theme.colors.controlStroke,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12, paddingVertical: 10,
    marginTop: 14,
  },
  mBtn: {
    flex: 1, paddingVertical: 14,
    borderRadius: theme.radius.md,
    alignItems: "center",
    borderWidth: theme.stroke.control,
    borderColor: theme.colors.controlStroke,
  },
  mBtnGhost: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
});
