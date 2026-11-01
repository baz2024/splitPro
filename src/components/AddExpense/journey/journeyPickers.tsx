import { type TFunction } from 'next-i18next';
import React from 'react';

import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { CATEGORIES } from '~/lib/category';
import { CURRENCIES, type CurrencyCode, isCurrencyCode } from '~/lib/currency';
import { useCurrencyPreferenceStore } from '~/store/currencyPreferenceStore';

import { GeneralPicker } from '../../GeneralPicker';
import { Button } from '../../ui/button';
import { Calendar } from '../../ui/calendar';
import { CategoryIcon } from '../../ui/categoryIcons';
import { AppDrawer, AppDrawerClose } from '../../ui/drawer';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';

/**
 * Picker sheets with caller-supplied triggers, so the journey's grouped rows ("Category …
 * Hosting") can open them. The sheet contents mirror CategoryPicker / CurrencyPicker.
 */

type CategorySection = keyof typeof CATEGORIES;

const isCategorySection = (value: string): value is CategorySection => value in CATEGORIES;

/** Human label for a stored category (an item key, or a section key for "other"). */
export const categoryLabel = (t: TFunction, category: string): string => {
  if (isCategorySection(category)) {
    return t(`categories_list.${category}.name`, { ns: 'categories' });
  }
  const section = Object.entries(CATEGORIES).find(([, items]) =>
    (items as readonly string[]).includes(category),
  )?.[0];
  return section
    ? t(`categories_list.${section}.items.${category}`, { ns: 'categories' })
    : t(`categories_list.general.name`, { ns: 'categories' });
};

export const CategorySheet: React.FC<{
  category: string;
  onPick: (category: string) => void;
  trigger: React.ReactNode;
}> = ({ category, onPick, trigger }) => {
  const { t } = useTranslationWithUtils(['categories']);

  return (
    <AppDrawer trigger={trigger} title={t('title')} className="h-[70vh]" shouldCloseOnAction>
      {Object.entries(CATEGORIES).map(([section, items]) => (
        <div key={section} className="mb-8">
          <h3 className="mb-4 text-lg font-semibold">{t(`categories_list.${section}.name`)}</h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(75px,1fr))] gap-4">
            {items.map((key: string) => {
              const value = 'other' === key ? section : key;
              return (
                <AppDrawerClose key={key} asChild>
                  <Button
                    variant="ghost"
                    aria-pressed={value === category}
                    className="flex h-[75px] w-[75px] flex-col items-center justify-start gap-1 justify-self-center py-3 text-center aria-pressed:ring-2 aria-pressed:ring-(--accent)"
                    onClick={() => onPick(value)}
                  >
                    <CategoryIcon category={value} className="size-6 shrink-0" aria-hidden />
                    <span className="block text-xs text-wrap">
                      {t(`categories_list.${section}.items.${key}`)}
                    </span>
                  </Button>
                </AppDrawerClose>
              );
            })}
          </div>
        </div>
      ))}
    </AppDrawer>
  );
};

type CurrencyItem = (typeof CURRENCIES)[CurrencyCode];

export const CurrencySheet: React.FC<{
  currency: CurrencyCode;
  onPick: (currency: CurrencyCode) => void;
  trigger: React.ReactNode;
}> = ({ currency, onPick, trigger }) => {
  const { t, getCurrencyName } = useTranslationWithUtils(['currencies']);
  const { recentCurrencies, addToRecentCurrencies } = useCurrencyPreferenceStore();

  const items: CurrencyItem[] = [
    ...recentCurrencies.map((code) => CURRENCIES[code]),
    ...Object.values(CURRENCIES).filter(
      (item) => !isCurrencyCode(item.code) || !recentCurrencies.includes(item.code),
    ),
  ];

  return (
    <GeneralPicker
      trigger={trigger}
      title={t('title')}
      placeholderText={t('placeholder')}
      noOptionsText={t('no_currency_found')}
      onSelect={(value) => {
        if (!isCurrencyCode(value)) {
          return;
        }
        addToRecentCurrencies(value);
        onPick(value);
      }}
      items={items}
      extractValue={(item: CurrencyItem) => item.code}
      extractKey={(item: CurrencyItem) => item.code}
      extractKeywords={(item: CurrencyItem) =>
        isCurrencyCode(item.code) ? [getCurrencyName(item.code)] : []
      }
      selected={(item: CurrencyItem) => item.code === currency}
      render={(item: CurrencyItem) =>
        isCurrencyCode(item.code) ? (
          <>
            <p>{getCurrencyName(item.code)}</p>
            <p className="text-muted">{item.code}</p>
          </>
        ) : null
      }
    />
  );
};

export const DatePopover: React.FC<{
  date: Date;
  onPick: (date: Date) => void;
  trigger: React.ReactNode;
}> = ({ date, onPick, trigger }) => (
  <Popover>
    <PopoverTrigger asChild>{trigger}</PopoverTrigger>
    <PopoverContent className="w-auto p-0">
      <Calendar
        mode="single"
        required
        fixedWeeks
        selected={date}
        onSelect={(next: Date | undefined) => {
          if (next) {
            onPick(next);
          }
        }}
      />
    </PopoverContent>
  </Popover>
);
