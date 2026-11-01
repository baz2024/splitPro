# SplitPro mobile (TestFlight wrapper)

A thin Expo app that shows https://split.kafoai.com inside a full-screen WebView.
It is meant for internal TestFlight testing, not an App Store release.

This folder uses **npm**, separate from the root pnpm workspace.

## What the wrapper does

- Opens `https://split.kafoai.com/home` full screen, inside the safe area, on a navy `#0b1626`
  background (light mode uses `#f6f8fb`).
- Pull to refresh: built into the WebView on iOS. On Android it uses a refresh control that only
  works when the page is scrolled to the top.
- Android back button moves back through the WebView history before it leaves the app.
- Links to other sites, plus `mailto:` and `tel:` links, open in the system browser or app.
  Pages on `split.kafoai.com` stay in the WebView.
- Receipt scanning works through `<input type="file" capture>`. iOS asks for camera and photo
  library permission using the text in `app.json`.
- If the site cannot load, a "Try again" screen appears.

## Important: signing in

> **Use email sign-in for the TestFlight build.**

Google blocks OAuth inside embedded WebViews and shows a `403 disallowed_useragent` error.
To avoid that error, the app catches any move to `accounts.google.com` or
`/api/auth/signin/google` and opens the SplitPro sign-in page in the system browser instead,
using `expo-web-browser` `openAuthSessionAsync`.

**Limitation:** the session cookie from the system browser is **not shared** with the WebView.
Signing in with Google there does not sign you in inside the app. When the browser sheet
closes, the WebView reloads, but you will still be signed out.

Email sign-in works fully inside the WebView:

1. Enter your email on the sign-in screen.
2. Open the email on any device and **type the 5-character code** into the app.
3. Do not tap the magic link in the email. It opens Safari, not the app.

Making Google sign-in work in the app properly needs a native flow, for example a custom
callback that gives the session token back to the app through the `splitpro://` scheme.
That is out of scope for tonight's build.

## Run locally

```bash
cd mobile
npm install
npx expo start
```

The WebView is a native module, so it needs a development build or the iOS Simulator through
`npx expo run:ios`. Expo Go may also work, because it ships `react-native-webview`.

## Checks

```bash
npx tsc --noEmit
npx expo-doctor
```

## Build and upload to TestFlight

Run these from `mobile/`. EAS builds in the cloud, so you do not need Xcode.

1. Log in to Expo:

   ```bash
   npx eas-cli@latest login
   ```

2. Link the project to EAS. The first time, this adds `extra.eas.projectId` to `app.json`:

   ```bash
   npx eas-cli@latest init
   ```

3. Build for iOS. When asked, sign in with your Apple Developer account and let EAS create
   the bundle ID `com.kafoai.split`, the certificates and the provisioning profile:

   ```bash
   npx eas-cli@latest build -p ios --profile production
   ```

4. Upload the build to App Store Connect / TestFlight:

   ```bash
   npx eas-cli@latest submit -p ios --profile production --latest
   ```

5. In App Store Connect, open TestFlight, add the build to your internal testing group and
   install it through the TestFlight app.

### TODO before `eas submit`

`eas.json` has a placeholder in `submit.production.ios.ascAppId`:

```
"ascAppId": "TODO_REPLACE_WITH_APP_STORE_CONNECT_APP_ID"
```

Create the app in App Store Connect (My Apps, then +, then New App, with bundle ID
`com.kafoai.split`). Then copy its numeric **Apple ID** from App Information into `ascAppId`.
Or delete the `ascAppId` line and `eas submit` will ask you for it.

## Regenerating the icons

`assets/icon.png`, `assets/splash-icon.png`, the Android adaptive icon layers and the favicon
come from a pure Node script with no dependencies:

```bash
node scripts/generate-icons.js
```
