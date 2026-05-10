import React, { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { GlassCard } from "@/components/GlassCard";
import { theme } from "@/theme";
import type { ListeningSessionDTO } from "@/services/api";
import { haptic } from "@/utils/format";
import { toDateKeyFromMs } from "@/utils/actionCalendarDate";
import { formatClock, formatSessionHoursLine } from "@/utils/listenSessionFormat";

function toDateKey(d: Date): string {
  return toDateKeyFromMs(d.getTime());
}

function startOfWeekSunday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

function defaultFocusedKeyForWeek(weekStart: Date): string {
  const todayKey = toDateKey(new Date());
  for (let i = 0; i < 7; i++) {
    const k = toDateKey(addDays(weekStart, i));
    if (k === todayKey) return todayKey;
  }
  return toDateKey(weekStart);
}

const weekdayShort = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

type Props = {
  sessions: ListeningSessionDTO[];
  onOpenSession: (log: ListeningSessionDTO) => void;
};

export function ListenSessionLogCalendar({ sessions, onOpenSession }: Props) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [focusedDayKey, setFocusedDayKey] = useState(() => toDateKey(new Date()));

  const byDay = useMemo(() => {
    const map = new Map<string, ListeningSessionDTO[]>();
    for (const s of sessions) {
      const key = toDateKeyFromMs(s.startedAt);
      const cur = map.get(key) || [];
      cur.push(s);
      map.set(key, cur);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => b.startedAt - a.startedAt);
    }
    return map;
  }, [sessions]);

  const weekStart = useMemo(() => {
    const base = startOfWeekSunday(new Date());
    return addDays(base, weekOffset * 7);
  }, [weekOffset]);

  const weekDays = useMemo(() => {
    const days: {
      key: string;
      date: Date;
      label: string;
      num: number;
      count: number;
      isToday: boolean;
    }[] = [];
    const todayKey = toDateKey(new Date());
    for (let i = 0; i < 7; i++) {
      const date = addDays(weekStart, i);
      const key = toDateKey(date);
      const list = byDay.get(key) || [];
      days.push({
        key,
        date,
        label: weekdayShort[date.getDay()],
        num: date.getDate(),
        count: list.length,
        isToday: key === todayKey,
      });
    }
    return days;
  }, [weekStart, byDay]);

  useEffect(() => {
    const base = startOfWeekSunday(new Date());
    const ws = addDays(base, weekOffset * 7);
    setFocusedDayKey(defaultFocusedKeyForWeek(ws));
  }, [weekOffset]);

  const daySessions = byDay.get(focusedDayKey) || [];
  const previewDate = new Date(`${focusedDayKey}T12:00:00`);

  const webMouseLeave =
    Platform.OS === "web"
      ? ({
          onMouseLeave: () => setFocusedDayKey(defaultFocusedKeyForWeek(weekStart)),
        } as object)
      : {};

  const onPickDay = (key: string) => {
    haptic.light();
    setFocusedDayKey(key);
  };

  const onHoverDay = (key: string) => {
    if (Platform.OS !== "web") return;
    setFocusedDayKey(key);
  };

  return (
    <View style={styles.wrap} {...webMouseLeave}>
      <View style={styles.weekNav}>
        <Pressable
          hitSlop={8}
          style={styles.chevron}
          onPress={() => {
            haptic.light();
            setWeekOffset((w) => w - 1);
          }}
        >
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </Pressable>
        <Text style={styles.weekTitle}>
          {weekStart.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </Text>
        <Pressable
          hitSlop={8}
          style={styles.chevron}
          onPress={() => {
            haptic.light();
            setWeekOffset((w) => w + 1);
          }}
        >
          <Ionicons name="chevron-forward" size={20} color={theme.colors.text} />
        </Pressable>
      </View>

      <View style={styles.row}>
        {weekDays.map((d) => {
          const active = focusedDayKey === d.key;
          return (
            <Pressable
              key={d.key}
              style={[
                styles.dayCell,
                d.isToday && styles.dayToday,
                active && styles.dayActive,
              ]}
              onPress={() => onPickDay(d.key)}
              {...(Platform.OS === "web" ? { onHoverIn: () => onHoverDay(d.key) } : {})}
            >
              <Text style={[styles.dayLbl, active && styles.dayLblActive]}>{d.label}</Text>
              <Text style={[styles.dayNum, active && styles.dayNumActive]}>{d.num}</Text>
              {d.count > 0 ? <View style={styles.dot} /> : <View style={styles.dotPlaceholder} />}
            </Pressable>
          );
        })}
      </View>

      <GlassCard intensity="low" style={styles.previewCard}>
        <Text style={styles.previewTitle}>
          {previewDate.toLocaleDateString(undefined, {
            weekday: "long",
            month: "short",
            day: "numeric",
          })}
        </Text>
        <Text style={styles.previewMeta}>
          {daySessions.length === 0
            ? "No listening sessions started on this day."
            : `${daySessions.length} session${daySessions.length === 1 ? "" : "s"} · tap for details`}
        </Text>

        {sessions.length === 0 ? (
          <Text style={styles.previewHint}>
            Each time you go LIVE and then pause, ECHO saves one log with duration, chunks, and tasks added.
          </Text>
        ) : daySessions.length === 0 ? (
          <Text style={styles.previewHint}>
            Try another day in this week, or swipe the week arrows to browse other weeks.
          </Text>
        ) : (
          daySessions.map((log, index) => (
            <Pressable
              key={log.id}
              onPress={() => {
                haptic.light();
                onOpenSession(log);
              }}
              style={{ marginTop: index === 0 ? 12 : 0 }}
            >
              <View style={[styles.sessionRow, index > 0 && styles.sessionRowSep]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ ...theme.type.label, color: theme.colors.textMute }}>SESSION</Text>
                  <Text style={{ ...theme.type.title, color: theme.colors.text, marginTop: 4 }}>
                    Listening started at {formatClock(log.startedAt)}
                  </Text>
                  <Text style={{ ...theme.type.bodySm, color: theme.colors.textDim, marginTop: 4 }}>
                    {log.endedAt
                      ? `Stopped at ${formatClock(log.endedAt)} · ${formatSessionHoursLine(log)}`
                      : "Open — pause LIVE to save this log"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.colors.textMute} />
              </View>
            </Pressable>
          ))
        )}
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  weekNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  chevron: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
  },
  weekTitle: { ...theme.type.h3, color: theme.colors.text },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 4 },
  dayCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  dayToday: { borderColor: `${theme.colors.cyan}55` },
  dayActive: {
    backgroundColor: `${theme.colors.primary}28`,
    borderColor: `${theme.colors.primary}66`,
  },
  dayLbl: { ...theme.type.label, color: theme.colors.textMute, fontSize: 10 },
  dayLblActive: { color: theme.colors.text },
  dayNum: { ...theme.type.h3, color: theme.colors.text, marginTop: 2 },
  dayNumActive: { color: theme.colors.primary },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.accent,
    marginTop: 6,
  },
  dotPlaceholder: { height: 6, marginTop: 6 },
  previewCard: { marginTop: 4 },
  previewTitle: { ...theme.type.h3, color: theme.colors.text, marginBottom: 4 },
  previewMeta: { ...theme.type.bodySm, color: theme.colors.textDim },
  previewHint: { ...theme.type.bodySm, color: theme.colors.textMute, marginTop: 10, lineHeight: 18 },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 8,
  },
  sessionRowSep: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.outlineSoft,
    marginTop: 4,
    paddingTop: 12,
  },
});
