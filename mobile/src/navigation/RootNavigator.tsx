import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";

import HomeScreen from "@/screens/HomeScreen";
import AmbientScreen from "@/screens/AmbientScreen";
import ConversationScreen from "@/screens/ConversationScreen";
import AslScreen from "@/screens/AslScreen";
import EmergencyScreen from "@/screens/EmergencyScreen";
import ClassroomScreen from "@/screens/ClassroomScreen";
import MedicalScreen from "@/screens/MedicalScreen";
import SettingsScreen from "@/screens/SettingsScreen";
import OnboardingScreen from "@/screens/OnboardingScreen";
import { AmbientAlertOverlay } from "@/components/AmbientAlertOverlay";
import { rootNavigationRef } from "@/navigation/rootNavigationRef";
import { theme } from "@/theme";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: theme.colors.bg,
    card: "transparent",
    primary: theme.colors.primary,
    text: theme.colors.text,
    border: "transparent",
    notification: theme.colors.accent,
  },
};

const TabBarBg = () => (
  <View style={StyleSheet.absoluteFill}>
    <BlurView
      intensity={Platform.OS === "ios" ? 28 : 72}
      tint="dark"
      style={StyleSheet.absoluteFill}
    />
    <View
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: "rgba(28,32,58,0.78)",
          borderTopWidth: theme.stroke.control,
          borderTopColor: theme.colors.controlStrokeMuted,
        },
      ]}
    />
  </View>
);

function Tabs() {
  return (
    <Tab.Navigator
      // Listen must stay mounted so the ambient mic loop runs when toggled from Home.
      screenOptions={({ route }) => ({
        lazy: false,
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: theme.colors.text,
        tabBarInactiveTintColor: theme.colors.textMute,
        tabBarLabelStyle: { fontSize: 13, fontWeight: "600", letterSpacing: 0.12, marginBottom: 4 },
        tabBarStyle: {
          position: "absolute",
          borderTopWidth: 0,
          height: 92,
          paddingTop: 8,
          paddingBottom: 6,
          backgroundColor: "transparent",
          elevation: 0,
        },
        tabBarBackground: () => <TabBarBg />,
        tabBarIcon: ({ color, focused }) => {
          const size = 27;
          const iconColor = focused ? theme.colors.accent : color;
          switch (route.name) {
            case "Home":
              return <Ionicons name={focused ? "pulse" : "pulse-outline"} size={size} color={iconColor} />;
            case "Listen":
              return <Ionicons name={focused ? "radio" : "radio-outline"} size={size} color={iconColor} />;
            case "Talk":
              return <Ionicons name={focused ? "chatbubbles" : "chatbubbles-outline"} size={size} color={iconColor} />;
            case "ASL":
              return <MaterialCommunityIcons name="hand-wave-outline" size={size} color={iconColor} />;
            case "SOS":
              return <Ionicons name={focused ? "shield" : "shield-outline"} size={size} color={iconColor} />;
            default:
              return <Ionicons name="ellipse" size={size} color={iconColor} />;
          }
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Listen" component={AmbientScreen} />
      <Tab.Screen name="Talk" component={ConversationScreen} />
      <Tab.Screen name="ASL" component={AslScreen} />
      <Tab.Screen name="SOS" component={EmergencyScreen} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  return (
    <View style={{ flex: 1 }}>
      <NavigationContainer ref={rootNavigationRef} theme={navTheme} style={{ flex: 1 }}>
        <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg } }}>
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
          <Stack.Screen name="Main" component={Tabs} />
          <Stack.Screen name="Classroom" component={ClassroomScreen} options={{ presentation: "card" }} />
          <Stack.Screen name="Medical" component={MedicalScreen} options={{ presentation: "card" }} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ presentation: "card" }} />
        </Stack.Navigator>
      </NavigationContainer>
      <AmbientAlertOverlay />
    </View>
  );
}
