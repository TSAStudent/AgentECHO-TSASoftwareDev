import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { Audio } from "expo-av";

/**
 * Unified audio-recorder hook that works on iOS, Android, and Web.
 *
 * On native platforms we use expo-av's Audio.Recording with HIGH_QUALITY
 * presets (MP4/AAC m4a). On the web we use the browser's MediaRecorder API
 * directly because expo-av's web shim is flaky and produces files that
 * Whisper doesn't always accept.
 *
 * The hook exposes:
 *   - status:         "idle" | "preparing" | "recording" | "stopping" | "error"
 *   - durationMs:     how long the current recording has been going
 *   - levels:         rolling meter values 0..1 (best-effort — zero on web)
 *   - error:          last error message if any
 *   - start():        begin a new recording
 *   - stop():         stop and return { uri, mime, duration, ext }
 *   - cancel():       abandon the recording without returning anything
 */

type Status = "idle" | "preparing" | "recording" | "stopping" | "error";

export type RecordingResult = {
  uri: string;
  mime: string;
  ext: string;
  duration: number;
};

export function useAudioRecorder() {
  const [status, setStatus] = useState<Status>("idle");
  const [durationMs, setDurationMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const webRecorderRef = useRef<MediaRecorder | null>(null);
  const webChunksRef = useRef<Blob[]>([]);
  const webStreamRef = useRef<MediaStream | null>(null);
  const webMimeRef = useRef<string>("audio/webm");
  const startedAtRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---------- cleanup ----------
  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    // Best-effort teardown so a dev-reload leaves the mic free.
    (async () => {
      try { await recordingRef.current?.stopAndUnloadAsync(); } catch {}
      try { webRecorderRef.current?.stop(); } catch {}
      try { webStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    })();
  }, []);

  const startTicker = useCallback(() => {
    startedAtRef.current = Date.now();
    setDurationMs(0);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setDurationMs(Date.now() - startedAtRef.current);
    }, 120);
  }, []);

  const stopTicker = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  const start = useCallback(async () => {
    try {
      setError(null);
      setStatus("preparing");

      if (Platform.OS === "web") {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        webStreamRef.current = stream;
        // Prefer webm/opus — supported by Whisper and every modern browser.
        const mime = pickWebMime();
        webMimeRef.current = mime;
        const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        webChunksRef.current = [];
        rec.ondataavailable = (e) => { if (e.data.size > 0) webChunksRef.current.push(e.data); };
        rec.onerror = (e) => {
          // @ts-ignore
          setError(e?.error?.message || "MediaRecorder error");
          setStatus("error");
        };
        webRecorderRef.current = rec;
        rec.start(250);
        startTicker();
        setStatus("recording");
        return;
      }

      // ---- native (iOS / Android) ----
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        setError("Microphone permission denied");
        setStatus("error");
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        interruptionModeIOS: 1,
        interruptionModeAndroid: 1,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      } as any);
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      rec.setOnRecordingStatusUpdate((s) => {
        if (typeof s.metering === "number") {
          // Expo reports metering in dBFS (-160..0). Normalize to 0..1.
          const norm = Math.max(0, Math.min(1, (s.metering + 60) / 60));
          setLevel(norm);
        }
      });
      rec.setProgressUpdateInterval(80);
      await rec.startAsync();
      recordingRef.current = rec;
      startTicker();
      setStatus("recording");
    } catch (e: any) {
      setError(e?.message || "Could not start recorder");
      setStatus("error");
    }
  }, [startTicker]);

  const stop = useCallback(async (): Promise<RecordingResult | null> => {
    setStatus("stopping");
    stopTicker();

    try {
      if (Platform.OS === "web") {
        const rec = webRecorderRef.current;
        if (!rec) throw new Error("No recording in progress");
        const done: Promise<Blob> = new Promise((resolve) => {
          rec.onstop = () => resolve(new Blob(webChunksRef.current, { type: webMimeRef.current }));
        });
        rec.stop();
        const blob = await done;
        webStreamRef.current?.getTracks().forEach((t) => t.stop());
        webStreamRef.current = null;
        webRecorderRef.current = null;
        const uri = URL.createObjectURL(blob);
        const mime = blob.type || webMimeRef.current;
        const ext = extFromMime(mime);
        const duration = Date.now() - startedAtRef.current;
        setStatus("idle");
        setLevel(0);
        return { uri, mime, ext, duration };
      }

      const rec = recordingRef.current;
      if (!rec) throw new Error("No recording in progress");
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI() || "";
      recordingRef.current = null;
      const duration = Date.now() - startedAtRef.current;
      setStatus("idle");
      setLevel(0);
      // Native always produces m4a with the HIGH_QUALITY preset.
      return { uri, mime: "audio/mp4", ext: "m4a", duration };
    } catch (e: any) {
      setError(e?.message || "Could not stop recorder");
      setStatus("error");
      return null;
    }
  }, [stopTicker]);

  const cancel = useCallback(async () => {
    stopTicker();
    try {
      if (Platform.OS === "web") {
        webRecorderRef.current?.stop();
        webStreamRef.current?.getTracks().forEach((t) => t.stop());
      } else {
        await recordingRef.current?.stopAndUnloadAsync();
      }
    } catch {}
    webRecorderRef.current = null;
    webStreamRef.current = null;
    recordingRef.current = null;
    setStatus("idle");
    setLevel(0);
  }, [stopTicker]);

  return { status, durationMs, level, error, start, stop, cancel };
}

function pickWebMime(): string | undefined {
  if (typeof window === "undefined" || !(window as any).MediaRecorder) return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const c of candidates) {
    // @ts-ignore
    if (MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return undefined;
}

function extFromMime(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4"))  return "m4a";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("wav"))  return "wav";
  return "webm";
}
