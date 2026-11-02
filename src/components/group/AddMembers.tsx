import { UserPlusIcon } from '@heroicons/react/24/solid';
import { type Group, type GroupUser } from '@prisma/client';
import { clsx } from 'clsx';
import { CheckIcon, MessageSquareText, SendIcon } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '~/components/ui/button';
import { AppDrawer } from '~/components/ui/drawer';
import { getInviteErrorToastKey, isInviteSendFailed } from '~/lib/error/invite';
import {
  INVITE_EMAIL_SUBJECT,
  buildInviteEmailText,
  buildInviteSmsText,
  buildInviteUrl,
} from '~/lib/inviteMessage';
import { type InviteTarget, getInviteTarget, toInviteFriendInput } from '~/lib/inviteTarget';
import { api } from '~/utils/api';

import { EntityAvatar } from '../ui/avatar';
import { Input } from '../ui/input';

type SendableTarget = Extract<InviteTarget, { kind: 'email' | 'phone' }>;

/** What the invite will say, exactly as the server sends it, for the preview before sending. */
export const invitePreview = (target: SendableTarget, inviterName: string, url: string) =>
  'phone' === target.kind
    ? {
        channel: 'sms' as const,
        to: target.phone,
        subject: null,
        body: buildInviteSmsText(inviterName, url),
      }
    : {
        channel: 'email' as const,
        to: target.email,
        subject: INVITE_EMAIL_SUBJECT,
        body: buildInviteEmailText(inviterName, url),
      };

const AddMembers: React.FC<{
  enableSendingInvites: boolean;
  group: (Group & { groupUsers: GroupUser[] }) | null | undefined;
  children: React.ReactNode;
}> = ({ group, children, enableSendingInvites }) => {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [userIds, setUserIds] = useState<Record<number, boolean>>({});
  const [inputValue, setInputValue] = useState('');
  /** The invite waiting for the user to confirm after reading the preview. */
  const [preview, setPreview] = useState<SendableTarget | null>(null);

  const friendsQuery = api.user.getFriends.useQuery();
  const addMembersMutation = api.group.addMembers.useMutation();
  const addFriendMutation = api.user.inviteFriend.useMutation();

  const utils = api.useUtils();
  const groupId = group?.id;

  const onSave = useCallback(
    (selectedUserIds: Record<number, boolean>) => {
      const users = Object.keys(selectedUserIds)
        .map((userId) => parseInt(userId))
        .filter((userId) => selectedUserIds[userId]);

      setInputValue('');
      setPreview(null);

      if (0 === users.length || undefined === groupId) {
        return;
      }

      addMembersMutation.mutate(
        { groupId, userIds: users },
        {
          onSuccess: () => {
            utils.group.getGroupDetails.invalidate({ groupId }).catch(console.error);
            utils.project.summary.invalidate({ groupId }).catch(console.error);
          },
          onError: () => toast.error(t('errors.add_member_failed')),
        },
      );
      setOpen(false);
      setUserIds({});
    },
    [addMembersMutation, groupId, t, utils],
  );

  const handleTriggerClick = useCallback(() => setOpen(true), []);
  const handleActionClick = useCallback(() => onSave(userIds), [onSave, userIds]);
  const handleClose = useCallback(() => {
    setOpen(false);
    setPreview(null);
  }, []);

  if (!group) {
    return null;
  }

  const groupUserMap = group.groupUsers.reduce<Record<string, boolean>>((acc, gu) => {
    acc[gu.userId] = true;
    return acc;
  }, {});

  const filteredUsers = friendsQuery.data?.filter(
    (friend) =>
      !groupUserMap[friend.id] &&
      (friend.name ?? friend.email)?.toLowerCase().includes(inputValue.toLowerCase()),
  );

  const onUserSelect = (userId: number) =>
    setUserIds((prev) => ({ ...prev, [userId]: !prev[userId] }));

  const inviteTarget = getInviteTarget(inputValue);
  const isValidTarget = 'email' === inviteTarget.kind || 'phone' === inviteTarget.kind;
  const isPhone = 'phone' === inviteTarget.kind;
  const invalidTargetLabel =
    'invalid-phone' === inviteTarget.kind ? t('errors.valid_phone') : t('errors.valid_email');

  const addTarget = (target: SendableTarget, invite: boolean) => {
    const addUserToGroup = (user: { id: number }) => onSave({ ...userIds, [user.id]: true });

    addFriendMutation.mutate(toInviteFriendInput(target, invite, group.id), {
      onSuccess: addUserToGroup,
      onError: (err) => {
        const appErrorCode = err.data?.appErrorCode;
        toast.error(t(getInviteErrorToastKey(appErrorCode)));

        // The friend row already exists whenever this router throws, so retry the group-add.
        if (isInviteSendFailed(appErrorCode)) {
          addFriendMutation.mutate(toInviteFriendInput(target, false), {
            onSuccess: addUserToGroup,
            onError: () => toast.error(t('errors.add_member_failed')),
          });
        }
      },
    });
  };

  const onAddClick = (invite: boolean) => {
    if ('email' !== inviteTarget.kind && 'phone' !== inviteTarget.kind) {
      return;
    }
    if (invite) {
      // Show what will be sent first; sending happens from the preview.
      setPreview(inviteTarget);
      return;
    }
    addTarget(inviteTarget, false);
  };

  const inviterName = session?.user.name ?? session?.user.email ?? '';
  const signInUrl =
    'undefined' === typeof window ? '' : buildInviteUrl(window.location.origin, group.publicId);
  const message = preview ? invitePreview(preview, inviterName, signInUrl) : null;

  return (
    <AppDrawer
      trigger={children}
      onTriggerClick={handleTriggerClick}
      title={t('group_details.no_members.add_members_details.title')}
      leftAction={t('actions.cancel')}
      actionTitle={t('actions.save')}
      actionOnClick={handleActionClick}
      className="h-[85vh]"
      shouldCloseOnAction
      onClose={handleClose}
      onOpenChange={(state) => state !== open && setOpen(state)}
    >
      <Input
        className="mt-8 w-full text-lg"
        placeholder={t('group_details.no_members.add_members_details.placeholder')}
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          setPreview(null);
        }}
      />
      {message && preview ? (
        <section
          aria-labelledby="invite-preview-title"
          className="border-border bg-surface mt-4 flex flex-col gap-3 rounded-2xl border p-4"
        >
          <div className="flex items-center gap-2">
            <MessageSquareText className="text-muted size-4" aria-hidden />
            <h3 id="invite-preview-title" className="text-sm font-semibold">
              {'sms' === message.channel
                ? t('audit_c.invite.preview_sms', { to: message.to })
                : t('audit_c.invite.preview_email', { to: message.to })}
            </h3>
          </div>
          {message.subject ? (
            <p className="text-muted text-xs">
              {t('audit_c.invite.subject', { subject: message.subject })}
            </p>
          ) : null}
          <p
            dir="ltr"
            data-testid="invite-preview-body"
            className="bg-default rounded-xl px-3 py-2.5 text-start text-sm whitespace-pre-line"
          >
            {message.body}
          </p>
          <p className="text-muted text-xs">{t('audit_c.invite.preview_note')}</p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setPreview(null)}>
              {t('actions.back')}
            </Button>
            <Button
              className="flex-1"
              loading={addFriendMutation.isPending}
              disabled={addFriendMutation.isPending}
              onClick={() => addTarget(preview, true)}
            >
              <SendIcon className="me-2 h-4 w-4" />
              {t('audit_c.invite.send')}
            </Button>
          </div>
        </section>
      ) : (
        <div>
          {enableSendingInvites ? (
            <div className="mt-1 text-orange-600">
              {t('group_details.no_members.add_members_details.warning')}
            </div>
          ) : (
            <div>{t('group_details.no_members.add_members_details.note')}</div>
          )}

          <div className="flex justify-center gap-4">
            {enableSendingInvites && (
              <Button
                className="mt-4 w-full text-cyan-500"
                variant="outline"
                disabled={!isValidTarget}
                onClick={() => onAddClick(true)}
              >
                <SendIcon className="me-2 h-4 w-4" />
                {isValidTarget
                  ? isPhone
                    ? t('group_details.no_members.add_members_details.send_invite_sms')
                    : t('group_details.no_members.add_members_details.send_invite')
                  : invalidTargetLabel}
              </Button>
            )}
            <Button
              className="mt-4 w-full text-cyan-500"
              variant="outline"
              disabled={!isValidTarget}
              onClick={() => onAddClick(false)}
            >
              <UserPlusIcon className="me-2 h-4 w-4" />
              {isValidTarget
                ? t('group_details.no_members.add_members_details.add_to_split_pro')
                : invalidTargetLabel}
            </Button>
          </div>
        </div>
      )}
      <div className="mt-4 flex flex-col gap-4">
        {filteredUsers?.map((friend) => (
          <Button
            variant="ghost"
            key={friend.id}
            className="focus:text-foreground flex items-center justify-between px-0"
            onClick={() => onUserSelect(friend.id)}
          >
            <div className={clsx('flex items-center gap-2 rounded-md py-1.5')}>
              <EntityAvatar entity={friend} />
              <p>{friend.name ?? friend.email}</p>
            </div>
            <div>{userIds[friend.id] ? <CheckIcon className="text-primary h-4 w-4" /> : null}</div>
          </Button>
        ))}
      </div>
    </AppDrawer>
  );
};

export default AddMembers;
