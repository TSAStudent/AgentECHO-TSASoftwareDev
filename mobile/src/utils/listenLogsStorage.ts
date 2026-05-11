import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "echo_listen_session_logs_v1";

export type ListenSessionLog = {
  id: string;
  startedAt: number;
  endedAt: number | null;
  chunkCount: number;
  tasksAdded: number;
  lastSnippet: string;
  error: string | null;
};

export async function loadListenLogs(): Promise<ListenSessionLog[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveListenLogs(logs: ListenSessionLog[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(logs.slice(0, 200)));
  } catch { /* ignore */ }
}
