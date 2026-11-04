import { Check, Download, HandCoins, Share, Upload, UserPlus } from 'lucide-react';
import Link from 'next/link';
import React, { useState } from 'react';
import { toast } from 'sonner';

import { browserTimeZone, saveGzipBase64 } from '~/components/DataIO/transfer';
import { BalanceList } from '~/components/Expense/BalanceList';
import AddMembers from '~/components/group/AddMembers';
import { EntityAvatar } from '~/components/ui/avatar';
import { AppDrawer } from '~/components/ui/drawer';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { cn } from '~/lib/utils';
import { api } from '~/utils/api';
import { BigMath } from '~/utils/numbers';

import { isolateLtr } from './format';
import { hasOpenBalances, memberBalances } from './members';
import { type GroupDetails } from './ProjectSettingsSheet';

const CHIP =
  'focus-visible:ring-focus inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-2 disabled:opacity-50';
const CHIP_PRIMARY = cn(CHIP, 'bg-accent text-accent-foreground');
const CHIP_SECONDARY = cn(CHIP, 'bg-surface border-border text-foreground border');

/**
 * The group page's essential actions on the project page: a Splitwise-style row of chips
 * (Settle up first), then "Members · N" with each member's owes / is owed position.
 */
export const ProjectMembers: React.FC<{
  group: GroupDetails;
  userId: number;
  enableSendingInvites: boolean;
}> = ({ group, userId, enableSendingInvites }) => {
  const { t, i18n, displayName, getCurrencyHelpersCached } = useTranslationWithUtils();
  const [isInviteCopied, setIsInviteCopied] = useState(false);
  const exportMutation = api.dataio.exportExpenses.useMutation();

  const isArchived = Boolean(group.archivedAt);
  const users = group.groupUsers.map((groupUser) => groupUser.user);
  const positions = memberBalances(
    group.groupBalances,
    users.map((user) => user.id),
  );
  const needsSettling = hasOpenBalances(group.groupBalances);

  const shareInvite = async () => {
    const inviteLink = `${window.location.origin}/join-group?groupId=${group.publicId}`;
    if (navigator.share) {
      navigator
        .share({
          title: `${t('invite_message.join_to')} ${group.name} ${t('invite_message.in_splitpro')}`,
          text: t('invite_message.text'),
          url: inviteLink,
        })
        .catch((error) => console.error('Error sharing', error));
      return;
    }
    await navigator.clipboard.writeText(inviteLink);
    setIsInviteCopied(true);
    setTimeout(() => setIsInviteCopied(false), 2000);
  };

  const onExport = async () => {
    try {
      const result = await exportMutation.mutateAsync({
        scope: { type: 'group', groupId: group.id },
        from: null,
        to: null,
        format: 'csv',
        locale: i18n.language,
        timeZone: browserTimeZone(),
      });
      await saveGzipBase64(result.gzipBase64, result.fileName, result.mimeType);
      toast.success(t('audit_c.members.exported', { count: result.rowCount }));
    } catch (error) {
      console.error(error);
      toast.error(t('audit_c.members.export_failed'));
    }
  };

  const positionText = (memberId: number) => {
    const list = positions.get(memberId) ?? [];
    const [first, ...rest] = list;
    if (!first) {
      return { text: t('audit_c.members.settled'), tone: 'text-muted' };
    }
    const amount = isolateLtr(
      getCurrencyHelpersCached(first.currency).toUIString(BigMath.abs(first.amount)),
    );
    const isYou = memberId === userId;
    const key =
      0n < first.amount
        ? isYou
          ? 'audit_c.members.you_are_owed'
          : 'audit_c.members.is_owed'
        : isYou
          ? 'audit_c.members.you_owe'
          : 'audit_c.members.owes';
    return {
      text: t(key, { amount, count: rest.length }),
      tone: 0n < first.amount ? 'text-success' : 'text-danger',
    };
  };

  return (
    <section id="project-members" className="mt-5 flex flex-col gap-3" aria-labelledby="pm-title">
      {/* Wraps instead of scrolling sideways, so no action is cut off on a 375px screen. */}
      <div className="flex flex-wrap gap-2">
        <AppDrawer
          title={t('audit_c.members.settle_up')}
          className="h-[85vh]"
          trigger={
            <button type="button" className={CHIP_PRIMARY} disabled={isArchived}>
              <HandCoins className="size-4" aria-hidden />
              {t('audit_c.members.settle_up')}
            </button>
          }
        >
          {needsSettling ? (
            <BalanceList groupBalances={group.groupBalances} users={users} />
          ) : (
            <p className="text-muted py-6 text-center text-sm">
              {t('audit_c.members.all_settled')}
            </p>
          )}
        </AppDrawer>
        <AddMembers group={group} enableSendingInvites={enableSendingInvites}>
          <button type="button" className={CHIP_SECONDARY} disabled={isArchived}>
            <UserPlus className="size-4" aria-hidden />
            {t('group_details.add_members')}
          </button>
        </AddMembers>
        <button
          type="button"
          className={CHIP_SECONDARY}
          onClick={() => {
            shareInvite().catch(console.error);
          }}
          disabled={isArchived}
        >
          {isInviteCopied ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <Share className="size-4" aria-hidden />
          )}
          {isInviteCopied ? t('group_details.copied') : t('audit_c.members.invite_link')}
        </button>
        <button
          type="button"
          className={CHIP_SECONDARY}
          onClick={() => {
            onExport().catch(console.error);
          }}
          disabled={exportMutation.isPending}
        >
          <Download className="size-4" aria-hidden />
          {t('actions.export')}
        </button>
        {isArchived ? null : (
          <Link href={`/data?groupId=${group.id}`} className={CHIP_SECONDARY}>
            <Upload className="size-4" aria-hidden />
            {t('actions.import')}
          </Link>
        )}
      </div>

      <div className="flex items-baseline justify-between">
        <h2 id="pm-title" className="text-base font-semibold">
          {t('audit_c.members.title', { count: users.length })}
        </h2>
      </div>
      <ul className="bg-surface border-border flex flex-col rounded-[16px] border">
        {users.map((member) => {
          const position = positionText(member.id);
          return (
            <li
              key={member.id}
              className="border-border flex min-h-14 items-center justify-between gap-3 border-b px-4 py-2.5 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <EntityAvatar entity={member} size={32} />
                <span className="truncate text-sm font-medium">
                  {displayName(member, userId)}
                  {member.id === group.userId ? (
                    <span className="text-muted ms-1.5 text-xs font-normal">
                      {t('actors.owner')}
                    </span>
                  ) : null}
                </span>
              </div>
              <span className={cn('shrink-0 text-end text-[13px]', position.tone)}>
                {position.text}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
