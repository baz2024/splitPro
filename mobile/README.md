# Safi mobile app

An Expo app with native sign-in that then shows https://safi.kafoai.com inside a
full-screen WebView.

This folder uses **npm**, separate from the root pnpm workspace.

## What the app does

- When you are signed out, it shows a native **Welcome** screen (Kafo AI / SplitPro) with
  Sign in with Apple (iOS), Continue with Google, Continue with phone, and a small
  "Use email instead" link.
- After you sign in, it shows `https://safi.kafoai.com/balances` full screen in a WebView.
- The app always uses the Midnight Navy theme: navy `#0b1626` strips behind the status bar and
  home indicator, with light status bar text, even when the phone is in light mode.
- Pull to refresh: built into the WebView on iOS. On Android it uses a refresh control that only
  works when the page is scrolled to the top.
- Android back button moves back through the WebView history before it leaves the app.
- Links to other sites, plus `mailto:` and `tel:` links, open in the system browser or app.
  Pages on `safi.kafoai.com` stay in the WebView.
- Receipt scanning works through `<input type="file" capture>`. iOS asks for camera and photo
  library permission using the text in `app.json`.
- Exports open the iOS share sheet, because the WebView can't save files the web app creates in
  memory. The web app sends the file over the WebView message bridge (`src/lib/download.ts`).
- If the site cannot load, a "Try again" screen appears.

## How sign-in works

1. Apple, Google and phone sign-in happen natively through **Supabase Auth**
   (project `lfmhkxsjyvqlswmnppad`).
2. The app then opens the WebView with a one-time form POST to
   `https://safi.kafoai.com/api/auth/supabase-exchange`, sending the Supabase access token.
3. The SplitPro server checks the token with Supabase, finds or creates the user, sets the normal
   SplitPro session cookie and redirects to `/balances`.
4. The app remembers that you are signed in, so the next launch opens `/balances` directly.
5. If the WebView ever lands on `/auth/signin` (you signed out, or the session expired), the app
   signs out of Supabase, forgets the flag and shows the Welcome screen again.

"Use email instead" opens the existing email sign-in page inside the WebView. Type the
5-character code from the email into the app; do not tap the magic link (it opens Safari).

If the web sign-in page tries to start Google OAuth inside the WebView, the app runs the native
Google flow instead, because Google blocks OAuth in embedded WebViews (`403 disallowed_useragent`).

> **Requires the web route.** `/api/auth/supabase-exchange` must be deployed on
> `safi.kafoai.com` before native sign-in works end to end.

## Supabase settings needed

### 1. App key

The public **anon** key for project `lfmhkxsjyvqlswmnppad` is built into
`src/lib/supabase.ts` (the same key the web app ships), so no setup is needed.

To use a different project, copy `.env.example` to `.env.local` and set
`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. For EAS builds, set them in the
EAS environment instead, because `.env.local` is not uploaded.

> **Warning:** use only the `anon` (or publishable) key. Never put `service_role` in the app.

### 2. Redirect URL

In Supabase Dashboard, Authentication, URL Configuration, add this to **Redirect URLs**:

```
splitpro://auth-callback
```

### 3. Providers (Authentication, Sign In / Providers)

- **Apple:** enable it and add the bundle ID `com.kafoai.split` to the **Client IDs** list.
  Native sign-in uses an ID token, so no Services ID or secret key is needed for the app.
  The App ID needs the Sign In with Apple capability (EAS sets it up from `ios.usesAppleSignIn`).
- **Google:** enable it with a **Web** OAuth client ID and secret from Google Cloud. In Google
  Cloud, add `https://lfmhkxsjyvqlswmnppad.supabase.co/auth/v1/callback` as an authorised
  redirect URI.
- **Phone:** enable it and connect an SMS provider (Twilio, MessageBird, Vonage or Textlocal).
  Leave the OTP length at 6 digits. For testing without SMS cost, add test phone numbers with
  fixed codes in the Phone provider settings.

## Run locally

```bash
cd mobile
npm install
npx expo start
```

The app uses native modules (WebView, Apple sign-in, secure storage), so test it in a
development build: `npx expo run:ios` or `npx eas-cli@latest build --profile development`.

> **Sign in with Apple:** it does not work reliably in Expo Go or on the iOS Simulator.
> In Expo Go the token is issued for Expo Go's bundle ID, so Supabase rejects it. Test Apple
> sign-in on a real device with a development or TestFlight build.

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

## Store submission

Run these from `mobile/`. `eas.json` already has the App Store Connect app ID and the Google
Play settings (internal track, draft release).

**iOS (App Store)**

```bash
npx eas-cli@latest build -p ios --profile production
npx eas-cli@latest submit -p ios --profile production --latest
```

**Android (Google Play)**

```bash
npx eas-cli@latest build -p android --profile production
npx eas-cli@latest submit -p android --profile production --latest
```

- The production profile builds an Android App Bundle (`.aab`).
- Submitting needs a Google Play service-account key saved as
  `mobile/google-service-account.json`. It is in `.gitignore`; never commit it.
- Google Play does not accept the first upload through the API. Upload the first `.aab` by hand
  in Play Console, then `eas submit` works for later builds.
- The Welcome screen links to the Terms and Privacy pages on `safi.kafoai.com`, which both
  stores require.

## Regenerating the icons

`assets/icon.png`, `assets/splash-icon.png`, the Android adaptive icon layers and the favicon
come from a pure Node script with no dependencies:

```bash
node scripts/generate-icons.js
```
