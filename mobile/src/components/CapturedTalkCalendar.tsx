import React, { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { GlassCard } from "@/components/GlassCard";
import { ActionCard } from "@/components/ActionCard";
import { theme } from "@/theme";
import type { CapturedAction } from "@/context/EchoContext";
import { haptic } from "@/utils/format";
import {
  calendarDayKeyForAction,
  isCalendarListedAction,
  toDateKeyFromMs,
} from "@/utils/actionCalendarDate";

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

/** Prefer today when it falls in this week; otherwise the first day (Sunday). */
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
  actions: CapturedAction[];
  onToggleDone: (id: string) => void;
};

export function CapturedTalkCalendar({ actions, onToggleDone }: Props) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [focusedDayKey, setFocusedDayKey] = useState(() => toDateKey(new Date()));

  const calendarList = useMemo(
    () => actions.filter((a) => isCalendarListedAction(a)),
    [actions],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, CapturedAction[]>();
    for (const a of calendarList) {
      const key = calendarDayKeyForAction(a);
      const cur = map.get(key) || [];
      cur.push(a);
      map.set(key, cur);
    }
    for (const arr of map.values()) {
      arr.sort((x, y) => {
        const wx = Date.parse(x.when || "") || x.createdAt;
        const wy = Date.parse(y.when || "") || y.createdAt;
        if (wy !== wx) return wy - wx;
        return y.createdAt - x.createdAt;
      });
    }
    return map;
  }, [calendarList]);

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
      hasTasks: boolean;
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
        hasTasks: list.length > 0,
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

  const previewList = byDay.get(focusedDayKey) || [];
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
              {...(Platform.OS === "web"
                ? { onHoverIn: () => onHoverDay(d.key) }
                : {})}
            >
              <Text style={[styles.dayLbl, active && styles.dayLblActive]}>{d.label}</Text>
              <Text style={[styles.dayNum, active && styles.dayNumActive]}>{d.num}</Text>
              {d.hasTasks ? <View style={styles.dot} /> : <View style={styles.dotPlaceholder} />}
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
        {previewList.length === 0 ? (
          <>
            <Text style={styles.previewEmpty}>No tasks on this day.</Text>
            {calendarList.length === 0 ? (
              <Text style={styles.previewHint}>
                Use Talk (Extract actions) or Listen (ambient, when your name and a task are heard) — dated items land on the day they are due.
              </Text>
            ) : null}
          </>
        ) : (
          previewList.map((a) => (
            <ActionCard key={a.id} action={a} onToggle={() => onToggleDone(a.id)} />
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
  previewHint: { ...theme.type.bodySm, color: theme.colors.textDim, marginTop: 10, lineHeight: 18 },
  previewTitle: { ...theme.type.h3, color: theme.colors.text, marginBottom: 10 },
  previewEmpty: { ...theme.type.body, color: theme.colors.textMute },
});
