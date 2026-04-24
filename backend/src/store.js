import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Tiny file-backed JSON store. Designed for a single-process hackathon/competition
 * deployment — every write persists synchronously to disk so nothing is lost if
 * the process dies. Safe enough for demos, NOT safe for multi-writer production
 * use; swap in lowdb/sqlite when needed without changing the public API.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "echo.json");

const DEFAULTS = () => ({
  profile: {
    userName: "Sarah",
    createdAt: Date.now(),
  },
  preferences: {
    haptics: true,
    flashAlerts: true,
    textSize: "regular",
    autoTranscribe: true,
    allowCloudOffload: true,
    retentionDays: 7,
    isListening: true,
    nightMode: false,
  },
  actions: [
    {
      id: "a1",
      type: "calendar",
      title: "Dentist — Thursday 3:00 PM",
      detail: 'Overheard: "Hey Sarah, don\'t forget your dentist appointment Thursday at 3."',
      when: null,
      sourceQuote: "Hey Sarah, don't forget your dentist appointment Thursday at 3.",
      priority: "medium",
      confidence: 0.92,
      createdAt: Date.now() - 1000 * 60 * 60 * 3,
      done: false,
    },
    {
      id: "a2",
      type: "shopping",
      title: "Milk on the way home",
      detail: "Commitment overheard in the kitchen this morning.",
      when: null,
      sourceQuote: "I'll pick up milk on the way home.",
      priority: "low",
      confidence: 0.78,
      createdAt: Date.now() - 1000 * 60 * 60 * 6,
      done: false,
    },
  ],
  events: [
    {
      id: "e1",
      label: "doorbell",
      display: "Doorbell",
      tier: "medium",
      icon: "bell",
      confidence: 0.94,
      timestamp: Date.now() - 1000 * 60 * 4,
      room: "Front door",
      direction: "N",
    },
    {
      id: "e2",
      label: "microwave_beep",
      display: "Microwave timer",
      tier: "low",
      icon: "microwave",
      confidence: 0.88,
      timestamp: Date.now() - 1000 * 60 * 14,
      room: "Kitchen",
      direction: "E",
    },
    {
      id: "e3",
      label: "name_called",
      display: "Your name called",
      tier: "high",
      icon: "user",
      confidence: 0.81,
      timestamp: Date.now() - 1000 * 60 * 37,
      room: "Living room",
      direction: "W",
    },
  ],
  contacts: [
    { id: "c1", name: "Mom",     phone: "+15550101001", relation: "Family"  },
    { id: "c2", name: "Alex",    phone: "+15550101002", relation: "Partner" },
    { id: "c3", name: "Dr. Lin", phone: "+15550101003", relation: "Doctor"  },
  ],
  medications: [
    {
      id: "m1",
      name: "Lisinopril 10 mg",
      schedule: "Every morning with water",
      nextDose: Date.now() + 1000 * 60 * 60 * 14,
      prescribedBy: "Dr. Lin",
      active: true,
    },
    {
      id: "m2",
      name: "Vitamin D3 2000 IU",
      schedule: "Daily with lunch",
      nextDose: Date.now() + 1000 * 60 * 60 * 18,
      prescribedBy: null,
      active: true,
    },
  ],
  transcripts: [],
  meetings: [],
});

let state = null;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  ensureDir();
  if (!fs.existsSync(DATA_FILE)) {
    state = DEFAULTS();
    persist();
    return;
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    // Shallow-merge defaults so new collections added in code exist on old files.
    const defaults = DEFAULTS();
    state = {
      ...defaults,
      ...parsed,
      profile: { ...defaults.profile, ...(parsed.profile || {}) },
      preferences: { ...defaults.preferences, ...(parsed.preferences || {}) },
    };
  } catch (err) {
    console.warn("[store] failed to parse echo.json, starting fresh:", err.message);
    state = DEFAULTS();
    persist();
  }
}

let persistQueued = false;
function persist() {
  // Debounce tight bursts (e.g. a rapid push of 10 events) into a single write.
  if (persistQueued) return;
  persistQueued = true;
  setImmediate(() => {
    persistQueued = false;
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
    } catch (err) {
      console.error("[store] persist failed:", err.message);
    }
  });
}

export const store = {
  init() {
    if (!state) load();
    return state;
  },

  all() {
    if (!state) load();
    return state;
  },

  // ---------- generic list helpers ----------
  list(collection) {
    return this.all()[collection] || [];
  },

  get(collection, id) {
    return this.list(collection).find((x) => x.id === id) || null;
  },

  insert(collection, item, { prepend = true } = {}) {
    const s = this.all();
    s[collection] = s[collection] || [];
    const withId = item.id ? item : { ...item, id: newId(collection) };
    s[collection] = prepend ? [withId, ...s[collection]] : [...s[collection], withId];
    persist();
    return withId;
  },

  update(collection, id, patch) {
    const s = this.all();
    const arr = s[collection] || [];
    let updated = null;
    s[collection] = arr.map((x) => {
      if (x.id !== id) return x;
      updated = { ...x, ...patch };
      return updated;
    });
    if (updated) persist();
    return updated;
  },

  remove(collection, id) {
    const s = this.all();
    const before = (s[collection] || []).length;
    s[collection] = (s[collection] || []).filter((x) => x.id !== id);
    if (s[collection].length !== before) persist();
    return before !== s[collection].length;
  },

  clear(collection) {
    const s = this.all();
    s[collection] = [];
    persist();
  },

  trim(collection, max) {
    const s = this.all();
    if ((s[collection] || []).length > max) {
      s[collection] = s[collection].slice(0, max);
      persist();
    }
  },

  // ---------- object helpers ----------
  patchObject(key, patch) {
    const s = this.all();
    s[key] = { ...(s[key] || {}), ...patch };
    persist();
    return s[key];
  },

  // ---------- retention ----------
  pruneByRetention(days) {
    if (!days || days <= 0) return 0;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const s = this.all();
    let removed = 0;
    for (const k of ["events", "transcripts", "meetings"]) {
      const before = (s[k] || []).length;
      s[k] = (s[k] || []).filter((x) => (x.timestamp || x.createdAt || Date.now()) >= cutoff);
      removed += before - s[k].length;
    }
    if (removed > 0) persist();
    return removed;
  },

  reset() {
    state = DEFAULTS();
    persist();
    return state;
  },
};

function newId(collection) {
  const prefix = collection[0] || "x";
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

store.init();
