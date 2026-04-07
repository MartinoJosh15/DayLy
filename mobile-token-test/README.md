# Dayly Mobile Token Test

This is a tiny Expo app used only to fetch an Expo push token from a physical device.

## Run It

1. Open a terminal in [`mobile-token-test`](C:/Users/marti/OneDrive/Documents/Task_Manager/Dayly/mobile-token-test).
2. Install dependencies:

```bash
npm install
```

3. Start Expo:

```bash
npx expo start
```

4. Open the project in Expo Go on your phone.
5. Tap `Get Expo Push Token`.
6. Copy the token shown on screen.
7. Paste it into Dayly `Settings -> Device Tokens`.

## If Expo Asks For A projectId

If the app says the Expo `projectId` is missing:

1. Paste your Expo projectId into the text field in the app, or
2. Replace the placeholder in [`app.json`](C:/Users/marti/OneDrive/Documents/Task_Manager/Dayly/mobile-token-test/app.json).

## Notes

- You must use a real phone, not an emulator, for Expo push tokens.
- This app does not connect to Supabase or Dayly directly.
- It only helps you generate a token you can register in Dayly.
