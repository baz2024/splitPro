import { Button, Chip } from '@heroui/react';
import { useTranslation } from 'next-i18next';
import React, { useState } from 'react';
import { toast } from 'sonner';

import { type RouterOutputs, api } from '~/utils/api';

import { BILLING_NAMESPACES, billingErrorText } from './billingErrors';
import { ConnectBillingSheet } from './ConnectBillingSheet';

type BillingConnectionItem = RouterOutputs['billing']['list']['connections'][number];

const ROW_CLASS = 'flex min-h-14 items-center justify-between gap-3 px-4 py-2 text-sm';

const formatSyncedAt = (date: Date, language: string) =>
  new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(date);

const ConnectButton: React.FC<{ label: string; ariaLabel: string; groupId: number | null }> = ({
  label,
  ariaLabel,
  groupId,
}) => (
  <ConnectBillingSheet
    defaultGroupId={groupId}
    trigger={
      <button
        type="button"
        aria-label={ariaLabel}
        className="border-border text-foreground focus-visible:ring-focus inline-flex min-h-9 items-center rounded-full border px-4 text-xs font-semibold focus-visible:ring-2 focus-visible:outline-none"
      >
        {label}
      </button>
    }
  />
);

/** One connected billing account: status, target project, sync now and disconnect. */
const ConnectionRow: React.FC<{ connection: BillingConnectionItem }> = ({ connection }) => {
  const { t, i18n } = useTranslation(BILLING_NAMESPACES);
  const utils = api.useUtils();
  const [confirming, setConfirming] = useState(false);
  const syncNow = api.billing.syncNow.useMutation();
  const disconnect = api.billing.disconnect.useMutation();
  const service = t('provider.vercel');
  const hasError = 'error' === connection.status;

  const refresh = () => {
    void utils.billing.list.invalidate();
    void utils.agent.usage.invalidate();
    void utils.subscriptions.invalidate();
  };

  const onSync = () => {
    syncNow.mutate(
      { id: connection.id },
      {
        onSuccess: (result) => {
          if (result.ok) {
            toast.success(t('row.sync_done', { count: result.created + result.updated }));
          } else {
            toast.error(t('row.error', { reason: billingErrorText(t, result.error) }));
          }
          refresh();
        },
        onError: (error) => toast.error(billingErrorText(t, error.message)),
      },
    );
  };

  const onDisconnect = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    disconnect.mutate(
      { id: connection.id },
      {
        onSuccess: () => {
          toast.success(t('row.disconnected'));
          refresh();
        },
        onError: (error) => toast.error(billingErrorText(t, error.message)),
        onSettled: () => setConfirming(false),
      },
    );
  };

  const statusText = hasError
    ? t('row.error', { reason: billingErrorText(t, connection.lastError) })
    : connection.lastSyncedAt
      ? t('row.synced', { time: formatSyncedAt(connection.lastSyncedAt, i18n.language) })
      : t('row.never_synced');
  const target = connection.groupName
    ? t('row.project', { project: connection.groupName })
    : t('row.personal');

  return (
    <li className="flex flex-col gap-2 px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <span>{service}</span>
          <span className="text-muted truncate text-xs" dir="auto">
            {target} · <span dir="ltr">{t('row.token', { last4: connection.tokenLast4 })}</span>
          </span>
        </span>
        <span className={hasError ? 'text-danger text-xs' : 'text-success text-xs'}>
          {hasError ? t('row.status_error') : t('row.status_connected')}
        </span>
      </div>
      <p className={hasError ? 'text-danger text-xs' : 'text-muted text-xs'} role="status">
        {statusText}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {hasError ? (
          <ConnectButton
            label={t('row.reconnect')}
            ariaLabel={t('connect_label', { service })}
            groupId={connection.groupId}
          />
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="min-h-9 rounded-full"
            isDisabled={syncNow.isPending}
            onPress={onSync}
          >
            {syncNow.isPending ? t('row.syncing') : t('row.sync_now')}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="text-danger min-h-9 rounded-full"
          isDisabled={disconnect.isPending}
          aria-label={confirming ? undefined : t('row.disconnect_label', { service })}
          onPress={onDisconnect}
        >
          {confirming ? t('row.disconnect_confirm') : t('row.disconnect')}
        </Button>
        {confirming ? (
          <Button
            size="sm"
            variant="ghost"
            className="min-h-9 rounded-full"
            onPress={() => setConfirming(false)}
          >
            {t('row.cancel')}
          </Button>
        ) : null}
      </div>
      {confirming ? <p className="text-muted text-xs">{t('row.disconnect_hint')}</p> : null}
    </li>
  );
};

/**
 * Billing rows for the "Connected" list on /agents: one row per Vercel connection, or a Connect
 * row. Without INTEGRATION_ENCRYPTION_KEY on the server, Vercel shows as "Soon".
 */
export const BillingConnectedRows: React.FC<{ projectId: number | null }> = ({ projectId }) => {
  const { t } = useTranslation(BILLING_NAMESPACES);
  const listQuery = api.billing.list.useQuery();
  const service = t('provider.vercel');
  const connections = listQuery.data?.connections.filter((c) => 'VERCEL' === c.provider) ?? [];

  if (listQuery.isPending) {
    return (
      <li className={ROW_CLASS} aria-busy="true">
        <span>{service}</span>
        <span className="bg-border h-9 w-20 animate-pulse rounded-full" />
      </li>
    );
  }

  if (!listQuery.data?.enabled && 0 === connections.length) {
    return (
      <li className={ROW_CLASS}>
        <span>{service}</span>
        <div className="flex items-center gap-2">
          <Chip size="sm" variant="soft">
            {t('soon')}
          </Chip>
          <Button
            size="sm"
            variant="outline"
            isDisabled
            aria-label={t('connect_soon_label', { service })}
            className="min-h-9 rounded-full"
          >
            {t('connect')}
          </Button>
        </div>
      </li>
    );
  }

  if (0 === connections.length) {
    return (
      <li className={ROW_CLASS}>
        <span>{service}</span>
        <ConnectButton
          label={t('connect')}
          ariaLabel={t('connect_label', { service })}
          groupId={projectId}
        />
      </li>
    );
  }

  return (
    <>
      {connections.map((connection) => (
        <ConnectionRow key={connection.id} connection={connection} />
      ))}
    </>
  );
};
