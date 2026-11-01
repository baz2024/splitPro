import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputInstance,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { sendPhoneCode, toE164, verifyPhoneCode } from '../lib/auth';
import { COLORS } from '../theme';

interface PhoneScreenProps {
  onBack: () => void;
  onAccessToken: (accessToken: string) => void;
}

const CODE_LENGTH = 6;
const RESEND_SECONDS = 30;
const CODE_SLOTS = Array.from({ length: CODE_LENGTH }, (_, index) => index);

const describeError = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.';

export const PhoneScreen = ({ onBack, onAccessToken }: PhoneScreenProps) => {
  const [step, setStep] = useState<'number' | 'code'>('number');
  const [countryCode, setCountryCode] = useState('+1');
  const [number, setNumber] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const codeInputRef = useRef<TextInputInstance>(null);

  const phone = toE164(countryCode, number);
  const numberDigits = number.replace(/\D/g, '');
  const hasCountryCode = 1 <= countryCode.replace(/\D/g, '').length;
  // E.164 allows at most 15 digits including the country code.
  const numberValid = hasCountryCode && 6 <= numberDigits.length && 15 >= phone.length - 1;

  useEffect(() => {
    if (0 >= resendIn) {
      return;
    }
    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const sendCode = async () => {
    if (busy || !numberValid) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendPhoneCode(phone);
      setCode('');
      setStep('code');
      setResendIn(RESEND_SECONDS);
      setTimeout(() => codeInputRef.current?.focus(), 250);
    } catch (sendError) {
      setError(describeError(sendError));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (token: string) => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const accessToken = await verifyPhoneCode(phone, token);
      onAccessToken(accessToken);
    } catch (verifyError) {
      setError(describeError(verifyError));
      setCode('');
      codeInputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const handleCodeChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    // Auto-advance: submit as soon as the sixth digit arrives (typed or SMS autofill).
    if (CODE_LENGTH === digits.length) {
      verify(digits).catch(() => undefined);
    }
  };

  const handleBack = () => {
    if ('code' === step) {
      setStep('number');
      setError(null);
      setCode('');
      return;
    }
    onBack();
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={'ios' === Platform.OS ? 'padding' : undefined}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={handleBack}
          hitSlop={12}
          style={styles.back}
        >
          <Text style={styles.backLabel}>‹ Back</Text>
        </Pressable>

        <View style={styles.body}>
          {'number' === step ? (
            <>
              <Text style={styles.title} accessibilityRole="header">
                What's your number?
              </Text>
              <Text style={styles.subtitle}>We'll text you a 6-digit code to sign in.</Text>

              <View style={styles.phoneRow}>
                <TextInput
                  accessibilityLabel="Country code"
                  value={countryCode}
                  onChangeText={(value) =>
                    setCountryCode(`+${value.replace(/\D/g, '').slice(0, 4)}`)
                  }
                  keyboardType="phone-pad"
                  style={[styles.input, styles.countryInput]}
                  placeholderTextColor={COLORS.muted}
                  selectionColor={COLORS.accent}
                  maxLength={5}
                />
                <TextInput
                  accessibilityLabel="Phone number"
                  value={number}
                  onChangeText={setNumber}
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  autoComplete="tel"
                  placeholder="Phone number"
                  placeholderTextColor={COLORS.muted}
                  selectionColor={COLORS.accent}
                  style={[styles.input, styles.numberInput]}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    sendCode().catch(() => undefined);
                  }}
                />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.title} accessibilityRole="header">
                Enter the code
              </Text>
              <Text style={styles.subtitle}>Sent to {phone}</Text>

              <Pressable
                accessibilityRole="none"
                onPress={() => codeInputRef.current?.focus()}
                style={styles.codeRow}
              >
                {CODE_SLOTS.map((index) => {
                  const char = code[index] ?? '';
                  const active = index === code.length && !busy;
                  return (
                    <View
                      key={index}
                      style={[styles.codeCell, active ? styles.codeCellActive : null]}
                    >
                      <Text style={styles.codeDigit}>{char}</Text>
                    </View>
                  );
                })}
              </Pressable>
              {/* One hidden input drives all six boxes, so paste and SMS autofill just work. */}
              <TextInput
                ref={codeInputRef}
                accessibilityLabel="6-digit code"
                value={code}
                onChangeText={handleCodeChange}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                maxLength={CODE_LENGTH}
                editable={!busy}
                caretHidden
                style={styles.hiddenInput}
              />

              <Pressable
                accessibilityRole="button"
                disabled={0 < resendIn || busy}
                onPress={() => {
                  sendCode().catch(() => undefined);
                }}
                hitSlop={8}
                style={styles.resend}
              >
                <Text style={[styles.resendLabel, 0 < resendIn ? styles.resendWaiting : null]}>
                  {0 < resendIn ? `Resend code in ${resendIn}s` : 'Resend code'}
                </Text>
              </Pressable>
            </>
          )}

          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </View>

        {'number' === step ? (
          <Pressable
            accessibilityRole="button"
            disabled={!numberValid || busy}
            onPress={() => {
              sendCode().catch(() => undefined);
            }}
            style={({ pressed }) => [
              styles.button,
              !numberValid || busy ? styles.disabled : null,
              pressed ? styles.pressed : null,
            ]}
          >
            {busy ? (
              <ActivityIndicator color={COLORS.onAccent} />
            ) : (
              <Text style={styles.buttonLabel}>Send code</Text>
            )}
          </Pressable>
        ) : busy ? (
          <ActivityIndicator style={styles.verifying} color={COLORS.accent} />
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  flex: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  back: {
    alignSelf: 'flex-start',
    paddingVertical: 12,
  },
  backLabel: {
    color: COLORS.accent,
    fontSize: 17,
    fontWeight: '500',
  },
  body: {
    flex: 1,
    paddingTop: 16,
    gap: 12,
  },
  title: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 12,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    height: 56,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    color: COLORS.text,
    fontSize: 18,
    paddingHorizontal: 16,
  },
  countryInput: {
    width: 84,
    textAlign: 'center',
  },
  numberInput: {
    flex: 1,
  },
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  codeCell: {
    flex: 1,
    height: 60,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeCellActive: {
    borderColor: COLORS.accent,
  },
  codeDigit: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '600',
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  resend: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  resendLabel: {
    color: COLORS.accent,
    fontSize: 15,
    fontWeight: '500',
  },
  resendWaiting: {
    color: COLORS.muted,
  },
  error: {
    color: COLORS.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    height: 52,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    color: COLORS.onAccent,
    fontSize: 17,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.5,
  },
  verifying: {
    marginBottom: 24,
  },
});
