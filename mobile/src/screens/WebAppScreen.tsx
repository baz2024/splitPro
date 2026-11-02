import * as SplashScreen from 'expo-splash-screen';
import {
  type ComponentType,
  type RefAttributes,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  BackHandler,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView as RNWebView, type WebViewProps } from 'react-native-webview';
import type {
  ShouldStartLoadRequest,
  WebViewHttpErrorEvent,
  WebViewNavigation,
  WebViewOpenWindowEvent,
  WebViewScrollEvent,
  WebViewSource,
} from 'react-native-webview/lib/WebViewTypes';

import { WEB_LOCALE, directionStyle, isArabic, stripLocale, t } from '../lib/i18n';
import {
  APP_HOST,
  APP_ORIGIN,
  COLORS,
  EMAIL_SIGNIN_URL,
  EXCHANGE_URL,
  HOME_PATH,
  LOCALIZED_HOME_PATH,
} from '../theme';

// react-native-webview's class type defaults its generic to `undefined`, and `Props & undefined`
// collapses to `never` under current TypeScript. Re-type it with an object generic.
type WebViewHandle = RNWebView<object>;
const WebView = RNWebView as unknown as ComponentType<WebViewProps & RefAttributes<WebViewHandle>>;

export type WebEntry =
  // Hand a fresh Supabase access token to the SplitPro server, which sets the session cookie.
  | { kind: 'exchange'; accessToken: string }
  // The existing email sign-in page, inside the WebView.
  | { kind: 'email' }
  // Relaunch with a session cookie already in the WebView.
  | { kind: 'resume' };

interface WebAppScreenProps {
  entry: WebEntry;
  onSignedIn: () => void;
  onSignedOut: (error?: string) => void;
  onGoogleRequested: () => void;
  onAppleRequested: () => void;
  onBackToWelcome: () => void;
}

// Pages that only exist for signed-in users; reaching one means the cookie works.
const SIGNED_IN_PREFIXES = [
  '/balances',
  '/groups',
  '/activity',
  '/account',
  '/add',
  '/expenses',
  '/recurring',
] as const;

const SupabaseSigninError = 'SupabaseSignin';

const parseUrl = (url: string): URL | null => {
  try {
    return new URL(url);
  } catch {
    return null;
  }
};

const isAppUrl = (url: URL) => APP_HOST === url.hostname;

// Page paths carry a locale prefix (`/en/balances`, `/ar/balances`); compare without it.
const isSignInPage = (url: URL) =>
  isAppUrl(url) && stripLocale(url.pathname).startsWith('/auth/signin');

const isSignedInPage = (url: URL) =>
  isAppUrl(url) &&
  SIGNED_IN_PREFIXES.some((prefix) => stripLocale(url.pathname).startsWith(prefix));

// Saves the device language as the web app's NEXT_LOCALE cookie, so later relaunches (which
// open the unprefixed home path) keep it until the user picks another language on the web.
const persistWebLocaleScript = (locale: string) =>
  `fetch('/api/locale?locale=' + encodeURIComponent(${JSON.stringify(locale)}), { credentials: 'same-origin' }).catch(function () {}); true;`;

const isGoogleAuthUrl = (url: URL) =>
  'accounts.google.com' === url.hostname ||
  (isAppUrl(url) && url.pathname.startsWith('/api/auth/signin/google'));

// Supabase OAuth (Apple / Google from the web sign-in page). Opening it in Safari would leave
// the app, so the native sign-in flows handle it instead.
const supabaseAuthProvider = (url: URL): string | null =>
  url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/auth/v1/authorize')
    ? (url.searchParams.get('provider') ?? '')
    : null;

// Schemes the WebView must load itself rather than hand to the OS.
const isInternalScheme = (url: string) =>
  url.startsWith('about:') || url.startsWith('data:') || url.startsWith('blob:');

const buildSource = (entry: WebEntry): WebViewSource => {
  if ('exchange' === entry.kind) {
    return {
      uri: EXCHANGE_URL,
      method: 'POST',
      // LOCALIZED_HOME_PATH is always a single-slash relative path, so it passes the
      // server's safeNextPath check.
      body: `accessToken=${encodeURIComponent(entry.accessToken)}&next=${encodeURIComponent(LOCALIZED_HOME_PATH)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    };
  }
  if ('email' === entry.kind) {
    return { uri: EMAIL_SIGNIN_URL };
  }
  return { uri: `${APP_ORIGIN}${HOME_PATH}` };
};

export const WebAppScreen = ({
  entry,
  onSignedIn,
  onSignedOut,
  onGoogleRequested,
  onAppleRequested,
  onBackToWelcome,
}: WebAppScreenProps) => {
  const webViewRef = useRef<WebViewHandle>(null);
  const canGoBackRef = useRef(false);
  const splashHiddenRef = useRef(false);
  // Fresh sign-ins on an Arabic device store the web language once; a relaunch never does,
  // so a language chosen later in the web app is respected.
  const localeSavedRef = useRef('resume' === entry.kind || null === WEB_LOCALE);
  // Email sign-in starts on /auth/signin; every other entry is already signed in.
  const signedInRef = useRef('email' !== entry.kind);
  const signedOutRef = useRef(false);
  // Build the source once: the POST must not be replayed when the component re-renders.
  const [source] = useState(() => buildSource(entry));
  const [onSignInPage, setOnSignInPage] = useState('email' === entry.kind);
  const [atTop, setAtTop] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasError, setHasError] = useState(false);

  const hideSplash = useCallback(() => {
    if (splashHiddenRef.current) {
      return;
    }
    splashHiddenRef.current = true;
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  // Never leave the splash up forever if the network is slow.
  useEffect(() => {
    const timer = setTimeout(hideSplash, 8000);
    return () => clearTimeout(timer);
  }, [hideSplash]);

  // Android hardware back: walk WebView history before leaving the app.
  useEffect(() => {
    if ('android' !== Platform.OS) {
      return;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBackRef.current) {
        return false;
      }
      webViewRef.current?.goBack();
      return true;
    });
    return () => sub.remove();
  }, []);

  const trackAuthState = useCallback(
    (url: string) => {
      const parsed = parseUrl(url);
      if (!parsed || signedOutRef.current) {
        return;
      }
      setOnSignInPage(isSignInPage(parsed));

      if (isSignedInPage(parsed)) {
        signedInRef.current = true;
        onSignedIn();
        return;
      }

      // Back on the sign-in page after being signed in: the session ended (signed out,
      // cookie expired, or the token exchange failed). Return to the native Welcome screen.
      if (isSignInPage(parsed) && signedInRef.current) {
        signedOutRef.current = true;
        const failed = SupabaseSigninError === parsed.searchParams.get('error');
        onSignedOut(failed ? t.signInIncomplete : undefined);
      }
    },
    [onSignedIn, onSignedOut],
  );

  const openExternal = useCallback((url: string) => {
    Linking.openURL(url).catch((error) => console.warn('Could not open URL', url, error));
  }, []);

  const handleShouldStartLoad = useCallback(
    (request: ShouldStartLoadRequest) => {
      const { url } = request;

      if (isInternalScheme(url)) {
        return true;
      }

      const parsed = parseUrl(url);
      if (!parsed) {
        return false;
      }

      // Google blocks OAuth inside embedded WebViews (403 disallowed_useragent), so use the
      // native Google flow instead.
      if (isGoogleAuthUrl(parsed)) {
        onGoogleRequested();
        return false;
      }

      const provider = supabaseAuthProvider(parsed);
      if (null !== provider) {
        if ('apple' === provider) {
          onAppleRequested();
        } else if ('google' === provider) {
          onGoogleRequested();
        } else {
          onBackToWelcome();
        }
        return false;
      }

      // Let iframes (payments, embeds, analytics) load normally.
      if (false === request.isTopFrame) {
        return true;
      }

      if (('https:' === parsed.protocol || 'http:' === parsed.protocol) && isAppUrl(parsed)) {
        return true;
      }

      // Everything else (other sites, mailto:, tel:, sms:, maps) goes to the OS.
      openExternal(url);
      return false;
    },
    [onAppleRequested, onBackToWelcome, onGoogleRequested, openExternal],
  );

  const handleOpenWindow = useCallback(
    (event: WebViewOpenWindowEvent) => {
      const { targetUrl } = event.nativeEvent;
      const parsed = parseUrl(targetUrl);
      if (parsed && isGoogleAuthUrl(parsed)) {
        onGoogleRequested();
        return;
      }
      const provider = parsed ? supabaseAuthProvider(parsed) : null;
      if (null !== provider) {
        if ('apple' === provider) {
          onAppleRequested();
        } else if ('google' === provider) {
          onGoogleRequested();
        } else {
          onBackToWelcome();
        }
        return;
      }
      if (parsed && isAppUrl(parsed)) {
        webViewRef.current?.injectJavaScript(
          `window.location.href = ${JSON.stringify(targetUrl)}; true;`,
        );
        return;
      }
      openExternal(targetUrl);
    },
    [onAppleRequested, onBackToWelcome, onGoogleRequested, openExternal],
  );

  const handleNavigationStateChange = useCallback(
    (nav: WebViewNavigation) => {
      canGoBackRef.current = nav.canGoBack;
      trackAuthState(nav.url);
    },
    [trackAuthState],
  );

  const handleScroll = useCallback((event: WebViewScrollEvent) => {
    setAtTop(0 >= event.nativeEvent.contentOffset.y);
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setHasError(false);
    webViewRef.current?.reload();
  }, []);

  const handleLoadEnd = useCallback(() => {
    setRefreshing(false);
    hideSplash();
    if (localeSavedRef.current || null === WEB_LOCALE) {
      return;
    }
    localeSavedRef.current = true;
    webViewRef.current?.injectJavaScript(persistWebLocaleScript(WEB_LOCALE));
  }, [hideSplash]);

  const handleError = useCallback(() => {
    setRefreshing(false);
    setHasError(true);
    hideSplash();
  }, [hideSplash]);

  const webView = (
    <WebView
      ref={webViewRef}
      source={source}
      style={styles.webView}
      containerStyle={styles.webView}
      originWhitelist={['*']}
      onShouldStartLoadWithRequest={handleShouldStartLoad}
      onOpenWindow={handleOpenWindow}
      onNavigationStateChange={handleNavigationStateChange}
      onLoadEnd={handleLoadEnd}
      onError={handleError}
      onHttpError={(event: WebViewHttpErrorEvent) => {
        if (500 <= event.nativeEvent.statusCode) {
          handleError();
        }
      }}
      onContentProcessDidTerminate={() => webViewRef.current?.reload()}
      onRenderProcessGone={() => webViewRef.current?.reload()}
      onScroll={'android' === Platform.OS ? handleScroll : undefined}
      // Session + storage
      sharedCookiesEnabled
      thirdPartyCookiesEnabled
      domStorageEnabled
      javaScriptEnabled
      // Camera / photo upload via <input type="file" capture>
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
      allowFileAccess
      // Window handling
      setSupportMultipleWindows
      javaScriptCanOpenWindowsAutomatically
      // iOS niceties
      allowsBackForwardNavigationGestures
      pullToRefreshEnabled
      refreshControlLightMode
      decelerationRate="normal"
      // Android niceties
      overScrollMode="never"
      setBuiltInZoomControls={false}
      applicationNameForUserAgent="SafiApp/1.0"
    />
  );

  return (
    <SafeAreaView style={[styles.root, directionStyle]} edges={['top', 'left', 'right', 'bottom']}>
      {'android' === Platform.OS ? (
        // Android WebView has no native pull-to-refresh; enable it only when scrolled to the top.
        <ScrollView
          contentContainerStyle={styles.root}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              enabled={atTop}
              colors={[COLORS.accent]}
              progressBackgroundColor={COLORS.background}
            />
          }
        >
          {webView}
        </ScrollView>
      ) : (
        webView
      )}
      {'email' === entry.kind && onSignInPage && !signedInRef.current ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.backToSignInOptions}
          onPress={onBackToWelcome}
          hitSlop={12}
          style={styles.backChip}
        >
          <Text style={[styles.backChipLabel, textDirection]}>{t.otherOptions}</Text>
        </Pressable>
      ) : null}
      {hasError ? (
        <View style={styles.errorOverlay}>
          <Text style={[styles.errorTitle, textDirection]}>{t.cantReachSafi}</Text>
          <Text style={[styles.errorBody, textDirection]}>{t.checkConnection}</Text>
          <Pressable accessibilityRole="button" onPress={handleRefresh} style={styles.retryButton}>
            <Text style={[styles.retryLabel, textDirection]}>{t.tryAgain}</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
};

// Centered labels only need the reading direction, not a start alignment.
const textDirection = { writingDirection: isArabic ? 'rtl' : 'ltr' } as const;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  webView: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  backChip: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  backChipLabel: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '500',
  },
  errorOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
    backgroundColor: COLORS.background,
  },
  errorTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '600',
  },
  errorBody: {
    color: COLORS.muted,
    fontSize: 15,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    minHeight: 44,
    minWidth: 140,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: COLORS.accent,
  },
  retryLabel: {
    color: COLORS.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
});
