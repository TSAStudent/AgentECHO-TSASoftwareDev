import React, { useRef, useState } from "react";
import {
  Alert,
  Animated,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import * as Location from "expo-location";

import { Screen } from "@/components/Screen";
import { HoverGrowPressable } from "@/components/HoverGrowPressable";
import { GlassCard } from "@/components/GlassCard";
import { SectionHeader } from "@/components/SectionHeader";
import { Tag } from "@/components/Tag";
import { theme } from "@/theme";
import { useEcho } from "@/context/EchoContext";
import { haptic } from "@/utils/format";
import { api } from "@/services/api";

export default function EmergencyScreen() {
  const { trustedCircle, removeContact, addContact } = useEcho();
  const [pressing, setPressing] = useState(false);
  const [status, setStatus] = useState<null | string>(null);
  const ringScale = useRef(new Animated.Value(1)).current;
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [sosActionsOpen, setSosActionsOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", relation: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const startHold = () => {
    haptic.medium();
    setPressing(true);
    Animated.timing(ringScale, { toValue: 1.25, duration: 1500, useNativeDriver: true }).start();
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      openSosActionSheet();
    }, 1500);
  };
  const cancelHold = () => {
    setPressing(false);
    Animated.timing(ringScale, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const openSosActionSheet = () => {
    haptic.warning();
    setPressing(false);
    Animated.timing(ringScale, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    setSosActionsOpen(true);
  };

  const dialPhone = async (label: string, raw: string) => {
    const cleaned = String(raw).replace(/[^\d+#*;+]/g, "").trim();
    if (!cleaned) {
      Alert.alert("No number", `${label} does not have a dialable number.`);
      return;
    }
    const url = `tel:${cleaned}`;
    try {
      if (Platform.OS !== "web" && (await Linking.canOpenURL(url))) {
        await Linking.openURL(url);
      } else if (Platform.OS === "web") {
        Alert.alert(
          "Call from your phone",
          `Number to dial: ${cleaned}\n\nOn a real device, ECHO opens the phone app here.`,
        );
      } else {
        await Linking.openURL(url);
      }
    } catch {
      Alert.alert("Could not start call", `Try calling ${cleaned} from your phone app.`);
    }
    setSosActionsOpen(false);
  };

  /** Same as the former hold-to-send: SMS / notify Trusted Circle via backend. */
  const dispatchTrustedCircle = async () => {
    if (trustedCircle.length === 0) {
      Alert.alert("No contacts", "Add someone to Trusted Circle first, then try again.");
      return;
    }
    setSosActionsOpen(false);
    setStatus("Locating you…");
    haptic.error();
    let location: { lat: number; lng: number; accuracy?: number } | undefined;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        location = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? undefined };
      }
    } catch {
      /* send without location */
    }

    setStatus("Dispatching…");
    try {
      const res = await api.emergency({
        level: "sos",
        trigger: "panic_button",
        contacts: trustedCircle.map((c) => ({ name: c.name, phone: c.phone })),
        location,
        message: "I need help. This is Agent ECHO sending an SOS on my behalf.",
      });
      if (res.sent) {
        const ok = (res.results || []).filter((r: any) => r.sid && !r.error).length;
        setStatus(`Sent to ${ok} contact${ok === 1 ? "" : "s"}.`);
      } else {
        setStatus(res.reason || "Demo preview generated.");
      }
    } catch {
      setStatus("Could not reach backend. Showing a demo preview.");
    }
  };

  const submitContact = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      setFormError("Name and phone are required.");
      return;
    }
    setFormError(null);
    setSubmitting(true);
    const result = await addContact({ name: form.name.trim(), phone: form.phone.trim(), relation: form.relation.trim() || null });
    setSubmitting(false);
    if (result.ok) {
      haptic.success();
      setForm({ name: "", phone: "", relation: "" });
      setModalOpen(false);
    } else {
      setFormError(result.error || "Could not save contact.");
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>SAFETY</Text>
          <Text style={styles.title}>Trusted Circle</Text>
        </View>
        <Tag label="ARMED" color={theme.colors.success} icon={<Ionicons name="shield-checkmark" size={12} color={theme.colors.success} />} />
      </View>

      {/* SOS button */}
      <View style={{ alignItems: "center", marginVertical: 12 }}>
        <Animated.View style={{ transform: [{ scale: ringScale }] }}>
          <HoverGrowPressable
            onPressIn={startHold}
            onPressOut={cancelHold}
            style={styles.sosOuter}
          >
            <LinearGradient
              colors={theme.colors.gradientDanger as any}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.sosInner}>
              <MaterialCommunityIcons name="shield-alert" size={60} color="#fff" />
              <Text style={styles.sosTitle}>{pressing ? "HOLD…" : "HOLD FOR SOS"}</Text>
              <Text style={styles.sosSub}>
                {pressing ? "Opens emergency options in 1.5s" : "Hold 1.5s"}
              </Text>
            </View>
          </HoverGrowPressable>
        </Animated.View>
        {status ? <Text style={styles.status}>{status}</Text> : null}
      </View>

      {/* Tier explanation */}
      <SectionHeader eyebrow="Tiered response" title="What happens when ECHO detects…" />
      <GlassCard>
        {[
          { icon: "flame",   label: "Smoke alarm",      tier: "emergency", chain: "Flash → haptics → SMS circle → text 911" },
          { icon: "megaphone", label: "Scream / help",  tier: "emergency", chain: "Flash → haptics → SMS circle" },
          { icon: "alarm-light", label: "Siren (vehicle)", tier: "high",   chain: "Haptic pulse → direction on map" },
          { icon: "bell",    label: "Knock / doorbell", tier: "medium",    chain: "Silent alert → door camera peek" },
        ].map((row) => (
          <View key={row.label} style={styles.tierRow}>
            <MaterialCommunityIcons
              name={row.icon as any}
              size={20}
              color={
                row.tier === "emergency" ? theme.colors.danger :
                row.tier === "high" ? theme.colors.warning : theme.colors.accent
              }
            />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ ...theme.type.h3, color: theme.colors.text }}>{row.label}</Text>
              <Text style={{ ...theme.type.bodySm, color: theme.colors.textDim, marginTop: 2 }}>{row.chain}</Text>
            </View>
          </View>
        ))}
      </GlassCard>

      {/* Trusted circle */}
      <SectionHeader
        eyebrow="Contacts"
        title={`${trustedCircle.length} on standby`}
        action={
          <HoverGrowPressable onPress={() => { haptic.light(); setModalOpen(true); }} hitSlop={10}>
            <Feather name="plus" size={18} color={theme.colors.accent} />
          </HoverGrowPressable>
        }
      />
      {trustedCircle.length === 0 ? (
        <GlassCard intensity="low">
          <Text style={{ ...theme.type.body, color: theme.colors.textDim, textAlign: "center" }}>
            Add at least one contact so ECHO has someone to reach in an emergency.
          </Text>
        </GlassCard>
      ) : (
        trustedCircle.map((c) => (
          <View key={c.id} style={styles.contact}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{c.name[0]?.toUpperCase() || "?"}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ ...theme.type.h3, color: theme.colors.text }}>{c.name}</Text>
              <Text style={{ ...theme.type.bodySm, color: theme.colors.textDim }}>
                {c.relation ? `${c.relation} · ` : ""}{c.phone}
              </Text>
            </View>
            <HoverGrowPressable onPress={() => { haptic.light(); removeContact(c.id); }} hitSlop={10}>
              <Feather name="x" size={18} color={theme.colors.textMute} />
            </HoverGrowPressable>
          </View>
        ))
      )}

      <SectionHeader eyebrow="Public safety" title="Evacuation & PA capture" />
      <GlassCard intensity="low">
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Ionicons name="map" size={24} color={theme.colors.cyan} />
          <Text style={{ ...theme.type.body, color: theme.colors.textDim, flex: 1 }}>
            On trains, planes, and in airports we listen for PA announcements and surface gate changes,
            delays, and evacuations on a map, even when audio is hard to hear.
          </Text>
        </View>
      </GlassCard>

      {/* SOS action sheet (after hold completes) */}
      <Modal visible={sosActionsOpen} transparent animationType="fade" onRequestClose={() => setSosActionsOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setSosActionsOpen(false)}>
          <Pressable style={styles.sosSheet} onPress={() => {}}>
            <Text style={{ ...theme.type.label, color: theme.colors.danger }}>SOS</Text>
            <Text style={{ ...theme.type.title, color: theme.colors.text, marginTop: 6 }}>What do you need?</Text>
            <Text style={{ ...theme.type.bodySm, color: theme.colors.textDim, marginTop: 8, marginBottom: 4 }}>
              Pick a number or alert your circle. Location is only used if you alert Trusted Circle.
            </Text>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <HoverGrowPressable
                onPress={() => { haptic.medium(); void dialPhone("911", "911"); }}
                style={[styles.sosSheetBtn, styles.sosSheetBtn911]}
              >
                <Ionicons name="call" size={22} color="#fff" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.sosSheetBtnTitle}>Call 911</Text>
                  <Text style={styles.sosSheetBtnSub}>Opens the dialer (US emergency)</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
              </HoverGrowPressable>

              <HoverGrowPressable
                onPress={() => { haptic.medium(); void dispatchTrustedCircle(); }}
                style={[
                  styles.sosSheetBtn,
                  { marginTop: 10, opacity: trustedCircle.length ? 1 : 0.45 },
                ]}
                disabled={trustedCircle.length === 0}
              >
                <MaterialCommunityIcons name="message-text" size={22} color="#07080F" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.sosSheetBtnTitle, { color: "#07080F" }]}>Alert Trusted Circle</Text>
                  <Text style={[styles.sosSheetBtnSub, { color: "rgba(7,8,15,0.65)" }]}>
                    {trustedCircle.length
                      ? "Sends SOS through ECHO with location if allowed"
                      : "Add a contact on this screen first"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="rgba(7,8,15,0.45)" />
              </HoverGrowPressable>

              {trustedCircle.length > 0 ? (
                <View style={{ marginTop: 18 }}>
                  <Text style={{ ...theme.type.overline, color: theme.colors.textMute, marginBottom: 8 }}>Call a contact</Text>
                  {trustedCircle.map((c) => (
                    <HoverGrowPressable
                      key={c.id}
                      onPress={() => { haptic.light(); void dialPhone(c.name, c.phone); }}
                      style={[styles.sosSheetBtn, styles.sosSheetBtnGhost, { marginTop: 8 }]}
                    >
                      <View style={styles.sosMiniAvatar}>
                        <Text style={styles.sosMiniAvatarText}>{c.name[0]?.toUpperCase() || "?"}</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[styles.sosSheetBtnTitle, { color: theme.colors.text }]}>{c.name}</Text>
                        <Text style={[styles.sosSheetBtnSub, { color: theme.colors.textDim }]}>{c.phone}</Text>
                      </View>
                      <Ionicons name="call-outline" size={22} color={theme.colors.accent} />
                    </HoverGrowPressable>
                  ))}
                </View>
              ) : null}
            </ScrollView>

            <HoverGrowPressable
              onPress={() => { haptic.light(); setSosActionsOpen(false); }}
              style={[styles.sosSheetBtn, styles.sosSheetBtnGhost, { marginTop: 16, justifyContent: "center" }]}
            >
              <Text style={{ ...theme.type.label, color: theme.colors.textDim }}>CLOSE</Text>
            </HoverGrowPressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add-contact modal */}
      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setModalOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={{ ...theme.type.label, color: theme.colors.accent }}>TRUSTED CIRCLE</Text>
            <Text style={{ ...theme.type.title, color: theme.colors.text, marginTop: 4 }}>Add contact</Text>

            <Text style={styles.formLabel}>Name</Text>
            <TextInput
              value={form.name}
              onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
              placeholder="e.g. Alex Martinez"
              placeholderTextColor={theme.colors.textMute}
              style={styles.input}
            />
            <Text style={styles.formLabel}>Phone</Text>
            <TextInput
              value={form.phone}
              onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
              placeholder="+1 555 010 1234"
              placeholderTextColor={theme.colors.textMute}
              keyboardType="phone-pad"
              style={styles.input}
            />
            <Text style={styles.formLabel}>Relation (optional)</Text>
            <TextInput
              value={form.relation}
              onChangeText={(v) => setForm((f) => ({ ...f, relation: v }))}
              placeholder="Partner, Parent, Friend…"
              placeholderTextColor={theme.colors.textMute}
              style={styles.input}
            />
            {formError ? <Text style={{ ...theme.type.bodySm, color: theme.colors.danger, marginTop: 10 }}>{formError}</Text> : null}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
              <HoverGrowPressable onPress={() => setModalOpen(false)} style={[styles.mBtn, styles.mBtnGhost]}>
                <Text style={{ ...theme.type.label, color: theme.colors.text }}>CANCEL</Text>
              </HoverGrowPressable>
              <HoverGrowPressable onPress={submitContact} disabled={submitting} style={[styles.mBtn, { backgroundColor: theme.colors.accent, opacity: submitting ? 0.6 : 1 }]}>
                <Text style={{ ...theme.type.label, color: "#07080F" }}>{submitting ? "SAVING…" : "ADD"}</Text>
              </HoverGrowPressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 8, marginBottom: 12 },
  eyebrow: { ...theme.type.label, color: theme.colors.danger },
  title: { ...theme.type.display, color: theme.colors.text, marginTop: 2 },

  sosOuter: {
    width: 240, height: 240, borderRadius: 240,
    overflow: "hidden",
    alignItems: "center", justifyContent: "center",
    shadowColor: theme.colors.danger, shadowOpacity: 0.7, shadowRadius: 40, shadowOffset: { width: 0, height: 0 },
  },
  sosInner: { alignItems: "center", justifyContent: "center" },
  sosTitle: { ...theme.type.title, color: "#fff", letterSpacing: 1.5, marginTop: 12 },
  sosSub:   { ...theme.type.bodySm, color: "rgba(255,255,255,0.85)", marginTop: 4 },
  status:   { ...theme.type.body, color: theme.colors.accent, marginTop: 12 },

  tierRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: theme.colors.outlineSoft,
  },

  contact: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 12,
    borderRadius: theme.radius.lg,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1, borderColor: theme.colors.outlineSoft,
    marginBottom: 8,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { ...theme.type.h3, color: "#07080F" },

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
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
  },
  sosSheet: {
    width: "100%",
    maxWidth: 400,
    maxHeight: "88%",
    backgroundColor: "#121530",
    borderRadius: theme.radius.xl,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
  },
  sosSheetBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent,
  },
  sosSheetBtn911: {
    backgroundColor: theme.colors.danger,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  sosSheetBtnGhost: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
  },
  sosSheetBtnTitle: { ...theme.type.h3, color: "#fff", fontSize: 16 },
  sosSheetBtnSub: { ...theme.type.bodySm, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  sosMiniAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sosMiniAvatarText: { ...theme.type.h3, color: "#07080F" },
});
