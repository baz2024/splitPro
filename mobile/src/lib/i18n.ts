import { I18nManager, NativeModules, type TextStyle, type ViewStyle } from 'react-native';

// Tiny in-house i18n for the native screens. No native dependency: the device language comes
// from Intl (Hermes) with a NativeModules fallback. The web app handles its own translations.

export type AppLanguage = 'en' | 'ar';

const toLanguage = (locale: string | undefined | null): AppLanguage | null => {
  if (!locale || 'und' === locale) {
    return null;
  }
  const primary = (locale.split(/[-_]/)[0] ?? '').toLowerCase();
  if ('' === primary) {
    return null;
  }
  return 'ar' === primary ? 'ar' : 'en';
};

const readIntlLocale = (): string | undefined => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
};

interface NativeLocaleModules {
  SettingsManager?: { settings?: { AppleLocale?: string; AppleLanguages?: string[] } };
  I18nManager?: { localeIdentifier?: string };
}

const readNativeLocale = (): string | undefined => {
  try {
    const modules = NativeModules as NativeLocaleModules;
    const settings = modules.SettingsManager?.settings;
    return (
      settings?.AppleLanguages?.[0] ??
      settings?.AppleLocale ??
      modules.I18nManager?.localeIdentifier ??
      undefined
    );
  } catch {
    return undefined;
  }
};

export const detectLanguage = (): AppLanguage =>
  toLanguage(readIntlLocale()) ?? toLanguage(readNativeLocale()) ?? 'en';

export const LANGUAGE: AppLanguage = detectLanguage();
export const isArabic = 'ar' === LANGUAGE;

// Keeps a Latin-script run (phone number, brand) in the right order inside Arabic text.
const isolateLtr = (value: string) => `⁦${value}⁩`;

const en = {
  // Welcome
  headline: 'Every receipt, subscription and API cost — against your project budget',
  subhead: 'Scan, split and settle with your team. Your budget stays in sync.',
  continueWithGoogle: 'Continue with Google',
  continueWithPhone: 'Continue with phone',
  useEmailInstead: 'Use email instead',
  genericError: 'Something went wrong. Please try again.',
  terms: 'Terms',
  privacy: 'Privacy',
  termsLabel: 'Terms of Service',
  privacyLabel: 'Privacy Policy',
  // Phone
  back: 'Back',
  backChevron: '‹ Back',
  numberTitle: "What's your number?",
  numberSubtitle: "We'll text you a 6-digit code to sign in.",
  countryCode: 'Country code',
  phoneNumber: 'Phone number',
  codeTitle: 'Enter the code',
  sentTo: (phone: string) => `Sent to ${phone}`,
  codeLabel: '6-digit code',
  resendIn: (seconds: number) => `Resend code in ${seconds}s`,
  resendCode: 'Resend code',
  sendCode: 'Send code',
  // Web app shell
  backToSignInOptions: 'Back to sign-in options',
  otherOptions: '‹ Other options',
  cantReachSafi: "Can't reach Safi",
  checkConnection: 'Check your connection and try again.',
  tryAgain: 'Try again',
  signInIncomplete: 'We could not finish signing you in. Please try again.',
  shareFileFailed: 'Could not share this file. Please try again.',
  // Auth errors raised by the app itself (provider messages pass through untranslated)
  signInCancelled: 'Sign-in was cancelled',
  signInNotConfigured: 'Sign-in is not configured in this build (missing Supabase key).',
  noSession: 'Sign-in did not return a session.',
  appleNoToken: 'Apple did not return an identity token.',
  googleCouldNotStart: 'Google sign-in could not start.',
  googleNoCode: 'Google sign-in did not return a code.',
  googleFailed: 'Google sign-in failed.',
  appleFailed: 'Apple sign-in failed.',
};

export type Strings = typeof en;

const ar: Strings = {
  headline: 'كل إيصال واشتراك وتكلفة API — مقابل ميزانية مشروعك',
  subhead: 'امسح الإيصالات وقسّمها وسوِّ الحسابات مع فريقك. تبقى ميزانيتك متزامنة دائمًا.',
  continueWithGoogle: 'المتابعة باستخدام Google',
  continueWithPhone: 'المتابعة برقم الهاتف',
  useEmailInstead: 'استخدم البريد الإلكتروني بدلًا من ذلك',
  genericError: 'حدث خطأ ما. يُرجى المحاولة مرة أخرى.',
  terms: 'الشروط',
  privacy: 'الخصوصية',
  termsLabel: 'شروط الخدمة',
  privacyLabel: 'سياسة الخصوصية',
  back: 'رجوع',
  backChevron: '› رجوع',
  numberTitle: 'ما رقم هاتفك؟',
  numberSubtitle: 'سنرسل إليك رمزًا من 6 أرقام في رسالة نصية لتسجيل الدخول.',
  countryCode: 'رمز الدولة',
  phoneNumber: 'رقم الهاتف',
  codeTitle: 'أدخل الرمز',
  sentTo: (phone: string) => `أُرسل إلى ${isolateLtr(phone)}`,
  codeLabel: 'رمز من 6 أرقام',
  resendIn: (seconds: number) => `إعادة إرسال الرمز بعد ${seconds} ث`,
  resendCode: 'إعادة إرسال الرمز',
  sendCode: 'إرسال الرمز',
  backToSignInOptions: 'العودة إلى خيارات تسجيل الدخول',
  otherOptions: '› خيارات أخرى',
  cantReachSafi: 'تعذّر الوصول إلى Safi',
  checkConnection: 'تحقّق من اتصالك وحاول مرة أخرى.',
  tryAgain: 'حاول مرة أخرى',
  signInIncomplete: 'تعذّر إكمال تسجيل دخولك. يُرجى المحاولة مرة أخرى.',
  shareFileFailed: 'تعذّرت مشاركة هذا الملف. يُرجى المحاولة مرة أخرى.',
  signInCancelled: 'تم إلغاء تسجيل الدخول',
  signInNotConfigured: 'تسجيل الدخول غير مُعَدّ في هذا الإصدار (مفتاح Supabase مفقود).',
  noSession: 'لم يُرجع تسجيل الدخول جلسة.',
  appleNoToken: 'لم تُرجع Apple رمز الهوية.',
  googleCouldNotStart: 'تعذّر بدء تسجيل الدخول باستخدام Google.',
  googleNoCode: 'لم يُرجع تسجيل الدخول باستخدام Google رمزًا.',
  googleFailed: 'تعذّر تسجيل الدخول باستخدام Google.',
  appleFailed: 'تعذّر تسجيل الدخول باستخدام Apple.',
};

const STRINGS: Record<AppLanguage, Strings> = { en, ar };

export const t: Strings = STRINGS[LANGUAGE];

// --- Layout direction --------------------------------------------------------------------
// We never call I18nManager.forceRTL (it needs a restart). Instead each screen root sets an
// explicit Yoga `direction`, so rows and start/end flip for Arabic whatever I18nManager says.

export const directionStyle: ViewStyle = { direction: isArabic ? 'rtl' : 'ltr' };

// Keeps a row left-to-right (phone number, code boxes) even inside an Arabic screen.
export const ltrStyle: ViewStyle = { direction: 'ltr' };

// React Native swaps textAlign left/right when I18nManager.isRTL is on, so pick the physical
// side that ends up at the reading start.
const startSide: 'left' | 'right' = isArabic === I18nManager.isRTL ? 'left' : 'right';

export const textStartStyle: TextStyle = {
  textAlign: startSide,
  writingDirection: isArabic ? 'rtl' : 'ltr',
  // Any letter spacing breaks the joins between Arabic letters.
  ...(isArabic ? { letterSpacing: 0 } : null),
};

// --- Web app locale ----------------------------------------------------------------------

/** Locale prefix for the Next.js app, or null to let the server (NEXT_LOCALE cookie) decide. */
export const WEB_LOCALE: string | null = isArabic ? 'ar' : null;

/**
 * Prefixes an app-relative path with the web locale. Always returns a single-slash relative
 * path, so it stays valid for the server's safe `next` check.
 */
export const localizePath = (path: string): string => {
  const relative = `/${path.replace(/^[/\\]+/, '')}`;
  return WEB_LOCALE ? `/${WEB_LOCALE}${'/' === relative ? '' : relative}` : relative;
};

// Every locale the Next.js app routes (next-i18next.config.js), used to read paths back.
const WEB_LOCALE_PREFIX =
  /^\/(default|en|de|fr|it|cs|nl|pl|pt-PT|pt-BR|sv|es|es-MX|es-AR|id|hu|ar)(?=\/|$)/;

/** Drops a leading locale segment: `/ar/balances` -> `/balances`. */
export const stripLocale = (pathname: string): string =>
  pathname.replace(WEB_LOCALE_PREFIX, '') || '/';
