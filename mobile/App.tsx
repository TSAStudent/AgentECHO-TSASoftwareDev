import "react-native-gesture-handler";
import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SystemUI from "expo-system-ui";
import { SafeAreaProvider } from "react-native-safe-area-context";

import RootNavigator from "@/navigation/RootNavigator";
import { EchoProvider } from "@/context/EchoContext";
import { theme } from "@/theme";

export default function App() {
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.colors.bg).catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <SafeAreaProvider>
        <EchoProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </EchoProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
