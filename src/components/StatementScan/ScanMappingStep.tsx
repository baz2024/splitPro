import { Button } from '@heroui/react';
import { useTranslation } from 'next-i18next';
import React from 'react';

import { CurrencyPicker } from '~/components/AddExpense/CurrencyPicker';
import { ChoiceChips, SelectField } from '~/components/DataIO/ui';
import { isCurrencyCode } from '~/lib/currency';
import { type UploadInspection } from '~/server/dataio/inspect';
import {
  type AmountSign,
  type DateFormat,
  type ImportMapping,
  REQUIRED_IMPORT_FIELDS,
} from '~/server/dataio/types';

import { STATEMENT_SCAN_NAMESPACES } from './types';

/** The import mapping minus the import target: a scan never writes expenses directly. */
export interface ScanMappingState {
  mapping: ImportMapping;
  dateFormat: DateFormat;
  amountSign: AmountSign;
  defaultCurrency: string;
}

/** A scan only reads the date, description, amount and (optionally) currency columns. */
const SCAN_FIELDS = ['date', 'description', 'amount', 'currency'] as const;
const REQUIRED: ReadonlySet<string> = new Set(REQUIRED_IMPORT_FIELDS);

export const isScanMappingComplete = (state: ScanMappingState) =>
  REQUIRED_IMPORT_FIELDS.every((field) => null != state.mapping[field]);

export const mappingFromInspection = (
  inspection: UploadInspection,
  fallbackCurrency: string,
): ScanMappingState => ({
  mapping: inspection.mapping,
  dateFormat: inspection.dateFormat,
  amountSign: inspection.amountSign,
  defaultCurrency: inspection.currency ?? fallbackCurrency,
});

interface ScanMappingStepProps {
  inspection: UploadInspection;
  fileName: string;
  value: ScanMappingState;
  onChange: (value: ScanMappingState) => void;
  onBack: () => void;
  onContinue: () => void;
  isPending: boolean;
}

export const ScanMappingStep: React.FC<ScanMappingStepProps> = ({
  inspection,
  fileName,
  value,
  onChange,
  onBack,
  onContinue,
  isPending,
}) => {
  const { t } = useTranslation(STATEMENT_SCAN_NAMESPACES);
  const update = (patch: Partial<ScanMappingState>) => onChange({ ...value, ...patch });
  const complete = isScanMappingComplete(value);

  const columnOptions = inspection.headers.map((header, index) => ({
    value: String(index),
    label: '' === header ? `#${index + 1}` : header,
  }));
  const sampleFor = (column: number | null | undefined) =>
    null == column
      ? undefined
      : inspection.sample.map((row) => row[column] ?? '').find((cell) => '' !== cell);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <p className="text-foreground text-sm font-semibold">{t('mapping.heading')}</p>
        <p className="text-muted text-sm">{t('mapping.hint')}</p>
      </div>
      <div className="bg-background flex flex-col gap-1 rounded-2xl px-3 py-2.5">
        <p className="text-foreground truncate text-sm font-medium" dir="auto">
          {fileName}
        </p>
        <p className="text-muted text-xs">
          {t('mapping.rows_found', { count: inspection.rowCount })}
        </p>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-muted mb-2 text-xs font-medium">{t('mapping.columns')}</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SCAN_FIELDS.map((field) => (
            <SelectField
              key={field}
              id={`statement-scan-map-${field}`}
              label={
                REQUIRED.has(field)
                  ? `${t(`mapping.fields.${field}`)} · ${t('mapping.required')}`
                  : t(`mapping.fields.${field}`)
              }
              value={null == value.mapping[field] ? '' : String(value.mapping[field])}
              onChange={(column) =>
                update({
                  mapping: { ...value.mapping, [field]: '' === column ? null : Number(column) },
                })
              }
              hint={sampleFor(value.mapping[field])}
            >
              <option value="">{t('mapping.not_mapped')}</option>
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
        label={t('mapping.date_format')}
        value={value.dateFormat}
        onChange={(dateFormat) => update({ dateFormat })}
        options={[
          { value: 'DMY', label: t('mapping.date_dmy') },
          { value: 'MDY', label: t('mapping.date_mdy') },
          { value: 'ISO', label: t('mapping.date_iso') },
        ]}
      />

      <ChoiceChips
        label={t('mapping.amount_sign')}
        value={value.amountSign}
        onChange={(amountSign) => update({ amountSign })}
        options={[
          { value: 'positive', label: t('mapping.sign_positive') },
          { value: 'negative', label: t('mapping.sign_negative') },
        ]}
      />

      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm">{t('mapping.default_currency')}</span>
          <span className="text-muted text-xs">{t('mapping.default_currency_hint')}</span>
        </div>
        <CurrencyPicker
          trigger={
            <Button variant="outline" className="min-h-11 w-[70px] rounded-lg py-2 text-base">
              {isCurrencyCode(value.defaultCurrency) ? value.defaultCurrency : ''}
            </Button>
          }
          currentCurrency={isCurrencyCode(value.defaultCurrency) ? value.defaultCurrency : null}
          onCurrencyPick={(currency) => {
            if (currency) {
              update({ defaultCurrency: currency });
            }
          }}
        />
      </div>

      {!complete ? (
        <p className="text-warning text-xs" role="status">
          {t('mapping.missing_required')}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button variant="ghost" className="min-h-11 rounded-full" onPress={onBack}>
          {t('mapping.back')}
        </Button>
        <Button
          className="min-h-11 flex-1 rounded-full"
          isDisabled={!complete || isPending}
          isPending={isPending}
          onPress={onContinue}
        >
          {isPending ? t('upload.reading') : t('mapping.continue')}
        </Button>
      </div>
    </div>
  );
};
