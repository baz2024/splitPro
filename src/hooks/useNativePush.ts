import { useCallback, useEffect, useState } from 'react';

import { api } from '~/utils/api';
import {
  type NativePushState,
  getNativePushState,
  getStoredNativePushToken,
  isNativePushDisabled,
  requestNativePush,
  setNativePushDisabled,
  setStoredNativePushToken,
  useHasNativePush,
} from '~/utils/nativePush';

/**
 * Notifications inside the Safi iOS/Android app. Keeps the device's Expo push token stored
 * for the signed-in user (tokens can change, and permission can be granted later in Settings),
 * and exposes enable/disable for the account page and the first-run prompt.
 */
export const useNativePush = () => {
  const available = useHasNativePush();
  const [state, setState] = useState<NativePushState | null>(null);
  // Only mounted on the client inside the app, so storage can be read straight away.
  const [disabled, setDisabled] = useState(() => available && isNativePushDisabled());
  const { mutateAsync: registerToken } = api.user.registerNativePushToken.useMutation();
  const { mutateAsync: deleteToken } = api.user.deleteNativePushToken.useMutation();

  const storeToken = useCallback(
    async (next: NativePushState) => {
      if ('granted' !== next.status || !next.token) {
        return false;
      }
      await registerToken({ token: next.token, platform: next.platform });
      setStoredNativePushToken(next.token);
      return true;
    },
    [registerToken],
  );

  const refresh = useCallback(async () => {
    const next = await getNativePushState();
    setState(next);
    if (!isNativePushDisabled()) {
      await storeToken(next);
    }
  }, [storeToken]);

  useEffect(() => {
    // Coming back from Settings (or the background) may have changed the permission.
    const onVisible = () => {
      if (available && 'visible' === document.visibilityState) {
        refresh().catch(console.error);
      }
    };
    onVisible();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [available, refresh]);

  /** Resolves true once this device will receive notifications. */
  const enable = useCallback(async () => {
    const next = await requestNativePush();
    setState(next);
    if ('granted' !== next.status) {
      return false;
    }
    setNativePushDisabled(false);
    setDisabled(false);
    return storeToken(next);
  }, [storeToken]);

  const disable = useCallback(async () => {
    const token = state?.token ?? getStoredNativePushToken();
    if (token) {
      await deleteToken({ token });
    }
    setStoredNativePushToken(null);
    setNativePushDisabled(true);
    setDisabled(true);
  }, [deleteToken, state?.token]);

  return {
    available,
    state,
    enabled: available && 'granted' === state?.status && Boolean(state.token) && !disabled,
    disabled,
    /** Only the Settings app can turn notifications back on. */
    needsSettings: 'denied' === state?.status && !state.canAskAgain,
    enable,
    disable,
  };
};

/** Removes this device's token from the server before signing out of the native app. */
export const useForgetNativePushToken = () => {
  const { mutateAsync: deleteToken } = api.user.deleteNativePushToken.useMutation();

  return useCallback(async () => {
    const token = getStoredNativePushToken();
    if (!token) {
      return;
    }
    await deleteToken({ token }).catch(console.error);
    setStoredNativePushToken(null);
  }, [deleteToken]);
};
