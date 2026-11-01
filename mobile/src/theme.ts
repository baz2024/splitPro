// Midnight Navy theme. The app always uses it, whatever the system light/dark setting.
export const COLORS = {
  background: '#0b1626',
  card: '#13233a',
  cardBorder: '#1e3350',
  accent: '#5aa9ff',
  text: '#f1f5f9',
  muted: '#8da2c0',
  danger: '#ff8a8a',
  onAccent: '#0b1626',
} as const;

export const APP_HOST = 'split.kafoai.com';
export const APP_ORIGIN = `https://${APP_HOST}`;
export const HOME_PATH = '/balances';
export const EXCHANGE_URL = `${APP_ORIGIN}/api/auth/supabase-exchange`;
export const EMAIL_SIGNIN_URL = `${APP_ORIGIN}/auth/signin?callbackUrl=${encodeURIComponent(HOME_PATH)}`;
export const AUTH_REDIRECT_URL = 'splitpro://auth-callback';
