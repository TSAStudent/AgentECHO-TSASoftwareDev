import { loadListenLogs, saveListenLogs, type ListenSessionLog } from "@/utils/listenLogsStorage";
import { setAmbientSessionLogId, getAmbientSessionLogId } from "@/utils/ambientSessionLogBridge";

const subscribers = new Set<() => void>();

export function subscribeAmbientListenLogs(notify: () => void): () => void {
  subscribers.add(notify);
  return () => { subscribers.delete(notify); };
}

function emitListenLogsChanged() {
  subscribers.forEach((fn) => {
    try { fn(); } catch { /* ignore */ }
  });
}

/** Call whenever global ambient listening toggles (Home pause/resume or Listen LIVE). */
export async function onAmbientListeningEdge(prev: boolean, next: boolean): Promise<void> {
  if (prev === next) return;

  if (next) {
    const existing = getAmbientSessionLogId();
    if (existing) return;

    const id = `log_${Date.now()}`;
    setAmbientSessionLogId(id);
    const row: ListenSessionLog = {
      id,
      startedAt: Date.now(),
      endedAt: null,
      chunkCount: 0,
      tasksAdded: 0,
      lastSnippet: "",
      error: null,
    };
    const logs = await loadListenLogs();
    await saveListenLogs([row, ...logs]);
    emitListenLogsChanged();
    return;
  }

  const id = getAmbientSessionLogId();
  setAmbientSessionLogId(null);
  if (!id) return;
  const logs = await loadListenLogs();
  const patched = logs.map((l) =>
    l.id === id && l.endedAt === null ? { ...l, endedAt: Date.now() } : l,
  );
  await saveListenLogs(patched);
  emitListenLogsChanged();
}

export async function patchActiveAmbientSession(patch: Partial<ListenSessionLog>): Promise<void> {
  const id = getAmbientSessionLogId();
  if (!id) return;
  const logs = await loadListenLogs();
  const next = logs.map((l) => (l.id === id ? { ...l, ...patch } : l));
  await saveListenLogs(next);
  emitListenLogsChanged();
}

export async function bumpActiveSessionChunkCount(): Promise<void> {
  const id = getAmbientSessionLogId();
  if (!id) return;
  const logs = await loadListenLogs();
  const next = logs.map((l) =>
    l.id === id ? { ...l, chunkCount: l.chunkCount + 1 } : l,
  );
  await saveListenLogs(next);
  emitListenLogsChanged();
}

export async function bumpActiveSessionTasksAdded(by: number, lastSnippet: string): Promise<void> {
  const id = getAmbientSessionLogId();
  if (!id || by <= 0) return;
  const logs = await loadListenLogs();
  const next = logs.map((l) =>
    l.id === id
      ? { ...l, tasksAdded: l.tasksAdded + by, lastSnippet: lastSnippet.slice(0, 280) }
      : l,
  );
  await saveListenLogs(next);
  emitListenLogsChanged();
}
