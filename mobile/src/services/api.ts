import Constants from "expo-constants";

const API_URL =
  (process.env.EXPO_PUBLIC_API_URL as string | undefined) ||
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ||
  "http://localhost:4000";

async function jsonRequest<T>(path: string, init?: RequestInit, timeoutMs = 15_000): Promise<T> {
  // Hand-rolled timeout so a dead backend doesn't hang the UI indefinitely —
  // the mobile client gets a rejection within `timeoutMs` instead of spinning.
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`${path} -> ${res.status} ${body.slice(0, 120)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export type SoundEventDTO = {
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

export type CapturedActionDTO = {
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

export type TrustedContactDTO = { id: string; name: string; phone: string; relation?: string | null };
export type MedicationDTO = {
  id: string;
  name: string;
  schedule: string;
  nextDose: number | null;
  prescribedBy?: string | null;
  active: boolean;
  lastTakenAt?: number;
  createdAt?: number;
};

export type PreferencesDTO = {
  haptics: boolean;
  flashAlerts: boolean;
  textSize: "regular" | "large" | "xl";
  autoTranscribe: boolean;
  allowCloudOffload: boolean;
  retentionDays: number;
  isListening: boolean;
  nightMode: boolean;
};

export type ProfileDTO = { userName: string; createdAt?: number };

export type StateSnapshot = {
  profile: ProfileDTO;
  preferences: PreferencesDTO;
  actions: CapturedActionDTO[];
  events: SoundEventDTO[];
  contacts: TrustedContactDTO[];
  medications: MedicationDTO[];
  transcripts: Array<{ id: string; title: string; kind: string; preview: string; language: string; duration: number; createdAt: number }>;
  meetings: Array<{ id: string; title: string; kind: string; summary: any; vibe: any; createdAt: number }>;
  stats: { totalActions: number; pendingActions: number; totalEvents: number; emergencyEvents: number };
  serverTime: number;
};

export const api = {
  url: API_URL,

  // ---------- health / hydration ----------
  health: () => jsonRequest<any>("/api/health"),
  state:  () => jsonRequest<StateSnapshot>("/api/state"),
  reset:  () => jsonRequest<{ ok: boolean }>("/api/state/reset", { method: "POST" }),

  // ---------- actions ----------
  listActions:   () => jsonRequest<{ actions: CapturedActionDTO[] }>("/api/actions"),
  addAction:     (a: Partial<CapturedActionDTO>) =>
    jsonRequest<{ action: CapturedActionDTO }>("/api/actions", { method: "POST", body: JSON.stringify(a) }),
  patchAction:   (id: string, patch: Partial<CapturedActionDTO>) =>
    jsonRequest<{ action: CapturedActionDTO }>(`/api/actions/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteAction:  (id: string) => jsonRequest<{ ok: boolean }>(`/api/actions/${id}`, { method: "DELETE" }),

  // ---------- events ----------
  listEvents:     () => jsonRequest<{ events: SoundEventDTO[] }>("/api/events"),
  addEvent:       (e: Partial<SoundEventDTO>) =>
    jsonRequest<{ event: SoundEventDTO }>("/api/events", { method: "POST", body: JSON.stringify(e) }),
  ackEvent:       (id: string) => jsonRequest<{ event: SoundEventDTO }>(`/api/events/${id}`, { method: "PATCH", body: JSON.stringify({ acknowledged: true }) }),
  clearEvents:    () => jsonRequest<{ ok: boolean }>("/api/events", { method: "DELETE" }),

  // ---------- contacts ----------
  listContacts:   () => jsonRequest<{ contacts: TrustedContactDTO[] }>("/api/contacts"),
  addContact:     (c: { name: string; phone: string; relation?: string | null }) =>
    jsonRequest<{ contact: TrustedContactDTO }>("/api/contacts", { method: "POST", body: JSON.stringify(c) }),
  deleteContact:  (id: string) => jsonRequest<{ ok: boolean }>(`/api/contacts/${id}`, { method: "DELETE" }),

  // ---------- medications ----------
  listMedications: () => jsonRequest<{ medications: MedicationDTO[] }>("/api/medications"),
  addMedication:   (m: Partial<MedicationDTO>) =>
    jsonRequest<{ medication: MedicationDTO }>("/api/medications", { method: "POST", body: JSON.stringify(m) }),
  takeMedication:  (id: string) =>
    jsonRequest<{ medication: MedicationDTO }>(`/api/medications/${id}/taken`, { method: "POST" }),
  deleteMedication:(id: string) => jsonRequest<{ ok: boolean }>(`/api/medications/${id}`, { method: "DELETE" }),

  // ---------- preferences + profile ----------
  patchPreferences: (p: Partial<PreferencesDTO>) =>
    jsonRequest<{ preferences: PreferencesDTO }>("/api/preferences", { method: "PATCH", body: JSON.stringify(p) }),
  patchProfile: (p: Partial<ProfileDTO>) =>
    jsonRequest<{ profile: ProfileDTO }>("/api/profile", { method: "PATCH", body: JSON.stringify(p) }),

  // ---------- AI endpoints ----------
  extractActions: (args: { transcript: string; userName?: string; context?: string; persist?: boolean }) =>
    jsonRequest<{ actions: any[]; persisted: CapturedActionDTO[] }>("/api/extract-actions", {
      method: "POST",
      body: JSON.stringify(args),
    }),
  summarize: (args: { transcript: string; kind: "lecture" | "meeting"; save?: boolean; transcriptId?: string | null }) =>
    jsonRequest<any>("/api/summarize", { method: "POST", body: JSON.stringify(args) }),
  vibe:  (transcript: string, meetingId?: string) =>
    jsonRequest<any>("/api/vibe-report", { method: "POST", body: JSON.stringify({ transcript, meetingId }) }),
  recognizeSign: (imageBase64: string, priorSigns: string[]) =>
    jsonRequest<any>("/api/asl-recognize", { method: "POST", body: JSON.stringify({ imageBase64, priorSigns }) }),
  tts: (text: string, voice?: string) =>
    jsonRequest<{ audioBase64: string; mime: string }>("/api/tts", { method: "POST", body: JSON.stringify({ text, voice }) }),
  emergency: (body: any) =>
    jsonRequest<any>("/api/emergency", { method: "POST", body: JSON.stringify(body) }),
  chat: (message: string, history: Array<{ role: "user" | "assistant"; content: string }> = []) =>
    jsonRequest<{ reply: string; demo?: boolean }>("/api/chat", { method: "POST", body: JSON.stringify({ message, history }) }),
  brief: (kind: "morning" | "evening" = "morning") =>
    jsonRequest<any>(`/api/brief?kind=${kind}`),

  // ---------- maps ----------
  directions: (origin: any, destination: any, mode: "walking" | "driving" | "transit" | "bicycling" = "walking") =>
    jsonRequest<any>("/api/maps/directions", { method: "POST", body: JSON.stringify({ origin, destination, mode }) }),
  reverseGeocode: (lat: number, lng: number) =>
    jsonRequest<{ address: string | null }>("/api/maps/reverse-geocode", { method: "POST", body: JSON.stringify({ lat, lng }) }),

  // ---------- multipart (whisper, sound) ----------
  transcribe: async (
    audioUri: string,
    opts: { kind?: string; title?: string; ext?: string; mime?: string } = {}
  ) => {
    const form = await buildAudioForm(audioUri, opts.ext, opts.mime, "audio");
    if (opts.kind)  form.append("kind", opts.kind);
    if (opts.title) form.append("title", opts.title);
    const res = await fetch(`${API_URL}/api/transcribe`, { method: "POST", body: form });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`transcribe -> ${res.status} ${body.slice(0, 200)}`);
    }
    return res.json();
  },

  classifySoundFromUri: async (
    audioUri: string,
    opts: { room?: string; direction?: string; ext?: string; mime?: string; skipLow?: boolean; userName?: string; persist?: boolean } = {}
  ) => {
    const form = await buildAudioForm(audioUri, opts.ext, opts.mime, "snippet");
    if (opts.room)      form.append("room", opts.room);
    if (opts.direction) form.append("direction", opts.direction);
    if (opts.userName)  form.append("userName", opts.userName);
    if (opts.skipLow)   form.append("skipLow", "true");
    if (opts.persist === false) form.append("persist", "false");
    const res = await fetch(`${API_URL}/api/classify-sound`, { method: "POST", body: form });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`classify -> ${res.status} ${body.slice(0, 200)}`);
    }
    return res.json();
  },
};

/**
 * Build a multipart form that works on native (RN FormData accepts
 * `{ uri, name, type }`) and on the web (where we must fetch the blob URL
 * and append a real Blob).
 */
async function buildAudioForm(
  uri: string,
  ext: string = "m4a",
  mime: string = "audio/mp4",
  basename: string = "audio"
): Promise<FormData> {
  const form = new FormData();
  const name = `${basename}.${ext}`;

  // Web: uri is either a blob: URL from MediaRecorder or a data: URL.
  if (uri.startsWith("blob:") || uri.startsWith("data:") || uri.startsWith("http")) {
    try {
      const resp = await fetch(uri);
      const blob = await resp.blob();
      const file = typeof File !== "undefined" ? new File([blob], name, { type: mime }) : blob;
      form.append("audio", file as any, name);
      return form;
    } catch {
      // Fall through to the native style append as a last resort.
    }
  }

  // @ts-ignore – RN FormData accepts { uri, name, type }
  form.append("audio", { uri, name, type: mime });
  return form;
}
