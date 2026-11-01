import { Input } from '@heroui/react';
import { useTranslation } from 'next-i18next';
import React, { useState } from 'react';
import { toast } from 'sonner';

import { CurrencyPicker } from '~/components/AddExpense/CurrencyPicker';
import { AppDrawer } from '~/components/ui/drawer';
import { NativeSelect, NativeSelectOption } from '~/components/ui/native-select';
import { type CurrencyCode, isCurrencyCode } from '~/lib/currency';
import { api } from '~/utils/api';

import { isValidCapInput, minorToDecimal } from './capInput';

const MAX_TEXT_LENGTH = 100;

export interface EditableAgentKey {
  id: string;
  name: string;
  agentLabel: string | null;
  model: string | null;
  groupId: number | null;
  monthlyCapAmount: bigint | null;
  capCurrency: string | null;
}

interface AgentKeySheetProps {
  apiKey: EditableAgentKey;
  trigger: React.ReactNode;
  fallbackCurrency?: string | null;
}

/** Sheet to set an agent key's display name, model, project and monthly cap. */
export const AgentKeySheet: React.FC<AgentKeySheetProps> = ({
  apiKey,
  trigger,
  fallbackCurrency,
}) => {
  const { t } = useTranslation('agentcaps');
  const utils = api.useUtils();
  const groupsQuery = api.group.getAllGroups.useQuery();
  const updateMutation = api.agent.updateApiKey.useMutation();

  const initialCurrency: CurrencyCode = isCurrencyCode(apiKey.capCurrency)
    ? apiKey.capCurrency
    : isCurrencyCode(fallbackCurrency)
      ? fallbackCurrency
      : 'USD';

  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [model, setModel] = useState('');
  const [groupId, setGroupId] = useState('');
  const [cap, setCap] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>(initialCurrency);

  const groups = (groupsQuery.data ?? [])
    .map(({ group }) => group)
    .filter((group) => !group.archivedAt || group.id === apiKey.groupId);

  const capValid = isValidCapInput(cap);

  const onOpenChange = (next: boolean) => {
    if (next) {
      setLabel(apiKey.agentLabel ?? '');
      setModel(apiKey.model ?? '');
      setGroupId(null === apiKey.groupId ? '' : String(apiKey.groupId));
      setCurrency(initialCurrency);
      setCap(
        null !== apiKey.monthlyCapAmount && isCurrencyCode(apiKey.capCurrency)
          ? minorToDecimal(apiKey.monthlyCapAmount, apiKey.capCurrency)
          : '',
      );
    }
    setOpen(next);
  };

  const onSave = () => {
    if (!capValid) {
      toast.error(t('sheet.invalid_cap'));
      return;
    }
    const normalizedCap = cap.trim().replace(',', '.');
    updateMutation.mutate(
      {
        id: apiKey.id,
        agentLabel: label,
        model,
        groupId: '' === groupId ? null : Number(groupId),
        cap: '' === normalizedCap ? null : { amount: normalizedCap, currency },
      },
      {
        onSuccess: () => {
          toast.success(t('sheet.saved'));
          setOpen(false);
          Promise.all([utils.agent.listApiKeys.invalidate(), utils.agent.usage.invalidate()]).catch(
            console.error,
          );
        },
        onError: (error) => {
          toast.error(error.message || t('sheet.failed'));
        },
      },
    );
  };

  const fieldId = (name: string) => `agent-key-${apiKey.id}-${name}`;

  return (
    <AppDrawer
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={t('sheet.title')}
      actionTitle={t('sheet.save')}
      actionOnClick={onSave}
      actionDisabled={!capValid || updateMutation.isPending}
      shouldCloseOnAction={false}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <div className="flex flex-col gap-2">
          <label htmlFor={fieldId('label')} className="text-sm font-medium">
            {t('sheet.label')}
          </label>
          <Input
            id={fieldId('label')}
            value={label}
            maxLength={MAX_TEXT_LENGTH}
            placeholder={t('sheet.label_placeholder')}
            onChange={(e) => setLabel(e.target.value)}
            className="min-h-11"
            variant="secondary"
            aria-describedby={fieldId('label-hint')}
          />
          <p id={fieldId('label-hint')} className="text-muted text-xs">
            {t('sheet.label_hint')}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={fieldId('model')} className="text-sm font-medium">
            {t('sheet.model')}
          </label>
          <Input
            id={fieldId('model')}
            dir="ltr"
            value={model}
            maxLength={MAX_TEXT_LENGTH}
            autoComplete="off"
            placeholder={t('sheet.model_placeholder')}
            onChange={(e) => setModel(e.target.value)}
            className="min-h-11"
            variant="secondary"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={fieldId('project')} className="text-sm font-medium">
            {t('sheet.project')}
          </label>
          <NativeSelect
            id={fieldId('project')}
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="min-h-11 w-full"
            aria-describedby={fieldId('project-hint')}
          >
            <NativeSelectOption value="">{t('sheet.project_none')}</NativeSelectOption>
            {groups.map((group) => (
              <NativeSelectOption key={group.id} value={String(group.id)}>
                {group.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <p id={fieldId('project-hint')} className="text-muted text-xs">
            {t('sheet.project_hint')}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={fieldId('cap')} className="text-sm font-medium">
            {t('sheet.cap')}
          </label>
          <div className="flex items-center gap-2">
            <Input
              id={fieldId('cap')}
              inputMode="decimal"
              autoComplete="off"
              dir="ltr"
              placeholder={t('sheet.cap_placeholder')}
              value={cap}
              onChange={(e) => setCap(e.target.value)}
              className="min-h-11 min-w-0 flex-1 text-lg font-semibold"
              variant="secondary"
              aria-invalid={!capValid}
              aria-describedby={fieldId('cap-hint')}
            />
            <CurrencyPicker
              currentCurrency={currency}
              onCurrencyPick={(picked) => {
                if (picked) {
                  setCurrency(picked);
                }
              }}
            />
          </div>
          <p id={fieldId('cap-hint')} className="text-muted text-xs">
            {capValid ? t('sheet.cap_hint') : t('sheet.invalid_cap')}
          </p>
        </div>
      </form>
    </AppDrawer>
  );
};
