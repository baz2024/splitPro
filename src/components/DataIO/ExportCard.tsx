import { Button } from '@heroui/react';
import { DownloadIcon } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import React, { useState } from 'react';
import { toast } from 'sonner';

import { api } from '~/utils/api';

import { browserTimeZone, saveGzipBase64 } from './transfer';
import {
  Card,
  ChoiceChips,
  DATAIO_NAMESPACES,
  SELECT_CLASS,
  SectionTitle,
  SelectField,
} from './ui';

type ScopeKind = 'all' | 'group' | 'friend';
type RangeKind = 'this_month' | 'last_month' | 'this_year' | 'all' | 'custom';
type FormatKind = 'csv' | 'xlsx';

const parseDateInput = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
};

/** Local-time [from, to) bounds for a preset or custom range; null means open-ended. */
export const rangeBounds = (
  range: RangeKind,
  now: Date,
  custom: { from: string; to: string },
): { from: Date | null; to: Date | null } => {
  const year = now.getFullYear();
  const month = now.getMonth();
  switch (range) {
    case 'this_month':
      return { from: new Date(year, month, 1), to: new Date(year, month + 1, 1) };
    case 'last_month':
      return { from: new Date(year, month - 1, 1), to: new Date(year, month, 1) };
    case 'this_year':
      return { from: new Date(year, 0, 1), to: new Date(year + 1, 0, 1) };
    case 'custom': {
      const from = parseDateInput(custom.from);
      const toDay = parseDateInput(custom.to);
      const to = toDay
        ? new Date(toDay.getFullYear(), toDay.getMonth(), toDay.getDate() + 1)
        : null;
      return { from, to };
    }
    default:
      return { from: null, to: null };
  }
};

export const ExportCard: React.FC = () => {
  const { t, i18n } = useTranslation(DATAIO_NAMESPACES);
  const [scope, setScope] = useState<ScopeKind>('all');
  const [groupId, setGroupId] = useState('');
  const [friendId, setFriendId] = useState('');
  const [range, setRange] = useState<RangeKind>('this_month');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [format, setFormat] = useState<FormatKind>('xlsx');

  const groupsQuery = api.group.getAllGroups.useQuery(undefined, { enabled: 'group' === scope });
  const friendsQuery = api.user.getFriends.useQuery(undefined, { enabled: 'friend' === scope });
  const exportMutation = api.dataio.exportExpenses.useMutation();

  const groups = (groupsQuery.data ?? []).map(({ group }) => group);
  const friends = friendsQuery.data ?? [];

  const scopeInput =
    'group' === scope
      ? '' === groupId
        ? null
        : { type: 'group' as const, groupId: Number(groupId) }
      : 'friend' === scope
        ? '' === friendId
          ? null
          : { type: 'friend' as const, friendId: Number(friendId) }
        : { type: 'all' as const };
  const customIncomplete = 'custom' === range && ('' === custom.from || '' === custom.to);
  const canExport = null !== scopeInput && !customIncomplete && !exportMutation.isPending;

  const onExport = async () => {
    if (!scopeInput) {
      return;
    }
    try {
      const result = await exportMutation.mutateAsync({
        scope: scopeInput,
        ...rangeBounds(range, new Date(), custom),
        format,
        locale: i18n.language,
        timeZone: browserTimeZone(),
      });
      await saveGzipBase64(result.gzipBase64, result.fileName, result.mimeType);
      toast.success(t('export.success', { count: result.rowCount }));
      if (result.truncated) {
        toast.warning(t('export.truncated', { limit: result.rowCount }));
      }
    } catch (error) {
      console.error(error);
      toast.error(t('export.failed'));
    }
  };

  return (
    <section aria-labelledby="dataio-export" className="flex flex-col gap-2">
      <SectionTitle id="dataio-export">{t('export.heading')}</SectionTitle>
      <Card className="flex flex-col gap-5">
        <ChoiceChips
          label={t('export.scope')}
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', label: t('export.scope_all') },
            { value: 'group', label: t('export.scope_group') },
            { value: 'friend', label: t('export.scope_friend') },
          ]}
        />

        {'group' === scope ? (
          0 === groups.length && groupsQuery.isSuccess ? (
            <p className="text-muted text-sm">{t('export.no_projects')}</p>
          ) : (
            <SelectField
              id="dataio-export-group"
              label={t('export.choose_project')}
              value={groupId}
              onChange={setGroupId}
            >
              <option value="">{t('export.pick_placeholder')}</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </SelectField>
          )
        ) : null}

        {'friend' === scope ? (
          0 === friends.length && friendsQuery.isSuccess ? (
            <p className="text-muted text-sm">{t('export.no_friends')}</p>
          ) : (
            <SelectField
              id="dataio-export-friend"
              label={t('export.choose_friend')}
              value={friendId}
              onChange={setFriendId}
            >
              <option value="">{t('export.pick_placeholder')}</option>
              {friends.map((friend) => (
                <option key={friend.id} value={friend.id}>
                  {friend.name ?? friend.email}
                </option>
              ))}
            </SelectField>
          )
        ) : null}

        <ChoiceChips
          label={t('export.range')}
          value={range}
          onChange={setRange}
          options={[
            { value: 'this_month', label: t('export.range_this_month') },
            { value: 'last_month', label: t('export.range_last_month') },
            { value: 'this_year', label: t('export.range_this_year') },
            { value: 'all', label: t('export.range_all') },
            { value: 'custom', label: t('export.range_custom') },
          ]}
        />

        {'custom' === range ? (
          <div className="grid grid-cols-2 gap-3">
            {(['from', 'to'] as const).map((edge) => (
              <div key={edge} className="flex flex-col gap-1.5">
                <label htmlFor={`dataio-export-${edge}`} className="text-muted text-xs font-medium">
                  {t(`export.${edge}`)}
                </label>
                <input
                  id={`dataio-export-${edge}`}
                  type="date"
                  dir="ltr"
                  value={custom[edge]}
                  max={'from' === edge && custom.to ? custom.to : undefined}
                  min={'to' === edge && custom.from ? custom.from : undefined}
                  onChange={(event) =>
                    setCustom((prev) => ({ ...prev, [edge]: event.target.value }))
                  }
                  className={SELECT_CLASS}
                />
              </div>
            ))}
          </div>
        ) : null}

        <ChoiceChips
          label={t('export.format')}
          value={format}
          onChange={setFormat}
          options={[
            { value: 'xlsx', label: t('export.format_xlsx') },
            { value: 'csv', label: t('export.format_csv') },
          ]}
        />

        <Button
          fullWidth
          size="lg"
          className="min-h-13 rounded-full"
          isDisabled={!canExport}
          isPending={exportMutation.isPending}
          onPress={() => {
            onExport().catch(console.error);
          }}
        >
          <DownloadIcon className="size-5" aria-hidden />
          {t('export.download')}
        </Button>
      </Card>
    </section>
  );
};
