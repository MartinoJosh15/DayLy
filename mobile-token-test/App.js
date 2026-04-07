import { useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function getConfiguredProjectId(overrideValue) {
  const manual = String(overrideValue || "").trim();
  if (manual) return manual;

  const fromExpoConfig = Constants.expoConfig?.extra?.eas?.projectId;
  if (fromExpoConfig && !String(fromExpoConfig).includes("REPLACE_WITH")) {
    return fromExpoConfig;
  }

  const fromEasConfig = Constants.easConfig?.projectId;
  if (fromEasConfig) return fromEasConfig;

  return "";
}

export default function App() {
  const [status, setStatus] = useState("Tap the button to request notification permission.");
  const [projectIdOverride, setProjectIdOverride] = useState("");
  const [expoPushToken, setExpoPushToken] = useState("");

  async function handleGetToken() {
    setStatus("Checking device and notification permissions...");
    setExpoPushToken("");

    if (!Device.isDevice) {
      setStatus("Expo push tokens require a physical device. Open this in Expo Go on your phone.");
      return;
    }

    const existing = await Notifications.getPermissionsAsync();
    let finalStatus = existing.status;

    if (finalStatus !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      finalStatus = requested.status;
    }

    if (finalStatus !== "granted") {
      setStatus("Notification permission was not granted.");
      return;
    }

    try {
      const projectId = getConfiguredProjectId(projectIdOverride);
      if (!projectId) {
        setStatus(
          "Permission is granted, but Expo projectId is missing. Add it in app.json or paste it into the field below."
        );
        return;
      }

      setStatus("Requesting Expo push token...");
      const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
      setExpoPushToken(tokenResponse.data || "");
      setStatus("Success. Copy this Expo push token into Dayly Settings > Device Tokens.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `Could not fetch an Expo push token: ${error.message}`
          : "Could not fetch an Expo push token."
      );
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.kicker}>Dayly</Text>
        <Text style={styles.title}>Push Token Test</Text>
        <Text style={styles.body}>
          Use this app in Expo Go on a real phone, then paste the Expo push token into Dayly Settings so
          `send-reminders` can deliver push notifications.
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Expo projectId</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Paste projectId if Expo asks for it"
            value={projectIdOverride}
            onChangeText={setProjectIdOverride}
          />
          <Text style={styles.help}>
            Leave this blank if your Expo config already contains the correct projectId.
          </Text>
        </View>

        <Pressable style={styles.button} onPress={handleGetToken}>
          <Text style={styles.buttonText}>Get Expo Push Token</Text>
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.label}>Status</Text>
          <Text style={styles.status}>{status}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Expo push token</Text>
          <Text selectable style={styles.token}>
            {expoPushToken || "No token yet"}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#eef4fb",
  },
  container: {
    padding: 24,
    gap: 16,
  },
  kicker: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "#5b6b80",
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -1,
    color: "#102033",
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: "#405064",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: "#d8e3f1",
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#5b6b80",
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#c8d6e8",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#f8fbff",
    color: "#102033",
  },
  help: {
    fontSize: 13,
    lineHeight: 20,
    color: "#607286",
  },
  status: {
    fontSize: 15,
    lineHeight: 22,
    color: "#102033",
  },
  token: {
    fontSize: 15,
    lineHeight: 22,
    color: "#102033",
  },
  button: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1f5fd6",
    paddingHorizontal: 18,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
});
