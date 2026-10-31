export interface SupportedLanguage {
  code: string;
  name: string;
}

export const getSupportedLanguages = (): SupportedLanguage[] =>
  [
    { code: 'en', name: 'English' },
    { code: 'fr', name: 'Français' },
    { code: 'de', name: 'Deutsch' },
    { code: 'it', name: 'Italiano' },
    { code: 'cs', name: 'Čeština' },
    { code: 'pl', name: 'Polski' },
    { code: 'nl', name: 'Nederlands' },
    { code: 'pt-BR', name: 'Português (Brasil)' },
    { code: 'pt-PT', name: 'Português (Portugal)' },
    { code: 'es', name: 'Español' },
    { code: 'es-MX', name: 'Español (Mexico)' },
    { code: 'es-AR', name: 'Español (Argentina)' },
    { code: 'id', name: 'Bahasa Indonesia' },
    { code: 'sv', name: 'Svenska' },
    { code: 'hu', name: 'Magyar' },
    { code: 'ar', name: 'العربية' },
  ].sort((a, b) => a.name.localeCompare(b.name));

/** Locales written right-to-left. */
export const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur']);

export const getLocaleDirection = (locale?: string | null): 'rtl' | 'ltr' =>
  locale && RTL_LOCALES.has(locale.split('-')[0] ?? '') ? 'rtl' : 'ltr';
