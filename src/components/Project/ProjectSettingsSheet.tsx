import { Archive, DoorOpen, Merge, Settings, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/router';
import React, { useState } from 'react';
import { toast } from 'sonner';

import { UpdateName } from '~/components/Account/UpdateDetails';
import { CurrencyPicker } from '~/components/AddExpense/CurrencyPicker';
import { DefaultSplitSettings } from '~/components/DefaultSplit/DefaultSplitSettings';
import { EntityAvatar } from '~/components/ui/avatar';
import { Button } from '~/components/ui/button';
import { AppDrawer } from '~/components/ui/drawer';
import { Switch } from '~/components/ui/switch';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { isCurrencyCode, parseCurrencyCode } from '~/lib/currency';
import { deserializeDefaultSplit } from '~/lib/defaultSplit';
import { cn } from '~/lib/utils';
import { useCurrencyPreferenceStore } from '~/store/currencyPreferenceStore';
import { type RouterOutputs, api } from '~/utils/api';

import { GroupBudgetRow } from './GroupBudgetRow';
import { hasOpenBalances } from './members';

export type GroupDetails = NonNullable<RouterOutputs['group']['getGroupDetails']>;

type Pending = { kind: 'delete' } | { kind: 'leave' } | { kind: 'remove'; userId: number } | null;

const ROUND_ICON_BUTTON =
  'bg-surface border-border text-foreground focus-visible:ring-focus inline-flex size-11 shrink-0 items-center justify-center rounded-full border focus-visible:ring-2 focus-visible:outline-none';

const SECTION_TITLE = 'text-muted text-[11px] font-semibold tracking-wider uppercase';

/**
 * In-sheet confirmation (no browser dialog): says what will happen and offers the destructive
 * action next to Cancel, or only explains why the action is not possible yet.
 */
const InlineConfirm: React.FC<{
  title: string;
  description: string;
  allowed: boolean;
  confirmLabel: string;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ title, description, allowed, confirmLabel, loading, onConfirm, onCancel }) => {
  const { t } = useTranslationWithUtils();
  return (
    <div
      role="alertdialog"
      aria-label={title}
      className="border-danger/40 bg-danger/10 flex flex-col gap-3 rounded-2xl border p-4"
    >
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-muted text-sm">{description}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" onClick={onCancel}>
          {t('actions.cancel')}
        </Button>
        {allowed ? (
          <Button
            variant="destructive"
            size="sm"
            className="flex-1"
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
};

/**
 * Everything the old group page kept behind its info and stats icons, now behind the project's
 * gear: name and photo, members (remove), default currency, budget, default split, simplify
 * debts, archive, totals, and delete (creator) or leave (others).
 */
export const ProjectSettingsSheet: React.FC<{
  group: GroupDetails;
  userId: number;
  onChanged: () => void;
}> = ({ group, userId, onChanged }) => {
  const { t, displayName, toUIDate, getCurrencyHelpersCached } = useTranslationWithUtils();
  const router = useRouter();
  const [pending, setPending] = useState<Pending>(null);
  const setGroupDefaultCurrency = useCurrencyPreferenceStore((s) => s.setGroupDefaultCurrency);

  const totalsQuery = api.group.getGroupTotals.useQuery({ groupId: group.id });
  const deleteMutation = api.group.delete.useMutation();
  const leaveMutation = api.group.leaveGroup.useMutation();
  const archiveMutation = api.group.toggleArchive.useMutation();
  const simplifyMutation = api.group.toggleSimplifyDebts.useMutation();
  const updateMutation = api.group.updateGroupDetails.useMutation();
  const upsertSplitMutation = api.group.upsertDefaultSplit.useMutation();
  const clearSplitMutation = api.group.clearDefaultSplit.useMutation();

  const isCreator = group.userId === userId;
  const isArchived = Boolean(group.archivedAt);
  const balancesOpen = hasOpenBalances(group.groupBalances);
  const canLeave = !hasOpenBalances(group.groupBalances, userId);

  const onError = (error: unknown) => {
    console.error(error);
    toast.error(t('errors.something_went_wrong'));
  };

  const onDelete = () => {
    deleteMutation.mutate(
      { groupId: group.id },
      {
        onSuccess: () => {
          toast.success(t('audit_c.settings.deleted'));
          router.replace('/projects').catch(console.error);
        },
        onError,
      },
    );
  };

  const onLeave = (memberId?: number) => {
    leaveMutation.mutate(
      { groupId: group.id, userId: memberId },
      {
        onSuccess: () => {
          setPending(null);
          if (!memberId) {
            router.replace('/projects').catch(console.error);
            return;
          }
          onChanged();
        },
        onError,
      },
    );
  };

  const onToggleArchive = () => {
    archiveMutation.mutate(
      { groupId: group.id },
      {
        onSuccess: () => {
          toast.success(
            isArchived ? t('audit_c.settings.unarchived') : t('audit_c.settings.archived'),
          );
          onChanged();
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  /* oxlint-disable no-underscore-dangle -- Prisma's generated aggregate API uses `_sum`. */
  const totals = (totalsQuery.data ?? [])
    .filter((total) => null != total._sum.amount)
    .map((total) => getCurrencyHelpersCached(total.currency).toUIString(total._sum.amount ?? 0n));
  /* oxlint-enable no-underscore-dangle */

  return (
    <AppDrawer
      title={t('audit_c.settings.title')}
      className="h-[85vh]"
      trigger={
        <button
          type="button"
          aria-label={t('audit_c.settings.title')}
          className={ROUND_ICON_BUTTON}
        >
          <Settings className="size-5" aria-hidden />
        </button>
      }
    >
      <div className="flex flex-col gap-6 pb-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <EntityAvatar entity={group} size={40} />
            <p className="truncate text-lg font-semibold">{group.name}</p>
          </div>
          <UpdateName
            className="size-5"
            defaultName={group.name}
            defaultImage={group.image ?? null}
            onNameSubmit={async (values) => {
              try {
                await updateMutation.mutateAsync({
                  groupId: group.id,
                  name: values.name,
                  image: values.image,
                });
                toast.success(t('group_details.messages.group_name_updated'), { duration: 1500 });
                onChanged();
              } catch (error) {
                toast.error(t('errors.group_name_update_failed'));
                console.error(error);
              }
            }}
          />
        </div>

        <section className="flex flex-col gap-2">
          <h3 className={SECTION_TITLE}>{t('group_details.group_info.members')}</h3>
          {group.groupUsers.map((groupUser) => {
            const isOwner = groupUser.userId === group.userId;
            const canRemove = !hasOpenBalances(group.groupBalances, groupUser.userId);
            const confirming = 'remove' === pending?.kind && pending.userId === groupUser.userId;
            return (
              <div key={groupUser.userId} className="flex flex-col gap-2">
                <div className="flex min-h-11 items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <EntityAvatar entity={groupUser.user} size={28} />
                    <p className="truncate text-sm">{displayName(groupUser.user, userId)}</p>
                  </div>
                  {isOwner ? (
                    <p className="text-muted text-xs">{t('actors.owner')}</p>
                  ) : isCreator && !isArchived ? (
                    <button
                      type="button"
                      aria-label={t('audit_c.settings.remove_member', {
                        name: displayName(groupUser.user),
                      })}
                      onClick={() => setPending({ kind: 'remove', userId: groupUser.userId })}
                      className="text-danger focus-visible:ring-focus inline-flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-2"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  ) : null}
                </div>
                {confirming ? (
                  <InlineConfirm
                    title={t('group_details.group_info.remove_member_details.title')}
                    description={
                      canRemove
                        ? t('group_details.group_info.remove_member_details.can_remove')
                        : t('group_details.group_info.remove_member_details.cant_remove')
                    }
                    allowed={canRemove}
                    confirmLabel={t('audit_c.settings.remove')}
                    loading={leaveMutation.isPending}
                    onConfirm={() => onLeave(groupUser.userId)}
                    onCancel={() => setPending(null)}
                  />
                ) : null}
              </div>
            );
          })}
        </section>

        <section className="flex flex-col gap-2">
          <h3 className={SECTION_TITLE}>
            {t('group_details.group_info.default_balance_currency')}
          </h3>
          <CurrencyPicker
            currentCurrency={
              group.defaultCurrency && isCurrencyCode(group.defaultCurrency)
                ? parseCurrencyCode(group.defaultCurrency)
                : null
            }
            allowClear
            onCurrencyPick={(currency) => {
              updateMutation.mutate(
                {
                  groupId: group.id,
                  name: group.name,
                  image: group.image,
                  defaultCurrency: currency,
                },
                {
                  onSuccess: () => {
                    toast.success(t('group_details.messages.default_balance_currency_updated'));
                    setGroupDefaultCurrency(group.id, currency);
                    onChanged();
                  },
                  onError: () => toast.error(t('errors.setting_update_failed')),
                },
              );
            }}
          />
          <GroupBudgetRow
            groupId={group.id}
            budget={group.budgetAmount ?? null}
            budgetCurrency={group.budgetCurrency ?? null}
            defaultCurrency={group.defaultCurrency ?? null}
            disabled={isArchived}
          />
        </section>

        <section className="flex flex-col gap-2">
          <h3 className={SECTION_TITLE}>{t('group_details.group_info.default_split')}</h3>
          <div className="flex items-center gap-2">
            <DefaultSplitSettings
              participants={group.groupUsers.map((groupUser) => groupUser.user)}
              defaultSplit={group.defaultSplit}
              triggerLabel={t('group_details.group_info.configure_default_split')}
              disabled={isArchived}
              onSave={(defaultSplit) => {
                upsertSplitMutation.mutate(
                  { groupId: group.id, defaultSplit },
                  {
                    onSuccess: () => {
                      toast.success(t('group_details.messages.default_split_updated'));
                      onChanged();
                    },
                    onError: () => toast.error(t('errors.setting_update_failed')),
                  },
                );
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={
                isArchived ||
                !deserializeDefaultSplit(group.defaultSplit) ||
                clearSplitMutation.isPending
              }
              onClick={() => {
                clearSplitMutation.mutate(
                  { groupId: group.id },
                  {
                    onSuccess: () => {
                      toast.success(t('group_details.messages.default_split_cleared'));
                      onChanged();
                    },
                    onError: () => toast.error(t('errors.setting_update_failed')),
                  },
                );
              }}
            >
              {t('expense_details.clear')}
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-1">
          <h3 className={SECTION_TITLE}>{t('group_details.group_info.actions')}</h3>
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <Merge className="size-4" aria-hidden />
              {t('group_details.group_info.simplify_debts')}
            </span>
            <Switch
              id="project-simplify-debts"
              disabled={isArchived || simplifyMutation.isPending}
              checked={group.simplifyDebts}
              onCheckedChange={() => {
                simplifyMutation.mutate(
                  { groupId: group.id },
                  {
                    onSuccess: onChanged,
                    onError: () => toast.error(t('errors.setting_update_failed')),
                  },
                );
              }}
            />
          </label>
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm">
            <span className="flex flex-col">
              <span className="flex items-center gap-2">
                <Archive className="size-4" aria-hidden />
                {t('group_details.group_info.archive_group')}
              </span>
              {!isCreator ? (
                <span className="text-muted ms-6 text-xs">
                  {t('audit_c.settings.archive_creator_only')}
                </span>
              ) : !isArchived && balancesOpen ? (
                <span className="text-muted ms-6 text-xs">
                  {t('group_details.group_info.archive_group_details.cant_archive')}
                </span>
              ) : null}
            </span>
            <Switch
              id="project-archive"
              checked={isArchived}
              disabled={!isCreator || archiveMutation.isPending || (!isArchived && balancesOpen)}
              onCheckedChange={onToggleArchive}
            />
          </label>
        </section>

        <section className="flex flex-col gap-1 text-sm">
          <h3 className={SECTION_TITLE}>{t('group_details.group_statistics.title')}</h3>
          <div className="flex min-h-9 items-center justify-between gap-3">
            <span className="text-muted">{t('group_details.group_statistics.total_expenses')}</span>
            <span dir="ltr" className="font-medium">
              {0 < totals.length ? totals.join(' + ') : '–'}
            </span>
          </div>
          <div className="flex min-h-9 items-center justify-between gap-3">
            <span className="text-muted">{t('group_details.group_info.group_created')}</span>
            <span className="font-medium">{toUIDate(group.createdAt, { year: true })}</span>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          {isCreator ? (
            <>
              <button
                type="button"
                onClick={() => setPending({ kind: 'delete' })}
                className={cn(
                  'text-danger focus-visible:ring-focus flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium outline-none focus-visible:ring-2',
                )}
              >
                <Trash2 className="size-4" aria-hidden />
                {t('audit_c.settings.delete')}
              </button>
              {'delete' === pending?.kind ? (
                <InlineConfirm
                  title={t('audit_c.settings.delete_title', { name: group.name })}
                  description={
                    balancesOpen
                      ? t('group_details.group_info.delete_group_details.cant_delete')
                      : t('audit_c.settings.delete_description')
                  }
                  allowed={!balancesOpen}
                  confirmLabel={t('audit_c.settings.delete')}
                  loading={deleteMutation.isPending}
                  onConfirm={onDelete}
                  onCancel={() => setPending(null)}
                />
              ) : null}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setPending({ kind: 'leave' })}
                className="text-danger focus-visible:ring-focus flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium outline-none focus-visible:ring-2"
              >
                <DoorOpen className="size-4" aria-hidden />
                {t('group_details.group_info.leave_group')}
              </button>
              {'leave' === pending?.kind ? (
                <InlineConfirm
                  title={t('group_details.group_info.leave_group_details.title')}
                  description={
                    canLeave
                      ? t('group_details.group_info.leave_group_details.can_leave')
                      : t('group_details.group_info.leave_group_details.cant_leave')
                  }
                  allowed={canLeave}
                  confirmLabel={t('group_details.group_info.leave_group')}
                  loading={leaveMutation.isPending}
                  onConfirm={() => onLeave()}
                  onCancel={() => setPending(null)}
                />
              ) : null}
            </>
          )}
        </section>
      </div>
    </AppDrawer>
  );
};
