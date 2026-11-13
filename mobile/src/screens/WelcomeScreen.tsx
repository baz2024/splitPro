import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthCancelledError, signInWithApple, signInWithGoogle } from '../lib/auth';
import { LANGUAGE, directionStyle, isArabic, t, textStartStyle } from '../lib/i18n';
import { COLORS } from '../theme';

interface WelcomeScreenProps {
  initialError?: string | null;
  onAccessToken: (accessToken: string) => void;
  onPhone: () => void;
  onEmail: () => void;
}

type Busy = 'apple' | 'google' | null;

const LEGAL_BASE_URL = `https://safi.kafoai.com/${LANGUAGE}`;

const openLegalPage = (page: 'terms' | 'privacy') => {
  WebBrowser.openBrowserAsync(`${LEGAL_BASE_URL}/${page}`).catch(() => undefined);
};

const describeError = (error: unknown) => (error instanceof Error ? error.message : t.genericError);

export const WelcomeScreen = ({
  initialError,
  onAccessToken,
  onPhone,
  onEmail,
}: WelcomeScreenProps) => {
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(initialError ?? null);

  useEffect(() => {
    if ('ios' !== Platform.OS) {
      return;
    }
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  const run = async (kind: Exclude<Busy, null>, signIn: () => Promise<string>) => {
    if (busy) {
      return;
    }
    setBusy(kind);
    setError(null);
    try {
      const accessToken = await signIn();
      onAccessToken(accessToken);
    } catch (signInError) {
      if (!(signInError instanceof AuthCancelledError)) {
        setError(describeError(signInError));
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={[styles.root, directionStyle]} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.hero}>
        <View style={styles.mark}>
          <View style={styles.logo}>
            <Text style={styles.logoGlyph}>K</Text>
          </View>
          <View>
            <Text style={[styles.brand, textStartStyle]}>Kafo AI</Text>
            <Text style={[styles.product, textStartStyle]}>Safi</Text>
          </View>
        </View>

        <Text
          style={[styles.headline, textStartStyle, isArabic ? styles.headlineArabic : null]}
          accessibilityRole="header"
        >
          {t.headline}
        </Text>
        <Text style={[styles.subhead, textStartStyle]}>{t.subhead}</Text>
      </View>

      <View style={styles.actions}>
        {error ? (
          <Text style={[styles.error, textDirection]} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        {appleAvailable ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={14}
            style={[styles.appleButton, busy ? styles.disabled : null]}
            onPress={() => {
              run('apple', signInWithApple).catch(() => undefined);
            }}
          />
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.continueWithGoogle}
          disabled={null !== busy}
          onPress={() => {
            run('google', signInWithGoogle).catch(() => undefined);
          }}
          style={({ pressed }) => [
            styles.button,
            styles.secondaryButton,
            pressed ? styles.pressed : null,
            busy && 'google' !== busy ? styles.disabled : null,
          ]}
        >
          {'google' === busy ? (
            <ActivityIndicator color={COLORS.text} />
          ) : (
            <>
              <Text style={styles.googleGlyph}>G</Text>
              <Text style={[styles.secondaryLabel, textDirection]}>{t.continueWithGoogle}</Text>
            </>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.continueWithPhone}
          disabled={null !== busy}
          onPress={onPhone}
          style={({ pressed }) => [
            styles.button,
            styles.primaryButton,
            pressed ? styles.pressed : null,
            busy ? styles.disabled : null,
          ]}
        >
          <Text style={[styles.primaryLabel, textDirection]}>{t.continueWithPhone}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="link"
          disabled={null !== busy}
          onPress={onEmail}
          hitSlop={12}
          style={styles.linkWrap}
        >
          <Text style={[styles.link, textDirection]}>{t.useEmailInstead}</Text>
        </Pressable>

        <View style={styles.legalRow}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t.termsLabel}
            onPress={() => openLegalPage('terms')}
            style={({ pressed }) => [styles.legalLink, pressed ? styles.pressed : null]}
          >
            <Text style={[styles.legalLabel, textDirection]}>{t.terms}</Text>
          </Pressable>
          <Text style={styles.legalDot} importantForAccessibility="no" accessible={false}>
            ·
          </Text>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t.privacyLabel}
            onPress={() => openLegalPage('privacy')}
            style={({ pressed }) => [styles.legalLink, pressed ? styles.pressed : null]}
          >
            <Text style={[styles.legalLabel, textDirection]}>{t.privacy}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
};

// Centered labels only need the reading direction, not a start alignment.
const textDirection = { writingDirection: textStartStyle.writingDirection } as const;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    gap: 20,
  },
  mark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGlyph: {
    color: COLORS.accent,
    fontSize: 24,
    fontWeight: '800',
  },
  brand: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '700',
  },
  product: {
    color: COLORS.muted,
    fontSize: 14,
    fontWeight: '500',
  },
  headline: {
    color: COLORS.text,
    fontSize: 32,
    lineHeight: 39,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  // Arabic glyphs and marks sit taller, so give the large headline more room.
  headlineArabic: {
    lineHeight: 46,
  },
  subhead: {
    color: COLORS.muted,
    fontSize: 16,
    lineHeight: 23,
  },
  actions: {
    gap: 12,
    paddingBottom: 12,
  },
  error: {
    color: COLORS.danger,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  appleButton: {
    width: '100%',
    height: 52,
  },
  button: {
    height: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primaryButton: {
    backgroundColor: COLORS.accent,
  },
  secondaryButton: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.5,
  },
  googleGlyph: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '800',
  },
  primaryLabel: {
    color: COLORS.onAccent,
    fontSize: 17,
    fontWeight: '600',
  },
  secondaryLabel: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '600',
  },
  linkWrap: {
    alignSelf: 'center',
    paddingVertical: 8,
  },
  link: {
    color: COLORS.muted,
    fontSize: 15,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  // Row inherits the screen's Yoga direction, so the two links swap sides in Arabic.
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  legalLink: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legalLabel: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: '500',
  },
  legalDot: {
    color: COLORS.muted,
    fontSize: 13,
  },
});
