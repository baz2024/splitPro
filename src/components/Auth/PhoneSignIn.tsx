import { Button, Input, InputOTP } from '@heroui/react';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { useTranslation } from 'next-i18next';
import React, { useState } from 'react';
import { toast } from 'sonner';

import { exchangeSupabaseToken, getSupabaseClient } from '~/utils/supabaseClient';

const OTP_LENGTH = 6;
const OTP_SLOTS = Array.from({ length: OTP_LENGTH }, (_, index) => index);

/** Normalises user input to E.164 (`+` and digits), which Supabase phone auth expects. */
const normalisePhone = (value: string) => {
  const digits = value.replace(/[^\d]/g, '');
  return digits ? `+${digits}` : '';
};

export const PhoneSignIn: React.FC<{
  getNext: () => string;
  onSignedIn: (next: string) => void;
}> = ({ getNext, onSignedIn }) => {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [isBusy, setIsBusy] = useState(false);

  const e164 = normalisePhone(phone);
  const isPhoneValid = e164.length >= 8;

  const sendCode = async () => {
    if (!isPhoneValid) {
      toast.error(t('auth.phone.invalid'));
      return;
    }
    setIsBusy(true);
    const { error } = await getSupabaseClient().auth.signInWithOtp({ phone: e164 });
    setIsBusy(false);
    if (error) {
      toast.error(t('auth.phone.send_failed'));
      console.error('Phone OTP send failed:', error.message);
      return;
    }
    setCode('');
    setStep('code');
    toast.success(t('auth.phone.code_sent', { phone: e164 }));
  };

  const verifyCode = async (token: string) => {
    if (OTP_LENGTH !== token.length) {
      return;
    }
    setIsBusy(true);
    try {
      const { data, error } = await getSupabaseClient().auth.verifyOtp({
        phone: e164,
        token,
        type: 'sms',
      });
      if (error || !data.session) {
        throw new Error(error?.message ?? 'No session returned');
      }
      const next = getNext();
      await exchangeSupabaseToken(data.session.access_token, next);
      onSignedIn(next);
    } catch (error) {
      console.error('Phone OTP verification failed:', error);
      toast.error(t('auth.phone.verify_failed'));
      setCode('');
      setIsBusy(false);
    }
  };

  if ('code' === step) {
    return (
      <form
        className="flex w-full flex-col items-center gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void verifyCode(code);
        }}
      >
        <p className="text-muted text-center text-sm">
          {t('auth.phone.enter_code', { phone: e164 })}
        </p>
        <InputOTP
          maxLength={OTP_LENGTH}
          pattern={REGEXP_ONLY_DIGITS}
          value={code}
          onChange={setCode}
          onComplete={(value: string) => void verifyCode(value)}
          autoComplete="one-time-code"
          inputMode="numeric"
          aria-label={t('auth.phone.code_label')}
          isDisabled={isBusy}
        >
          <InputOTP.Group>
            {OTP_SLOTS.map((index) => (
              <InputOTP.Slot key={index} index={index} />
            ))}
          </InputOTP.Group>
        </InputOTP>
        <Button type="submit" fullWidth size="lg" isDisabled={isBusy || OTP_LENGTH !== code.length}>
          {isBusy ? t('auth.phone.verifying') : t('auth.phone.verify')}
        </Button>
        <Button variant="ghost" size="sm" isDisabled={isBusy} onPress={() => setStep('phone')}>
          {t('auth.phone.change_number')}
        </Button>
      </form>
    );
  }

  return (
    <form
      className="flex w-full flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void sendCode();
      }}
    >
      <Input
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        aria-label={t('auth.phone.label')}
        placeholder={t('auth.phone.placeholder')}
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        className="min-h-12 w-full text-base"
        variant="secondary"
        autoFocus
      />
      <Button type="submit" fullWidth size="lg" isDisabled={isBusy || !isPhoneValid}>
        {isBusy ? t('auth.sending') : t('auth.phone.send_code')}
      </Button>
    </form>
  );
};
