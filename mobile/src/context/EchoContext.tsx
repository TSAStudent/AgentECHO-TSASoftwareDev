import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/services/api";

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

type Preferences = {
  haptics: boolean;
  flashAlerts: boolean;
  textSize: "regular" | "large" | "xl";
  autoTranscribe: boolean;
  allowCloudOffload: boolean;
  retentionDays: number;
};

type EchoState = {
  isListening: boolean;
  nightMode: boolean;
  userName: string;
  soundEvents: SoundEvent[];
  actions: CapturedAction[];
  trustedCircle: TrustedContact[];
  medications: Medication[];
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

  addAction: (a: Omit<CapturedAction, "id" | "createdAt">) => void;
  toggleActionDone: (id: string) => void;
  removeAction: (id: string) => void;

  addContact: (c: Omit<TrustedContact, "id">) => Promise<{ ok: boolean; error?: string }>;
  removeContact: (id: string) => void;

  addMedication: (m: Omit<Medication, "id" | "active"> & { active?: boolean }) => void;
  takeMedication: (id: string) => void;
  removeMedication: (id: string) => void;

  setPreference: <K extends keyof Preferences>(k: K, v: Preferences[K]) => void;

  refresh: () => Promise<void>;
};

const EchoContext = createContext<EchoContextValue | null>(null);
const PREFS_CACHE_KEY = "echo_state_cache_v1";

// -------- Fallback seeds (used only when backend is unreachable AND no cache) --------
const seedEvents = (): SoundEvent[] => [
  { id: "e1", label: "doorbell",       display: "Doorbell",         tier: "medium", icon: "bell",       confidence: 0.94, timestamp: Date.now() - 1000 * 60 * 4,  room: "Front door",   direction: "N" },
  { id: "e2", label: "microwave_beep", display: "Microwave timer",  tier: "low",    icon: "microwave",  confidence: 0.88, timestamp: Date.now() - 1000 * 60 * 14, room: "Kitchen",      direction: "E" },
  { id: "e3", label: "name_called",    display: "Your name called", tier: "high",   icon: "user",       confidence: 0.81, timestamp: Date.now() - 1000 * 60 * 37, room: "Living room",  direction: "W" },
];
const seedActions = (): CapturedAction[] => [
  { id: "a1", type: "calendar", title: "Dentist — Thursday 3:00 PM", detail: "Overheard reminder.", when: null, sourceQuote: "Hey Sarah, don't forget your dentist appointment Thursday at 3.", priority: "medium", confidence: 0.92, createdAt: Date.now() - 1000 * 60 * 60 * 3 },
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
});

export const EchoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<EchoState>(() => ({
    isListening: true,
    nightMode: false,
    userName: "Sarah",
    soundEvents: seedEvents(),
    actions: seedActions(),
    trustedCircle: seedContacts(),
    medications: seedMedications(),
    preferences: defaultPrefs(),
    hydrating: true,
    backendOnline: false,
    lastSyncedAt: null,
  }));

  // Keep the "latest state" available for async syncs without re-binding every
  // mutator on every render. Without this, closure captures stale snapshots.
  const stateRef = useRef(state);
  stateRef.current = state;

  // ---------- Hydration ----------
  const hydrate = useCallback(async () => {
    try {
      const snap = await api.state();
      setState((prev) => ({
        ...prev,
        userName:      snap.profile?.userName || prev.userName,
        isListening:   Boolean(snap.preferences?.isListening),
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

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // ---------- Listening / NightMode (persisted in preferences) ----------
  const setIsListening = useCallback((v: boolean) => {
    setState((p) => ({ ...p, isListening: v }));
    api.patchPreferences({ isListening: v }).catch(() => {});
  }, []);

  const setNightMode = useCallback((v: boolean) => {
    setState((p) => ({ ...p, nightMode: v }));
    api.patchPreferences({ nightMode: v }).catch(() => {});
  }, []);

  // ---------- Profile (userName) ----------
  const setUserName = useCallback((v: string) => {
    setState((p) => ({ ...p, userName: v }));
    api.patchProfile({ userName: v }).catch(() => {});
  }, []);

  // ---------- Sound events ----------
  const pushSoundEvent: EchoContextValue["pushSoundEvent"] = useCallback((e) => {
    const optimistic: SoundEvent = {
      ...e,
      id: `e_local_${Date.now()}`,
      timestamp: Date.now(),
    };
    setState((p) => ({ ...p, soundEvents: [optimistic, ...p.soundEvents].slice(0, 200) }));
    // Reconcile with server id on success.
    api.addEvent({
      label: e.label, display: e.display, tier: e.tier, icon: e.icon,
      confidence: e.confidence, room: e.room, direction: e.direction as any,
    })
      .then(({ event }) => {
        setState((p) => ({
          ...p,
          soundEvents: p.soundEvents.map((x) => (x.id === optimistic.id ? { ...event } : x)),
        }));
      })
      .catch(() => { /* offline — keep optimistic row */ });
  }, []);

  const acknowledgeEvent = useCallback((id: string) => {
    setState((p) => ({
      ...p,
      soundEvents: p.soundEvents.map((e) => (e.id === id ? { ...e, acknowledged: true } : e)),
    }));
    api.ackEvent(id).catch(() => {});
  }, []);

  const clearEvents = useCallback(() => {
    setState((p) => ({ ...p, soundEvents: [] }));
    api.clearEvents().catch(() => {});
  }, []);

  // ---------- Actions ----------
  const addAction: EchoContextValue["addAction"] = useCallback((a) => {
    const optimistic: CapturedAction = { ...a, id: `a_local_${Date.now()}`, createdAt: Date.now() };
    setState((p) => ({ ...p, actions: [optimistic, ...p.actions] }));
    api.addAction(a)
      .then(({ action }) => {
        setState((p) => ({
          ...p,
          actions: p.actions.map((x) => (x.id === optimistic.id ? action : x)),
        }));
      })
      .catch(() => {});
  }, []);

  const toggleActionDone = useCallback((id: string) => {
    const existing = stateRef.current.actions.find((a) => a.id === id);
    const next = !existing?.done;
    setState((p) => ({ ...p, actions: p.actions.map((a) => (a.id === id ? { ...a, done: next } : a)) }));
    api.patchAction(id, { done: next }).catch(() => {});
  }, []);

  const removeAction = useCallback((id: string) => {
    setState((p) => ({ ...p, actions: p.actions.filter((a) => a.id !== id) }));
    api.deleteAction(id).catch(() => {});
  }, []);

  // ---------- Contacts (add is awaited so the UI can surface validation errors) ----------
  const addContact: EchoContextValue["addContact"] = useCallback(async (c) => {
    try {
      const { contact } = await api.addContact(c);
      setState((p) => ({ ...p, trustedCircle: [...p.trustedCircle, contact] }));
      return { ok: true };
    } catch (err: any) {
      // Fallback: add locally so the app is usable offline. Flag it as a local
      // id so we know it hasn't synced yet — future work can retry.
      const optimistic: TrustedContact = { ...c, id: `c_local_${Date.now()}` };
      setState((p) => ({ ...p, trustedCircle: [...p.trustedCircle, optimistic] }));
      return { ok: false, error: err?.message || "Could not reach backend — saved locally." };
    }
  }, []);

  const removeContact = useCallback((id: string) => {
    setState((p) => ({ ...p, trustedCircle: p.trustedCircle.filter((c) => c.id !== id) }));
    api.deleteContact(id).catch(() => {});
  }, []);

  // ---------- Medications ----------
  const addMedication: EchoContextValue["addMedication"] = useCallback((m) => {
    const optimistic: Medication = {
      id: `m_local_${Date.now()}`, name: m.name, schedule: m.schedule,
      nextDose: m.nextDose ?? null, prescribedBy: m.prescribedBy ?? null,
      active: m.active ?? true,
    };
    setState((p) => ({ ...p, medications: [...p.medications, optimistic] }));
    api.addMedication(m as any)
      .then(({ medication }) => {
        setState((p) => ({
          ...p,
          medications: p.medications.map((x) => (x.id === optimistic.id ? medication : x)),
        }));
      })
      .catch(() => {});
  }, []);

  const takeMedication = useCallback((id: string) => {
    setState((p) => ({
      ...p,
      medications: p.medications.map((m) => (m.id === id ? { ...m, lastTakenAt: Date.now() } : m)),
    }));
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
    api.deleteMedication(id).catch(() => {});
  }, []);

  // ---------- Preferences ----------
  const setPreference: EchoContextValue["setPreference"] = useCallback((k, v) => {
    setState((p) => ({ ...p, preferences: { ...p.preferences, [k]: v } }));
    api.patchPreferences({ [k]: v } as any).catch(() => {});
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
      addAction,
      toggleActionDone,
      removeAction,
      addContact,
      removeContact,
      addMedication,
      takeMedication,
      removeMedication,
      setPreference,
      refresh: hydrate,
    }),
    [
      state,
      setIsListening, setNightMode, setUserName,
      pushSoundEvent, acknowledgeEvent, clearEvents,
      addAction, toggleActionDone, removeAction,
      addContact, removeContact,
      addMedication, takeMedication, removeMedication,
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
