import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/services/api";
import { firebaseConfigured, initFirebase } from "@/services/firebase";
import { fs } from "@/services/firestoreSync";
import { onAmbientListeningEdge } from "@/utils/ambientSessionLifecycle";
import { hasDuplicatePending } from "@/utils/actionDedupe";
import { ambientBannerFromSound } from "@/utils/ambientSoundBanner";
import type { AmbientBanner } from "@/utils/ambientSoundBanner";
import { registerHapticsEnabled } from "@/utils/feedbackPrefs";
import { feedbackForSoundEventTier } from "@/utils/alertFeedback";
import { syncTaskRemindersFromActions } from "@/notifications/taskReminders";

export type { AmbientBanner } from "@/utils/ambientSoundBanner";

export type SoundEvent = {
  id: string;
  label: string;
  display: string;
  tier: "emergency" | "high" | "medium" | "low";
  icon: string;
  confidence: number;
  timestamp: number;
  room?: string | null;
  direction?: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | string | null;
  acknowledged?: boolean;
};

export type CapturedAction = {
  id: string;
  type: "calendar" | "reminder" | "shopping" | "contact" | "medication" | "followup" | "note";
  title: string;
  detail: string;
  when?: string | null;
  sourceQuote?: string;
  priority: "low" | "medium" | "high" | "urgent";
  confidence: number;
  createdAt: number;
  done?: boolean;
};

export type TrustedContact = { id: string; name: string; phone: string; relation?: string | null };

export type Medication = {
  id: string;
  name: string;
  schedule: string;
  nextDose: number | null;
  prescribedBy?: string | null;
  active: boolean;
  lastTakenAt?: number;
  createdAt?: number;
};

/** Local-only history of Appointment companion visits (not synced to backend yet). */
export type MedicalVisitLogEntry = {
  id: string;
  createdAt: number;
  summaryTitle?: string;
  summaryTldr?: string;
  medsAdded: string[];
  labsScheduled: string[];
  transcriptPreview: string;
};

type Preferences = {
  haptics: boolean;
  flashAlerts: boolean;
  textSize: "regular" | "large" | "xl";
  autoTranscribe: boolean;
  allowCloudOffload: boolean;
  retentionDays: number;
  /** Schedule OS notifications when a task has a future ISO `when` (calendar / reminder / etc.). */
  taskReminders: boolean;
};

type EchoState = {
  isListening: boolean;
  nightMode: boolean;
  userName: string;
  soundEvents: SoundEvent[];
  /** Immediate ambient classification banner (any tab). */
  ambientBanner: AmbientBanner | null;
  actions: CapturedAction[];
  trustedCircle: TrustedContact[];
  medications: Medication[];
  medicalVisitLog: MedicalVisitLogEntry[];
  preferences: Preferences;
  // lifecycle
  hydrating: boolean;
  backendOnline: boolean;
  lastSyncedAt: number | null;
};

type EchoContextValue = EchoState & {
  setIsListening: (v: boolean) => void;
  setNightMode: (v: boolean) => void;
  setUserName: (v: string) => void;

  pushSoundEvent: (e: Omit<SoundEvent, "id" | "timestamp">) => void;
  acknowledgeEvent: (id: string) => void;
  clearEvents: () => void;
  dismissAmbientBanner: () => void;

  /** Returns false if an identical pending task already exists (same type, title, detail, when). */
  addAction: (a: Omit<CapturedAction, "id" | "createdAt">) => boolean;
  /** Rows already saved by POST /api/extract-actions — merges into state without a second POST. */
  ingestPersistedActions: (items: ReadonlyArray<CapturedAction>) => number;
  toggleActionDone: (id: string) => void;
  removeAction: (id: string) => void;

  addContact: (c: Omit<TrustedContact, "id">) => Promise<{ ok: boolean; error?: string }>;
  removeContact: (id: string) => void;

  addMedication: (m: Omit<Medication, "id" | "active"> & { active?: boolean }) => void;
  takeMedication: (id: string) => void;
  removeMedication: (id: string) => void;

  /** Append one Appointment companion visit summary (persisted locally). */
  appendMedicalVisitLog: (entry: Omit<MedicalVisitLogEntry, "id">) => void;

  setPreference: <K extends keyof Preferences>(k: K, v: Preferences[K]) => void;

  refresh: () => Promise<void>;
};

const EchoContext = createContext<EchoContextValue | null>(null);
const PREFS_CACHE_KEY = "echo_state_cache_v1";
const MEDICAL_LOG_KEY = "echo_medical_visit_log_v1";

const MAX_MEDICAL_VISIT_LOG = 40;

function coerceMedicalLogEntry(raw: any): MedicalVisitLogEntry | null {
  if (!raw || typeof raw.createdAt !== "number") return null;
  const id = raw.id != null ? String(raw.id) : `mv_${raw.createdAt}`;
  return {
    id,
    createdAt: raw.createdAt,
    summaryTitle: raw.summaryTitle != null ? String(raw.summaryTitle) : undefined,
    summaryTldr: raw.summaryTldr != null ? String(raw.summaryTldr) : undefined,
    medsAdded: Array.isArray(raw.medsAdded) ? raw.medsAdded.map(String) : [],
    labsScheduled: Array.isArray(raw.labsScheduled) ? raw.labsScheduled.map(String) : [],
    transcriptPreview: raw.transcriptPreview != null ? String(raw.transcriptPreview) : "",
  };
}

// -------- Fallback seeds (used only when backend is unreachable AND no cache) --------
const seedEvents = (): SoundEvent[] => [
  { id: "e1", label: "doorbell",       display: "Doorbell",         tier: "medium", icon: "bell",       confidence: 0.94, timestamp: Date.now() - 1000 * 60 * 4,  room: "Front door",   direction: "N" },
  { id: "e2", label: "microwave_beep", display: "Microwave timer",  tier: "low",    icon: "microwave",  confidence: 0.88, timestamp: Date.now() - 1000 * 60 * 14, room: "Kitchen",      direction: "E" },
  { id: "e3", label: "name_called",    display: "Your name called", tier: "high",   icon: "user",       confidence: 0.81, timestamp: Date.now() - 1000 * 60 * 37, room: "Living room",  direction: "W" },
];
const seedActions = (): CapturedAction[] => [
  { id: "a1", type: "calendar", title: "Dentist, Thu 3:00 PM", detail: "Overheard reminder.", when: null, sourceQuote: "Hey Sarah, don't forget your dentist appointment Thursday at 3.", priority: "medium", confidence: 0.92, createdAt: Date.now() - 1000 * 60 * 60 * 3 },
  { id: "a2", type: "shopping", title: "Milk on the way home",       detail: "Commitment overheard.", when: null, sourceQuote: "I'll pick up milk on the way home.", priority: "low", confidence: 0.78, createdAt: Date.now() - 1000 * 60 * 60 * 6 },
];
const seedContacts = (): TrustedContact[] => [
  { id: "c1", name: "Mom",     phone: "+15550101001", relation: "Family"  },
  { id: "c2", name: "Alex",    phone: "+15550101002", relation: "Partner" },
  { id: "c3", name: "Dr. Lin", phone: "+15550101003", relation: "Doctor"  },
];
const seedMedications = (): Medication[] => [
  { id: "m1", name: "Lisinopril 10 mg", schedule: "Every morning with water", nextDose: Date.now() + 1000 * 60 * 60 * 14, prescribedBy: "Dr. Lin", active: true },
  { id: "m2", name: "Vitamin D3 2000 IU", schedule: "Daily with lunch",       nextDose: Date.now() + 1000 * 60 * 60 * 18, prescribedBy: null,      active: true },
];
const defaultPrefs = (): Preferences => ({
  haptics: true,
  flashAlerts: true,
  textSize: "regular",
  autoTranscribe: true,
  allowCloudOffload: true,
  retentionDays: 7,
  taskReminders: true,
});

function coerceCapturedAction(raw: any): CapturedAction | null {
  if (!raw?.title || raw?.id == null) return null;
  const id = String(raw.id);
  return {
    id,
    type: raw.type || "note",
    title: String(raw.title),
    detail: String(raw.detail ?? ""),
    when: raw.when ?? null,
    sourceQuote: raw.sourceQuote != null ? String(raw.sourceQuote) : undefined,
    priority: raw.priority || "medium",
    confidence: typeof raw.confidence === "number" ? raw.confidence : 0.8,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
    done: Boolean(raw.done),
  };
}

function mergePersistedInto(
  prev: CapturedAction[],
  rows: CapturedAction[],
): { actions: CapturedAction[]; added: number } {
  let next = [...prev];
  let added = 0;
  for (const a of rows) {
    if (next.some((x) => x.id === a.id)) continue;
    if (hasDuplicatePending(next, a)) continue;
    next = [a, ...next];
    added += 1;
  }
  return { actions: next, added };
}

export const EchoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // When the Firebase env keys are present we'll be replacing local state
  // with the real Firestore snapshots within milliseconds, so don't show
  // demo seed rows that would briefly flash and then disappear.
  const usingFirebase = firebaseConfigured();
  const [state, setState] = useState<EchoState>(() => ({
    isListening: true,
    nightMode: false,
    userName: "Sarah",
    soundEvents: usingFirebase ? [] : seedEvents(),
    ambientBanner: null,
    actions: usingFirebase ? [] : seedActions(),
    trustedCircle: usingFirebase ? [] : seedContacts(),
    medications: usingFirebase ? [] : seedMedications(),
    medicalVisitLog: [],
    preferences: defaultPrefs(),
    hydrating: true,
    backendOnline: false,
    lastSyncedAt: null,
  }));

  // Keep the "latest state" available for async syncs without re-binding every
  // mutator on every render. Without this, closure captures stale snapshots.
  const stateRef = useRef(state);
  stateRef.current = state;

  /** After user touches Listen/Home toggle, don't let async hydrate overwrite `isListening` (fixes Listen showing PAUSED). */
  const listeningUserOverrideRef = useRef(false);

  // ---------- Hydration ----------
  const hydrate = useCallback(async () => {
    try {
      const snap = await api.state();
      setState((prev) => ({
        ...prev,
        userName:      snap.profile?.userName || prev.userName,
        isListening:   listeningUserOverrideRef.current ? prev.isListening : Boolean(snap.preferences?.isListening),
        nightMode:     Boolean(snap.preferences?.nightMode),
        soundEvents:   snap.events || [],
        actions:       snap.actions || [],
        trustedCircle: snap.contacts || [],
        medications:   snap.medications || [],
        preferences: {
          haptics:           Boolean(snap.preferences?.haptics),
          flashAlerts:       Boolean(snap.preferences?.flashAlerts),
          textSize:          snap.preferences?.textSize || "regular",
          autoTranscribe:    Boolean(snap.preferences?.autoTranscribe),
          allowCloudOffload: Boolean(snap.preferences?.allowCloudOffload),
          retentionDays:     Number(snap.preferences?.retentionDays) || 7,
          taskReminders:     snap.preferences?.taskReminders !== false,
        },
        hydrating: false,
        backendOnline: true,
        lastSyncedAt: Date.now(),
      }));
      AsyncStorage.setItem(PREFS_CACHE_KEY, JSON.stringify(snap)).catch(() => {});
    } catch {
      // Backend unreachable — fall back to the last cache, else seeds.
      try {
        const raw = await AsyncStorage.getItem(PREFS_CACHE_KEY);
        if (raw) {
          const snap = JSON.parse(raw);
          setState((prev) => ({
            ...prev,
            userName:      snap.profile?.userName || prev.userName,
            isListening:   listeningUserOverrideRef.current ? prev.isListening : Boolean(snap.preferences?.isListening ?? prev.isListening),
            soundEvents:   snap.events || prev.soundEvents,
            actions:       snap.actions || prev.actions,
            trustedCircle: snap.contacts || prev.trustedCircle,
            medications:   snap.medications || prev.medications,
            preferences: { ...defaultPrefs(), ...(snap.preferences || {}) },
            hydrating: false,
            backendOnline: false,
          }));
          return;
        }
      } catch {}
      setState((prev) => ({ ...prev, hydrating: false, backendOnline: false }));
    }
  }, []);

  // ---------- Firebase bootstrap + live subscriptions ----------
  // When EXPO_PUBLIC_FIREBASE_* env vars are set, all state flows through
  // Firestore so two devices with the same EXPO_PUBLIC_FIREBASE_USER_ID share
  // data in real time. When they're absent, we silently fall back to the
  // legacy Express backend (`hydrate()` below).
  useEffect(() => {
    let unsubs: Array<() => void> = [];
    let cancelled = false;
    (async () => {
      const init = await initFirebase();
      if (cancelled) return;
      if (!init.enabled) {
        // No Firebase config → use the Express backend exactly as before.
        hydrate();
        return;
      }

      const u1 = fs.subscribeProfile((p) => {
        if (!p) return;
        setState((s) => ({ ...s, userName: p.userName || s.userName }));
      });
      const u2 = fs.subscribePreferences((p) => {
        if (!p) return;
        setState((s) => ({
          ...s,
          isListening: listeningUserOverrideRef.current ? s.isListening : Boolean(p.isListening ?? s.isListening),
          nightMode:   Boolean(p.nightMode ?? s.nightMode),
          preferences: {
            haptics:           Boolean(p.haptics ?? s.preferences.haptics),
            flashAlerts:       Boolean(p.flashAlerts ?? s.preferences.flashAlerts),
            textSize:          (p.textSize as any) ?? s.preferences.textSize,
            autoTranscribe:    Boolean(p.autoTranscribe ?? s.preferences.autoTranscribe),
            allowCloudOffload: Boolean(p.allowCloudOffload ?? s.preferences.allowCloudOffload),
            retentionDays:     Number(p.retentionDays ?? s.preferences.retentionDays) || 7,
            taskReminders:     p.taskReminders !== false,
          },
        }));
      });
      const u3 = fs.subscribeEvents((events) => {
        setState((s) => ({ ...s, soundEvents: events }));
      });
      const u4 = fs.subscribeActions((rows) => {
        setState((s) => ({ ...s, actions: rows }));
      });
      const u5 = fs.subscribeContacts((rows) => {
        setState((s) => ({ ...s, trustedCircle: rows }));
      });
      const u6 = fs.subscribeMedications((rows) => {
        setState((s) => ({ ...s, medications: rows }));
      });
      const u7 = fs.subscribeMedicalVisitLog((rows) => {
        setState((s) => ({ ...s, medicalVisitLog: rows.slice(0, MAX_MEDICAL_VISIT_LOG) }));
      });
      [u1, u2, u3, u4, u5, u6, u7].forEach((u) => { if (u) unsubs.push(u); });

      setState((s) => ({ ...s, hydrating: false, backendOnline: true, lastSyncedAt: Date.now() }));
    })();
    return () => {
      cancelled = true;
      unsubs.forEach((u) => { try { u(); } catch {} });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    registerHapticsEnabled(() => stateRef.current.preferences.haptics);
  }, []);

  const reminderSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (state.hydrating) return;
    if (reminderSyncTimerRef.current) clearTimeout(reminderSyncTimerRef.current);
    reminderSyncTimerRef.current = setTimeout(() => {
      void syncTaskRemindersFromActions(state.actions, state.preferences.taskReminders);
    }, 500);
    return () => {
      if (reminderSyncTimerRef.current) clearTimeout(reminderSyncTimerRef.current);
    };
  }, [state.actions, state.hydrating, state.preferences.taskReminders]);

  useEffect(() => {
    AsyncStorage.getItem(MEDICAL_LOG_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed)) return;
          const rows = parsed.map(coerceMedicalLogEntry).filter(Boolean) as MedicalVisitLogEntry[];
          rows.sort((a, b) => b.createdAt - a.createdAt);
          setState((p) => ({ ...p, medicalVisitLog: rows.slice(0, MAX_MEDICAL_VISIT_LOG) }));
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
  }, []);

  // ---------- Listening / NightMode (persisted in preferences) ----------
  const setIsListening = useCallback((v: boolean) => {
    listeningUserOverrideRef.current = true;
    setState((p) => {
      if (p.isListening !== v) void onAmbientListeningEdge(p.isListening, v);
      return { ...p, isListening: v };
    });
    if (fs.enabled()) {
      void fs.setPreferences({ isListening: v });
    } else {
      api.patchPreferences({ isListening: v }).catch(() => {});
    }
  }, []);

  const setNightMode = useCallback((v: boolean) => {
    setState((p) => ({ ...p, nightMode: v }));
    if (fs.enabled()) {
      void fs.setPreferences({ nightMode: v });
    } else {
      api.patchPreferences({ nightMode: v }).catch(() => {});
    }
  }, []);

  // ---------- Profile (userName) ----------
  const setUserName = useCallback((v: string) => {
    setState((p) => ({ ...p, userName: v }));
    if (fs.enabled()) {
      void fs.setProfile({ userName: v });
    } else {
      api.patchProfile({ userName: v }).catch(() => {});
    }
  }, []);

  // ---------- Sound events ----------
  const dismissAmbientBanner = useCallback(() => {
    setState((p) => ({ ...p, ambientBanner: null }));
  }, []);

  const pushSoundEvent: EchoContextValue["pushSoundEvent"] = useCallback((e) => {
    feedbackForSoundEventTier(e.tier);
    const optimisticId = `e_local_${Date.now()}`;
    const optimistic: SoundEvent = { ...e, id: optimisticId, timestamp: Date.now() };
    const banner = ambientBannerFromSound(e, optimisticId);
    setState((p) => ({
      ...p,
      soundEvents: [optimistic, ...p.soundEvents].slice(0, 200),
      ...(banner ? { ambientBanner: banner } : {}),
    }));
    if (fs.enabled()) {
      // Firestore subscription will replace the optimistic row with the
      // canonical one (sorted by timestamp).
      fs.addEvent({
        label: e.label, display: e.display, tier: e.tier, icon: e.icon,
        confidence: e.confidence, room: e.room, direction: e.direction as any,
      })
        .then((event) => {
          setState((p) => ({
            ...p,
            soundEvents: p.soundEvents.map((x) => (x.id === optimisticId ? event : x)),
          }));
        })
        .catch(() => { /* keep optimistic row */ });
      return;
    }
    api.addEvent({
      label: e.label, display: e.display, tier: e.tier, icon: e.icon,
      confidence: e.confidence, room: e.room, direction: e.direction as any,
    })
      .then(({ event }) => {
        setState((p) => ({
          ...p,
          soundEvents: p.soundEvents.map((x) => (x.id === optimisticId ? { ...event } : x)),
        }));
      })
      .catch(() => { /* offline — keep optimistic row */ });
  }, []);

  const acknowledgeEvent = useCallback((id: string) => {
    setState((p) => ({
      ...p,
      soundEvents: p.soundEvents.map((e) => (e.id === id ? { ...e, acknowledged: true } : e)),
    }));
    if (fs.enabled()) {
      void fs.ackEvent(id);
    } else {
      api.ackEvent(id).catch(() => {});
    }
  }, []);

  const clearEvents = useCallback(() => {
    setState((p) => ({ ...p, soundEvents: [], ambientBanner: null }));
    if (fs.enabled()) {
      void fs.clearEvents();
    } else {
      api.clearEvents().catch(() => {});
    }
  }, []);

  // ---------- Actions ----------
  const addAction: EchoContextValue["addAction"] = useCallback((a) => {
    if (hasDuplicatePending(stateRef.current.actions, a)) return false;
    const optimisticId = `a_local_${Date.now()}`;
    const optimistic: CapturedAction = { ...a, id: optimisticId, createdAt: Date.now() };
    setState((p) => ({ ...p, actions: [optimistic, ...p.actions] }));
    if (fs.enabled()) {
      fs.addAction(a)
        .then((row) => {
          setState((p) => ({
            ...p,
            actions: p.actions.map((x) => (x.id === optimisticId ? row : x)),
          }));
        })
        .catch(() => {
          setState((p) => ({ ...p, actions: p.actions.filter((x) => x.id !== optimisticId) }));
        });
      return true;
    }
    api.addAction(a)
      .then((res) => {
        if (res?.duplicate) {
          setState((p) => ({ ...p, actions: p.actions.filter((x) => x.id !== optimisticId) }));
          api.listActions()
            .then(({ actions: list }) => {
              const rows = (list || []).map(coerceCapturedAction).filter(Boolean) as CapturedAction[];
              rows.sort((x, y) => y.createdAt - x.createdAt);
              setState((p) => ({ ...p, actions: rows }));
            })
            .catch(() => {});
          return;
        }
        if (!res?.action) {
          setState((p) => ({ ...p, actions: p.actions.filter((x) => x.id !== optimisticId) }));
          return;
        }
        const merged = coerceCapturedAction(res.action);
        setState((p) => ({
          ...p,
          actions: p.actions.map((x) => (x.id === optimisticId ? merged || res.action! : x)),
        }));
      })
      .catch(() => {});
    return true;
  }, []);

  const ingestPersistedActions = useCallback((items: ReadonlyArray<CapturedAction>): number => {
    const rows = items.map((raw: any) => coerceCapturedAction(raw)).filter(Boolean) as CapturedAction[];
    if (!rows.length) return 0;
    let added = 0;
    setState((p) => {
      const { actions: merged, added: n } = mergePersistedInto(p.actions, rows);
      added = n;
      return n ? { ...p, actions: merged } : p;
    });
    // Mirror server-persisted rows to Firestore so cross-device sync stays
    // accurate. Snapshot listener will dedupe on id.
    if (fs.enabled()) {
      for (const row of rows) void fs.upsertAction(row);
    }
    return added;
  }, []);

  const toggleActionDone = useCallback((id: string) => {
    const existing = stateRef.current.actions.find((a) => a.id === id);
    const next = !existing?.done;
    setState((p) => ({ ...p, actions: p.actions.map((a) => (a.id === id ? { ...a, done: next } : a)) }));
    if (fs.enabled()) {
      void fs.patchAction(id, { done: next });
    } else {
      api.patchAction(id, { done: next }).catch(() => {});
    }
  }, []);

  const removeAction = useCallback((id: string) => {
    setState((p) => ({ ...p, actions: p.actions.filter((a) => a.id !== id) }));
    if (fs.enabled()) {
      void fs.deleteAction(id);
    } else {
      api.deleteAction(id).catch(() => {});
    }
  }, []);

  // ---------- Contacts (add is awaited so the UI can surface validation errors) ----------
  const addContact: EchoContextValue["addContact"] = useCallback(async (c) => {
    if (fs.enabled()) {
      try {
        const contact = await fs.addContact(c);
        setState((p) => ({ ...p, trustedCircle: [...p.trustedCircle, contact] }));
        return { ok: true };
      } catch (err: any) {
        const optimistic: TrustedContact = { ...c, id: `c_local_${Date.now()}` };
        setState((p) => ({ ...p, trustedCircle: [...p.trustedCircle, optimistic] }));
        return { ok: false, error: err?.message || "Could not reach Firestore. Saved on this device." };
      }
    }
    try {
      const { contact } = await api.addContact(c);
      setState((p) => ({ ...p, trustedCircle: [...p.trustedCircle, contact] }));
      return { ok: true };
    } catch (err: any) {
      // Fallback: add locally so the app is usable offline. Flag it as a local
      // id so we know it hasn't synced yet — future work can retry.
      const optimistic: TrustedContact = { ...c, id: `c_local_${Date.now()}` };
      setState((p) => ({ ...p, trustedCircle: [...p.trustedCircle, optimistic] }));
      return { ok: false, error: err?.message || "Could not reach backend. Saved on this device." };
    }
  }, []);

  const removeContact = useCallback((id: string) => {
    setState((p) => ({ ...p, trustedCircle: p.trustedCircle.filter((c) => c.id !== id) }));
    if (fs.enabled()) {
      void fs.deleteContact(id);
    } else {
      api.deleteContact(id).catch(() => {});
    }
  }, []);

  // ---------- Medications ----------
  const addMedication: EchoContextValue["addMedication"] = useCallback((m) => {
    const optimisticId = `m_local_${Date.now()}`;
    const optimistic: Medication = {
      id: optimisticId, name: m.name, schedule: m.schedule,
      nextDose: m.nextDose ?? null, prescribedBy: m.prescribedBy ?? null,
      active: m.active ?? true,
    };
    setState((p) => ({ ...p, medications: [...p.medications, optimistic] }));
    if (fs.enabled()) {
      fs.addMedication(m as any)
        .then((medication) => {
          setState((p) => ({
            ...p,
            medications: p.medications.map((x) => (x.id === optimisticId ? medication : x)),
          }));
        })
        .catch(() => {});
      return;
    }
    api.addMedication(m as any)
      .then(({ medication }) => {
        setState((p) => ({
          ...p,
          medications: p.medications.map((x) => (x.id === optimisticId ? medication : x)),
        }));
      })
      .catch(() => {});
  }, []);

  const takeMedication = useCallback((id: string) => {
    setState((p) => ({
      ...p,
      medications: p.medications.map((m) => (m.id === id ? { ...m, lastTakenAt: Date.now() } : m)),
    }));
    if (fs.enabled()) {
      void fs.takeMedication(id);
      return;
    }
    api.takeMedication(id)
      .then(({ medication }) => {
        setState((p) => ({
          ...p,
          medications: p.medications.map((x) => (x.id === id ? medication : x)),
        }));
      })
      .catch(() => {});
  }, []);

  const removeMedication = useCallback((id: string) => {
    setState((p) => ({ ...p, medications: p.medications.filter((m) => m.id !== id) }));
    if (fs.enabled()) {
      void fs.deleteMedication(id);
    } else {
      api.deleteMedication(id).catch(() => {});
    }
  }, []);

  const appendMedicalVisitLog = useCallback((entry: Omit<MedicalVisitLogEntry, "id">) => {
    const row: MedicalVisitLogEntry = {
      ...entry,
      id: `mv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: entry.createdAt,
      medsAdded: [...entry.medsAdded],
      labsScheduled: [...entry.labsScheduled],
      transcriptPreview: entry.transcriptPreview,
    };
    setState((p) => {
      const next = [row, ...p.medicalVisitLog].slice(0, MAX_MEDICAL_VISIT_LOG);
      if (!fs.enabled()) {
        AsyncStorage.setItem(MEDICAL_LOG_KEY, JSON.stringify(next)).catch(() => {});
      }
      return { ...p, medicalVisitLog: next };
    });
    if (fs.enabled()) {
      void fs.addMedicalVisitLog(entry);
    }
  }, []);

  // ---------- Preferences ----------
  const setPreference: EchoContextValue["setPreference"] = useCallback((k, v) => {
    setState((p) => ({ ...p, preferences: { ...p.preferences, [k]: v } }));
    if (fs.enabled()) {
      void fs.setPreferences({ [k]: v } as any);
    } else {
      api.patchPreferences({ [k]: v } as any).catch(() => {});
    }
  }, []);

  const value = useMemo<EchoContextValue>(
    () => ({
      ...state,
      setIsListening,
      setNightMode,
      setUserName,
      pushSoundEvent,
      acknowledgeEvent,
      clearEvents,
      dismissAmbientBanner,
      addAction,
      ingestPersistedActions,
      toggleActionDone,
      removeAction,
      addContact,
      removeContact,
      addMedication,
      takeMedication,
      removeMedication,
      appendMedicalVisitLog,
      setPreference,
      refresh: hydrate,
    }),
    [
      state,
      setIsListening, setNightMode, setUserName,
      pushSoundEvent, acknowledgeEvent, clearEvents, dismissAmbientBanner,
      addAction, ingestPersistedActions, toggleActionDone, removeAction,
      addContact, removeContact,
      addMedication, takeMedication, removeMedication,
      appendMedicalVisitLog,
      setPreference, hydrate,
    ],
  );

  return <EchoContext.Provider value={value}>{children}</EchoContext.Provider>;
};

export function useEcho() {
  const ctx = useContext(EchoContext);
  if (!ctx) throw new Error("useEcho must be inside EchoProvider");
  return ctx;
}
