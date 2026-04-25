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
      intensity={Platform.OS === "ios" ? 40 : 90}
      tint="dark"
      style={StyleSheet.absoluteFill}
    />
    <View
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: "rgba(10,12,28,0.7)", borderTopWidth: 1, borderTopColor: theme.colors.outlineSoft },
      ]}
    />
  </View>
);

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: theme.colors.text,
        tabBarInactiveTintColor: theme.colors.textMute,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700", letterSpacing: 0.3, marginBottom: 4 },
        tabBarStyle: {
          position: "absolute",
          borderTopWidth: 0,
          height: 82,
          paddingTop: 10,
          backgroundColor: "transparent",
          elevation: 0,
        },
        tabBarBackground: () => <TabBarBg />,
        tabBarIcon: ({ color, focused }) => {
          const size = 22;
          switch (route.name) {
            case "Home":
              return <Ionicons name={focused ? "pulse" : "pulse-outline"} size={size} color={color} />;
            case "Listen":
              return <Ionicons name={focused ? "radio" : "radio-outline"} size={size} color={color} />;
            case "Talk":
              return <Ionicons name={focused ? "chatbubbles" : "chatbubbles-outline"} size={size} color={color} />;
            case "ASL":
              return <MaterialCommunityIcons name="hand-wave-outline" size={size} color={color} />;
            case "SOS":
              return <Ionicons name={focused ? "shield" : "shield-outline"} size={size} color={color} />;
            default:
              return <Ionicons name="ellipse" size={size} color={color} />;
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
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg } }}>
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="Main" component={Tabs} />
        <Stack.Screen name="Classroom" component={ClassroomScreen} options={{ presentation: "card" }} />
        <Stack.Screen name="Medical" component={MedicalScreen} options={{ presentation: "card" }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ presentation: "card" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
