import React, { useRef, useState } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import * as Location from "expo-location";

import { Screen } from "@/components/Screen";
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
  const [form, setForm] = useState({ name: "", phone: "", relation: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const startHold = () => {
    haptic.medium();
    setPressing(true);
    Animated.timing(ringScale, { toValue: 1.25, duration: 1500, useNativeDriver: true }).start();
    pressTimer.current = setTimeout(() => {
      fireSos();
    }, 1500);
  };
  const cancelHold = () => {
    setPressing(false);
    Animated.timing(ringScale, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };
  const fireSos = async () => {
    setStatus("Locating you…");
    haptic.error();
    // Attempt to grab the user's real location. If permission is denied, we
    // still dispatch the SOS — just without live coordinates.
    let location: { lat: number; lng: number; accuracy?: number } | undefined;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        location = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? undefined };
      }
    } catch {
      // Non-fatal: send without location.
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
      setStatus("Could not reach backend — demo preview shown.");
    } finally {
      cancelHold();
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
          <Pressable
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
                {pressing ? "Dispatching in 1.5s" : "1.5-second safety lock"}
              </Text>
            </View>
          </Pressable>
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
          <Pressable onPress={() => { haptic.light(); setModalOpen(true); }} hitSlop={10}>
            <Feather name="plus" size={18} color={theme.colors.accent} />
          </Pressable>
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
            <Pressable onPress={() => { haptic.light(); removeContact(c.id); }} hitSlop={10}>
              <Feather name="x" size={18} color={theme.colors.textMute} />
            </Pressable>
          </View>
        ))
      )}

      <SectionHeader eyebrow="Public safety" title="Evacuation & PA capture" />
      <GlassCard intensity="low">
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Ionicons name="map" size={24} color={theme.colors.cyan} />
          <Text style={{ ...theme.type.body, color: theme.colors.textDim, flex: 1 }}>
            On trains, planes, and in airports, ECHO listens for PA announcements and pushes gate
            changes, delays, and evacuation orders with live maps — even if you can't hear them.
          </Text>
        </View>
      </GlassCard>

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
              <Pressable onPress={() => setModalOpen(false)} style={[styles.mBtn, styles.mBtnGhost]}>
                <Text style={{ ...theme.type.label, color: theme.colors.text }}>CANCEL</Text>
              </Pressable>
              <Pressable onPress={submitContact} disabled={submitting} style={[styles.mBtn, { backgroundColor: theme.colors.accent, opacity: submitting ? 0.6 : 1 }]}>
                <Text style={{ ...theme.type.label, color: "#07080F" }}>{submitting ? "SAVING…" : "ADD"}</Text>
              </Pressable>
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
    borderWidth: 1, borderColor: theme.colors.outlineSoft,
  },
});
