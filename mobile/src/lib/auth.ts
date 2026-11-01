import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';

import { AUTH_REDIRECT_URL } from '../theme';
import { isSupabaseConfigured, supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

// Set once the WebView holds a SplitPro session cookie, so relaunch skips the Welcome screen.
const WEB_SIGNED_IN_KEY = 'splitpro.webSignedIn';

export class AuthCancelledError extends Error {
  constructor() {
    super('Sign-in was cancelled');
    this.name = 'AuthCancelledError';
  }
}

const assertConfigured = () => {
  if (!isSupabaseConfigured) {
    throw new Error('Sign-in is not configured in this build (missing Supabase key).');
  }
};

export const getWebSignedIn = async () => {
  try {
    return '1' === (await AsyncStorage.getItem(WEB_SIGNED_IN_KEY));
  } catch {
    return false;
  }
};

export const setWebSignedIn = async (value: boolean) => {
  try {
    if (value) {
      await AsyncStorage.setItem(WEB_SIGNED_IN_KEY, '1');
    } else {
      await AsyncStorage.removeItem(WEB_SIGNED_IN_KEY);
    }
  } catch (error) {
    console.warn('Could not store sign-in flag', error);
  }
};

export const signOutEverywhere = async () => {
  await setWebSignedIn(false);
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
};

const requireAccessToken = (accessToken: string | undefined) => {
  if (!accessToken) {
    throw new Error('Sign-in did not return a session.');
  }
  return accessToken;
};

// --- Apple (iOS only) -------------------------------------------------------------------

export const signInWithApple = async (): Promise<string> => {
  assertConfigured();
  // Apple receives the SHA-256 hash; Supabase receives the raw nonce and compares them.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (error) {
    if ('ERR_REQUEST_CANCELED' === (error as { code?: string }).code) {
      throw new AuthCancelledError();
    }
    throw error;
  }

  if (!credential.identityToken) {
    throw new Error('Apple did not return an identity token.');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) {
    throw error;
  }

  // Apple only shares the name on the very first sign-in, and it is not in the ID token.
  // Save it to user metadata so the SplitPro server can use it when creating the account.
  const fullName = credential.fullName
    ? AppleAuthentication.formatFullName(credential.fullName).trim()
    : '';
  if ('' !== fullName) {
    await supabase.auth
      .updateUser({ data: { full_name: fullName } })
      .catch((updateError: unknown) => console.warn('Could not save Apple name', updateError));
  }

  return requireAccessToken(data.session?.access_token);
};

// --- Google (system browser + PKCE) -----------------------------------------------------

export const signInWithGoogle = async (): Promise<string> => {
  assertConfigured();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: AUTH_REDIRECT_URL, skipBrowserRedirect: true },
  });
  if (error) {
    throw error;
  }
  if (!data.url) {
    throw new Error('Google sign-in could not start.');
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, AUTH_REDIRECT_URL);
  if ('success' !== result.type) {
    throw new AuthCancelledError();
  }

  const returned = new URL(result.url);
  // Supabase may put errors in the query or the fragment.
  const fragment = new URLSearchParams(returned.hash.replace(/^#/, ''));
  const errorDescription =
    returned.searchParams.get('error_description') ?? fragment.get('error_description');
  if (errorDescription) {
    throw new Error(errorDescription);
  }

  const code = returned.searchParams.get('code');
  if (!code) {
    throw new Error('Google sign-in did not return a code.');
  }

  const exchanged = await supabase.auth.exchangeCodeForSession(code);
  if (exchanged.error) {
    throw exchanged.error;
  }
  return requireAccessToken(exchanged.data.session?.access_token);
};

// --- Phone (SMS one-time code) ----------------------------------------------------------

export const toE164 = (countryCode: string, number: string) => {
  const cc = countryCode.replace(/\D/g, '');
  const local = number.replace(/\D/g, '').replace(/^0+/, '');
  return `+${cc}${local}`;
};

export const sendPhoneCode = async (phone: string) => {
  assertConfigured();
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) {
    throw error;
  }
};

export const verifyPhoneCode = async (phone: string, token: string): Promise<string> => {
  assertConfigured();
  const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error) {
    throw error;
  }
  return requireAccessToken(data.session?.access_token);
};
