import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import {
  initializeFirestore,
  Firestore,
} from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
};

function nonEmpty(v: string | undefined): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function readConfig(): FirebaseConfig | null {
  const c = {
    apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
    measurementId:     process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
  };
  if (
    !nonEmpty(c.apiKey) ||
    !nonEmpty(c.authDomain) ||
    !nonEmpty(c.projectId) ||
    !nonEmpty(c.storageBucket) ||
    !nonEmpty(c.messagingSenderId) ||
    !nonEmpty(c.appId)
  ) {
    return null;
  }
  return c as FirebaseConfig;
}

export function firebaseConfigured(): boolean {
  return readConfig() !== null;
}

const USER_ID_CACHE_KEY = "echo_firebase_anon_user_id_v1";

let _app: FirebaseApp | null = null;
let _db: Firestore | null = null;
let _userId: string | null = null;
let _enabled = false;
let _initPromise: Promise<InitResult> | null = null;

type InitResult =
  | { enabled: true; db: Firestore; userId: string }
  | { enabled: false; reason?: string };

function makeAnonId(): string {
  const hex = () => Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0");
  return `dev-${Date.now().toString(36)}-${hex()}${hex()}`;
}

async function resolveUserId(): Promise<string> {
  const fromEnv = process.env.EXPO_PUBLIC_FIREBASE_USER_ID;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  try {
    const cached = await AsyncStorage.getItem(USER_ID_CACHE_KEY);
    if (cached) return cached;
  } catch {}
  const fresh = makeAnonId();
  try {
    await AsyncStorage.setItem(USER_ID_CACHE_KEY, fresh);
  } catch {}
  return fresh;
}

export function initFirebase(): Promise<InitResult> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const cfg = readConfig();
    if (!cfg) {
      _enabled = false;
      if (__DEV__) {
        console.log("[firebase] disabled — env vars missing");
      }
      return { enabled: false, reason: "Firebase env vars missing" };
    }
    try {
      _app = getApps().length ? getApp() : initializeApp(cfg);
      _db = initializeFirestore(_app, {
        // RN networking is more reliable with long polling than WebSockets.
        experimentalForceLongPolling: true,
      });
      _userId = await resolveUserId();
      _enabled = true;
      if (__DEV__) {
        console.log(`[firebase] enabled — project=${cfg.projectId} userId=${_userId}`);
      }
      return { enabled: true, db: _db, userId: _userId };
    } catch (err: any) {
      if (__DEV__) {
        console.warn("[firebase] init failed:", err?.message || err);
      }
      _enabled = false;
      return { enabled: false, reason: err?.message || "init failed" };
    }
  })();
  return _initPromise;
}

export function firebaseHandle(): { db: Firestore; userId: string } | null {
  if (_enabled && _db && _userId) return { db: _db, userId: _userId };
  return null;
}

export function isFirebaseEnabled(): boolean {
  return _enabled;
}
