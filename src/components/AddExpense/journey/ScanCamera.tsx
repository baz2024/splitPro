import { Button, Spinner } from '@heroui/react';
import { Camera, ImageIcon, Sparkles } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import React, { useRef } from 'react';

const CORNERS = [
  'start-0 top-0 border-s-4 border-t-4 rounded-ss-2xl',
  'end-0 top-0 border-e-4 border-t-4 rounded-se-2xl',
  'start-0 bottom-0 border-s-4 border-b-4 rounded-es-2xl',
  'end-0 bottom-0 border-e-4 border-b-4 rounded-ee-2xl',
] as const;

const Viewfinder: React.FC<{ previewUrl?: string | null; children?: React.ReactNode }> = ({
  previewUrl,
  children,
}) => (
  <div className="bg-surface border-border relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-3xl border">
    {previewUrl ? (
      // oxlint-disable-next-line next/no-img-element -- local blob/preview URLs
      <img src={previewUrl} alt="" className="absolute inset-0 size-full object-cover opacity-60" />
    ) : null}
    <div className="absolute inset-6">
      {CORNERS.map((corner) => (
        <span key={corner} className={`border-accent absolute size-10 ${corner}`} aria-hidden />
      ))}
    </div>
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-10 text-center">
      {children}
    </div>
  </div>
);

/** Screen 1: camera-style capture. Uses the native camera via a capture file input. */
export const ScanCamera: React.FC<{ onPick: (file: File) => void }> = ({ onPick }) => {
  const { t } = useTranslation();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so picking the same photo again still fires onChange.
    event.target.value = '';
    if (file) {
      onPick(file);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Viewfinder>
        <Camera className="text-muted size-10" aria-hidden />
        <p className="text-foreground font-medium">{t('add_journey.scan.frame_title')}</p>
        <p className="text-muted text-sm">{t('add_journey.scan.frame_hint')}</p>
      </Viewfinder>

      <div className="flex items-center justify-center gap-10">
        <Button
          isIconOnly
          variant="tertiary"
          className="size-12 rounded-full"
          aria-label={t('add_journey.scan.gallery')}
          onPress={() => galleryRef.current?.click()}
        >
          <ImageIcon className="size-5" aria-hidden />
        </Button>
        <Button
          isIconOnly
          variant="ghost"
          className="border-accent size-20 rounded-full border-4 p-0"
          aria-label={t('add_journey.scan.shutter')}
          onPress={() => cameraRef.current?.click()}
        >
          <span className="bg-foreground size-14 rounded-full" aria-hidden />
        </Button>
        <span className="size-12" aria-hidden />
      </div>

      <p className="text-muted flex items-center justify-center gap-1.5 text-xs">
        <Sparkles className="text-accent size-3.5" aria-hidden />
        {t('add_journey.scan.powered_by')}
      </p>

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

/** Screen 2: the photo is being read. */
export const ReadingReceipt: React.FC<{ previewUrl: string | null }> = ({ previewUrl }) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <Viewfinder previewUrl={previewUrl}>
        <div className="bg-overlay/80 flex flex-col items-center gap-3 rounded-2xl px-6 py-5">
          <Spinner color="accent" size="lg" />
          <p className="text-foreground font-medium">{t('add_journey.scan.reading_title')}</p>
          <p className="text-muted text-sm">{t('add_journey.scan.reading_hint')}</p>
        </div>
      </Viewfinder>
    </div>
  );
};
