import { useSyncExternalStore } from 'react';

import { isNativeApp } from '~/utils/nativeApp';

const getSnapshot = (): boolean => {
  try {
    const isIOSStandalone =
      typeof navigator !== 'undefined' && 'standalone' in navigator
        ? !!navigator.standalone
        : false;

    const isDisplayModeStandalone =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)').matches
        : false;

    // The native app is installed already, so it counts as installed for PWA prompts.
    return isIOSStandalone || isDisplayModeStandalone || isNativeApp();
  } catch {
    return false;
  }
};

const subscribe = (callback: () => void): (() => void) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }

  const mediaQuery = window.matchMedia('(display-mode: standalone)');
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', callback);
    return () => mediaQuery.removeEventListener('change', callback);
  }

  mediaQuery.addListener(callback);
  return () => mediaQuery.removeListener(callback);
};

export function useIsPwa(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
