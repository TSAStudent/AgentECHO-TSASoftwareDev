import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  Firestore,
  Unsubscribe,
} from "firebase/firestore";
import { firebaseHandle } from "@/services/firebase";

export type SoundEvent = {
  id: string;
  label: string;
  display: string;
  tier: "emergency" | "high" | "medium" | "low";
  icon: string;
  confidence: number;
  timestamp: number;
  room?: string | null;
  direction?: string | null;
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

export type TrustedContact = {
  id: string;
  name: string;
  phone: string;
  relation?: string | null;
};

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

export type MedicalVisitLogEntry = {
  id: string;
  createdAt: number;
  summaryTitle?: string;
  summaryTldr?: string;
  medsAdded: string[];
  labsScheduled: string[];
  transcriptPreview: string;
};

export type Preferences = {
  haptics: boolean;
  flashAlerts: boolean;
  textSize: "regular" | "large" | "xl";
  autoTranscribe: boolean;
  allowCloudOffload: boolean;
  retentionDays: number;
  taskReminders: boolean;
  isListening: boolean;
  nightMode: boolean;
};

export type Profile = { userName: string; createdAt?: number };

const profileDoc = (db: Firestore, uid: string) => doc(db, "users", uid, "meta", "profile");
const prefsDoc   = (db: Firestore, uid: string) => doc(db, "users", uid, "meta", "preferences");
const eventsCol  = (db: Firestore, uid: string) => collection(db, "users", uid, "soundEvents");
const actionsCol = (db: Firestore, uid: string) => collection(db, "users", uid, "actions");
const contactsCol = (db: Firestore, uid: string) => collection(db, "users", uid, "contacts");
const medsCol     = (db: Firestore, uid: string) => collection(db, "users", uid, "medications");
const medLogCol   = (db: Firestore, uid: string) => collection(db, "users", uid, "medicalVisitLog");

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

// Firestore rejects undefined fields; strip them before write.
function clean<T extends Record<string, any>>(obj: T): T {
  const out: any = {};
  for (const k of Object.keys(obj)) if (obj[k] !== undefined) out[k] = obj[k];
  return out as T;
}

function subscribe(
  ref: any,
  onNext: (snap: any) => void,
  label: string,
): Unsubscribe {
  return onSnapshot(ref, onNext, (err) => {
    if (__DEV__) {
      console.warn(`[firestore:${label}] subscription error:`, err?.message || err);
    }
  });
}

export const fs = {
  enabled(): boolean {
    return !!firebaseHandle();
  },

  async getProfile(): Promise<Profile | null> {
    const h = firebaseHandle(); if (!h) return null;
    const snap = await getDoc(profileDoc(h.db, h.userId));
    return snap.exists() ? (snap.data() as Profile) : null;
  },
  async setProfile(p: Partial<Profile>): Promise<void> {
    const h = firebaseHandle(); if (!h) return;
    await setDoc(profileDoc(h.db, h.userId), clean({ ...p, updatedAt: Date.now() }), { merge: true });
  },
  subscribeProfile(onChange: (p: Profile | null) => void): Unsubscribe | null {
    const h = firebaseHandle(); if (!h) return null;
    return subscribe(profileDoc(h.db, h.userId), (snap) => {
      onChange(snap.exists() ? (snap.data() as Profile) : null);
    }, "profile");
  },

  async getPreferences(): Promise<Partial<Preferences> | null> {
    const h = firebaseHandle(); if (!h) return null;
    const snap = await getDoc(prefsDoc(h.db, h.userId));
    return snap.exists() ? (snap.data() as Partial<Preferences>) : null;
  },
  async setPreferences(p: Partial<Preferences>): Promise<void> {
    const h = firebaseHandle(); if (!h) return;
    await setDoc(prefsDoc(h.db, h.userId), clean({ ...p, updatedAt: Date.now() }), { merge: true });
  },
  subscribePreferences(onChange: (p: Partial<Preferences> | null) => void): Unsubscribe | null {
    const h = firebaseHandle(); if (!h) return null;
    return subscribe(prefsDoc(h.db, h.userId), (snap) => {
      onChange(snap.exists() ? (snap.data() as Partial<Preferences>) : null);
    }, "preferences");
  },

  async addEvent(e: Omit<SoundEvent, "id" | "timestamp">): Promise<SoundEvent> {
    const id = newId("e");
    const row: SoundEvent = { ...e, id, timestamp: Date.now() };
    const h = firebaseHandle(); if (!h) return row;
    await setDoc(doc(eventsCol(h.db, h.userId), id), clean(row));
    return row;
  },
  async ackEvent(id: string): Promise<void> {
    const h = firebaseHandle(); if (!h) return;
    await updateDoc(doc(eventsCol(h.db, h.userId), id), { acknowledged: true });
  },
  async clearEvents(): Promise<void> {
    const h = firebaseHandle(); if (!h) return;
    const snap = await getDocs(eventsCol(h.db, h.userId));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  },
  subscribeEvents(onChange: (events: SoundEvent[]) => void): Unsubscribe | null {
    const h = firebaseHandle(); if (!h) return null;
    return subscribe(
      query(eventsCol(h.db, h.userId), orderBy("timestamp", "desc"), limit(200)),
      (snap) => onChange(snap.docs.map((d: any) => d.data() as SoundEvent)),
      "events",
    );
  },

  async addAction(a: Omit<CapturedAction, "id" | "createdAt">): Promise<CapturedAction> {
    const id = newId("a");
    const row: CapturedAction = { ...a, id, createdAt: Date.now() };
    const h = firebaseHandle(); if (!h) return row;
    await setDoc(doc(actionsCol(h.db, h.userId), id), clean(row));
    return row;
  },
  async upsertAction(a: CapturedAction): Promise<void> {
    const h = firebaseHandle(); if (!h) return;
    await setDoc(doc(actionsCol(h.db, h.userId), a.id), clean(a), { merge: true });
  },
  async patchAction(id: string, patch: Partial<CapturedAction>): Promise<void> {
    const h = firebaseHandle(); if (!h) return;
    await updateDoc(doc(actionsCol(h.db, h.userId), id), clean(patch));
  },
  async deleteAction(id: string): Promise<void> {
    const h = firebaseHandle(); if (!h) return;
    await deleteDoc(doc(actionsCol(h.db, h.userId), id));
  },
  subscribeActions(onChange: (rows: CapturedAction[]) => void): Unsubscribe | null {
    const h = firebaseHandle(); if (!h) return null;
    return subscribe(
      query(actionsCol(h.db, h.userId), orderBy("createdAt", "desc")),
      (snap) => onChange(snap.docs.map((d: any) => d.data() as CapturedAction)),
      "actions",
    );
  },

  async addContact(c: Omit<TrustedContact, "id">): Promise<TrustedContact> {
    const id = newId("c");
    const row: TrustedContact = { ...c, id };
    const h = firebaseHandle(); if (!h) return row;
    await setDoc(doc(contactsCol(h.db, h.userId), id), clean(row));
    return row;
  },
  async deleteContact(id: string): Promise<void> {
    const h = firebaseHandle(); if (!h) return;
    await deleteDoc(doc(contactsCol(h.db, h.userId), id));
  },
  subscribeContacts(onChange: (rows: TrustedContact[]) => void): Unsubscribe | null {
    const h = firebaseHandle(); if (!h) return null;
    return subscribe(
      contactsCol(h.db, h.userId),
      (snap) => {
        const rows = snap.docs.map((d: any) => d.data() as TrustedContact);
        rows.sort((a: TrustedContact, b: TrustedContact) => a.name.localeCompare(b.name));
        onChange(rows);
      },
      "contacts",
    );
  },

  async addMedication(
    m: Omit<Medication, "id" | "active"> & { active?: boolean },
  ): Promise<Medication> {
    const id = newId("m");
    const row: Medication = {
      id,
      name: m.name,
      schedule: m.schedule,
      nextDose: m.nextDose ?? null,
      prescribedBy: m.prescribedBy ?? null,
      active: m.active ?? true,
      createdAt: Date.now(),
    };
    const h = firebaseHandle(); if (!h) return row;
    await setDoc(doc(medsCol(h.db, h.userId), id), clean(row));
    return row;
  },
  async takeMedication(id: string): Promise<void> {
    const h = firebaseHandle(); if (!h) return;
    await updateDoc(doc(medsCol(h.db, h.userId), id), { lastTakenAt: Date.now() });
  },
  async deleteMedication(id: string): Promise<void> {
    const h = firebaseHandle(); if (!h) return;
    await deleteDoc(doc(medsCol(h.db, h.userId), id));
  },
  subscribeMedications(onChange: (rows: Medication[]) => void): Unsubscribe | null {
    const h = firebaseHandle(); if (!h) return null;
    return subscribe(
      medsCol(h.db, h.userId),
      (snap) => {
        const rows = snap.docs.map((d: any) => d.data() as Medication);
        // Older seed rows may not have `createdAt`, so sort manually.
        rows.sort((a: Medication, b: Medication) => {
          const at = a.createdAt ?? 0;
          const bt = b.createdAt ?? 0;
          if (bt !== at) return bt - at;
          return a.name.localeCompare(b.name);
        });
        onChange(rows);
      },
      "medications",
    );
  },

  async addMedicalVisitLog(entry: Omit<MedicalVisitLogEntry, "id">): Promise<MedicalVisitLogEntry> {
    const id = newId("mv");
    const row: MedicalVisitLogEntry = {
      id,
      createdAt: entry.createdAt,
      summaryTitle: entry.summaryTitle,
      summaryTldr: entry.summaryTldr,
      medsAdded: [...entry.medsAdded],
      labsScheduled: [...entry.labsScheduled],
      transcriptPreview: entry.transcriptPreview,
    };
    const h = firebaseHandle(); if (!h) return row;
    await setDoc(doc(medLogCol(h.db, h.userId), id), clean(row));
    return row;
  },
  subscribeMedicalVisitLog(onChange: (rows: MedicalVisitLogEntry[]) => void): Unsubscribe | null {
    const h = firebaseHandle(); if (!h) return null;
    return subscribe(
      query(medLogCol(h.db, h.userId), orderBy("createdAt", "desc"), limit(40)),
      (snap) => onChange(snap.docs.map((d: any) => d.data() as MedicalVisitLogEntry)),
      "medicalVisitLog",
    );
  },
};
