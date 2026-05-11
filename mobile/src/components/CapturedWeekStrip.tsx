import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { CapturedAction } from "@/context/EchoContext";
import { theme } from "@/theme";

export function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function addDays(ts: number, n: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return startOfLocalDay(d);
}

/** Calendar day that owns an action: explicit `when` date, else createdAt. */
export function actionDayStart(a: CapturedAction): number {
  if (a.when) {
    const t = Date.parse(a.when);
    if (!Number.isNaN(t)) return startOfLocalDay(new Date(t));
  }
  return startOfLocalDay(new Date(a.createdAt));
}

export function countActionsOnDay(actions: CapturedAction[], dayStart: number, pendingOnly: boolean): number {
  return actions.filter((a) => {
    if (pendingOnly && a.done) return false;
    return actionDayStart(a) === dayStart;
  }).length;
}

type Props = {
  actions: CapturedAction[];
  weekDays: number[];
  selectedDay: number;
  hoverDay: number | null;
  onSelectDay: (dayStart: number) => void;
  onHoverDay: (dayStart: number | null) => void;
};

export const CapturedWeekStrip: React.FC<Props> = ({
  actions,
  weekDays,
  selectedDay,
  hoverDay,
  onSelectDay,
  onHoverDay,
}) => {
  const today = startOfLocalDay(new Date());
  const displayDay = hoverDay ?? selectedDay;

  const counts = useMemo(() => {
    const m = new Map<number, number>();
    weekDays.forEach((d) => m.set(d, countActionsOnDay(actions, d, true)));
    return m;
  }, [actions, weekDays]);

  const labelFor = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString([], { weekday: "short" });
  };
  const numFor = (ts: number) => new Date(ts).getDate();

  return (
    <View style={styles.wrap}>
      <View style={styles.strip}>
        {weekDays.map((dayStart) => {
          const isToday = dayStart === today;
          const isSel = dayStart === selectedDay;
          const isHover = hoverDay === dayStart;
          const n = counts.get(dayStart) || 0;
          return (
            <Pressable
              key={dayStart}
              onPress={() => onSelectDay(dayStart)}
              onHoverIn={() => onHoverDay(dayStart)}
              onHoverOut={() => onHoverDay(null)}
              style={[
                styles.dayCell,
                isSel && styles.dayCellSelected,
                isHover && !isSel && styles.dayCellHover,
                isToday && styles.dayCellToday,
              ]}
            >
              <Text style={[styles.dayLbl, (isSel || isHover) && styles.dayLblOn]} numberOfLines={1}>
                {labelFor(dayStart)}
              </Text>
              <Text style={[styles.dayNum, (isSel || isHover) && styles.dayNumOn]}>{numFor(dayStart)}</Text>
              {n > 0 ? (
                <View style={styles.dotRow}>
                  <View style={[styles.dot, { backgroundColor: theme.colors.accent }]} />
                  <Text style={styles.dotTxt}>{n}</Text>
                </View>
              ) : (
                <View style={{ height: 14 }} />
              )}
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.caption, { paddingHorizontal: 18 }]}>
        {displayDay === today ? "Today" : new Date(displayDay).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}
        {" · "}
        {countActionsOnDay(actions, displayDay, true)} open
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { width: "100%", alignSelf: "stretch" },
  strip: {
    flexDirection: "row",
    width: "100%",
    gap: 4,
    paddingVertical: 4,
  },
  dayCell: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderRadius: theme.radius.md,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: theme.colors.outlineSoft,
    alignItems: "center",
  },
  dayCellToday: { borderColor: theme.colors.cyan + "66" },
  dayCellSelected: { backgroundColor: theme.colors.accent + "28", borderColor: theme.colors.accent },
  dayCellHover: { backgroundColor: "rgba(255,255,255,0.08)", borderColor: theme.colors.textDim },
  dayLbl: { ...theme.type.label, fontSize: 9, color: theme.colors.textMute },
  dayLblOn: { color: theme.colors.text },
  dayNum: { ...theme.type.title, color: theme.colors.text, marginTop: 2 },
  dayNumOn: { color: theme.colors.text },
  dotRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  dotTxt: { ...theme.type.label, fontSize: 9, color: theme.colors.textDim },
  caption: { ...theme.type.bodySm, color: theme.colors.textDim, marginTop: 8 },
});

export function weekContaining(dayStart: number): number[] {
  const base = new Date(dayStart);
  const dow = base.getDay();
  const start = addDays(dayStart, -dow);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
