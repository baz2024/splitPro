import { Chip, Input } from '@heroui/react';
import { ExternalLinkIcon, LockIcon } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import React, { useState } from 'react';
import { toast } from 'sonner';

import { AppDrawer } from '~/components/ui/drawer';
import { NativeSelect, NativeSelectOption } from '~/components/ui/native-select';
import { api } from '~/utils/api';

import {
  BILLING_NAMESPACES,
  billingErrorText,
  isPlausibleTeamId,
  isPlausibleToken,
} from './billingErrors';

/** Kept in sync with VERCEL_TOKENS_URL on the server (not imported to keep server code out). */
const VERCEL_TOKENS_URL = 'https://vercel.com/account/tokens';
const TOKEN_HINT_ID = 'billing-token-hint';
const TEAM_HINT_ID = 'billing-team-hint';

interface ConnectBillingSheetProps {
  /** Element rendered as the sheet trigger; must be a single focusable element. */
  trigger: React.ReactNode;
  /** Project preselected in the picker. */
  defaultGroupId?: number | null;
}

/** Sheet to connect Vercel billing with a pasted access token. Supabase is listed as "Soon". */
export const ConnectBillingSheet: React.FC<ConnectBillingSheetProps> = ({
  trigger,
  defaultGroupId = null,
}) => {
  const { t } = useTranslation(BILLING_NAMESPACES);
  const utils = api.useUtils();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const [teamId, setTeamId] = useState('');
  const [groupId, setGroupId] = useState<number | null>(defaultGroupId);
  const [error, setError] = useState<string | null>(null);

  const groupsQuery = api.group.getAllGroups.useQuery(undefined, { enabled: open });
  const projects = (groupsQuery.data ?? [])
    .map((membership) => membership.group)
    .filter((group) => !group.archivedAt)
    .sort((a, b) => a.name.localeCompare(b.name));

  const connect = api.billing.connect.useMutation();
  const isValid = isPlausibleToken(token) && isPlausibleTeamId(teamId);

  const onOpenChange = (next: boolean) => {
    if (next) {
      setToken('');
      setTeamId('');
      setGroupId(defaultGroupId);
      setError(null);
    }
    setOpen(next);
  };

  const onSubmit = () => {
    if (!isValid || connect.isPending) {
      return;
    }
    setError(null);
    connect.mutate(
      { provider: 'VERCEL', token: token.trim(), teamId: teamId.trim() || null, groupId },
      {
        onSuccess: ({ sync }) => {
          setToken('');
          setOpen(false);
          if (sync.ok) {
            toast.success(t('sheet.connected_synced', { count: sync.created + sync.updated }));
          } else {
            toast.warning(
              t('sheet.connected_sync_failed', { reason: billingErrorText(t, sync.error) }),
            );
          }
          void utils.billing.list.invalidate();
          void utils.agent.usage.invalidate();
          void utils.subscriptions.invalidate();
        },
        onError: (mutationError) => {
          setError(billingErrorText(t, mutationError.message));
        },
      },
    );
  };

  return (
    <AppDrawer
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={t('sheet.title')}
      actionTitle={connect.isPending ? t('sheet.connecting') : t('sheet.submit')}
      actionOnClick={onSubmit}
      actionDisabled={!isValid || connect.isPending}
      shouldCloseOnAction={false}
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">{t('sheet.provider_label')}</legend>
          <label className="border-accent bg-surface flex min-h-12 items-center gap-3 rounded-xl border px-3">
            <input type="radio" name="billing-provider" value="VERCEL" checked readOnly />
            <span className="flex-1 text-sm font-medium">{t('provider.vercel')}</span>
          </label>
          <div
            className="border-border flex min-h-12 items-center gap-3 rounded-xl border border-dashed px-3 opacity-70"
            aria-disabled="true"
          >
            <input
              type="radio"
              name="billing-provider"
              value="SUPABASE"
              disabled
              aria-label={t('provider.supabase')}
            />
            <span className="flex min-w-0 flex-1 flex-col py-2">
              <span className="text-sm font-medium">{t('provider.supabase')}</span>
              <span className="text-muted text-xs">{t('sheet.supabase_soon')}</span>
            </span>
            <Chip size="sm" variant="soft" className="shrink-0">
              {t('soon')}
            </Chip>
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <label htmlFor="billing-token" className="text-sm font-medium">
            {t('sheet.token_label')}
          </label>
          <Input
            id="billing-token"
            type="password"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            dir="ltr"
            placeholder={t('sheet.token_placeholder')}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="min-h-11"
            variant="secondary"
            aria-describedby={TOKEN_HINT_ID}
            aria-invalid={null !== error || undefined}
          />
          <div id={TOKEN_HINT_ID} className="text-muted flex flex-col gap-1.5 text-xs">
            <ol className="list-decimal ps-4">
              <li>{t('sheet.token_help_1')}</li>
              <li>{t('sheet.token_help_2')}</li>
              <li>{t('sheet.token_help_3')}</li>
            </ol>
            <p>{t('sheet.token_role')}</p>
          </div>
          <a
            href={VERCEL_TOKENS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent focus-visible:ring-focus inline-flex min-h-11 items-center gap-1.5 self-start rounded-lg text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none"
          >
            {t('sheet.token_link')}
            <ExternalLinkIcon className="size-4 rtl:-scale-x-100" aria-hidden />
          </a>
        </div>

        <details className="group">
          <summary className="text-muted focus-visible:ring-focus min-h-11 cursor-pointer rounded-lg py-2 text-sm focus-visible:ring-2 focus-visible:outline-none">
            {t('sheet.team_toggle')}
          </summary>
          <div className="flex flex-col gap-2 pt-2">
            <label htmlFor="billing-team" className="text-sm font-medium">
              {t('sheet.team_label')}
            </label>
            <Input
              id="billing-team"
              autoComplete="off"
              spellCheck={false}
              dir="ltr"
              placeholder="team_…"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="min-h-11"
              variant="secondary"
              aria-describedby={TEAM_HINT_ID}
            />
            <p id={TEAM_HINT_ID} className="text-muted text-xs">
              {t('sheet.team_hint')}
            </p>
          </div>
        </details>

        <div className="flex flex-col gap-2">
          <label htmlFor="billing-project" className="text-sm font-medium">
            {t('sheet.project_label')}
          </label>
          <NativeSelect
            id="billing-project"
            className="min-h-11 w-full"
            value={null === groupId ? '' : String(groupId)}
            onChange={(e) => setGroupId('' === e.target.value ? null : Number(e.target.value))}
          >
            <NativeSelectOption value="">{t('sheet.project_personal')}</NativeSelectOption>
            {null !== groupId && !projects.some((p) => p.id === groupId) ? (
              <NativeSelectOption value={String(groupId)}>
                {t('sheet.project_current')}
              </NativeSelectOption>
            ) : null}
            {projects.map((project) => (
              <NativeSelectOption key={project.id} value={String(project.id)}>
                {project.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <p className="text-muted text-xs">{t('sheet.usd_note')}</p>
        </div>

        <p className="text-muted flex items-start gap-2 text-xs">
          <LockIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{t('sheet.security')}</span>
        </p>

        {error ? (
          <p role="alert" className="text-danger text-sm">
            {error}
          </p>
        ) : null}

        {/* Lets Enter submit the form; the visible action lives in the sheet header. */}
        <button type="submit" className="sr-only" tabIndex={-1} disabled={!isValid}>
          {t('sheet.submit')}
        </button>
      </form>
    </AppDrawer>
  );
};
