import { z } from 'zod';

// Push inside the Safi iOS/Android app. The WebView has no service worker, so Web Push can't
// work there. The native app owns the OS permission and the Expo push token instead
// (mobile/src/lib/push.ts): we ask over the ReactNativeWebView bridge and it answers with a
// `safi-native-push` DOM event.

const PUSH_STATE_EVENT = 'safi-native-push';
const REPLY_TIMEOUT_MS = 15_000;
// Only a decision made here sticks: after "Disable" we stop re-registering the token on launch.
const NATIVE_PUSH_DISABLED_KEY = 'safi_native_push_disabled';
const NATIVE_PUSH_TOKEN_KEY = 'safi_native_push_token';

const NativePushStateSchema = z.object({
  status: z.enum(['granted', 'denied', 'undetermined', 'unavailable']),
  canAskAgain: z.boolean(),
  token: z.string().nullable(),
  platform: z.enum(['ios', 'android']),
});

export type NativePushState = z.infer<typeof NativePushStateSchema>;

type Bridge = { postMessage: (message: string) => void };

const nativeBridge = () =>
  (window as Window & { ReactNativeWebView?: Bridge }).ReactNativeWebView ?? null;

export const hasNativePush = () => 'undefined' !== typeof window && null !== nativeBridge();

const askNative = (type: 'push-status' | 'push-enable') =>
  new Promise<NativePushState>((resolve, reject) => {
    const bridge = nativeBridge();
    if (!bridge) {
      reject(new Error('Not running in the Safi app'));
      return;
    }

    // The permission prompt waits on the user, so 'enable' has no timeout.
    const timer =
      'push-status' === type
        ? window.setTimeout(() => {
            window.removeEventListener(PUSH_STATE_EVENT, onState);
            reject(new Error('The app did not answer'));
          }, REPLY_TIMEOUT_MS)
        : undefined;

    function onState(event: Event) {
      const parsed = NativePushStateSchema.safeParse((event as CustomEvent<unknown>).detail);
      if (!parsed.success) {
        return;
      }
      window.clearTimeout(timer);
      window.removeEventListener(PUSH_STATE_EVENT, onState);
      resolve(parsed.data);
    }

    window.addEventListener(PUSH_STATE_EVENT, onState);
    bridge.postMessage(JSON.stringify({ type }));
  });

/** Current permission and token. Never shows a prompt. */
export const getNativePushState = () => askNative('push-status');

/** Shows the OS prompt, or opens Settings when the user turned notifications off before. */
export const requestNativePush = () => askNative('push-enable');

const readStorage = (key: string) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (key: string, value: string | null) => {
  try {
    if (null === value) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Private mode or blocked storage: the choice just won't be remembered.
  }
};

export const isNativePushDisabled = () => '1' === readStorage(NATIVE_PUSH_DISABLED_KEY);
export const setNativePushDisabled = (disabled: boolean) =>
  writeStorage(NATIVE_PUSH_DISABLED_KEY, disabled ? '1' : null);

/** The token stored for this user, so sign-out can remove it from the server. */
export const getStoredNativePushToken = () => readStorage(NATIVE_PUSH_TOKEN_KEY);
export const setStoredNativePushToken = (token: string | null) =>
  writeStorage(NATIVE_PUSH_TOKEN_KEY, token);
