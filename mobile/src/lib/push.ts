import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import { t } from './i18n';

// Native push for the web app inside the WebView. The web app asks over the ReactNativeWebView
// bridge (src/utils/nativePush.ts on the web side); the native side owns the OS permission and
// the Expo push token, and hands the token back so the web app can store it for its user.

const PUSH_STATUS_MESSAGE = 'push-status';
const PUSH_ENABLE_MESSAGE = 'push-enable';
/** Name of the DOM event the web app listens for. Keep in sync with src/utils/nativePush.ts. */
const PUSH_STATE_EVENT = 'safi-native-push';

const ANDROID_CHANNEL_ID = 'default';

export type PushRequest = 'status' | 'enable';

export interface PushState {
  status: 'granted' | 'denied' | 'undetermined' | 'unavailable';
  /** False once the OS will no longer show the prompt; only Settings can turn it on then. */
  canAskAgain: boolean;
  token: string | null;
  platform: 'ios' | 'android';
}

// Show banners while the app is open too: a new expense from a teammate is worth seeing.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const parsePushRequest = (data: string): PushRequest | null => {
  try {
    const message = JSON.parse(data) as { type?: unknown };
    if (PUSH_STATUS_MESSAGE === message.type) {
      return 'status';
    }
    if (PUSH_ENABLE_MESSAGE === message.type) {
      return 'enable';
    }
    return null;
  } catch {
    return null;
  }
};

const platform = (): PushState['platform'] => ('android' === Platform.OS ? 'android' : 'ios');

const isGranted = (permissions: Notifications.NotificationPermissionsStatus) =>
  permissions.granted ||
  Notifications.IosAuthorizationStatus.PROVISIONAL === permissions.ios?.status;

// Android 13+ shows the permission prompt only once a channel exists.
const ensureAndroidChannel = async () => {
  if ('android' !== Platform.OS) {
    return;
  }
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: t.notificationChannel,
    importance: Notifications.AndroidImportance.DEFAULT,
  });
};

const projectId = (): string | undefined => {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
};

const readToken = async (): Promise<string | null> => {
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
    return data;
  } catch (error) {
    // No APNs/FCM credentials in this build, or no network. Permission still stands.
    console.warn('Could not get an Expo push token', error);
    return null;
  }
};

const toState = async (
  permissions: Notifications.NotificationPermissionsStatus,
): Promise<PushState> => {
  if (isGranted(permissions)) {
    return { status: 'granted', canAskAgain: true, token: await readToken(), platform: platform() };
  }
  return {
    status: 'undetermined' === permissions.status ? 'undetermined' : 'denied',
    canAskAgain: permissions.canAskAgain,
    token: null,
    platform: platform(),
  };
};

const unavailable = (): PushState => ({
  status: 'unavailable',
  canAskAgain: false,
  token: null,
  platform: platform(),
});

/** Current permission, plus the token when granted. Never shows a prompt. */
export const getPushState = async (): Promise<PushState> => {
  try {
    await ensureAndroidChannel();
    return await toState(await Notifications.getPermissionsAsync());
  } catch (error) {
    console.warn('Could not read notification permission', error);
    return unavailable();
  }
};

/**
 * Asks for permission (the web app has already explained why). If the user turned
 * notifications off earlier and the OS won't ask again, opens Safi's page in Settings instead.
 */
export const enablePush = async (): Promise<PushState> => {
  try {
    await ensureAndroidChannel();
    const current = await Notifications.getPermissionsAsync();
    if (isGranted(current)) {
      return await toState(current);
    }
    if (!current.canAskAgain) {
      await Linking.openSettings();
      return await toState(current);
    }
    return await toState(await Notifications.requestPermissionsAsync());
  } catch (error) {
    console.warn('Could not enable notifications', error);
    return unavailable();
  }
};

/** JavaScript that hands the state to the web app as a DOM event. */
export const pushStateScript = (state: PushState) =>
  `window.dispatchEvent(new CustomEvent(${JSON.stringify(PUSH_STATE_EVENT)}, { detail: ${JSON.stringify(state)} })); true;`;

/**
 * The page a notification should open. Only app-relative paths are accepted, so a payload
 * can never send the WebView to another site.
 */
export const notificationPath = (
  response: Notifications.NotificationResponse | null | undefined,
): string | null => {
  const url: unknown = response?.notification.request.content.data?.url;
  if ('string' !== typeof url || !url.startsWith('/') || url.startsWith('//')) {
    return null;
  }
  return url;
};

/** A notification tapped while the app was closed; read once, then cleared. */
export const takeLaunchNotificationPath = (): string | null => {
  try {
    const path = notificationPath(Notifications.getLastNotificationResponse());
    if (path) {
      Notifications.clearLastNotificationResponse();
    }
    return path;
  } catch {
    return null;
  }
};

/** Calls `onPath` for each notification the user taps while the app is running. */
export const addNotificationTapListener = (onPath: (path: string) => void) => {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const path = notificationPath(response);
    if (!path) {
      return;
    }
    Notifications.clearLastNotificationResponse();
    onPath(path);
  });
  return () => subscription.remove();
};
