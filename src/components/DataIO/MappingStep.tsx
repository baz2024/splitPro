import { Button } from '@heroui/react';
import { useTranslation } from 'next-i18next';
import React from 'react';

import { CurrencyPicker } from '~/components/AddExpense/CurrencyPicker';
import { isCurrencyCode } from '~/lib/currency';
import {
  type AmountSign,
  type DateFormat,
  IMPORT_FIELDS,
  type ImportField,
  type ImportMapping,
  REQUIRED_IMPORT_FIELDS,
} from '~/server/dataio/types';
import { api } from '~/utils/api';

import { type Inspection } from './ImportFlow';
import { ChoiceChips, DATAIO_NAMESPACES, SelectField } from './ui';

export interface MappingState {
  mapping: ImportMapping;
  dateFormat: DateFormat;
  amountSign: AmountSign;
  defaultCurrency: string;
  targetType: 'personal' | 'group';
  groupId: number | null;
  split: 'equal' | 'me';
}

const REQUIRED: ReadonlySet<ImportField> = new Set(REQUIRED_IMPORT_FIELDS);

export const isMappingComplete = (state: MappingState) =>
  REQUIRED_IMPORT_FIELDS.every((field) => null != state.mapping[field]) &&
  ('personal' === state.targetType || null !== state.groupId);

interface MappingStepProps {
  inspection: Inspection;
  fileName: string;
  value: MappingState;
  onChange: (value: MappingState) => void;
  onBack: () => void;
  onContinue: () => void;
  isPending: boolean;
}

export const MappingStep: React.FC<MappingStepProps> = ({
  inspection,
  fileName,
  value,
  onChange,
  onBack,
  onContinue,
  isPending,
}) => {
  const { t } = useTranslation(DATAIO_NAMESPACES);
  const groupsQuery = api.group.getAllGroups.useQuery();
  const groups = (groupsQuery.data ?? [])
    .map(({ group }) => group)
    .filter((group) => null === group.archivedAt);

  const update = (patch: Partial<MappingState>) => onChange({ ...value, ...patch });
  const setColumn = (field: ImportField, column: string) =>
    update({ mapping: { ...value.mapping, [field]: '' === column ? null : Number(column) } });

  const sampleFor = (column: number | null | undefined) =>
    null === column || undefined === column
      ? undefined
      : inspection.sample.map((row) => row[column] ?? '').find((cell) => '' !== cell);

  const complete = isMappingComplete(value);
  const columnOptions = inspection.headers.map((header, index) => ({
    value: String(index),
    label: '' === header ? `#${index + 1}` : header,
  }));

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-background flex flex-col gap-1 rounded-2xl px-3 py-2.5">
        <p className="text-foreground truncate text-sm font-medium" dir="auto">
          {fileName}
        </p>
        <p className="text-muted text-xs">
          {t('import.detected', { format: inspection.format })} ·{' '}
          {t('import.rows_found', { count: inspection.rowCount })}
        </p>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-muted mb-2 text-xs font-medium">
          {t('import.columns_heading')}
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {IMPORT_FIELDS.map((field) => (
            <SelectField
              key={field}
              id={`dataio-map-${field}`}
              label={
                REQUIRED.has(field)
                  ? `${t(`import.fields.${field}`)} · ${t('import.required')}`
                  : t(`import.fields.${field}`)
              }
              value={null == value.mapping[field] ? '' : String(value.mapping[field])}
              onChange={(column) => setColumn(field, column)}
              hint={sampleFor(value.mapping[field])}
            >
              <option value="">{t('import.not_mapped')}</option>
              {columnOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          ))}
        </div>
      </fieldset>

      <ChoiceChips
        label={t('import.date_format')}
        value={value.dateFormat}
        onChange={(dateFormat) => update({ dateFormat })}
        options={[
          { value: 'DMY', label: t('import.date_dmy') },
          { value: 'MDY', label: t('import.date_mdy') },
          { value: 'ISO', label: t('import.date_iso') },
        ]}
      />

      <ChoiceChips
        label={t('import.amount_sign')}
        value={value.amountSign}
        onChange={(amountSign) => update({ amountSign })}
        options={[
          { value: 'positive', label: t('import.sign_positive') },
          { value: 'negative', label: t('import.sign_negative') },
        ]}
      />

      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm">{t('import.default_currency')}</span>
          <span className="text-muted text-xs">{t('import.default_currency_hint')}</span>
        </div>
        <CurrencyPicker
          currentCurrency={isCurrencyCode(value.defaultCurrency) ? value.defaultCurrency : null}
          onCurrencyPick={(currency) => {
            if (currency) {
              update({ defaultCurrency: currency });
            }
          }}
        />
      </div>

      <ChoiceChips
        label={t('import.target')}
        value={value.targetType}
        onChange={(targetType) => update({ targetType })}
        options={[
          { value: 'personal', label: t('import.target_personal') },
          { value: 'group', label: t('import.target_group') },
        ]}
      />

      {'group' === value.targetType ? (
        <>
          {0 === groups.length && groupsQuery.isSuccess ? (
            <p className="text-muted text-sm">{t('export.no_projects')}</p>
          ) : (
            <SelectField
              id="dataio-import-group"
              label={t('export.choose_project')}
              value={null === value.groupId ? '' : String(value.groupId)}
              onChange={(groupId) => update({ groupId: '' === groupId ? null : Number(groupId) })}
            >
              <option value="">{t('export.pick_placeholder')}</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </SelectField>
          )}
          <ChoiceChips
            label={t('import.split')}
            value={value.split}
            onChange={(split) => update({ split })}
            options={[
              { value: 'equal', label: t('import.split_equal') },
              { value: 'me', label: t('import.split_me') },
            ]}
          />
        </>
      ) : null}

      <p className="text-muted text-xs">{t('import.paid_by_me')}</p>
      {!complete ? (
        <p className="text-warning text-xs" role="status">
          {t('import.missing_required')}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button variant="ghost" className="min-h-11 rounded-full" onPress={onBack}>
          {t('import.back_step')}
        </Button>
        <Button
          className="min-h-11 flex-1 rounded-full"
          isDisabled={!complete || isPending}
          isPending={isPending}
          onPress={onContinue}
        >
          {t('import.continue')}
        </Button>
      </div>
    </div>
  );
};
