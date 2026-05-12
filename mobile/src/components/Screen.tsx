import React from "react";
import { ScrollView, StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GradientBackground } from "./GradientBackground";
import { theme } from "@/theme";

/** Horizontal padding for scroll screens — shared with screens that full-bleed sections. */
export const SCREEN_SCROLL_H_PAD = 22;

type Props = {
  scroll?: boolean;
  children: React.ReactNode;
  contentStyle?: ViewStyle;
  bare?: boolean;
};

export const Screen: React.FC<Props> = ({ scroll = true, children, contentStyle, bare }) => {
  const inner = scroll ? (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.scroll, contentStyle]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.scroll, { flex: 1 }, contentStyle]}>{children}</View>
  );

  return (
    <View style={styles.root}>
      <GradientBackground />
      {bare ? (
        inner
      ) : (
        <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
          {inner}
        </SafeAreaView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  scroll: {
    paddingHorizontal: SCREEN_SCROLL_H_PAD,
    paddingTop: 6,
    paddingBottom: 128,
  },
});
