import { Bell, BellOff, Settings } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useNativePush } from '~/hooks/useNativePush';
import { useAppStore } from '~/store/appStore';
import { api } from '~/utils/api';
import { hasNativePush } from '~/utils/nativePush';
import { useTranslation } from 'next-i18next';

import { AccountButton } from './AccountButton';

const base64ToUint8Array = (base64: string) => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(b64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

/** Inside the Safi app: the OS permission and Expo push token come from the native side. */
const NativeSubscribeNotification: React.FC = () => {
  const { t } = useTranslation();
  const nativePush = useNativePush();
  const [busy, setBusy] = useState(false);

  const onToggle = useCallback(async () => {
    setBusy(true);
    try {
      if (nativePush.enabled) {
        await nativePush.disable();
        return;
      }
      if (nativePush.needsSettings) {
        // Opens Safi in the Settings app; the state refreshes when the user comes back.
        await nativePush.enable();
        return;
      }
      if (await nativePush.enable()) {
        toast.success(t('account.notifications.messages.notification_granted'));
      } else if ('granted' === nativePush.state?.status) {
        toast.error(t('errors.notification_subscribe_failed'));
      }
    } catch (e) {
      console.info(e);
      toast.error(t(nativePush.enabled ? 'errors.unsubscribe_error' : 'errors.request_error'));
    } finally {
      setBusy(false);
    }
  }, [nativePush, t]);

  if (!nativePush.available || !nativePush.state || 'unavailable' === nativePush.state.status) {
    return null;
  }

  return (
    <AccountButton onClick={onToggle} disabled={busy} loading={busy}>
      {nativePush.enabled ? (
        <>
          <BellOff className="text-muted h-5 w-5" />
          {t('account.notifications.disable_notification')}
        </>
      ) : nativePush.needsSettings ? (
        <>
          <Settings className="text-muted h-5 w-5" />
          {t('account.notifications.open_settings')}
        </>
      ) : (
        <>
          <Bell className="text-muted h-5 w-5" />
          {t('account.notifications.enable_notification')}
        </>
      )}
    </AccountButton>
  );
};

export const SubscribeNotification: React.FC = () => {
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    setIsNative(hasNativePush());
  }, []);

  return isNative ? <NativeSubscribeNotification /> : <WebSubscribeNotification />;
};

const WebSubscribeNotification: React.FC = () => {
  const { t } = useTranslation();
  const updatePushSubscription = api.user.updatePushNotification.useMutation();
  const deletePushSubscription = api.user.deletePushNotification.useMutation();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const webPushPublicKey = useAppStore((s) => s.webPushPublicKey);

  useEffect(() => {
    if ('undefined' !== typeof window && 'serviceWorker' in navigator) {
      // Run only in browser
      navigator.serviceWorker.ready
        .then((reg) => {
          reg.pushManager
            .getSubscription()
            .then((sub) => {
              if (sub) {
                setIsSubscribed(true);
              }
            })
            .catch(console.error);
        })
        .catch(console.error);
    }
  }, []);

  async function onRequestNotification() {
    try {
      const result = await Notification.requestPermission();
      if ('granted' === result) {
        toast.success(t('account.notifications.messages.notification_granted'));
        navigator.serviceWorker.ready
          .then(async (reg) => {
            if (!webPushPublicKey) {
              toast.error(t('errors.notification_not_supported'));
              return;
            }

            const sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: base64ToUint8Array(webPushPublicKey),
            });

            setIsSubscribed(true);
            updatePushSubscription.mutate({ subscription: JSON.stringify(sub) });
          })
          .catch((e) => {
            console.info(e);
            toast.error(t('errors.subscribe_error'));
          });
      }
    } catch (e) {
      console.info(e);
      toast.error(t('errors.request_error'));
    }
  }

  async function unSubscribeNotification() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscription.mutateAsync({ subscription: JSON.stringify(sub) });
        await sub.unsubscribe();
        setIsSubscribed(false);
      }
    } catch (e) {
      console.info(e);
      toast.error(t('errors.unsubscribe_error'));
    }
  }

  if (!webPushPublicKey) {
    return null;
  }

  return (
    <AccountButton onClick={isSubscribed ? unSubscribeNotification : onRequestNotification}>
      {!isSubscribed ? (
        <>
          <Bell className="text-muted h-5 w-5" />
          {t('account.notifications.enable_notification')}
        </>
      ) : (
        <>
          <BellOff className="text-muted h-5 w-5" />
          {t('account.notifications.disable_notification')}
        </>
      )}
    </AccountButton>
  );
};
