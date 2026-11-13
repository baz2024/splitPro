import { Button, Spinner } from '@heroui/react';
import { Check, ImageIcon, Minus, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import Link from 'next/link';
import React, { useRef, useState, useSyncExternalStore } from 'react';

import { useReviewTranslation } from '../../Review/useReviewTranslation';
import { GroupedRows } from './journeyUi';

/** Decorative receipt outline drawn inside the viewfinder. */
const ReceiptOutline: React.FC = () => (
  <div
    aria-hidden
    className="bg-surface-secondary border-border flex w-40 flex-col gap-2 rounded-xl border p-4"
  >
    <span className="bg-muted/60 h-2 w-16 rounded-full" />
    <span className="bg-muted/30 h-1.5 w-24 rounded-full" />
    <span className="flex justify-between pt-2">
      <span className="bg-muted/30 h-1.5 w-14 rounded-full" />
      <span className="bg-muted/30 h-1.5 w-8 rounded-full" />
    </span>
    <span className="flex justify-between">
      <span className="bg-muted/30 h-1.5 w-10 rounded-full" />
      <span className="bg-muted/30 h-1.5 w-8 rounded-full" />
    </span>
    <span className="flex justify-between pt-1">
      <span className="bg-muted/60 h-2 w-12 rounded-full" />
      <span className="bg-muted/60 h-2 w-12 rounded-full" />
    </span>
  </div>
);

const AI_CONSENT_KEY = 'safi.aiReceiptConsent';

const readAiConsent = () => {
  try {
    return 'granted' === localStorage.getItem(AI_CONSENT_KEY);
  } catch {
    return false;
  }
};

const subscribeToNothing = () => () => undefined;

/**
 * Asks once before any receipt photo goes to the AI provider (App Store guideline 5.1.2(i)).
 * Declining keeps the user in the app with manual entry.
 */
const AiConsent: React.FC<{ onAllow: () => void; onDecline: () => void }> = ({
  onAllow,
  onDecline,
}) => {
  const { t } = useTranslation();

  return (
    <div
      role="dialog"
      aria-labelledby="ai-consent-title"
      className="bg-surface-secondary border-border flex flex-col gap-4 rounded-3xl border p-6"
    >
      <ShieldCheck className="text-accent size-8" aria-hidden />
      <h2 id="ai-consent-title" className="text-lg font-semibold">
        {t('ai_consent.title')}
      </h2>
      <p className="text-muted text-sm leading-relaxed">{t('ai_consent.description')}</p>
      <Link
        href="/privacy"
        className="text-accent inline-flex min-h-11 items-center text-sm underline"
      >
        {t('ai_consent.privacy_link')}
      </Link>
      <div className="flex flex-col gap-2">
        <Button className="min-h-12 w-full" onPress={onAllow}>
          {t('ai_consent.allow')}
        </Button>
        <Button variant="ghost" className="min-h-12 w-full" onPress={onDecline}>
          {t('ai_consent.deny')}
        </Button>
      </div>
    </div>
  );
};

/** Screen 1: camera-style capture. Uses the native camera via a capture file input. */
export const ScanCamera: React.FC<{ onPick: (file: File) => void; onDecline: () => void }> = ({
  onPick,
  onDecline,
}) => {
  const { t } = useTranslation();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  // Server render assumes no consent; the stored answer is read on the client without a mismatch.
  const storedConsent = useSyncExternalStore(subscribeToNothing, readAiConsent, () => false);
  const [grantedNow, setGrantedNow] = useState(false);
  const consented = storedConsent || grantedNow;

  const allowAi = () => {
    try {
      localStorage.setItem(AI_CONSENT_KEY, 'granted');
    } catch {
      // Private mode: the consent holds for this visit only.
    }
    setGrantedNow(true);
  };

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so picking the same photo again still fires onChange.
    event.target.value = '';
    if (file) {
      onPick(file);
    }
  };

  if (!consented) {
    return <AiConsent onAllow={allowAi} onDecline={onDecline} />;
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <button
        type="button"
        onClick={() => cameraRef.current?.click()}
        aria-label={t('add_journey.scan.shutter')}
        className="border-accent focus-visible:ring-focus flex min-h-[26rem] flex-1 flex-col items-center justify-center gap-5 rounded-3xl border-2 border-dashed p-6 text-center outline-none focus-visible:ring-2"
      >
        <ReceiptOutline />
        <span className="text-muted text-sm">{t('add_journey.scan.frame_title')}</span>
        <span className="bg-accent/15 text-accent inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium">
          <Sparkles className="size-3.5" aria-hidden />
          {t('add_journey.scan.frame_chip')}
        </span>
      </button>

      <div className="flex items-center justify-between px-4 pt-2">
        <Button
          isIconOnly
          variant="ghost"
          className="size-12 rounded-full"
          aria-label={t('add_journey.scan.gallery')}
          onPress={() => galleryRef.current?.click()}
        >
          <ImageIcon className="size-6" aria-hidden />
        </Button>
        <button
          type="button"
          aria-label={t('add_journey.scan.shutter')}
          onClick={() => cameraRef.current?.click()}
          className="bg-accent ring-accent/30 focus-visible:ring-focus size-20 rounded-full ring-4 ring-offset-4 ring-offset-(--background) outline-none focus-visible:ring-[6px]"
        />
        {/* The native camera owns the flash; this mirrors the design without a fake toggle. */}
        <Button
          isIconOnly
          variant="ghost"
          isDisabled
          className="size-12 rounded-full"
          aria-label={t('add_journey.scan.flash')}
        >
          <Zap className="size-6" aria-hidden />
        </Button>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onChange}
      />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={onChange} />
    </div>
  );
};

export interface ReadingFields {
  merchant: string | null;
  total: string | null;
  date: string | null;
  category: string | null;
}

const FIELD_ORDER = ['merchant', 'total', 'date', 'category'] as const;

/**
 * Screen 2: the photo is being read. Rows stay "Reading…" until the scan returns, then show
 * what was actually found (or "Not found") before the journey moves on to review.
 */
export const ReadingReceipt: React.FC<{
  previewUrl: string | null;
  fields: ReadingFields | null;
  /** Leave while the AI is still reading; the saved expense is then flagged "Review". */
  onSkip?: () => void;
}> = ({ previewUrl, fields, onSkip }) => {
  const { t } = useTranslation();
  const { t: tReview } = useReviewTranslation();
  const canSkip = Boolean(onSkip) && null === fields;

  return (
    <div className="flex flex-col gap-4" aria-busy={null === fields}>
      <div className="flex justify-center">
        <div className="bg-surface-secondary border-border flex h-56 w-48 items-center justify-center overflow-hidden rounded-xl border">
          {previewUrl ? (
            // oxlint-disable-next-line next/no-img-element -- local blob preview URL
            <img
              src={previewUrl}
              alt={t('add_journey.scan.preview_alt')}
              className="size-full object-cover"
            />
          ) : (
            <ImageIcon className="text-muted size-8" aria-hidden />
          )}
        </div>
      </div>

      <GroupedRows>
        {FIELD_ORDER.map((key) => {
          const value = fields?.[key] ?? null;
          const pending = null === fields;
          return (
            <div key={key} className="flex min-h-13 items-center gap-3 px-4 py-2 text-sm">
              {pending ? (
                <Sparkles className="text-accent size-4 shrink-0" aria-hidden />
              ) : value ? (
                <Check className="text-accent size-4 shrink-0" aria-hidden />
              ) : (
                <Minus className="text-muted size-4 shrink-0" aria-hidden />
              )}
              <span className="text-muted flex-1">{t(`add_journey.scan.fields.${key}`)}</span>
              {pending ? (
                <span className="text-accent flex items-center gap-2 font-medium" role="status">
                  <Spinner size="sm" color="accent" />
                  {t('add_journey.scan.reading_row')}
                </span>
              ) : (
                <span
                  dir={'total' === key ? 'ltr' : undefined}
                  className={value ? 'text-foreground font-medium' : 'text-muted'}
                >
                  {value ?? t('add_journey.scan.not_found')}
                </span>
              )}
            </div>
          );
        })}
      </GroupedRows>

      {canSkip ? (
        <>
          <p className="text-muted text-xs">{tReview('reading.leave_hint')}</p>
          <Button variant="ghost" size="sm" className="text-accent self-start" onPress={onSkip}>
            {tReview('reading.type_instead')}
          </Button>
        </>
      ) : (
        <p className="text-muted text-xs">{t('add_journey.scan.reading_footnote')}</p>
      )}
    </div>
  );
};
