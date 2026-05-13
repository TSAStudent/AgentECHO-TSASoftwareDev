import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

import type { CapturedAction } from "@/context/EchoContext";
import { isHapticsEnabled } from "@/utils/feedbackPrefs";
import { vibrateAlertPattern } from "@/utils/alertFeedback";

const ID_PREFIX = "echo-action-";

const MIN_LEAD_MS = 60_000;

function parseFutureWhen(when: string | null | undefined): Date | null {
  if (when == null || typeof when !== "string") return null;
  const raw = when.trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  if (d.getTime() < Date.now() + MIN_LEAD_MS) return null;
  return d;
}

function shouldScheduleType(a: CapturedAction): boolean {
  if (a.done) return false;
  return (
    a.type === "calendar"
    || a.type === "reminder"
    || a.type === "medication"
    || a.type === "followup"
    || (Boolean(a.when) && (a.type === "note" || a.type === "shopping"))
  );
}

export function configureEchoNotificationHandler() {
  if (Platform.OS === "web") return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    /* ignore */
  }
}

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync("echo-tasks", {
      name: "Task reminders",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 220, 80, 220],
      enableVibrate: true,
    });
  } catch {
    /* ignore */
  }
}

async function cancelEchoTaskSchedules() {
  if (Platform.OS === "web") return;
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      all
        .filter((n) => String(n.identifier).startsWith(ID_PREFIX))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch {
    /* ignore */
  }
}

/**
 * Aligns local notifications with open tasks that have a future ISO `when`.
 * Call whenever `actions` or reminder preference changes.
 */
export async function syncTaskRemindersFromActions(
  actions: ReadonlyArray<CapturedAction>,
  remindersEnabled: boolean,
): Promise<void> {
  if (Platform.OS === "web") return;
  if (!remindersEnabled) {
    await cancelEchoTaskSchedules();
    return;
  }

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== "granted") {
      await cancelEchoTaskSchedules();
      return;
    }

    await ensureAndroidChannel();
    await cancelEchoTaskSchedules();

    for (const a of actions) {
      if (!shouldScheduleType(a)) continue;
      const at = parseFutureWhen(a.when ?? null);
      if (!at) continue;
      const id = `${ID_PREFIX}${a.id}`;
      try {
        await Notifications.scheduleNotificationAsync({
          identifier: id,
          content: {
            title: "ECHO · Task reminder",
            body: a.title,
            data: { actionId: a.id, kind: "task_reminder" },
            sound: true,
            ...(Platform.OS === "android" ? { channelId: "echo-tasks" } : {}),
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
        });
      } catch {
        /* skip malformed trigger */
      }
    }
  } catch {
    /* expo-notifications unavailable */
  }
}

/** Short buzz when a scheduled reminder fires (foreground). */
export function attachTaskReminderForegroundVibration(): () => void {
  if (Platform.OS === "web") return () => {};
  let sub: { remove: () => void } | undefined;
  try {
    sub = Notifications.addNotificationReceivedListener(() => {
      if (isHapticsEnabled()) vibrateAlertPattern("medium");
    });
  } catch {
    return () => {};
  }
  return () => {
    try {
      sub?.remove();
    } catch {
      /* ignore */
    }
  };
}
