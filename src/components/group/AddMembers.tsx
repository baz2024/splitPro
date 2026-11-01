import { UserPlusIcon } from '@heroicons/react/24/solid';
import { type Group, type GroupUser } from '@prisma/client';
import { clsx } from 'clsx';
import { CheckIcon, SendIcon } from 'lucide-react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { toast } from 'sonner';

import { Button } from '~/components/ui/button';
import { AppDrawer } from '~/components/ui/drawer';
import { getInviteErrorToastKey, isInviteSendFailed } from '~/lib/error/invite';
import { getInviteTarget, toInviteFriendInput } from '~/lib/inviteTarget';
import { api } from '~/utils/api';

import { EntityAvatar } from '../ui/avatar';
import { Input } from '../ui/input';

const AddMembers: React.FC<{
  enableSendingInvites: boolean;
  group: (Group & { groupUsers: GroupUser[] }) | null | undefined;
  children: React.ReactNode;
}> = ({ group, children, enableSendingInvites }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [userIds, setUserIds] = useState<Record<number, boolean>>({});
  const [inputValue, setInputValue] = useState('');

  const friendsQuery = api.user.getFriends.useQuery();
  const addMembersMutation = api.group.addMembers.useMutation();
  const addFriendMutation = api.user.inviteFriend.useMutation();

  const utils = api.useUtils();

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

  function onUserSelect(userId: number) {
    setUserIds((prev) => ({ ...prev, [userId]: !prev[userId] }));
  }

  const onSave = useCallback(
    (selectedUserIds: Record<number, boolean>) => {
      const users = [];

      for (const userId of Object.keys(selectedUserIds)) {
        if (selectedUserIds[parseInt(userId)]) {
          users.push(parseInt(userId));
        }
      }

      setInputValue('');

      if (0 === users.length) {
        return;
      }

      addMembersMutation.mutate(
        {
          groupId: group.id,
          userIds: users,
        },
        {
          onSuccess: () => {
            utils.group.getGroupDetails.invalidate({ groupId: group.id }).catch(console.error);
          },
          onError: () => toast.error(t('errors.add_member_failed')),
        },
      );
      setOpen(false);
      setUserIds({});
    },
    [addMembersMutation, group.id, t, utils],
  );

  const inviteTarget = getInviteTarget(inputValue);
  const isValidTarget = 'email' === inviteTarget.kind || 'phone' === inviteTarget.kind;
  const isPhone = 'phone' === inviteTarget.kind;
  const invalidTargetLabel =
    'invalid-phone' === inviteTarget.kind ? t('errors.valid_phone') : t('errors.valid_email');

  function onAddEmailClick(invite = false) {
    if ('email' === inviteTarget.kind || 'phone' === inviteTarget.kind) {
      const target = inviteTarget;
      const addUserToGroup = (user: { id: number }) => onSave({ ...userIds, [user.id]: true });

      addFriendMutation.mutate(toInviteFriendInput(target, invite), {
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
    }
  }

  const handleTriggerClick = useCallback(() => setOpen(true), []);

  const handleActionClick = useCallback(() => onSave(userIds), [onSave, userIds]);

  const handleClose = useCallback(() => setOpen(false), []);

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
        onChange={(e) => setInputValue(e.target.value)}
      />
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
              onClick={() => onAddEmailClick(true)}
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
            onClick={() => onAddEmailClick(false)}
          >
            <UserPlusIcon className="me-2 h-4 w-4" />
            {isValidTarget
              ? t('group_details.no_members.add_members_details.add_to_split_pro')
              : invalidTargetLabel}
          </Button>
        </div>
      </div>
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
