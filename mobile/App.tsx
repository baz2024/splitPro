import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { type ComponentType, type RefAttributes, useCallback, useEffect, useRef, useState } from 'react';
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
  useColorScheme,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView as RNWebView, type WebViewProps } from 'react-native-webview';
import type {
  ShouldStartLoadRequest,
  WebViewHttpErrorEvent,
  WebViewNavigation,
  WebViewOpenWindowEvent,
  WebViewScrollEvent,
} from 'react-native-webview/lib/WebViewTypes';

// react-native-webview's class type defaults its generic to `undefined`, and `Props & undefined`
// collapses to `never` under current TypeScript. Re-type it with an object generic.
type WebViewHandle = RNWebView<object>;
const WebView = RNWebView as unknown as ComponentType<WebViewProps & RefAttributes<WebViewHandle>>;

const APP_HOST = 'split.kafoai.com';
const APP_ORIGIN = `https://${APP_HOST}`;
const START_URL = `${APP_ORIGIN}/home`;
// Google sign-in is started fresh in the system browser (see README for the cookie caveat).
const GOOGLE_SIGNIN_URL = `${APP_ORIGIN}/auth/signin?callbackUrl=${encodeURIComponent('/home')}`;
const AUTH_RETURN_URL = 'splitpro://';

const THEME = {
  dark: { background: '#0b1626', foreground: '#f1f5f9', muted: '#8da2c0', accent: '#5aa9ff' },
  light: { background: '#f6f8fb', foreground: '#0b1626', muted: '#5b6b82', accent: '#1f6fd1' },
} as const;

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const parseUrl = (url: string): URL | null => {
  try {
    return new URL(url);
  } catch {
    return null;
  }
};

const isAppUrl = (url: URL) => APP_HOST === url.hostname;

const isGoogleAuthUrl = (url: URL) =>
  'accounts.google.com' === url.hostname ||
  (isAppUrl(url) && url.pathname.startsWith('/api/auth/signin/google'));

// Schemes the WebView must load itself rather than hand to the OS.
const isInternalScheme = (url: string) =>
  url.startsWith('about:') || url.startsWith('data:') || url.startsWith('blob:');

const Main = () => {
  const scheme = useColorScheme();
  const colors = 'light' === scheme ? THEME.light : THEME.dark;

  const webViewRef = useRef<WebViewHandle>(null);
  const canGoBackRef = useRef(false);
  const splashHiddenRef = useRef(false);
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

  const openGoogleSignIn = useCallback(async () => {
    try {
      await WebBrowser.openAuthSessionAsync(GOOGLE_SIGNIN_URL, AUTH_RETURN_URL);
    } catch (error) {
      console.warn('Google sign-in session failed', error);
    }
    // The system browser does not share cookies with the WebView; reload to reflect any change.
    webViewRef.current?.reload();
  }, []);

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

      // Google blocks OAuth inside embedded WebViews (403 disallowed_useragent).
      if (isGoogleAuthUrl(parsed)) {
        openGoogleSignIn().catch(() => undefined);
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
    [openExternal, openGoogleSignIn],
  );

  const handleOpenWindow = useCallback(
    (event: WebViewOpenWindowEvent) => {
      const { targetUrl } = event.nativeEvent;
      const parsed = parseUrl(targetUrl);
      if (parsed && isGoogleAuthUrl(parsed)) {
        openGoogleSignIn().catch(() => undefined);
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
    [openExternal, openGoogleSignIn],
  );

  const handleNavigationStateChange = useCallback((nav: WebViewNavigation) => {
    canGoBackRef.current = nav.canGoBack;
  }, []);

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
  }, [hideSplash]);

  const handleError = useCallback(() => {
    setRefreshing(false);
    setHasError(true);
    hideSplash();
  }, [hideSplash]);

  const webView = (
    <WebView
      ref={webViewRef}
      source={{ uri: START_URL }}
      style={[styles.webView, { backgroundColor: colors.background }]}
      containerStyle={{ backgroundColor: colors.background }}
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
      refreshControlLightMode={'light' !== scheme}
      decelerationRate="normal"
      // Android niceties
      overScrollMode="never"
      setBuiltInZoomControls={false}
      applicationNameForUserAgent="SplitProApp/1.0"
    />
  );

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: colors.background }]}
      edges={['top', 'left', 'right', 'bottom']}
    >
      <StatusBar style={'light' === scheme ? 'dark' : 'light'} />
      {'android' === Platform.OS ? (
        // Android WebView has no native pull-to-refresh; enable it only when scrolled to the top.
        <ScrollView
          contentContainerStyle={styles.root}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              enabled={atTop}
              colors={[colors.accent]}
              progressBackgroundColor={colors.background}
            />
          }
        >
          {webView}
        </ScrollView>
      ) : (
        webView
      )}
      {hasError ? (
        <View style={[styles.errorOverlay, { backgroundColor: colors.background }]}>
          <Text style={[styles.errorTitle, { color: colors.foreground }]}>Can't reach SplitPro</Text>
          <Text style={[styles.errorBody, { color: colors.muted }]}>
            Check your connection and try again.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={handleRefresh}
            style={[styles.retryButton, { backgroundColor: colors.accent }]}
          >
            <Text style={styles.retryLabel}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
};

const App = () => (
  <SafeAreaProvider>
    <Main />
  </SafeAreaProvider>
);

export default App;

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  webView: {
    flex: 1,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  errorBody: {
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
  },
  retryLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
