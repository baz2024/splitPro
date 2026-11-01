import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  AuthCancelledError,
  getWebSignedIn,
  setWebSignedIn,
  signInWithGoogle,
  signOutEverywhere,
} from './src/lib/auth';
import { PhoneScreen } from './src/screens/PhoneScreen';
import { WebAppScreen, type WebEntry } from './src/screens/WebAppScreen';
import { WelcomeScreen } from './src/screens/WelcomeScreen';
import { COLORS } from './src/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);
// Root view colour behind everything (shows during transitions and under the system bars).
SystemUI.setBackgroundColorAsync(COLORS.background).catch(() => undefined);

type Screen =
  | { name: 'loading' }
  | { name: 'welcome'; error?: string | null }
  | { name: 'phone' }
  // `key` forces a fresh WebView for each new entry so a POST is sent exactly once.
  | { name: 'web'; entry: WebEntry; key: number };

const Main = () => {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });
  const webKeyRef = useRef(0);
  const flagSetRef = useRef(false);

  const openWeb = useCallback((entry: WebEntry) => {
    webKeyRef.current += 1;
    setScreen({ name: 'web', entry, key: webKeyRef.current });
  }, []);

  // Relaunch: if the WebView already has a SplitPro session, go straight to it.
  useEffect(() => {
    getWebSignedIn()
      .then((signedIn) => {
        if (signedIn) {
          flagSetRef.current = true;
          openWeb({ kind: 'resume' });
          return;
        }
        setScreen({ name: 'welcome' });
        SplashScreen.hideAsync().catch(() => undefined);
      })
      .catch(() => setScreen({ name: 'welcome' }));
  }, [openWeb]);

  const handleAccessToken = useCallback(
    (accessToken: string) => openWeb({ kind: 'exchange', accessToken }),
    [openWeb],
  );

  const handleSignedIn = useCallback(() => {
    if (flagSetRef.current) {
      return;
    }
    flagSetRef.current = true;
    setWebSignedIn(true).catch(() => undefined);
  }, []);

  const handleSignedOut = useCallback((error?: string) => {
    flagSetRef.current = false;
    setScreen({ name: 'welcome', error: error ?? null });
    signOutEverywhere().catch(() => undefined);
  }, []);

  // The web sign-in page tried to start Google OAuth; run the native flow instead.
  const handleGoogleRequested = useCallback(() => {
    signInWithGoogle()
      .then(handleAccessToken)
      .catch((error: unknown) => {
        if (error instanceof AuthCancelledError) {
          return;
        }
        setScreen({
          name: 'welcome',
          error: error instanceof Error ? error.message : 'Google sign-in failed.',
        });
      });
  }, [handleAccessToken]);

  const showWelcome = useCallback(() => setScreen({ name: 'welcome' }), []);

  if ('loading' === screen.name) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  if ('phone' === screen.name) {
    return <PhoneScreen onBack={showWelcome} onAccessToken={handleAccessToken} />;
  }

  if ('web' === screen.name) {
    return (
      <WebAppScreen
        key={screen.key}
        entry={screen.entry}
        onSignedIn={handleSignedIn}
        onSignedOut={handleSignedOut}
        onGoogleRequested={handleGoogleRequested}
        onBackToWelcome={showWelcome}
      />
    );
  }

  return (
    <WelcomeScreen
      // Remount when a new error arrives so it replaces any earlier message.
      key={screen.error ?? 'welcome'}
      initialError={screen.error}
      onAccessToken={handleAccessToken}
      onPhone={() => setScreen({ name: 'phone' })}
      onEmail={() => openWeb({ kind: 'email' })}
    />
  );
};

const App = () => (
  <SafeAreaProvider style={styles.provider}>
    {/* Always light content on the navy bars, whatever the system appearance. */}
    <StatusBar style="light" />
    <Main />
  </SafeAreaProvider>
);

export default App;

const styles = StyleSheet.create({
  provider: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
});
