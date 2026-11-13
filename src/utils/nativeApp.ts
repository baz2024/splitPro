/** Set by the Safi iOS/Android app's WebView (mobile/src/screens/WebAppScreen.tsx). */
const NATIVE_APP_USER_AGENT = 'SafiApp/';

/** True inside the Safi native app, where web-only features (PWA install, blob downloads) differ. */
export const isNativeApp = (): boolean => {
  if ('undefined' === typeof window) {
    return false;
  }

  const hasBridge = Boolean(
    (window as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView,
  );
  return hasBridge || navigator.userAgent.includes(NATIVE_APP_USER_AGENT);
};
