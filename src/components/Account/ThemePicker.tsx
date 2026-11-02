import { clsx } from 'clsx';
import { Monitor, Moon, Palette, Sun } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import { useTheme } from 'next-themes';
import React, { useSyncExternalStore } from 'react';

const subscribeNoop = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

const THEME_OPTIONS = [
  { value: 'light', Icon: Sun },
  { value: 'dark', Icon: Moon },
  { value: 'system', Icon: Monitor },
] as const;

/** Light / Dark / System selector for the account page. */
export const ThemePicker: React.FC = () => {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  // The stored theme is only known on the client, so render no selection on the server.
  const mounted = useSyncExternalStore(subscribeNoop, getClientSnapshot, getServerSnapshot);

  const current = mounted ? (theme ?? 'dark') : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="text-md flex items-center gap-4 font-medium">
        <Palette className="text-muted size-5" aria-hidden />
        <span id="theme-picker-label">{t('account.theme.title')}</span>
      </div>
      <div
        role="radiogroup"
        aria-labelledby="theme-picker-label"
        className="bg-default ms-9 flex gap-1 rounded-full p-1"
      >
        {THEME_OPTIONS.map(({ value, Icon }) => {
          const selected = current === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setTheme(value)}
              className={clsx(
                'focus-visible:ring-focus flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none',
                selected
                  ? 'bg-segment text-segment-foreground shadow-surface'
                  : 'text-muted hover:text-foreground',
              )}
            >
              <Icon className="size-4" aria-hidden />
              {t(`account.theme.${value}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
};
