import { Bell } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { toast } from 'sonner';

import { useNativePush } from '~/hooks/useNativePush';
import { useAppStore } from '~/store/appStore';
import { api } from '~/utils/api';
import { isNativePushDisabled, useHasNativePush } from '~/utils/nativePush';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';

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

const NOTIFICATION_DISMISSED_TIME = 'notification_dismissed_time';
const NOTIFICATION_DISMISSED_TIME_THRESHOLD = 1000 * 60 * 60 * 24 * 30; // 30 days

const wasDismissedRecently = () => {
  const notificationTime = localStorage.getItem(NOTIFICATION_DISMISSED_TIME);
  return (
    Boolean(notificationTime) &&
    Date.now() - parseInt(notificationTime ?? '0') <= NOTIFICATION_DISMISSED_TIME_THRESHOLD
  );
};

interface EnableNotificationsDialogProps {
  open: boolean;
  onEnable: () => void;
  onRemindLater: () => void;
}

const EnableNotificationsDialog: React.FC<EnableNotificationsDialogProps> = ({
  open,
  onEnable,
  onRemindLater,
}) => {
  const { t } = useTranslation();

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="rounded-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('notifications.enable_title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('notifications.enable_description')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11" onClick={onRemindLater}>
            {t('actions.remind_later')}
          </AlertDialogCancel>
          <AlertDialogAction className="min-h-11" onClick={onEnable}>
            <Bell className="me-1 h-4" />
            {t('notifications.subscribe')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

/**
 * Inside the Safi app: shown once after sign-in (the first time the home page opens) while the
 * OS has not asked yet, so the system prompt only appears after the user chose to subscribe.
 */
const NativeNotificationModal: React.FC = () => {
  const { t } = useTranslation();
  const nativePush = useNativePush();
  // Only mounted on the client inside the app, so storage can be read straight away.
  const [dismissed, setDismissed] = useState(
    () => isNativePushDisabled() || wasDismissedRecently(),
  );

  const onEnable = useCallback(() => {
    setDismissed(true);
    nativePush
      .enable()
      .then((enabled) => {
        if (enabled) {
          toast.success(t('notifications.permission_granted'));
        }
      })
      .catch((e) => {
        toast.error(t('errors.notification_request_failed'));
        console.error(e);
      });
  }, [nativePush, t]);

  const remindLater = useCallback(() => {
    localStorage.setItem(NOTIFICATION_DISMISSED_TIME, Date.now().toString());
    setDismissed(true);
  }, []);

  return (
    <EnableNotificationsDialog
      open={!dismissed && 'undetermined' === nativePush.state?.status}
      onEnable={onEnable}
      onRemindLater={remindLater}
    />
  );
};

export const NotificationModal: React.FC = () => {
  const isNative = useHasNativePush();

  return isNative ? <NativeNotificationModal /> : <WebNotificationModal />;
};

const WebNotificationModal: React.FC = () => {
  const { t } = useTranslation();
  const updatePushSubscription = api.user.updatePushNotification.useMutation();
  const webPushPublicKey = useAppStore((s) => s.webPushPublicKey);

  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if ('undefined' !== typeof window && 'serviceWorker' in navigator) {
      // Run only in browser
      navigator.serviceWorker.ready
        .then((reg) => {
          reg.pushManager
            .getSubscription()
            .then((sub) => {
              if (!sub && !wasDismissedRecently()) {
                setModalOpen(true);
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
        toast.success(t('notifications.permission_granted'));
        navigator.serviceWorker.ready
          .then(async (reg) => {
            if (!webPushPublicKey) {
              return;
            }
            const sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: base64ToUint8Array(webPushPublicKey),
            });

            updatePushSubscription.mutate({ subscription: JSON.stringify(sub) });
          })
          .catch((e) => {
            toast.error(t('errors.notification_subscribe_failed'));
            console.error(e);
          });
        setModalOpen(false);
      }
    } catch (e) {
      toast.error(t('errors.notification_request_failed'));
      console.error(e);
    }
  }

  function remindLater() {
    localStorage.setItem(NOTIFICATION_DISMISSED_TIME, Date.now().toString());
    setModalOpen(false);
  }

  if (!webPushPublicKey) {
    return null;
  }

  return (
    <EnableNotificationsDialog
      open={modalOpen}
      onEnable={() => {
        void onRequestNotification();
      }}
      onRemindLater={remindLater}
    />
  );
};
